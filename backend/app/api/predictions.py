"""
CyberSentinel — Prediction API
================================
Orchestrates ML inference requests, stores prediction runs, generates
prediction-driven alerts, and serves results to the frontend.

Endpoints:
  POST /api/v1/predictions/run       — orchestrated ML inference run
  GET  /api/v1/predictions/          — list stored predictions (legacy)
  GET  /api/v1/predictions/forecast  — Prophet zone forecast
  GET  /api/v1/predictions/{id}      — single prediction by ID (legacy)

Data flow:
  1. Load ATM candidates from db.atms
  2. Compute graph-derived features from db.transactions
  3. Build ML inference request (stable contract)
  4. POST to ML microservice /predict
  5. Parse and validate ML response
  6. Persist hotspots to db.predictions + db.prediction_runs
  7. Auto-generate prediction-driven alerts (risk_score >= threshold)
  8. Return results
"""

import math
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import httpx
from fastapi import APIRouter, Depends, Query, HTTPException, status, Body
from app.config import settings
from app.db.mongo import get_database
from app.schemas.prediction import (
    PredictionResponse,
    PredictionRunRequest,
    PredictionRunResponse,
    MLPredictRequest,
    MLPredictResponse,
    CandidateLocation,
    StoredHotspot,
)
from app.auth.dependencies import get_current_user
from app.schemas.auth import TokenData

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/predictions", tags=["Predictions"])

# ---------------------------------------------------------------------------
# Alert thresholds (configurable via env in production)
# ---------------------------------------------------------------------------
ALERT_THRESHOLD_HIGH     = 60.0   # risk_score >= 60 → HIGH alert
ALERT_THRESHOLD_CRITICAL = 80.0   # risk_score >= 80 → CRITICAL alert


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _risk_level_from_score(score: float) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "MODERATE"
    return "LOW"


def _reason_codes_from_factors(top_factors: List[str]) -> List[str]:
    """Convert ML top_factors list to human-readable reason codes."""
    mapping = {
        "cashout_count":               "HIGH_RECENT_CASHOUT_FREQUENCY",
        "cashout_amount":              "HIGH_RECENT_CASHOUT_VOLUME",
        "suspicious_neighbor_count":   "SUSPICIOUS_ACCOUNT_CHAIN",
        "account_degree":              "HIGH_ACCOUNT_DEGREE_CENTRALITY",
        "outgoing_transfer_count":     "HIGH_OUTGOING_TRANSFER_COUNT",
        "incoming_transfer_count":     "HIGH_INCOMING_TRANSFER_COUNT",
        "anomaly_score":               "ANOMALY_SCORE_ELEVATED",
        "historical_location_risk":    "HISTORICAL_ATM_HOTSPOT",
        "pagerank_score":              "HIGH_PAGERANK_RISK_PROPAGATION",
        "Fraud_Count_30D":             "HIGH_RECENT_FRAUD_ACTIVITY",
        "Local_Fraud_Density":         "HIGH_LOCAL_FRAUD_DENSITY",
        "Withdrawal_Count_30D":        "HIGH_WITHDRAWAL_FREQUENCY_30D",
    }
    codes = [mapping.get(f, f.upper()) for f in top_factors]
    return codes if codes else ["ELEVATED_RISK_SCORE"]


