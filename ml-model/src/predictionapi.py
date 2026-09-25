import os
import json
import logging
import joblib
import numpy as np
import pandas as pd

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# PATHS — versioned model directories
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HOTSPOT_MODEL_PATH    = os.path.join(BASE_DIR, 'models', 'hotspot', 'v1', 'model.joblib')
HOTSPOT_SCHEMA_PATH   = os.path.join(BASE_DIR, 'models', 'hotspot', 'v1', 'feature_schema.json')
HOTSPOT_METADATA_PATH = os.path.join(BASE_DIR, 'models', 'hotspot', 'v1', 'metadata.json')

VOLUME_MODEL_PATH     = os.path.join(BASE_DIR, 'models', 'volume', 'v1', 'model.joblib')
VOLUME_SCHEMA_PATH    = os.path.join(BASE_DIR, 'models', 'volume', 'v1', 'feature_schema.json')
VOLUME_METADATA_PATH  = os.path.join(BASE_DIR, 'models', 'volume', 'v1', 'metadata.json')

# ---------------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------------


class CandidateLocation(BaseModel):
    """
    A candidate ATM/location supplied by the backend.

    The ML service ranks these candidates.
    It does NOT create locations itself.
    """

    atm_id: str
    latitude: float
    longitude: float
    features: Dict[str, float] = Field(default_factory=dict)


class HistoricalFeatures(BaseModel):
    """
    Historical / aggregated transaction features calculated
    by the backend or ML feature pipeline.
    """

    features: Dict[str, float] = Field(default_factory=dict)


class GraphFeatures(BaseModel):
    """
    Graph-derived features.

    The backend constructs the graph and sends only the
    resulting numerical features to the ML service.
    """

    features: Dict[str, float] = Field(default_factory=dict)


class AnomalyFeatures(BaseModel):
    """
    Isolation Forest / anomaly-derived features.

    Isolation Forest is used as an anomaly detector,
    not as the future-hotspot predictor.
    """

    features: Dict[str, float] = Field(default_factory=dict)


class PredictRequest(BaseModel):

    prediction_timestamp: str

    horizon_hours: int = Field(
        default=24,
        ge=1,
        le=168
    )

    candidates: List[CandidateLocation]

    historical_features: Optional[HistoricalFeatures] = None

    transaction_features: Optional[Dict[str, float]] = None

    geographic_features: Optional[Dict[str, float]] = None

    graph_features: Optional[GraphFeatures] = None

    anomaly_features: Optional[AnomalyFeatures] = None


# ---------------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------------


class HotspotPrediction(BaseModel):

    atm_id: str

    latitude: float
    longitude: float

    risk_score: float

    risk_level: str

    predicted_withdrawal_volume: float

    prediction_window_hours: int

    top_factors: List[str] = []

    rank: int


class PredictResponse(BaseModel):

    model_version: str

    generated_at: str

    prediction_timestamp: str

    prediction_horizon_hours: int

    hotspots: List[HotspotPrediction]


# ---------------------------------------------------------------------------
# MODEL LOADING HELPERS
# ---------------------------------------------------------------------------


def load_json(path: str) -> Dict[str, Any]:
    """Load a JSON file, returning an empty dict on any failure."""

    if not os.path.exists(path):
        logger.warning("JSON file not found: %s", path)
        return {}

    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    except Exception as exc:
        logger.warning("Could not parse JSON at %s: %s", path, exc)
        return {}


