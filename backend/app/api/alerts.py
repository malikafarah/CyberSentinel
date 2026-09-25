from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import asyncio
import json
from app.db.mongo import get_database
from app.schemas.alert import AlertCreate, AlertAcknowledge

router = APIRouter(prefix="/alerts", tags=["Alerts"])

# Prototype seed alerts — clearly labelled SIMULATED. Only injected when the
# alerts collection is empty AND no real prediction runs have been completed.
def get_db(request: Request):
    if hasattr(request.app, "mongodb") and request.app.mongodb is not None:
        return request.app.mongodb
    return get_database()

def build_alert_query(alert_id: str):
    if ObjectId.is_valid(alert_id):
        return {"$or": [{"_id": ObjectId(alert_id)}, {"id": alert_id}]}
    return {"id": alert_id}

@router.get("/")
async def get_alerts(request: Request, limit: int = 25):
    db = get_db(request)
    alerts = await db["alerts"].find().sort("created_at", -1).to_list(length=min(limit, 50))
    for a in alerts:
        if "_id" in a:
            a["_id"] = str(a["_id"])
        if "id" not in a:
            a["id"] = a["_id"]
        # Ensure riskScore & risk_score are populated if missing
        if "riskScore" not in a and "risk_score" not in a:
            sev = a.get("severity", "MEDIUM").upper()
            score = 95.0 if sev == "CRITICAL" else (82.0 if sev == "HIGH" else 58.0)
            a["riskScore"] = score
            a["risk_score"] = score
        elif "riskScore" in a and "risk_score" not in a:
            a["risk_score"] = a["riskScore"]
        elif "risk_score" in a and "riskScore" not in a:
            a["riskScore"] = a["risk_score"]
    return {"status": "success", "count": len(alerts), "data": alerts}

@router.post("/{alert_id}/acknowledge")
@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, request: Request):
    db = get_db(request)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    result = await db["alerts"].find_one_and_update(
        build_alert_query(alert_id),
        {"$set": {"status": "ACKNOWLEDGED", "acknowledged_at": now_iso}},
        return_document=True
    )
    if not result:
        update_res = await db["alerts"].update_one(
            build_alert_query(alert_id),
            {"$set": {"status": "ACKNOWLEDGED", "acknowledged_at": now_iso}}
        )
        if update_res.matched_count == 0:
            await db["alerts"].update_one(
                {"id": alert_id},
                {"$set": {"id": alert_id, "status": "ACKNOWLEDGED", "acknowledged_at": now_iso}},
                upsert=True
            )
        result = await db["alerts"].find_one(build_alert_query(alert_id))
        
    if result and "_id" in result:
        result["_id"] = str(result["_id"])
    return {"message": "Alert acknowledged successfully", "status": "success", "data": result}

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_alert(alert: AlertCreate, request: Request):
    db = get_db(request)
    now_iso = datetime.now(timezone.utc).isoformat()
    alert_doc = alert.model_dump()
    if not alert_doc.get("id"):
        alert_doc["id"] = f"ALT-{int(datetime.now().timestamp())}"
    alert_doc["created_at"] = now_iso
    await db["alerts"].insert_one(alert_doc)
    if "_id" in alert_doc:
        alert_doc["_id"] = str(alert_doc["_id"])
    return {"status": "success", "data": alert_doc}

@router.get("/stream")
async def stream_alerts(request: Request):
    """
    SSE endpoint — streams NEW alerts created in the last 60 seconds.
    Polls MongoDB every 5 seconds. Closes when the client disconnects.
    """
    db = get_db(request)

    async def event_generator():
        try:
            while True:
                # Check for client disconnect before polling
                if await request.is_disconnected():
                    break

                cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
                try:
                    new_alerts = await db["alerts"].find(
                        {"status": "NEW", "created_at": {"$gte": cutoff}}
                    ).sort("created_at", -1).to_list(length=20)

                    for alert in new_alerts:
                        if "_id" in alert:
                            alert["_id"] = str(alert["_id"])
                        payload = json.dumps(alert, default=str)
                        yield f"data: {payload}\n\n"
                except Exception as db_err:
                    yield f"data: {json.dumps({'error': str(db_err)})}\n\n"

                await asyncio.sleep(5)
        except asyncio.CancelledError:
            pass  # Client disconnected cleanly

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )