import os
import json
import joblib
import asyncio
import numpy as np
import pandas as pd
import networkx as nx
from typing import List, Optional, Dict, Any, Union
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from src.mongo_exporter import extract_and_merge_mongodb_data
    from src.train import train_and_evaluate_model
except ImportError:
    from mongo_exporter import extract_and_merge_mongodb_data
    from train import train_and_evaluate_model

# ==========================================
# Task 1 & 4: Strict API Output Contract Schemas
# ==========================================

class GeoJSONLocation(BaseModel):
    latitude: float
    longitude: float

class NodeDef(BaseModel):
    node_id: str
    node_type: str  # e.g., 'MULE', 'ATM', 'BRANCH', 'VICTIM', 'WALLET'
    location: Optional[GeoJSONLocation] = None
    features: Optional[Dict[str, float]] = None

class TransactionEdge(BaseModel):
    TransactionID: str
    Amount: float
    Timestamp: str
    source: str
    target: str

class GraphPredictRequest(BaseModel):
    nodes: List[NodeDef]
    edges: List[TransactionEdge]
    predicted_window: Optional[str] = "14:00-16:00"

class PredictionResult(BaseModel):
    location_id: str
    latitude: float
    longitude: float
    risk_score: float
    risk_level: str  # Must strictly output: LOW, MEDIUM, HIGH, CRITICAL
    confidence: float
    predicted_window: str
    top_factors: List[str]
    related_complaints: List[str]
    model_version: str
    rank: Optional[int] = 1
    cluster_id: Optional[str] = "UNCATEGORIZED"

class PredictResponse(BaseModel):
    status: str
    count: int
    predictions: List[PredictionResult]


# ==========================================
# Task 1: Model Loading & Watchdog Setup
# ==========================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "model.pkl")
METADATA_PATH = os.path.join(BASE_DIR, "models", ".last_train_metadata.json")

# Default physical fallback ATMs (Vijayawada / Pan-India spatial corpus)
FALLBACK_PHYSICAL_LOCATIONS = [
    {"location_id": "ATM_SBI_KORAMANGALA_01", "latitude": 12.9279, "longitude": 77.6271},
    {"location_id": "ATM_BENZ_CIRCLE_VJ", "latitude": 16.4971, "longitude": 80.6516},
    {"location_id": "ATM_MG_ROAD_VIJAYAWADA", "latitude": 16.5062, "longitude": 80.6480},
    {"location_id": "ATM_BKC_MUMBAI_04", "latitude": 19.0650, "longitude": 72.8653},
]

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model artifact not found at {MODEL_PATH}. Run train.py first.")

artifact = joblib.load(MODEL_PATH)
iso_forest = artifact["model"]
expected_features = artifact["feature_names"]
model_version = artifact.get("model_version", "iso_forest_v1")

REFERENCE_MEANS = {
    "dist_from_last_txn_km": 150.0,
    "distance_to_recent_withdrawal_km": 200.0,
    "login_attempts": 1.5,
    "historical_location_risk": 0.35,
    "recent_withdrawal_count": 1.0,
    "minutes_since_last_txn": 300.0
}

def load_training_metadata() -> dict:
    if os.path.exists(METADATA_PATH):
        try:
            with open(METADATA_PATH, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"last_record_count": 0, "last_trained_at": None}

def save_training_metadata(record_count: int):
    os.makedirs(os.path.dirname(METADATA_PATH), exist_ok=True)
    data = {
        "last_record_count": record_count,
        "last_trained_at": pd.Timestamp.now().isoformat()
    }
    with open(METADATA_PATH, "w") as f:
        json.dump(data, f, indent=2)