def load_model(path: str):
    """
    Load a joblib model file.

    Returns None if the file does not exist.
    Raises RuntimeError if the file exists but cannot be loaded.
    """

    if not os.path.exists(path):
        logger.warning("Model file not found: %s", path)
        return None

    try:
        return joblib.load(path)

    except Exception as exc:
        raise RuntimeError(
            f"Could not load model from {path}: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# MODULE-LEVEL MODEL LOADING
# Each model and its schema/metadata are loaded independently.
# ---------------------------------------------------------------------------

hotspot_model    = load_model(HOTSPOT_MODEL_PATH)
hotspot_schema   = load_json(HOTSPOT_SCHEMA_PATH)
hotspot_metadata = load_json(HOTSPOT_METADATA_PATH)

volume_model    = load_model(VOLUME_MODEL_PATH)
volume_schema   = load_json(VOLUME_SCHEMA_PATH)
volume_metadata = load_json(VOLUME_METADATA_PATH)

# Feature name lists — read from the schema files produced by train.py.
HOTSPOT_FEATURES: List[str] = hotspot_schema.get("feature_names", [])
VOLUME_FEATURES: List[str]  = volume_schema.get("feature_names", [])

# Version strings — read from the metadata files.
HOTSPOT_MODEL_VERSION: str = hotspot_metadata.get("model_version", "hotspot_v1")
VOLUME_MODEL_VERSION: str  = volume_metadata.get("model_version", "volume_v1")

# ---------------------------------------------------------------------------
# FASTAPI APPLICATION
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CyberSentinel ML Prediction Service",
    version="1.0.0"
)


# ---------------------------------------------------------------------------
# STARTUP VALIDATION
# ---------------------------------------------------------------------------


@app.on_event("startup")
def validate_models() -> None:
    """Emit warnings when models are not yet trained / available."""

    if hotspot_model is None:
        logger.warning(
            "Hotspot model not found. "
            "Train the hotspot model before inference."
        )

    if volume_model is None:
        logger.warning(
            "Volume model not found. "
            "Train the withdrawal-volume model before inference."
        )


# ---------------------------------------------------------------------------
# FEATURE PREPARATION
# ---------------------------------------------------------------------------


def build_candidate_features(
    candidate: CandidateLocation,
    payload: PredictRequest
) -> Dict[str, float]:
    """
    Merge all feature sources into a single flat dict for one candidate.

    Merge order (later keys overwrite earlier ones):
      1. candidate.features  (per-ATM features from the backend)
      2. historical_features (aggregated transaction history)
      3. transaction_features
      4. geographic_features
      5. graph_features      (graph-derived metrics)
      6. anomaly_features    (Isolation-Forest-derived scores)
    """

    features: Dict[str, float] = {}

    features.update(candidate.features)

    if payload.historical_features:
        features.update(payload.historical_features.features)

    if payload.transaction_features:
        features.update(payload.transaction_features)

    if payload.geographic_features:
        features.update(payload.geographic_features)

    if payload.graph_features:
        features.update(payload.graph_features.features)

    if payload.anomaly_features:
        features.update(payload.anomaly_features.features)

    return features


def create_feature_dataframe(
    features: Dict[str, float],
    expected_features: List[str]
) -> pd.DataFrame:
    """
    Build a single-row DataFrame aligned to the model's expected feature list.

    Missing features are zero-filled.
    """

    row: Dict[str, float] = {}

    for feature_name in expected_features:
        raw = features.get(feature_name, 0.0)

        try:
            row[feature_name] = float(raw)

        except (TypeError, ValueError):
            row[feature_name] = 0.0

    return pd.DataFrame([row], columns=expected_features)


# ---------------------------------------------------------------------------
# RISK SCORE AND RISK LEVEL
# ---------------------------------------------------------------------------


def get_risk_level(risk_score: float) -> str:
    """
    Map a numeric risk score to an operational UI category.

    IMPORTANT — these are operational UI categories, NOT calibrated
    probabilities.  Do NOT interpret risk_score as P(fraud).

     0 – 39   → LOW
    40 – 59   → MODERATE
    60 – 79   → HIGH
    80 – 100  → CRITICAL
    """

    if risk_score >= 80:
        return "CRITICAL"

    if risk_score >= 60:
        return "HIGH"

    if risk_score >= 40:
        return "MODERATE"

    return "LOW"


