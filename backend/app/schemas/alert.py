"""
CyberSentinel — Alert Schemas
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone


class AlertBase(BaseModel):
    prediction_id: Optional[str] = None
    prediction_run_id: Optional[str] = None
    alert_type: Optional[str] = "PREDICTED_CASH_OUT_HOTSPOT"
    atm_id: Optional[str] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    severity: str  # LOW | MEDIUM | HIGH | CRITICAL
    predicted_withdrawal_volume: Optional[float] = None
    reason_codes: List[str] = Field(default_factory=list)
    top_factors: List[str] = Field(default_factory=list)
    location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    crime_category: Optional[str] = None
    bank: Optional[str] = None
    recipient_role: Optional[str] = "LEA Officer"
    status: str = "NEW"  # NEW | ACKNOWLEDGED | RESOLVED
    model_version: Optional[str] = None


class AlertCreate(AlertBase):
    id: Optional[str] = None


class AlertAcknowledge(BaseModel):
    acknowledged_by: Optional[str] = None
    notes: Optional[str] = None


class AlertResponse(AlertBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    acknowledged_at: Optional[datetime] = None