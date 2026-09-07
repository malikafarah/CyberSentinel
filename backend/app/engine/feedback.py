# backend/app/engine/feedback.py
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

# Default baseline hyperparameters
DEFAULT_HYPERPARAMS = {
    "iso_forest_contamination": 0.08,
    "pagerank_alpha": 0.85,
    "last_recalibrated_at": datetime.now(timezone.utc).isoformat(),
    "total_feedback_count": 0,
    "false_positive_count": 0,
    "true_positive_count": 0,
    "active_learning_cycles": 0
}

_RUNTIME_HYPERPARAMS = dict(DEFAULT_HYPERPARAMS)


def get_current_hyperparam(key: str, default: Any = None) -> Any:
    """Fetches active ML hyperparameter."""
    return _RUNTIME_HYPERPARAMS.get(key, default)


def save_hyperparams(iso_forest_contamination: Optional[float] = None, pagerank_alpha: Optional[float] = None, extra: Optional[Dict[str, Any]] = None):
    """Updates and persists runtime hyperparameters."""
    global _RUNTIME_HYPERPARAMS
    if iso_forest_contamination is not None:
        _RUNTIME_HYPERPARAMS["iso_forest_contamination"] = round(float(iso_forest_contamination), 4)
    if pagerank_alpha is not None:
        _RUNTIME_HYPERPARAMS["pagerank_alpha"] = round(float(pagerank_alpha), 4)
    if extra:
        _RUNTIME_HYPERPARAMS.update(extra)
    _RUNTIME_HYPERPARAMS["last_recalibrated_at"] = datetime.now(timezone.utc).isoformat()
    _RUNTIME_HYPERPARAMS["active_learning_cycles"] = _RUNTIME_HYPERPARAMS.get("active_learning_cycles", 0) + 1


def recalibrate_models(feedback_batch: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Active Learning Feedback Recalibration Engine:
    - Calculates False Positive Rate (FPR) from officer interdiction reviews.
    - If FPR is high (over-aggressive model), decreases Isolation Forest contamination rate.
    - Tightens PageRank alpha (less diffusion leak onto innocent transacting accounts).
    """
    total = len(feedback_batch)
    if total == 0:
        return {
            "status": "no_op",
            "message": "Empty feedback batch",
            "current_hyperparams": dict(_RUNTIME_HYPERPARAMS)
        }

    false_positives = sum(
        1 for f in feedback_batch
        if str(f.get("status") or f.get("action") or "").upper() in ["FALSE_POSITIVE", "APPEAL_APPROVED", "DISMISSED", "UNFROZEN"]
    )
    true_positives = total - false_positives

    fpr = false_positives / total if total > 0 else 0.0

    current_contamination = float(get_current_hyperparam("iso_forest_contamination", 0.08))
    current_alpha = float(get_current_hyperparam("pagerank_alpha", 0.85))

    # If FPR is high, model is too aggressive -> Decrease contamination rate (bound [0.01, 0.20])
    # Penalty adjustment
    penalty = 0.002 if true_positives > false_positives else 0.0
    new_contamination = max(0.01, min(0.20, (current_contamination * (1.0 - fpr)) + penalty))

    # Decay/Tighten PageRank alpha (move closer to 1.0 -> localized diffusion, preventing false flags)
    new_alpha = max(0.60, min(0.98, current_alpha + (fpr * 0.08) - (0.02 if true_positives > false_positives else 0.0)))

    save_hyperparams(
        iso_forest_contamination=new_contamination,
        pagerank_alpha=new_alpha,
        extra={
            "total_feedback_count": _RUNTIME_HYPERPARAMS.get("total_feedback_count", 0) + total,
            "false_positive_count": _RUNTIME_HYPERPARAMS.get("false_positive_count", 0) + false_positives,
            "true_positive_count": _RUNTIME_HYPERPARAMS.get("true_positive_count", 0) + true_positives,
            "last_batch_fpr": round(fpr, 3)
        }
    )

    return {
        "status": "recalibrated",
        "feedback_batch_size": total,
        "false_positives": false_positives,
        "true_positives": true_positives,
        "false_positive_rate": round(fpr, 4),
        "previous_contamination": round(current_contamination, 4),
        "new_contamination": round(new_contamination, 4),
        "previous_pagerank_alpha": round(current_alpha, 4),
        "new_pagerank_alpha": round(new_alpha, 4),
        "active_learning_cycle": _RUNTIME_HYPERPARAMS["active_learning_cycles"],
        "recalibrated_at": _RUNTIME_HYPERPARAMS["last_recalibrated_at"]
    }
