from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone

class PredictionBase(BaseModel):
    location_id: str
    location_name: Optional[str] = None
    region: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    crime_category: Optional[str] = "Financial Cyber Fraud"
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Internal risk probability score between 0.0 and 1.0")
    risk_level: str  # LOW, MEDIUM, HIGH, CRITICAL
    predicted_window: str
    rank: Optional[int] = 1
    top_factors: List[str] = Field(default_factory=list)
    related_complaints: List[str] = Field(default_factory=list)
    confidence: Optional[float] = 85.0
    case_id: Optional[str] = None
    model_version: str = "iso_forest_v1"

class PredictionCreate(PredictionBase):
    id: Optional[str] = None

class PredictionResponse(PredictionBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PredictLiveRequest(BaseModel):
    candidates: Optional[List[dict]] = None
    predicted_window: Optional[str] = "3h"