def calculate_risk_score(candidate_features: pd.DataFrame) -> float:
    """
    Compute a 0–100 risk score from the loaded hotspot model.

    Strategy (in priority order):
      1. predict_proba  → probability of class 1 × 100, clipped [0, 100]
      2. decision_function → sigmoid(raw_score) × 100, clipped [0, 100]
      3. predict        → 100 if predicted class == 1, else 0

    NOTE: The score is a *ranking signal*, not a calibrated probability,
    unless the model was explicitly calibrated with CalibratedClassifierCV
    during training.
    """

    if hotspot_model is None:
        raise RuntimeError("Hotspot model is not loaded.")

    # --- Strategy 1: probability output ---
    if hasattr(hotspot_model, "predict_proba"):

        probabilities = hotspot_model.predict_proba(candidate_features)

        # Take the probability of the positive class (index 1).
        probability = (
            probabilities[0][1]
            if probabilities.shape[1] >= 2
            else probabilities[0][0]
        )

        risk_score = float(probability) * 100.0

    # --- Strategy 2: decision function (e.g. SVM, LinearSVC) ---
    elif hasattr(hotspot_model, "decision_function"):

        raw = hotspot_model.decision_function(candidate_features)
        raw_scalar = float(np.asarray(raw).ravel()[0])

        # Sigmoid maps the unbounded decision score to (0, 1) × 100.
        risk_score = 100.0 / (1.0 + np.exp(-raw_scalar))

    # --- Strategy 3: plain binary prediction ---
    else:

        prediction = hotspot_model.predict(candidate_features)
        risk_score = 100.0 if int(prediction[0]) == 1 else 0.0

    return float(np.clip(risk_score, 0.0, 100.0))


# ---------------------------------------------------------------------------
# WITHDRAWAL VOLUME PREDICTION
# ---------------------------------------------------------------------------


def predict_withdrawal_volume(
    candidate_features: Dict[str, float],
    prediction_timestamp: str,  # noqa: ARG001  (kept for future use)
    horizon_hours: int
) -> float:
    """
    Estimate predicted withdrawal volume over the forecast horizon.

    Supports two model types:
      • Prophet (has make_future_dataframe): sum yhat over future periods.
      • sklearn regressor: predict from VOLUME_FEATURES vector.

    Returns 0.0 on any failure so that one bad volume estimate never
    blocks the full hotspot response.
    """

    if volume_model is None:
        return 0.0

    try:
        # --- Prophet-style model ---
        if hasattr(volume_model, "make_future_dataframe"):

            future_periods = max(1, int(np.ceil(horizon_hours)))

            future = volume_model.make_future_dataframe(
                periods=future_periods,
                freq="h"
            )

            forecast = volume_model.predict(future)

            if "yhat" in forecast.columns:
                predicted_volume = (
                    forecast["yhat"].tail(future_periods).sum()
                )
                return float(max(0.0, predicted_volume))

        # --- Generic sklearn / regression model ---
        if VOLUME_FEATURES:

            feature_df = create_feature_dataframe(
                candidate_features,
                VOLUME_FEATURES
            )

            prediction = volume_model.predict(feature_df)
            value = float(np.asarray(prediction).ravel()[0])
            return max(0.0, value)

    except Exception as exc:
        logger.warning("Volume prediction failed: %s", exc)

    return 0.0


# ---------------------------------------------------------------------------
# TOP FACTOR EXTRACTION
# ---------------------------------------------------------------------------

# Priority list: features are evaluated in this order; the three with the
# highest absolute values are surfaced as human-readable explanation factors.
_FEATURE_PRIORITY: List[tuple] = [
    ("cashout_count",            "High historical cash-out activity"),
    ("cashout_amount",           "High historical cash-out amount"),
    ("suspicious_neighbor_count","Multiple suspicious neighboring accounts"),
    ("account_degree",           "High transaction-network connectivity"),
    ("outgoing_transfer_count",  "High outgoing transfer activity"),
    ("incoming_transfer_count",  "High incoming transfer activity"),
    ("anomaly_score",            "Anomalous transaction behavior"),
    ("historical_location_risk", "Elevated historical location risk"),
    ("pagerank_score",           "High graph centrality"),
    ("Fraud_Count_30D",          "High fraud count in the last 30 days"),
    ("Local_Fraud_Density",      "High local fraud density"),
    ("Withdrawal_Count_30D",     "High withdrawal count in the last 30 days"),
]


