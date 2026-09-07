from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import numpy as np
from sklearn.cluster import DBSCAN
from app.db.mongo import get_database

router = APIRouter(prefix="/locations", tags=["Locations"])
hotspots_router = APIRouter(prefix="/hotspots", tags=["Hotspots"])

@router.get("/")
async def get_locations():
    db = get_database()
    locations = await db.locations.find({}, {"_id": 0}).to_list(length=100)
    return {"status": "success", "count": len(locations), "data": locations}

@router.get("/{location_id}")
async def get_location_by_id(location_id: str):
    db = get_database()
    location = await db.locations.find_one({"location_id": location_id}, {"_id": 0})
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return {"status": "success", "data": location}

@hotspots_router.get("")
@hotspots_router.get("/")
async def get_hotspots(
    timeframe: Optional[str] = Query(default=None, description="Timeframe filter, e.g. 24h, 7d, 30d, all"),
    crime_category: Optional[str] = Query(default=None, description="Filter by crime category, e.g. ATM Skimming, Financial Cyber Fraud"),
    eps_km: float = Query(default=3.0, description="DBSCAN epsilon in kilometers"),
    min_samples: int = Query(default=2, description="DBSCAN min samples to form a dense cluster")
):
    """
    GET /api/v1/hotspots
    Accepts `timeframe` and `crime_category` query parameters.
    Filters MongoDB queries accordingly and returns strictly calculated DBSCAN cluster coordinates.
    """
    db = get_database()

    # 1. Build query filters for complaints / locations / predictions
    complaint_filter: Dict[str, Any] = {}
    location_filter: Dict[str, Any] = {}
    prediction_filter: Dict[str, Any] = {}

    if crime_category:
        complaint_filter["crime_category"] = {"$regex": crime_category, "$options": "i"}
        location_filter["crime_category"] = {"$regex": crime_category, "$options": "i"}
        prediction_filter["crime_category"] = {"$regex": crime_category, "$options": "i"}

    # Timeframe calculation (e.g. 24h, 7d, 30d)
    now = datetime.now(timezone.utc)
    if timeframe and timeframe.lower() not in ["all", "any", "lifetime"]:
        delta = None
        tf = timeframe.lower().strip()
        try:
            if tf.endswith("h"):
                hours = int(tf[:-1])
                delta = timedelta(hours=hours)
            elif tf.endswith("d"):
                days = int(tf[:-1])
                delta = timedelta(days=days)
            elif tf.endswith("m"):
                months = int(tf[:-1])
                delta = timedelta(days=months * 30)
            elif tf.isdigit():
                delta = timedelta(days=int(tf))
        except ValueError:
            delta = None

        if delta:
            start_time = now - delta
            complaint_filter["timestamp"] = {"$gte": start_time}
            prediction_filter["created_at"] = {"$gte": start_time}

    # 2. Query MongoDB for candidate coordinate points
    # First, fetch predictions matching the crime_category and/or timeframe
    matched_predictions = await db.predictions.find(prediction_filter, {"_id": 0}).to_list(length=300)
    matched_complaints = await db.complaints.find(complaint_filter, {"_id": 0}).to_list(length=300)
    matched_locations = await db.locations.find(location_filter if "crime_category" in location_filter else {}, {"_id": 0}).to_list(length=300)

    # Collect distinct geo points
    points: List[Dict[str, Any]] = []
    location_map = {l.get("location_id"): l for l in matched_locations if l.get("location_id")}

    # From predictions
    for p in matched_predictions:
        lat = p.get("latitude")
        lng = p.get("longitude")
        loc_id = p.get("location_id")
        if (lat is None or lng is None) and loc_id in location_map:
            coords = location_map[loc_id].get("geometry", {}).get("coordinates", [])
            if len(coords) == 2:
                lng, lat = coords[0], coords[1]

        if lat is not None and lng is not None and lat != 0 and lng != 0:
            points.append({
                "source": "prediction",
                "id": p.get("id") or loc_id,
                "location_id": loc_id,
                "location_name": p.get("location_name") or loc_id,
                "region": p.get("region", "Unknown"),
                "latitude": float(lat),
                "longitude": float(lng),
                "crime_category": p.get("crime_category", crime_category or "Financial Cyber Fraud"),
                "risk_score": p.get("risk_score", 0.5),
                "risk_level": p.get("risk_level", "MEDIUM")
            })

    # If no predictions matched, extract points from locations
    if not points:
        for loc in matched_locations:
            coords = loc.get("geometry", {}).get("coordinates", [])
            if len(coords) == 2:
                lng, lat = coords[0], coords[1]
                points.append({
                    "source": "location",
                    "id": loc.get("id") or loc.get("location_id"),
                    "location_id": loc.get("location_id"),
                    "location_name": loc.get("location_name"),
                    "region": loc.get("region", "Unknown"),
                    "latitude": float(lat),
                    "longitude": float(lng),
                    "crime_category": loc.get("crime_category", crime_category or "Financial Cyber Fraud"),
                    "risk_score": loc.get("risk_score", 0.5),
                    "risk_level": loc.get("risk_level", "MEDIUM")
                })

    if not points:
        return {
            "status": "success",
            "timeframe": timeframe,
            "crime_category": crime_category,
            "total_points": 0,
            "total_clusters": 0,
            "clusters": [],
            "noise_points": []
        }

    # 3. Apply DBSCAN clustering using Haversine metric
    coords = [[p["latitude"], p["longitude"]] for p in points]
    coords_rad = np.radians(np.array(coords))
    kms_per_radian = 6371.0
    epsilon = eps_km / kms_per_radian

    effective_min_samples = min(min_samples, len(coords))
    if effective_min_samples < 1:
        effective_min_samples = 1

    dbscan = DBSCAN(eps=epsilon, min_samples=effective_min_samples, metric="haversine")
    labels = dbscan.fit_predict(coords_rad)

    clusters_dict: Dict[int, List[Dict[str, Any]]] = {}
    noise_points: List[Dict[str, Any]] = []

    for pt, label in zip(points, labels):
        cid = int(label)
        pt_copy = dict(pt)
        pt_copy["cluster_id"] = cid
        if cid == -1:
            noise_points.append(pt_copy)
        else:
            clusters_dict.setdefault(cid, []).append(pt_copy)

    # 4. Strictly calculate DBSCAN cluster coordinates (centroid, bounds, severity)
    calculated_clusters = []
    for cid, members in clusters_dict.items():
        member_lats = [m["latitude"] for m in members]
        member_lngs = [m["longitude"] for m in members]
        center_lat = float(np.mean(member_lats))
        center_lng = float(np.mean(member_lngs))
        avg_risk = float(np.mean([m.get("risk_score", 0.5) for m in members]))

        # Determine dominant crime category in cluster
        cats = [m.get("crime_category") for m in members if m.get("crime_category")]
        dominant_cat = max(set(cats), key=cats.count) if cats else (crime_category or "Financial Cyber Fraud")

        calculated_clusters.append({
            "cluster_id": cid,
            "center": {
                "latitude": round(center_lat, 6),
                "longitude": round(center_lng, 6)
            },
            "bounds": {
                "min_latitude": round(min(member_lats), 6),
                "max_latitude": round(max(member_lats), 6),
                "min_longitude": round(min(member_lngs), 6),
                "max_longitude": round(max(member_lngs), 6)
            },
            "point_count": len(members),
            "average_risk_score": round(avg_risk, 3),
            "dominant_crime_category": dominant_cat,
            "region": members[0].get("region", "Unknown"),
            "member_points": members
        })

    # Sort clusters by point count and risk score descending
    calculated_clusters.sort(key=lambda c: (c["point_count"], c["average_risk_score"]), reverse=True)

    return {
        "status": "success",
        "timeframe": timeframe,
        "crime_category": crime_category,
        "total_points": len(points),
        "total_clusters": len(calculated_clusters),
        "noise_count": len(noise_points),
        "clusters": calculated_clusters,
        "noise_points": noise_points
    }