async def _create_prediction_alert(
    db,
    prediction_run_id: str,
    hotspot: StoredHotspot,
) -> bool:
    """
    Create a prediction-driven alert for a hotspot that exceeds the risk threshold.
    Returns True if alert was created.
    """
    if hotspot.risk_score < ALERT_THRESHOLD_HIGH:
        return False

    severity = "CRITICAL" if hotspot.risk_score >= ALERT_THRESHOLD_CRITICAL else "HIGH"
    now = _now_iso()
    alert_id = f"ALT_{hotspot.atm_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    alert_doc = {
        "id": alert_id,
        "prediction_run_id": prediction_run_id,
        "alert_type": "PREDICTED_CASH_OUT_HOTSPOT",
        "atm_id": hotspot.atm_id,
        "city": hotspot.city,
        "district": hotspot.district,
        "state": hotspot.state,
        "latitude": hotspot.latitude,
        "longitude": hotspot.longitude,
        "geocode_status": hotspot.geocode_status,
        "risk_score": hotspot.risk_score,
        "riskScore": hotspot.risk_score,   # keep both for legacy frontend compat
        "risk_level": hotspot.risk_level,
        "severity": severity,
        "predicted_withdrawal_volume": hotspot.predicted_withdrawal_volume,
        "prediction_window_hours": hotspot.prediction_window_hours,
        "reason_codes": _reason_codes_from_factors(hotspot.top_factors),
        "top_factors": hotspot.top_factors,
        "location": f"{hotspot.atm_id} — {hotspot.city or 'Unknown'}",
        "crime_category": "Predicted ATM Cash-Out Hotspot",
        "status": "NEW",
        "model_version": hotspot.model_version,
        "created_at": now,
    }

    await db["alerts"].insert_one(alert_doc)
    logger.info("Created prediction-driven alert %s (risk=%.1f, severity=%s)",
                alert_id, hotspot.risk_score, severity)
    return True


async def _build_graph_features(db, atm_id: str) -> Dict[str, float]:
    """
    Query MongoDB transactions to build graph-derived features for a specific ATM.
    These are the same feature names expected by the ML service feature schema.
    """
    # Count transactions ending at this ATM (cash withdrawals)
    cashout_txns = await db["transactions"].find(
        {"atm_id": atm_id, "transaction_type": {"$in": ["CASH_WITHDRAWAL", "Debit"]},
         "payment_mode": "ATM"},
        {"transaction_amount": 1, "source_hashed_acc_no": 1}
    ).to_list(length=500)

    cashout_count  = len(cashout_txns)
    cashout_amount = sum(float(t.get("transaction_amount", 0)) for t in cashout_txns)
    unique_accounts = len({t.get("source_hashed_acc_no") for t in cashout_txns if t.get("source_hashed_acc_no")})

    return {
        "cashout_count":             float(cashout_count),
        "cashout_amount":            float(cashout_amount),
        "unique_counterparty_count": float(unique_accounts),
        "account_degree":            float(unique_accounts),
        "incoming_transfer_count":   float(cashout_count),
        "outgoing_transfer_count":   0.0,
        "pagerank_score":            0.0,   # populated by graph engine if run first
        "suspicious_neighbor_count": 0.0,
        "chain_depth":               0.0,
        "anomaly_score":             0.0,
    }


# ---------------------------------------------------------------------------
# POST /predictions/run — Main orchestration endpoint
# ---------------------------------------------------------------------------