def extract_top_factors(features: Dict[str, float]) -> List[str]:
    """
    Return the top-3 human-readable factor descriptions ranked by the
    absolute magnitude of their corresponding feature values.

    Features not present in the supplied dict are skipped.
    If no matching features are found, a generic fallback message is returned.
    """

    scored: List[tuple] = []

    for feature_name, description in _FEATURE_PRIORITY:

        if feature_name not in features:
            continue

        try:
            value = float(features[feature_name])
            scored.append((abs(value), description))

        except (TypeError, ValueError):
            pass

    # Sort descending by magnitude.
    scored.sort(key=lambda x: x[0], reverse=True)

    factors = [desc for _, desc in scored[:3]]

    if not factors:
        factors.append(
            "Prediction based on supplied historical and graph-derived features"
        )

    return factors


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------


@app.post(
    "/predict",
    response_model=PredictResponse,
    summary="Score candidate ATM locations and rank by cashout risk"
)
def predict_hotspots(payload: PredictRequest) -> PredictResponse:
    """
    Main hotspot prediction endpoint.

    Accepts a list of candidate ATM locations together with pre-computed
    feature vectors and returns each candidate ranked by predicted cashout
    risk score (descending).
    """

    if not payload.candidates:
        raise HTTPException(
            status_code=400,
            detail="At least one candidate location is required."
        )

    if hotspot_model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Hotspot model is not available. "
                "Train the model before calling /predict."
            )
        )

    predictions: List[Dict[str, Any]] = []

    for candidate in payload.candidates:

        # --- Feature assembly ---
        features = build_candidate_features(candidate, payload)

        feature_df = create_feature_dataframe(features, HOTSPOT_FEATURES)

        # --- Hotspot risk ---
        risk_score = calculate_risk_score(feature_df)
        risk_level = get_risk_level(risk_score)

        # --- Withdrawal volume ---
        predicted_volume = predict_withdrawal_volume(
            features,
            payload.prediction_timestamp,
            payload.horizon_hours
        )

        # --- Explanation ---
        top_factors = extract_top_factors(features)

        predictions.append(
            {
                "atm_id":                     candidate.atm_id,
                "latitude":                   candidate.latitude,
                "longitude":                  candidate.longitude,
                "risk_score":                 round(risk_score, 2),
                "risk_level":                 risk_level,
                "predicted_withdrawal_volume": round(predicted_volume, 2),
                "prediction_window_hours":    payload.horizon_hours,
                "top_factors":                top_factors,
            }
        )

    # Rank by descending risk score.
    predictions.sort(key=lambda x: x["risk_score"], reverse=True)

    for rank, prediction in enumerate(predictions, start=1):
        prediction["rank"] = rank

    return PredictResponse(
        model_version=(
            f"{HOTSPOT_MODEL_VERSION}+{VOLUME_MODEL_VERSION}"
        ),
        generated_at=datetime.now(timezone.utc).isoformat(),
        prediction_timestamp=payload.prediction_timestamp,
        prediction_horizon_hours=payload.horizon_hours,
        hotspots=predictions
    )


@app.get(
    "/health",
    summary="Liveness and model availability check"
)
def health_check() -> Dict[str, Any]:
    """
    Return service health and model availability.

    Fields:
      • status                — always 'healthy' when the service responds
      • hotspot_model_loaded  — True if the hotspot model was loaded
      • volume_model_loaded   — True if the volume model was loaded
      • hotspot_model_version — version string from metadata.json
      • volume_model_version  — version string from metadata.json
    """

    return {
        "status":                "healthy",
        "hotspot_model_loaded":  hotspot_model is not None,
        "volume_model_loaded":   volume_model is not None,
        "hotspot_model_version": HOTSPOT_MODEL_VERSION,
        "volume_model_version":  VOLUME_MODEL_VERSION,
    }


@app.get(
    "/model-info",
    summary="Full metadata for both loaded models"
)
def model_info() -> Dict[str, Any]:
    """
    Return feature schemas and training metadata for both models.

    The metadata dicts are loaded at startup from the versioned
    ``metadata.json`` files alongside each ``model.joblib``.
    """

    return {
        "hotspot": {
            "model_version": HOTSPOT_MODEL_VERSION,
            "features":      HOTSPOT_FEATURES,
            "metadata":      hotspot_metadata,
        },
        "volume": {
            "model_version": VOLUME_MODEL_VERSION,
            "features":      VOLUME_FEATURES,
            "metadata":      volume_metadata,
        },
    }


# ---------------------------------------------------------------------------
# APPLICATION START
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)