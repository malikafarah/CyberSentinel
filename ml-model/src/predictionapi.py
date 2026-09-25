import os
import json
import joblib
import numpy as np
import pandas as pd

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# PATHS
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MODEL_PATH = os.path.join(
    BASE_DIR, "models", "model.pkl"
)

# REQUEST SCHEMAS

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


# RESPONSE SCHEMAS

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


# MODEL LOADING


def load_json(path: str) -> Dict[str, Any]:

    if not os.path.exists(path):
        return {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    except Exception:
        return {}


def load_model(path: str):

    if not os.path.exists(path):
        return None

    try:
        return joblib.load(path)

    except Exception as e:
        raise RuntimeError(
            f"Could not load model from {path}: {e}"
        )


model_artifact = load_model(MODEL_PATH)

if model_artifact:
    hotspot_model = model_artifact.get("hotspot_model")
    volume_model = model_artifact.get("volume_model")
    
    HOTSPOT_FEATURES = model_artifact.get("feature_names", [])
    VOLUME_FEATURES = model_artifact.get("feature_names", [])
    
    HOTSPOT_MODEL_VERSION = model_artifact.get("model_version", "hotspot_v1")
    VOLUME_MODEL_VERSION = model_artifact.get("model_version", "volume_v1")
    
    hotspot_metadata = model_artifact.get("metrics", {})
    volume_metadata = model_artifact.get("metrics", {})
else:
    hotspot_model = None
    volume_model = None
    HOTSPOT_FEATURES = []
    VOLUME_FEATURES = []
    HOTSPOT_MODEL_VERSION = "unknown"
    VOLUME_MODEL_VERSION = "unknown"
    hotspot_metadata = {}
    volume_metadata = {}


# FASTAPI

app = FastAPI(
    title="CyberSentinel ML Prediction Service",
    version="1.0.0"
)

# VALIDATION

@app.on_event("startup")
def validate_models():

    if hotspot_model is None:
        print(
            "[WARNING] Hotspot model not found. "
            "Train the hotspot model before inference."
        )

    if volume_model is None:
        print(
            "[WARNING] Volume model not found. "
            "Train the withdrawal-volume model before inference."
        )

# FEATURE PREPARATION

def build_candidate_features(
    candidate: CandidateLocation,
    payload: PredictRequest
) -> Dict[str, float]:

    features = {}

    # Candidate-specific features

    features.update(candidate.features)

    # Historical features

    if payload.historical_features:
        features.update(
            payload.historical_features.features
        )

    # Transaction features

    if payload.transaction_features:
        features.update(
            payload.transaction_features
        )

    # Geographic features

    if payload.geographic_features:
        features.update(
            payload.geographic_features
        )

    # Graph-derived features

    if payload.graph_features:
        features.update(
            payload.graph_features.features
        )

    # Anomaly features

    if payload.anomaly_features:
        features.update(
            payload.anomaly_features.features
        )

    return features


def create_feature_dataframe(
    features: Dict[str, float],
    expected_features: List[str]
) -> pd.DataFrame:

    row = {}

    for feature in expected_features:

        value = features.get(feature, 0.0)

        try:
            value = float(value)

        except (TypeError, ValueError):
            value = 0.0

        row[feature] = value

    return pd.DataFrame(
        [row],
        columns=expected_features
    )

# RISK SCORE

def get_risk_level(
    risk_score: float
) -> str:

    """
    Operational risk mapping from the specification.

    0-39    LOW
    40-59   MODERATE
    60-79   HIGH
    80-100  CRITICAL
    """

    if risk_score >= 80:
        return "CRITICAL"

    if risk_score >= 60:
        return "HIGH"

    if risk_score >= 40:
        return "MODERATE"

    return "LOW"


def calculate_risk_score(
    candidate_features: pd.DataFrame
) -> float:

    if hotspot_model is None:
        raise RuntimeError(
            "Hotspot model is not loaded."
        )

    # Classification model

    if hasattr(hotspot_model, "predict_proba"):

        probabilities = hotspot_model.predict_proba(
            candidate_features
        )

        # Probability of future_cashout = 1
        if probabilities.shape[1] >= 2:
            probability = probabilities[0][1]

        else:
            probability = probabilities[0][0]

        # This is only valid as a probability if the model
        # was properly calibrated during training.
        risk_score = float(probability * 100.0)

    # Models that provide decision_function

    elif hasattr(hotspot_model, "decision_function"):

        raw_score = hotspot_model.decision_function(
            candidate_features
        )

        raw_score = float(np.asarray(raw_score).ravel()[0])

        # Convert to a ranking score.
        # This is NOT presented as a probability.
        risk_score = float(
            100.0 / (1.0 + np.exp(-raw_score))
        )

    # Generic classifier

    else:

        prediction = hotspot_model.predict(
            candidate_features
        )

        risk_score = (
            100.0
            if int(prediction[0]) == 1
            else 0.0
        )

    return float(
        np.clip(risk_score, 0.0, 100.0)
    )


# WITHDRAWAL VOLUME

def predict_withdrawal_volume(
    candidate_features: Dict[str, float],
    prediction_timestamp: str,
    horizon_hours: int
) -> float:

    if volume_model is None:
        return 0.0

    try:
        # Prophet-style model

        if hasattr(volume_model, "make_future_dataframe"):

            future_periods = max(
                1,
                int(np.ceil(horizon_hours))
            )

            future = volume_model.make_future_dataframe(
                periods=future_periods,
                freq="h"
            )

            forecast = volume_model.predict(future)

            if "yhat" in forecast.columns:

                predicted_volume = forecast[
                    "yhat"
                ].tail(future_periods).sum()

                return float(
                    max(0.0, predicted_volume)
                )

        # Generic sklearn/regression model

        if VOLUME_FEATURES:

            feature_df = create_feature_dataframe(
                candidate_features,
                VOLUME_FEATURES
            )

            prediction = volume_model.predict(
                feature_df
            )

            value = float(
                np.asarray(prediction).ravel()[0]
            )

            return max(0.0, value)

    except Exception as e:

        print(
            f"[WARNING] Volume prediction failed: {e}"
        )

    return 0.0

# EXPLANATION

def extract_top_factors(
    features: Dict[str, float]
) -> List[str]:

    """
    Explanation based on actual feature values.

    These are deliberately generic until the final feature
    schema from train.py is fixed.
    """

    factors = []

    feature_priority = [
        (
            "cashout_count",
            "High historical cash-out activity"
        ),
        (
            "cashout_amount",
            "High historical cash-out amount"
        ),
        (
            "suspicious_neighbor_count",
            "Multiple suspicious neighboring accounts"
        ),
        (
            "account_degree",
            "High transaction-network connectivity"
        ),
        (
            "outgoing_transfer_count",
            "High outgoing transfer activity"
        ),
        (
            "incoming_transfer_count",
            "High incoming transfer activity"
        ),
        (
            "anomaly_score",
            "Anomalous transaction behavior"
        ),
        (
            "historical_location_risk",
            "Elevated historical location risk"
        ),
        (
            "pagerank_score",
            "High graph centrality"
        )
    ]

    scored_factors = []

    for feature_name, description in feature_priority:

        if feature_name in features:

            try:
                value = float(
                    features[feature_name]
                )

                scored_factors.append(
                    (
                        abs(value),
                        description
                    )
                )

            except (TypeError, ValueError):
                pass

    scored_factors.sort(
        key=lambda x: x[0],
        reverse=True
    )

    factors = [
        description
        for _, description
        in scored_factors[:3]
    ]

    if not factors:
        factors.append(
            "Prediction based on supplied historical and graph-derived features"
        )

    return factors

# MAIN PREDICTION ENDPOINT

@app.post(
    "/predict",
    response_model=PredictResponse
)
def predict_hotspots(
    payload: PredictRequest
):

    # Validate request

    if not payload.candidates:

        raise HTTPException(
            status_code=400,
            detail="At least one candidate location is required."
        )

    if hotspot_model is None:

        raise HTTPException(
            status_code=503,
            detail="Hotspot model is not available."
        )

    predictions = []

    # Process every candidate

    for candidate in payload.candidates:

        features = build_candidate_features(
            candidate,
            payload
        )

        feature_df = create_feature_dataframe(
            features,
            HOTSPOT_FEATURES
        )

        # Hotspot risk

        risk_score = calculate_risk_score(
            feature_df
        )

        risk_level = get_risk_level(
            risk_score
        )

        # Withdrawal volume

        predicted_volume = (
            predict_withdrawal_volume(
                features,
                payload.prediction_timestamp,
                payload.horizon_hours
            )
        )

        # Explanation

        top_factors = extract_top_factors(
            features
        )

        predictions.append(
            {
                "atm_id": candidate.atm_id,
                "latitude": candidate.latitude,
                "longitude": candidate.longitude,
                "risk_score": round(
                    risk_score,
                    2
                ),
                "risk_level": risk_level,
                "predicted_withdrawal_volume": round(
                    predicted_volume,
                    2
                ),
                "prediction_window_hours":
                    payload.horizon_hours,
                "top_factors": top_factors
            }
        )

    # Rank candidates

    predictions.sort(
        key=lambda x: x["risk_score"],
        reverse=True
    )

    for rank, prediction in enumerate(
        predictions,
        start=1
    ):

        prediction["rank"] = rank

    # Response

    return PredictResponse(

        model_version=(
            f"{HOTSPOT_MODEL_VERSION}+"
            f"{VOLUME_MODEL_VERSION}"
        ),

        generated_at=datetime.now(
            timezone.utc
        ).isoformat(),

        prediction_timestamp=(
            payload.prediction_timestamp
        ),

        prediction_horizon_hours=(
            payload.horizon_hours
        ),

        hotspots=predictions
    )

# HEALTH CHECK

@app.get("/health")
def health_check():

    return {
        "status": "healthy",
        "hotspot_model_loaded":
            hotspot_model is not None,
        "volume_model_loaded":
            volume_model is not None,
        "hotspot_model_version":
            HOTSPOT_MODEL_VERSION,
        "volume_model_version":
            VOLUME_MODEL_VERSION
    }

# MODEL INFORMATION

@app.get("/model-info")
def model_info():

    return {

        "hotspot": {
            "model_version":
                HOTSPOT_MODEL_VERSION,

            "features":
                HOTSPOT_FEATURES,

            "metadata":
                hotspot_metadata
        },

        "volume": {
            "model_version":
                VOLUME_MODEL_VERSION,

            "features":
                VOLUME_FEATURES,

            "metadata":
                volume_metadata
        }
    }

# APPLICATION START
if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000
    )
    