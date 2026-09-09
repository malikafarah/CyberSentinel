from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, List

class WeeklyTrendPoint(BaseModel):
    day: str
    risk: int

class DashboardSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    totalComplaints: int
    highRiskZones: int
    activeAlerts: int
    atRiskAtms: int
    risk_level_breakdown: Optional[Dict[str, int]] = None
    weekly_trend: Optional[List[WeeklyTrendPoint]] = None