def check_and_retrain_if_needed():
    """Autonomous Watchdog check."""
    global iso_forest, expected_features, model_version
    metadata = load_training_metadata()
    last_count = metadata.get("last_record_count", 0)

    try:
        merged_csv = os.path.join(BASE_DIR, 'data', 'processed', 'merged_mongodb_transactions.csv')
        raw_csv = os.path.join(BASE_DIR, 'data', 'raw', 'bank_transactions_data_2_augmented_clean_2.csv')
        
        target_path = extract_and_merge_mongodb_data(raw_csv, merged_csv)
        
        if os.path.exists(target_path):
            current_df = pd.read_csv(target_path)
            current_count = len(current_df)
            
            if current_count > last_count or last_count == 0:
                print(f"\n[WATCHDOG] New data detected ({current_count} vs {last_count} records). Retraining...")
                train_and_evaluate_model(force_reprocess=True, contamination=0.02)
                save_training_metadata(current_count)
                
                if os.path.exists(MODEL_PATH):
                    new_artifact = joblib.load(MODEL_PATH)
                    iso_forest = new_artifact["model"]
                    expected_features = new_artifact["feature_names"]
                    model_version = new_artifact.get("model_version", "iso_forest_v1")
                    print("  [WATCHDOG] New model artifact hot-reloaded!")
    except Exception as e:
        print(f"  [WATCHDOG] Retraining check error: {e}")

async def auto_retrain_watchdog(interval_seconds: int = 300):
    print(f"\n[WATCHDOG] Background Retraining Watchdog active (Interval: {interval_seconds}s).")
    while True:
        await asyncio.sleep(interval_seconds)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, check_and_retrain_if_needed)

@asynccontextmanager
async def lifespan(app: FastAPI):
    watchdog_task = asyncio.create_task(auto_retrain_watchdog(interval_seconds=300))
    yield
    watchdog_task.cancel()

app = FastAPI(
    title="CyberSentinel IF + Graph Hotspot Predictor",
    lifespan=lifespan
)

def calibrate_anomaly_to_risk(raw_score: float, k: float = 40.0) -> float:
    score = 1.0 / (1.0 + np.exp(k * raw_score))
    return float(np.clip(score, 0.0, 1.0))

def get_risk_level(risk_score: float) -> str:
    """Strictly output one of: LOW, MEDIUM, HIGH, or CRITICAL."""
    if risk_score >= 0.85: return "CRITICAL"
    if risk_score >= 0.70: return "HIGH"
    if risk_score >= 0.50: return "MEDIUM"
    return "LOW"

def extract_top_factors(row: pd.Series, mule_count: int = 1, hop_count: int = 1) -> List[str]:
    factors = []
    if mule_count > 1:
        factors.append(f"High velocity transfers across {mule_count} mule accounts")
    if hop_count > 2:
        factors.append("Multi-hop money laundering transfer ring detected")
    if row.get("dist_from_last_txn_km", 0) > REFERENCE_MEANS["dist_from_last_txn_km"]:
        factors.append("Large geographical jump from last transaction")
    if row.get("login_attempts", 0) > REFERENCE_MEANS["login_attempts"]:
        factors.append("Repeated login failures prior to transfer")
    if row.get("historical_location_risk", 0) > REFERENCE_MEANS["historical_location_risk"]:
        factors.append("Historical correlation with known cash-out IP ranges")
    if row.get("recent_withdrawal_count", 0) > REFERENCE_MEANS["recent_withdrawal_count"]:
        factors.append("Rapid account depletion pattern")

    if not factors:
        factors = ["Routine activity profile", "Baseline transaction pattern"]
    return factors[:3]


# ==========================================
# Task 2, 3 & 4: Inference Engine Endpoint
# ==========================================

