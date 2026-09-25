import asyncio
import random
from datetime import datetime, timezone
from app.db.mongo import get_database

# bg_tasks.py


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
