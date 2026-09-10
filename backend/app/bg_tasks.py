import asyncio
import random
from datetime import datetime, timezone
from app.db.mongo import get_database

# ─── Indian Context Data ─────────────────────────────────────────────────────
INDIAN_BANKS = ["SBI", "HDFC", "ICICI", "PNB", "Canara", "Axis", "Kotak"]

INDIAN_LOCATIONS = [
    "Benz Circle ATM, Vijayawada",
    "MG Road ATM Cluster, Vijayawada",
    "Patamata ATM Strip, Vijayawada",
    "KPHB Metro ATM, Hyderabad",
    "Indiranagar ATM, Bengaluru",
    "Juhu Beach Road ATM, Mumbai",
    "Connaught Place ATM, Delhi"
]

INDIAN_CRIMES = [
    "Coordinated ATM Cash-Out",
    "Mule Account Layering",
    "UPI Velocity Fraud",
    "SIM Swap + OTP Bypass",
    "KYC Credential Sharing",
    "Bust-Out Fraud Pattern",
    "Phishing-Initiated Transfer"
]
# ─────────────────────────────────────────────────────────────────────────────


async def generate_alerts_periodically():
    """Background task for Natural Alert Generation (Plan 4).
    Generates realistic Indian-context alerts every 15–30 seconds."""
    while True:
        await asyncio.sleep(random.randint(15, 30))
        try:
            db = get_database()
            if db is not None:
                risk_score = random.uniform(60, 99)
                severity = (
                    "CRITICAL" if risk_score >= 90
                    else "HIGH" if risk_score >= 75
                    else "MEDIUM"
                )
                new_alert = {
                    "id": f"ALT-{int(datetime.now().timestamp())}",
                    "prediction_id": f"p_{random.randint(100, 999)}",
                    "riskScore": round(risk_score, 2),
                    "risk_score": round(risk_score, 2),
                    "severity": severity,
                    "status": "NEW",
                    "bank": random.choice(INDIAN_BANKS),
                    "location": random.choice(INDIAN_LOCATIONS),
                    "crime_category": random.choice(INDIAN_CRIMES),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db["alerts"].insert_one(new_alert)
                print(f"[BG Task] Natural Alert Generated: {new_alert['id']} — {new_alert['crime_category']} @ {new_alert['location']}")
        except Exception as e:
            print(f"[BG Task] Error generating alert: {e}")


async def retrain_model_periodically():
    """Background task for Model Retraining (Plan 5). Runs every hour."""
    while True:
        await asyncio.sleep(3600)
        try:
            print("[BG Task] Initiating model retraining cycle...")
            db = get_database()
            if db is not None:
                # Pull recent feedback data
                feedback_docs = await db["ml_feedback"].find({}).sort("_id", -1).to_list(length=200)

                # Count true positives and false positives
                true_pos = sum(1 for f in feedback_docs if f.get("status") == "TRUE_POSITIVE")
                false_pos = sum(1 for f in feedback_docs if f.get("status") == "FALSE_POSITIVE")
                total = len(feedback_docs)

                if total > 0:
                    fpr = false_pos / max(total, 1)
                    # Recalibrate hyperparameters
                    try:
                        from app.engine.feedback import recalibrate_models
                        batch = [{"node_id": "RETRAIN_BG", "status": "FALSE_POSITIVE" if fpr > 0.3 else "TRUE_POSITIVE", "reason": f"Background retrain: FPR={fpr:.2f}"}]
                        recalibrate_models(batch)
                    except Exception as e:
                        print(f"[BG Task] Hyperparameter recalibration error: {e}")

                    # Record retrain event
                    await db["retrain_log"].insert_one({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "feedback_samples": total,
                        "true_positives": true_pos,
                        "false_positives": false_pos,
                        "fpr": round(fpr, 4),
                        "status": "completed"
                    })
                    print(f"[BG Task] Model retrained. Samples={total}, FPR={fpr:.2f}")
                else:
                    print("[BG Task] No feedback data yet — skipping retrain.")
        except Exception as e:
            print(f"[BG Task] Error retraining model: {e}")