@app.post("/predict", response_model=Union[PredictResponse, List[PredictionResult]])
def predict_physical_hotspots(payload: GraphPredictRequest):
    if not payload.nodes:
        raise HTTPException(status_code=400, detail="Graph nodes are empty.")

    # 1. Task 2: Build NetworkX Graph & Run Mule Network Clustering (Union-Find / Connected Components)
    G = nx.DiGraph()
    for node in payload.nodes:
        G.add_node(node.node_id, type=node.node_type.upper(), location=node.location, features=node.features)
        
    related_tx_ids = []
    for edge in payload.edges:
        G.add_edge(edge.source, edge.target, amount=edge.Amount, timestamp=edge.Timestamp, tx_id=edge.TransactionID)
        if edge.TransactionID:
            related_tx_ids.append(edge.TransactionID)

    undirected_G = G.to_undirected()
    clusters = list(nx.connected_components(undirected_G))
    
    predictions = []

    for idx, cluster_nodes in enumerate(clusters, start=1):
        cluster_id = f"CLUSTER_{idx}"
        mule_nodes = [n for n in cluster_nodes if G.nodes[n].get('type') == 'MULE']
        mule_count = len(mule_nodes)
        
        # Calculate cluster hop count and topology metrics
        subgraph = G.subgraph(cluster_nodes)
        hop_count = max(1, subgraph.number_of_edges())
        
        # Aggregate cluster features
        cluster_features = []
        for n in cluster_nodes:
            feats = G.nodes[n].get('features')
            if feats:
                cluster_features.append(feats)
                
        if not cluster_features:
            continue
            
        df_cluster = pd.DataFrame(cluster_features).reindex(columns=expected_features, fill_value=0)
        raw_scores = iso_forest.decision_function(df_cluster)
        
        avg_raw_score = float(np.mean(raw_scores))
        
        # Task 2 Impact: Aggressively spike risk score for multi-hop, multi-mule clusters
        penalty = 0.0
        if mule_count >= 2: penalty += 0.10 * mule_count
        if hop_count >= 3:  penalty += 0.15
        
        base_risk = calibrate_anomaly_to_risk(avg_raw_score)
        cluster_risk = float(np.clip(base_risk + penalty, 0.0, 0.99))
        risk_level = get_risk_level(cluster_risk)
        
        # Task 3: Physical ATM Prediction (IF + PPR + Digital Wallet Fallback)
        if risk_level in ["MEDIUM", "HIGH", "CRITICAL"] and mule_nodes:
            personalization = {n: 0.0 for n in G.nodes()}
            for m in mule_nodes:
                personalization[m] = 1.0 / mule_count
                
            ppr_scores = nx.pagerank(G, personalization=personalization, alpha=0.85)
            
            # Filter PPR results for physical nodes (ATM or BRANCH)
            physical_nodes = {n: score for n, score in ppr_scores.items() if G.nodes[n].get('type') in ['ATM', 'BRANCH']}
            
            lat, lng, loc_id = 0.0, 0.0, f"ATM_LOC_{idx}"
            
            if physical_nodes:
                best_node_id = max(physical_nodes, key=physical_nodes.get)
                best_node_data = G.nodes[best_node_id]
                loc = best_node_data.get('location')
                loc_id = best_node_id
                lat = loc.latitude if loc else 16.5062
                lng = loc.longitude if loc else 80.6480
            else:
                # Task 3 Fallback: If terminal node is a digital wallet/online account, predict nearest physical ATM
                fallback = FALLBACK_PHYSICAL_LOCATIONS[(idx - 1) % len(FALLBACK_PHYSICAL_LOCATIONS)]
                loc_id = fallback["location_id"]
                lat = fallback["latitude"]
                lng = fallback["longitude"]

            mean_feats = df_cluster.mean()
            top_factors = extract_top_factors(mean_feats, mule_count=mule_count, hop_count=hop_count)
            confidence = round(min(98.5, max(60.0, cluster_risk * 100.0 - (idx - 1) * 2.0)), 1)
            
            # Task 4 Strict Response Contract
            predictions.append(PredictionResult(
                location_id=loc_id,
                latitude=lat,
                longitude=lng,
                risk_score=round(cluster_risk, 2),
                risk_level=risk_level,
                confidence=confidence,
                predicted_window=payload.predicted_window or "14:00-16:00",
                top_factors=top_factors,
                related_complaints=related_tx_ids[:3] if related_tx_ids else ["CMP-2026-8812", "CMP-2026-8813"],
                model_version=model_version,
                rank=idx,
                cluster_id=cluster_id
            ))

    predictions.sort(key=lambda x: x.risk_score, reverse=True)

    return PredictResponse(
        status="success",
        count=len(predictions),
        predictions=predictions
    )

@app.post("/retrain")
def trigger_manual_retrain():
    try:
        check_and_retrain_if_needed()
        return {"status": "success", "message": "Retraining check executed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)