@router.post("/run", response_model=PredictionRunResponse)
async def run_prediction(
    req: PredictionRunRequest = Body(default_factory=PredictionRunRequest),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Orchestrated ML prediction run.

    1. Load ATM candidates from db.atms (filtered by location if specified).
    2. Compute graph-derived features for each ATM from db.transactions.
    3. Build and POST ML inference request to the ML microservice.
    4. Validate ML response.
    5. Persist prediction run + individual hotspots to MongoDB.
    6. Auto-generate prediction-driven alerts (risk >= threshold).
    7. Return full prediction run results.
    """
    db = get_database()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    prediction_run_id = f"PRED_{now.strftime('%Y%m%d_%H%M%S')}"

    # ---- 1. Load ATM candidates ----------------------------------------
    atm_query: Dict[str, Any] = {}
    if req.locations:
        atm_query["atm_city"] = {"$in": req.locations}

    atm_docs = await db["atms"].find(atm_query, {"_id": 0}).to_list(length=req.max_candidates)

    if not atm_docs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No ATM records found in db.atms. "
                "Import ATMs via POST /api/v1/intake/atm first, or run the synthetic data generator."
            ),
        )

    # ---- 2. Build candidates with graph features -----------------------
    candidates: List[CandidateLocation] = []
    for atm in atm_docs:
        lat = atm.get("latitude") or atm.get("atm_latitude")
        lon = atm.get("longitude") or atm.get("atm_longitude")

        # Skip ATMs without valid coordinates — never fallback to (0, 0)
        if not lat or not lon or lat == 0.0 or lon == 0.0:
            logger.warning("Skipping ATM %s — missing valid coordinates", atm.get("atm_id"))
            continue

        features: Dict[str, float] = {}
        if req.include_graph_features:
            features = await _build_graph_features(db, atm.get("atm_id", ""))

        candidates.append(CandidateLocation(
            atm_id=str(atm.get("atm_id", "")),
            latitude=float(lat),
            longitude=float(lon),
            features=features,
        ))

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="All ATM records are missing valid geographic coordinates.",
        )

    # ---- 3. Build ML request -------------------------------------------
    ml_request = MLPredictRequest(
        prediction_timestamp=now_iso,
        horizon_hours=req.prediction_horizon_hours,
        candidates=candidates,
    )

    # ---- 4. Call ML service -------------------------------------------
    ml_url = f"{settings.ml_service_url.rstrip('/')}/predict"
    logger.info("Sending %d candidates to ML service: %s", len(candidates), ml_url)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(ml_url, json=ml_request.model_dump())
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"ML service returned HTTP {resp.status_code}: {resp.text[:500]}",
                )
            raw = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ML microservice unreachable at {ml_url}: {exc}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ML request error: {exc}",
        )

    # ---- 5. Validate ML response ---------------------------------------
    try:
        ml_response = MLPredictResponse.model_validate(raw)
    except Exception as exc:
        logger.error("ML response validation failed: %s | raw=%s", exc, str(raw)[:500])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ML service returned an unexpected response format: {exc}",
        )

    # ---- 6. Build ATM metadata lookup for enrichment ------------------
    atm_meta: Dict[str, Dict] = {
        str(a.get("atm_id", "")): a for a in atm_docs
    }

    # ---- 7. Persist prediction run + hotspots -------------------------
    stored_hotspots: List[StoredHotspot] = []
    alerts_created = 0
    window_start = now_iso
    window_end   = (now + timedelta(hours=req.prediction_horizon_hours)).isoformat()

    for hs in ml_response.hotspots:
        meta = atm_meta.get(hs.atm_id, {})
        lat = hs.latitude if hs.latitude and hs.latitude != 0.0 else None
        lon = hs.longitude if hs.longitude and hs.longitude != 0.0 else None

        stored = StoredHotspot(
            atm_id=hs.atm_id,
            city=meta.get("atm_city") or meta.get("city"),
            district=meta.get("atm_district") or meta.get("district"),
            state=meta.get("atm_state") or meta.get("state"),
            latitude=lat,
            longitude=lon,
            geocode_status="MAPPED" if (lat and lon) else "UNMAPPED",
            risk_score=round(hs.risk_score, 2),
            risk_level=hs.risk_level,
            predicted_withdrawal_volume=round(hs.predicted_withdrawal_volume, 2),
            prediction_window_start=window_start,
            prediction_window_end=window_end,
            prediction_window_hours=req.prediction_horizon_hours,
            top_factors=hs.top_factors,
            rank=hs.rank,
            model_version=ml_response.model_version,
        )

        doc = stored.model_dump()
        doc["prediction_run_id"] = prediction_run_id
        doc["generated_at"]      = now_iso
        doc["id"]                = f"{prediction_run_id}_{hs.atm_id}"
        doc["location_id"]       = hs.atm_id
        doc["location_name"]     = f"{hs.atm_id} — {stored.city or 'Unknown'}"
        doc["region"]            = stored.state
        doc["predicted_window"]  = f"{req.prediction_horizon_hours}h"
        doc["created_at"]        = now

        await db["predictions"].update_one(
            {"id": doc["id"]},
            {"$set": doc},
            upsert=True,
        )

        # ---- 8. Generate prediction-driven alert ----------------------
        if await _create_prediction_alert(db, prediction_run_id, stored):
            alerts_created += 1

        stored_hotspots.append(stored)

    # Persist prediction run summary
    run_doc = {
        "prediction_run_id": prediction_run_id,
        "generated_at": now_iso,
        "horizon_hours": req.prediction_horizon_hours,
        "candidates_count": len(candidates),
        "hotspots_count": len(stored_hotspots),
        "alerts_created": alerts_created,
        "model_version": ml_response.model_version,
        "locations_filter": req.locations,
        "status": "COMPLETED",
    }
    await db["prediction_runs"].insert_one(run_doc)

    logger.info("Prediction run %s complete: %d hotspots, %d alerts",
                prediction_run_id, len(stored_hotspots), alerts_created)

    return PredictionRunResponse(
        prediction_run_id=prediction_run_id,
        generated_at=now_iso,
        horizon_hours=req.prediction_horizon_hours,
        hotspots_count=len(stored_hotspots),
        alerts_created=alerts_created,
        hotspots=stored_hotspots,
    )


# ---------------------------------------------------------------------------
# GET /predictions/forecast — Prophet zone forecast (must be before /{id})
# ---------------------------------------------------------------------------

@router.get("/forecast")
async def get_atm_cashout_forecast(
    hours_ahead: int = Query(default=12, ge=1, le=72,
        description="Forecast horizon in hours (e.g. 12, 24, 48)"),
):
    """
    Spatiotemporal time-series cash-out forecasting for ATM zones.
    Uses Prophet (with harmonic seasonal fallback).

    NOTE: The historical series used here is SIMULATED synthetic data
    grounded in NCERT 2024 ATM hotspot distributions. This is clearly
    labelled as SIMULATED and is not based on live government feeds.
    """
    try:
        from app.engine.forecasting import forecast_atm_hotspots
        results = forecast_atm_hotspots(hours_ahead=hours_ahead)
        return {
            "status": "success",
            "data_source": "SIMULATED — synthetic history based on NCERT 2024 ATM hotspot distributions",
            "algorithm": "Facebook Prophet / Harmonic Seasonal Decomposition",
            "forecast_horizon_hours": hours_ahead,
            "generated_at": _now_iso(),
            "forecasted_zones_count": len(results),
            "zones": results,
        }
    except Exception as exc:
        logger.error("Forecast error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /predictions/ — List stored predictions (legacy)
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[PredictionResponse])
async def get_predictions(
    region: Optional[str]       = Query(default=None),
    risk_level: Optional[str]   = Query(default=None),
    prediction_run_id: Optional[str] = Query(default=None),
    limit: int                  = Query(default=100, ge=1, le=500),
    current_user: TokenData     = Depends(get_current_user),
):
    """Return stored prediction hotspots (from prediction runs)."""
    db = get_database()
    query: Dict[str, Any] = {}
    if region:
        query["region"] = region
    if risk_level:
        query["risk_level"] = risk_level.upper()
    if prediction_run_id:
        query["prediction_run_id"] = prediction_run_id

    docs = await db["predictions"].find(query, {"_id": 0}).sort("risk_score", -1).to_list(length=limit)

    results = []
    for doc in docs:
        # Guard: never return (0, 0) coordinates
        if doc.get("latitude") == 0.0:
            doc["latitude"] = None
            doc["geocode_status"] = "UNMAPPED"
        if doc.get("longitude") == 0.0:
            doc["longitude"] = None
            doc["geocode_status"] = "UNMAPPED"
        try:
            results.append(PredictionResponse.model_validate(doc))
        except Exception as exc:
            logger.warning("Skipping malformed prediction doc: %s", exc)
    return results


# ---------------------------------------------------------------------------
# GET /predictions/{prediction_id} — Single prediction (legacy)
# ---------------------------------------------------------------------------

@router.get("/{prediction_id}", response_model=PredictionResponse)
async def get_prediction_by_id(
    prediction_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    db = get_database()
    doc = await db["predictions"].find_one({"id": prediction_id}, {"_id": 0})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prediction '{prediction_id}' not found.",
        )
    if doc.get("latitude") == 0.0:
        doc["latitude"] = None
        doc["geocode_status"] = "UNMAPPED"
    if doc.get("longitude") == 0.0:
        doc["longitude"] = None
        doc["geocode_status"] = "UNMAPPED"
    return PredictionResponse.model_validate(doc)