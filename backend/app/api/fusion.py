# backend/app/api/fusion.py
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongo import get_database

router = APIRouter(prefix="/fusion", tags=["Ecosystem Signal Fusion (eFRM & FRI)"])


class FusionSignal(BaseModel):
    identifier: str  # e.g., phone number, UPI, account number, or node_id
    source: str  # "NPCI_eFRM", "DoT_Chakshu", "NCRP", "DoT_FRI", "MNRL"
    risk_score: float
    timestamp: Optional[str] = None
    reason: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


def get_db(request: Request):
    if hasattr(request.app, "mongodb") and request.app.mongodb is not None:
        return request.app.mongodb
    return get_database()


@router.post("/ingest-signal")
async def ingest_national_signal(signal: FusionSignal, request: Request):
    """
    Ingests real-time threat signals from NPCI eFRM, DoT Chakshu/FRI, and NCRP feeds.
    Fuses external confidence signals dynamically into graph entity nodes.
    """
    db = get_db(request)
    nodes_col = db["nodes"]
    fusion_col = db["fusion_signals"]

    now_ts = signal.timestamp or datetime.now(timezone.utc).isoformat()

    # 1. Flexible lookup for the target node (by ObjectId, string ID, account, UPI, or phone)
    query = {
        "$or": [
            {"_id": signal.identifier},
            {"id": signal.identifier},
            {"metadata.identifier": signal.identifier},
            {"metadata.account": signal.identifier},
            {"metadata.upi": signal.identifier},
            {"metadata.phone": signal.identifier},
            {"metadata.label": {"$regex": signal.identifier, "$options": "i"}}
        ]
    }
    if ObjectId.is_valid(signal.identifier):
        query["$or"].append({"_id": ObjectId(signal.identifier)})

    node = await nodes_col.find_one(query)

    if not node:
        # Create entity if missing
        seed_type = "MULE" if "@" in signal.identifier or len(signal.identifier) > 8 else "SUSPECT"
        node = {
            "_id": signal.identifier,
            "type": seed_type,
            "riskScore": float(signal.risk_score),
            "status": "ACTIVE",
            "metadata": {
                "label": f"Fused Entity ({signal.identifier})",
                "source": signal.source
            }
        }
        await nodes_col.insert_one(node)

    current_risk = float(node.get("riskScore", 50.0))
    metadata = dict(node.get("metadata", {}) or {})

    # 2. Multi-Agency Fusion Logic: External alerts act as a multiplier / calibrated amplifier
    source_clean = signal.source.upper()
    if "NPCI" in source_clean or "EFRM" in source_clean:
        metadata["eFRM_flag"] = True
        metadata["eFRM_score"] = signal.risk_score
        metadata["eFRM_last_alert"] = now_ts
        # Heavy weight for NPCI eFRM UPI velocity alerts
        new_risk = min(100.0, max(current_risk * 1.5, signal.risk_score, 88.0))
    elif "CHAKSHU" in source_clean or "DOT" in source_clean or "FRI" in source_clean:
        metadata["DoT_FRI_score"] = signal.risk_score
        metadata["DoT_Chakshu_flag"] = True
        metadata["DoT_last_alert"] = now_ts
        # DoT Chakshu SIM churn / MNRL revocation flag
        new_risk = min(100.0, max(current_risk * 1.4, signal.risk_score, 85.0))
    elif "NCRP" in source_clean:
        metadata["NCRP_flag"] = True
        metadata["NCRP_score"] = signal.risk_score
        metadata["NCRP_last_alert"] = now_ts
        new_risk = min(100.0, max(current_risk, signal.risk_score, 90.0))
    else:
        metadata[f"{signal.source}_score"] = signal.risk_score
        new_risk = min(100.0, (current_risk + signal.risk_score) / 2.0)

    # 3. Update database
    node_id_val = node.get("_id")
    await nodes_col.update_one(
        {"_id": node_id_val},
        {
            "$set": {
                "riskScore": round(new_risk, 1),
                "metadata": metadata
            }
        }
    )

    # Record signal in audit/fusion collection
    signal_doc = {
        "identifier": signal.identifier,
        "source": signal.source,
        "input_risk": signal.risk_score,
        "resulting_risk": round(new_risk, 1),
        "target_node_id": str(node_id_val),
        "reason": signal.reason or f"Automated webhook ingestion from {signal.source}",
        "timestamp": now_ts
    }
    await fusion_col.insert_one(signal_doc)

    return {
        "status": "fusion_updated",
        "node_id": str(node_id_val),
        "identifier": signal.identifier,
        "source": signal.source,
        "previous_risk": current_risk,
        "new_risk": round(new_risk, 1),
        "metadata": metadata
    }


@router.get("/signals")
async def list_fusion_signals(request: Request):
    """Returns recent national agency fusion signals."""
    db = get_db(request)
    signals = await db["fusion_signals"].find({}, {"_id": 0}).sort([("_id", -1)]).to_list(length=50)
    return {
        "status": "success",
        "count": len(signals),
        "signals": signals
    }
