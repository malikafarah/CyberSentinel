"""
CyberSentinel — Backend Prediction Schemas
===========================================
Defines the shared contract between the backend and ML microservice.

IMPORTANT:
  - risk_score is 0–100 (operational ranking score, NOT a calibrated probability).
  - This schema must match `predictionapi.py` in `ml-model/src/` exactly.
"""

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# ATM / Candidate Location
# ---------------------------------------------------------------------------

class CandidateLocation(BaseModel):
    """One ATM candidate sent to the ML service for scoring."""
    atm_id: str
    latitude: float
    longitude: float
    features: Dict[str, float] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# ML Service Inference Request (backend → ML)
# ---------------------------------------------------------------------------

class MLPredictRequest(BaseModel):
    """
    Stable contract sent from the backend to POST /predict on the ML service.
    Field names and types must match ml-model/src/predictionapi.py PredictRequest.
    """
    prediction_timestamp: str  # ISO-8601 e.g. "2026-09-25T20:00:00"
    horizon_hours: int = Field(default=24, ge=1, le=168)
    candidates: List[CandidateLocation]
    historical_features: Optional[Dict[str, float]] = None
    transaction_features: Optional[Dict[str, float]] = None
    geographic_features: Optional[Dict[str, float]] = None
    graph_features: Optional[Dict[str, float]] = None
    anomaly_features: Optional[Dict[str, float]] = None


# ---------------------------------------------------------------------------
# ML Service Inference Response (ML → backend)
# ---------------------------------------------------------------------------

class HotspotPrediction(BaseModel):
    """
    Single ATM hotspot prediction as returned by the ML service.
    risk_score is a ranking signal (0–100), NOT a calibrated probability.
    """
    atm_id: str
    latitude: float
    longitude: float
    risk_score: float = Field(..., ge=0.0, le=100.0,
        description="Operational risk ranking score 0–100. NOT a calibrated probability.")
    risk_level: str  # LOW | MODERATE | HIGH | CRITICAL
    predicted_withdrawal_volume: float = 0.0
    prediction_window_hours: int = 24
    top_factors: List[str] = Field(default_factory=list)
    rank: int = 1


class MLPredictResponse(BaseModel):
    """Full response envelope from POST /predict on the ML service."""
    model_version: str
    generated_at: str
    prediction_timestamp: str
    prediction_horizon_hours: int
    hotspots: List[HotspotPrediction]


# ---------------------------------------------------------------------------
# Prediction Run (stored in MongoDB)
# ---------------------------------------------------------------------------

class PredictionRunRequest(BaseModel):
    """Request body for POST /api/v1/predictions/run."""
    prediction_horizon_hours: int = Field(default=24, ge=1, le=168)
    locations: Optional[List[str]] = None   # city names to filter ATMs; None = all
    include_graph_features: bool = True
    max_candidates: int = Field(default=100, ge=1, le=500)


class StoredHotspot(BaseModel):
    """One hotspot stored in the predictions collection with enriched metadata."""
    atm_id: str
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geocode_status: str = "MAPPED"         # MAPPED | UNMAPPED
    risk_score: float = Field(..., ge=0.0, le=100.0)
    risk_level: str
    predicted_withdrawal_volume: float = 0.0
    prediction_window_start: Optional[str] = None
    prediction_window_end: Optional[str] = None
    prediction_window_hours: int = 24
    top_factors: List[str] = Field(default_factory=list)
    rank: int = 1
    model_version: str = "unknown"


class PredictionRunResponse(BaseModel):
    """Response for POST /api/v1/predictions/run."""
    model_config = ConfigDict(from_attributes=True)

    prediction_run_id: str
    generated_at: str
    horizon_hours: int
    hotspots_count: int
    alerts_created: int
    hotspots: List[StoredHotspot]


# ---------------------------------------------------------------------------
# Legacy schemas — kept for backwards compatibility with existing GET /predictions/
# ---------------------------------------------------------------------------

class PredictionResponse(BaseModel):
    """
    Legacy prediction response used by GET /predictions/ and GET /predictions/{id}.
    New endpoints should use StoredHotspot / PredictionRunResponse instead.
    """
    model_config = ConfigDict(from_attributes=True)

    id: str
    location_id: Optional[str] = None
    location_name: Optional[str] = None
    region: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geocode_status: str = "MAPPED"
    crime_category: Optional[str] = "Financial Cyber Fraud"
    risk_score: float = Field(default=0.0, ge=0.0, le=100.0,
        description="Operational risk ranking score 0–100. NOT a calibrated probability.")
    risk_level: str = "LOW"
    predicted_window: Optional[str] = None
    rank: Optional[int] = 1
    top_factors: List[str] = Field(default_factory=list)
    related_complaints: List[str] = Field(default_factory=list)
    confidence: Optional[float] = None
    case_id: Optional[str] = None
    model_version: str = "unknown"
    prediction_run_id: Optional[str] = None
    atm_id: Optional[str] = None
    predicted_withdrawal_volume: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def reject_zero_zero(cls, v: Any) -> Any:
        """Prevent silent (0, 0) fallback — return None instead."""
        if v == 0.0:
            return None
        return v


class PredictLiveRequest(BaseModel):
    """Legacy live-predict request kept for backwards compatibility."""
    candidates: Optional[List[dict]] = None
    predicted_window: Optional[str] = "3h"