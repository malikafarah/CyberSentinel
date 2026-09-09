from fastapi import APIRouter, Depends
from datetime import datetime, timedelta, timezone
from app.schemas.dashboard import DashboardSummaryResponse
from app.auth.dependencies import get_current_user
from app.schemas.auth import TokenData
from app.db.mongo import get_database

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(current_user: TokenData = Depends(get_current_user)):
    db = get_database()

    # Query live metrics from MongoDB collections
    total_complaints = await db.complaints.count_documents({})
    high_risk_zones = await db.locations.count_documents({"risk_level": {"$in": ["HIGH", "CRITICAL"]}})
    active_alerts = await db.alerts.count_documents({"status": {"$in": ["NEW", "ACTIVE"]}})
    at_risk_atms = await db.locations.count_documents({"risk_score": {"$gte": 0.50}})

    # Count breakdown by risk level
    critical_count = await db.locations.count_documents({"risk_level": "CRITICAL"})
    high_count = await db.locations.count_documents({"risk_level": "HIGH"})
    medium_count = await db.locations.count_documents({"risk_level": "MEDIUM"})
    low_count = await db.locations.count_documents({"risk_level": "LOW"})

    # Compute live 7-day risk trend from alerts (normalised to 0–100)
    weekly_trend = []
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for offset in range(6, -1, -1):
        day_start = today - timedelta(days=offset)
        day_end = day_start + timedelta(days=1)
        count = await db.alerts.count_documents({
            "created_at": {"$gte": day_start, "$lt": day_end}
        })
        # Cap at 20 alerts = risk 100; minimum baseline of 10 so the chart is never flat-zero
        risk_score = max(10, min(100, int((count / 20) * 100)))
        weekly_trend.append({
            "day": DAY_ABBR[day_start.weekday()],
            "risk": risk_score
        })

    return {
        "totalComplaints": total_complaints,
        "highRiskZones": high_risk_zones,
        "activeAlerts": active_alerts,
        "atRiskAtms": at_risk_atms,
        "risk_level_breakdown": {
            "CRITICAL": critical_count,
            "HIGH": high_count,
            "MEDIUM": medium_count,
            "LOW": low_count
        },
        "weekly_trend": weekly_trend
    }