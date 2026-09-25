"""
CyberSentinel Model Training & Evaluation Engine
Trains:
  1. Isolation Forest (Anomaly Baseline)
  2. Hotspot Risk Classifier & Ranker (Target 1: future_cashout)
  3. Withdrawal Volume Regressor (Target 2: future_withdrawal_volume)
"""
import os
import json
import joblib
import numpy as np
from datetime import datetime, timezone

from sklearn.ensemble import IsolationForest, HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    roc_auc_score, average_precision_score, silhouette_score,
    mean_absolute_error, root_mean_squared_error
)

from src.features import load_feature_splits
from src.preprocessing import preprocess_pipeline


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _save_json(path: str, data: dict) -> None:
    """Atomically write *data* as pretty-printed JSON to *path*."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def _now_iso() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _precision_at_k(y_true, scores, k: int = 10) -> float:
    """Fraction of positive labels in the top-*k* ranked predictions."""
    top_k_idx = np.argsort(scores)[-k:]
    return float(np.asarray(y_true)[top_k_idx].mean())


def _recall_at_k(y_true, scores, k: int = 10) -> float:
    """Fraction of all positives captured in the top-*k* ranked predictions."""
    y = np.asarray(y_true)
    total_positives = y.sum()
    if total_positives == 0:
        return 0.0
    top_k_idx = np.argsort(scores)[-k:]
    return float(y[top_k_idx].sum() / total_positives)


# ---------------------------------------------------------------------------
# Main training function
# ---------------------------------------------------------------------------

def train_and_evaluate_model() -> None:
    """Train, evaluate, and persist all CyberSentinel ML models."""

    # ------------------------------------------------------------------
    # Resolve directory layout
    # ------------------------------------------------------------------
    base_dir     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    synthetic_csv = os.path.join(base_dir, "data", "synthetic",
                                 "synthetic_historical_ml_dataset.csv")
    processed_dir = os.path.join(base_dir, "data", "processed")
    models_dir    = os.path.join(base_dir, "models")

    hotspot_v1_dir = os.path.join(models_dir, "hotspot", "v1")
    volume_v1_dir  = os.path.join(models_dir, "volume",  "v1")

    for d in (models_dir, hotspot_v1_dir, volume_v1_dir):
        os.makedirs(d, exist_ok=True)

    trained_at = _now_iso()

    # ------------------------------------------------------------------
    # Step 1 — Preprocessing
    # ------------------------------------------------------------------
    train_file = os.path.join(processed_dir, "train_data.csv")
    val_file   = os.path.join(processed_dir, "val_data.csv")
    test_file  = os.path.join(processed_dir, "test_data.csv")

    if not (os.path.exists(train_file) and os.path.exists(val_file)
            and os.path.exists(test_file)):
        print("\n[Step 1/4] Running preprocessing pipeline on synthetic dataset...")
        preprocess_pipeline(synthetic_csv, processed_dir)
    else:
        print("\n[Step 1/4] Processed splits already exist — skipping preprocessing.")

    # ------------------------------------------------------------------
    # Step 2 — Load feature splits
    # ------------------------------------------------------------------
    print("\n[Step 2/4] Loading feature matrices from processed splits...")

    (X_train, y_tr_hotspot, y_tr_vol), \
    (X_val,   y_val_hotspot, y_val_vol), \
    (X_test,  y_te_hotspot,  y_te_vol), \
    feature_names = load_feature_splits(processed_dir)

    print(f"  Features : {len(feature_names)}")
    print(f"  Train    : {len(X_train):,} samples (70%)")
    print(f"  Val      : {len(X_val):,} samples (15%)")
    print(f"  Test     : {len(X_test):,} samples (15%)")

    # ------------------------------------------------------------------
    # Step 3 — Train all three models
    # ------------------------------------------------------------------
    print("\n[Step 3/4] Training Models...")

    # Model 1 — Isolation Forest (anomaly baseline)
    print("  -> Training Isolation Forest Anomaly Detector...")
    iso_forest = IsolationForest(
        n_estimators=200,
        contamination=0.15,
        random_state=20260923,
        n_jobs=-1,
    )
    iso_forest.fit(X_train)

    # Model 2 — Hotspot Risk Classifier (CalibratedClassifierCV)
    print("  -> Training Hotspot Risk Classifier "
          "(HistGradientBoosting + Isotonic Calibration)...")
    base_clf = HistGradientBoostingClassifier(
        max_iter=250, learning_rate=0.08, random_state=20260923
    )
    hotspot_model = CalibratedClassifierCV(
        estimator=base_clf, method="isotonic", cv=3
    )
    hotspot_model.fit(X_train, y_tr_hotspot)

    # Model 3 — Withdrawal Volume Regressor
    print("  -> Training Withdrawal Volume Regressor "
          "(HistGradientBoostingRegressor)...")
    volume_model = HistGradientBoostingRegressor(
        max_iter=250, learning_rate=0.08, random_state=20260923
    )
    volume_model.fit(X_train, y_tr_vol)

    # ------------------------------------------------------------------
    # Step 4 — Evaluation on test set
    # ------------------------------------------------------------------
    print("\n[Step 4/4] Evaluating models on unseen Test Set...")

    # 4a — Isolation Forest: silhouette score
    iso_preds = iso_forest.predict(X_test)
    sil_score = float(
        silhouette_score(
            X_test, iso_preds,
            sample_size=min(2000, len(X_test)),
            random_state=20260923,
        )
    )

    # 4b — Hotspot classifier
    raw_probs = hotspot_model.predict_proba(X_test)
    probs     = raw_probs[:, 1] if raw_probs.shape[1] > 1 else raw_probs[:, 0]

    roc_auc        = float(roc_auc_score(y_te_hotspot, probs))
    pr_auc         = float(average_precision_score(y_te_hotspot, probs))
    prec_at_10     = _precision_at_k(y_te_hotspot, probs, k=10)
    recall_at_10   = _recall_at_k(y_te_hotspot,   probs, k=10)

    # 4c — Volume regressor
    vol_preds = np.maximum(0, volume_model.predict(X_test))
    mae       = float(mean_absolute_error(y_te_vol, vol_preds))
    rmse      = float(root_mean_squared_error(y_te_vol, vol_preds))

    # ------------------------------------------------------------------
    # Print evaluation report
    # ------------------------------------------------------------------
    print("=" * 60)
    print("  MODEL EVALUATION REPORT (TEST SET)")
    print("=" * 60)
    print()
    print("  [Unsupervised Anomaly Model Metrics]")
    print(f"    Silhouette Score   : {sil_score:.4f}")
    print()
    print("  [Hotspot Risk Classifier Metrics]")
    print(f"    ROC-AUC Score      : {roc_auc:.4f}")
    print(f"    PR-AUC Score       : {pr_auc:.4f}")
    print(f"    Precision@10       : {prec_at_10:.4f}")
    print(f"    Recall@10          : {recall_at_10:.4f}")
    print()
    print("  [Withdrawal Volume Forecast Metrics]")
    print(f"    MAE                : INR {mae:,.2f}")
    print(f"    RMSE               : INR {rmse:,.2f}")
    print("=" * 60)

    # ------------------------------------------------------------------
    # Step 5 — Persist versioned artifacts
    # ------------------------------------------------------------------

    # ---- Hotspot model artifacts ----
    joblib.dump(hotspot_model, os.path.join(hotspot_v1_dir, "model.joblib"))

    _save_json(
        os.path.join(hotspot_v1_dir, "feature_schema.json"),
        {
            "feature_names":  feature_names,
            "feature_count":  len(feature_names),
        },
    )

    _save_json(
        os.path.join(hotspot_v1_dir, "metrics.json"),
        {
            "roc_auc":          roc_auc,
            "pr_auc":           pr_auc,
            "precision_at_10":  prec_at_10,
            "recall_at_10":     recall_at_10,
        },
    )

    _save_json(
        os.path.join(hotspot_v1_dir, "metadata.json"),
        {
            "model_name":              "future_cashout_hotspot",
            "version":                 "v1",
            "trained_at":              trained_at,
            "algorithm":               "CalibratedClassifierCV(HistGradientBoostingClassifier)",
            "prediction_horizon_hours": 24,
            "model_version":           "hotspot_v1",
            "training_data_version":   "synthetic_2026_09_23_v1",
            "features":                feature_names,
        },
    )

    # ---- Volume model artifacts ----
    joblib.dump(volume_model, os.path.join(volume_v1_dir, "model.joblib"))

    _save_json(
        os.path.join(volume_v1_dir, "feature_schema.json"),
        {
            "feature_names":  feature_names,
            "feature_count":  len(feature_names),
        },
    )

    _save_json(
        os.path.join(volume_v1_dir, "metrics.json"),
        {
            "mae":  mae,
            "rmse": rmse,
        },
    )

    _save_json(
        os.path.join(volume_v1_dir, "metadata.json"),
        {
            "model_name":            "withdrawal_volume_forecast",
            "version":               "v1",
            "trained_at":            trained_at,
            "algorithm":             "HistGradientBoostingRegressor",
            "model_version":         "volume_v1",
            "training_data_version": "synthetic_2026_09_23_v1",
            "features":              feature_names,
        },
    )

    # ---- Unified legacy artifact ----
    unified_payload = {
        "model":         iso_forest,
        "hotspot_model": hotspot_model,
        "volume_model":  volume_model,
        "feature_names": feature_names,
        "model_version": "cybersentinel_v1_synthetic",
        "metrics": {
            "silhouette_score": sil_score,
            "roc_auc":          roc_auc,
            "pr_auc":           pr_auc,
            "precision_at_10":  prec_at_10,
            "recall_at_10":     recall_at_10,
            "volume_mae":       mae,
            "volume_rmse":      rmse,
        },
    }
    model_pkl_path = os.path.join(models_dir, "model.pkl")
    joblib.dump(unified_payload, model_pkl_path)

    print(
        f"\n[OK] Versioned hotspot artifact : {hotspot_v1_dir}"
        f"\n[OK] Versioned volume artifact  : {volume_v1_dir}"
        f"\n[OK] Unified model.pkl          : {model_pkl_path} "
        f"({os.path.getsize(model_pkl_path) / 1024:.1f} KB)"
    )
    print("=" * 60)


if __name__ == "__main__":
    train_and_evaluate_model()
