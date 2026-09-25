"""
CyberSentinel Feature Engineering Pipeline
============================================
Implements strict leakage-safe feature extraction.

Feature groups:
  A. Spatial / Geographic
  B. ATM hardware & security
  C. Transaction characteristics
  D. Temporal (raw + cyclical encoding)
  E. Historical rolling risk (7D / 30D / 90D)
  F. Transaction velocity
  G. Graph-derived features (populated by the backend at inference time)

Design rules:
  - Feature names in FEATURE_COLUMNS are stable across training and inference.
  - Any graph-derived feature missing at inference is zero-filled.
  - Account hashes (sourceHashedAccNo, destinationHashedAccNo) are NOT in FEATURE_COLUMNS.
  - ATM_ID is NOT a predictive feature; it is an identifier.
"""

import os
import numpy as np
import pandas as pd
from typing import Tuple, List, Optional

# ---------------------------------------------------------------------------
# CATEGORICAL ENCODINGS
# ---------------------------------------------------------------------------

STATE_MAPPING: dict = {
    "Delhi":            1,
    "Rajasthan":        2,
    "West Bengal":      3,
    "Bihar":            4,
    "Uttar Pradesh":    5,
    "Jharkhand":        6,
    "Haryana":          7,
    "Maharashtra":      8,
    "Gujarat":          9,
    "Karnataka":       10,
    "Telangana":       11,
    "Tamil Nadu":      12,
    "Madhya Pradesh":  13,
    "Andhra Pradesh":  14,
    "Kerala":          15,
    "Odisha":          16,
    "Punjab":          17,
    "Chhattisgarh":    18,
    "Uttarakhand":     19,
    "Assam":           20,
}

CHANNEL_MAPPING: dict = {
    "ATM":      1,
    "UPI":      2,
    "Online":   3,
    "POS/Card": 4,
    "Branch":   5,
}

TXN_TYPE_MAPPING: dict = {
    "Debit":    1,
    "Credit":   2,
    "Transfer": 3,
}

LOCATION_TYPE_MAPPING: dict = {
    "Commercial_Area":  1,
    "Market":           2,
    "Shopping_Mall":    3,
    "Railway_Station":  4,
    "Bus_Stand":        5,
    "Residential":      6,
    "Highway":          7,
    "Educational_Area": 8,
    "Airport":          9,
    "Other":           10,
}

ATM_TYPE_MAPPING: dict = {
    "Bank-Owned":     1,
    "White-Label":    2,
    "Brown-Label":    3,
    "Online/Digital": 4,
}

# ---------------------------------------------------------------------------
# STABLE FEATURE SCHEMA
#
# Order matters: it must match between training and inference.
# New features must be appended so that existing saved models remain valid
# if backward compatibility is needed.
# ---------------------------------------------------------------------------

FEATURE_COLUMNS: List[str] = [
    # A. Spatial / Geographic
    "Latitude",
    "Longitude",
    "State_Encoded",
    "Urban_Rural_Encoded",
    "Location_Type_Encoded",
    "Nearby_ATM_Count",
    "Local_Fraud_Density",

    # B. ATM Hardware & Security
    "ATM_Type_Encoded",
    "ATM_Is_Onsite",
    "ATM_Is_Indoor",
    "CCTV_Available",
    "Security_Guard_Present",
    "Shutter_Lock_Present",
    "ATM_Is_Active",

    # C. Transaction Characteristics
    "Transaction_Amount",
    "log_Transaction_Amount",
    "Channel_Encoded",
    "Transaction_Type_Encoded",
    "LoginAttempts",
    "TransactionDuration",
    "log_AccountBalance",
    "Mule_Chain_Hop",

    # D. Temporal (raw + cyclical)
    "Hour",
    "Day_of_Week",
    "Is_Weekend",
    "Is_Night",
    "hour_sin",
    "hour_cos",
    "day_sin",
    "day_cos",

    # E. Historical Rolling Risk (leakage-safe)
    "Complaint_Count_7D",
    "Complaint_Count_30D",
    "Complaint_Count_90D",
    "Fraud_Count_7D",
    "Fraud_Count_30D",
    "Fraud_Count_90D",
    "ATM_Fraud_Count_30D",
    "Location_Fraud_Count_30D",
    "Total_Loss_7D",
    "Total_Loss_30D",
    "Total_Loss_90D",
    "Average_Loss_30D",
    "Withdrawal_Count_7D",
    "Withdrawal_Count_30D",
    "Withdrawal_Amount_30D",
    "Average_Withdrawal_Amount_30D",

    # F. Transaction Velocity (per-location)
    "Transaction_Velocity_1H",
    "Transaction_Velocity_6H",
    "Transaction_Velocity_24H",
    "Withdrawal_Velocity_24H",

    # G. Graph-Derived Features (populated by backend at inference; zero-filled here)
    "account_degree",
    "incoming_transfer_count",
    "outgoing_transfer_count",
    "unique_counterparty_count",
    "cashout_count",
    "cashout_amount",
    "pagerank_score",
    "suspicious_neighbor_count",
    "chain_depth",
    "anomaly_score",
]

FEATURE_COUNT: int = len(FEATURE_COLUMNS)


# ---------------------------------------------------------------------------
# FEATURE EXTRACTION
# ---------------------------------------------------------------------------

def extract_features(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, Optional[pd.Series], Optional[pd.Series]]:
    """
    Transform a raw (but preprocessed) DataFrame into the ML feature matrix.

    Returns
    -------
    X          : pd.DataFrame with exactly FEATURE_COLUMNS columns.
    y_hotspot  : pd.Series of future_cashout (0/1) or None if absent.
    y_volume   : pd.Series of future_withdrawal_volume or None if absent.
    """
    data = df.copy()

    # ---- D. Temporal features ----------------------------------------
    dt = pd.to_datetime(data["prediction_timestamp"])
    data["Hour"]        = dt.dt.hour
    data["Day_of_Week"] = dt.dt.dayofweek
    data["Is_Weekend"]  = (data["Day_of_Week"] >= 5).astype(int)
    data["Is_Night"]    = ((data["Hour"] >= 22) | (data["Hour"] <= 5)).astype(int)
    data["hour_sin"]    = np.sin(2 * np.pi * data["Hour"] / 24.0)
    data["hour_cos"]    = np.cos(2 * np.pi * data["Hour"] / 24.0)
    data["day_sin"]     = np.sin(2 * np.pi * data["Day_of_Week"] / 7.0)
    data["day_cos"]     = np.cos(2 * np.pi * data["Day_of_Week"] / 7.0)

    # ---- C. Transformed transaction features -------------------------
    data["log_Transaction_Amount"] = np.log1p(
        np.maximum(0, data["Transaction_Amount"].astype(float))
    )
    if "AccountBalance" in data.columns:
        data["log_AccountBalance"] = np.log1p(
            np.maximum(0, data["AccountBalance"].astype(float))
        )
    else:
        data["log_AccountBalance"] = np.log1p(10000.0)

    # ---- Mule chain hop (capped for safety) --------------------------
    if "Mule_Chain_Hop" not in data.columns:
        data["Mule_Chain_Hop"] = 0
    data["Mule_Chain_Hop"] = data["Mule_Chain_Hop"].fillna(0).astype(int).clip(0, 5)

    # ---- A/B. Categorical encodings ----------------------------------
    data["State_Encoded"] = (
        data["State"].map(lambda s: STATE_MAPPING.get(str(s), 0))
        if "State" in data.columns else 0
    )
    data["Channel_Encoded"] = (
        data["Channel"].map(lambda c: CHANNEL_MAPPING.get(str(c), 0))
        if "Channel" in data.columns else 0
    )
    data["Transaction_Type_Encoded"] = (
        data["Transaction_Type"].map(lambda t: TXN_TYPE_MAPPING.get(str(t), 0))
        if "Transaction_Type" in data.columns else 0
    )
    data["Location_Type_Encoded"] = (
        data["Location_Type"].map(lambda l: LOCATION_TYPE_MAPPING.get(str(l), 0))
        if "Location_Type" in data.columns else 0
    )
    data["ATM_Type_Encoded"] = (
        data["ATM_Type"].map(lambda a: ATM_TYPE_MAPPING.get(str(a), 0))
        if "ATM_Type" in data.columns else 0
    )
    data["Urban_Rural_Encoded"] = (
        (data["Urban_Rural"] == "Urban").astype(int)
        if "Urban_Rural" in data.columns else 0
    )
    data["ATM_Is_Onsite"] = (
        (data["ATM_Onsite_Offsite"] == "Onsite").astype(int)
        if "ATM_Onsite_Offsite" in data.columns else 0
    )
    data["ATM_Is_Indoor"] = (
        (data["ATM_Indoor_Outdoor"] == "Indoor").astype(int)
        if "ATM_Indoor_Outdoor" in data.columns else 0
    )
    data["ATM_Is_Active"] = (
        (data["ATM_Operating_Status"] == "Active").astype(int)
        if "ATM_Operating_Status" in data.columns else 1
    )

    for bool_col in ("CCTV_Available", "Security_Guard_Present", "Shutter_Lock_Present"):
        if bool_col in data.columns:
            data[bool_col] = data[bool_col].astype(int)
        else:
            data[bool_col] = 0

    # ---- G. Graph features (zero-fill when absent) -------------------
    graph_features = [
        "account_degree", "incoming_transfer_count", "outgoing_transfer_count",
        "unique_counterparty_count", "cashout_count", "cashout_amount",
        "pagerank_score", "suspicious_neighbor_count", "chain_depth",
        "anomaly_score",
    ]
    for gf in graph_features:
        if gf not in data.columns:
            data[gf] = 0.0

    # ---- Ensure all FEATURE_COLUMNS exist ----------------------------
    for col in FEATURE_COLUMNS:
        if col not in data.columns:
            data[col] = 0.0
        data[col] = pd.to_numeric(data[col], errors="coerce").fillna(0.0)

    X = data[FEATURE_COLUMNS].copy()

    y_hotspot = data["future_cashout"].copy() if "future_cashout" in data.columns else None
    y_volume  = (
        data["future_withdrawal_volume"].copy()
        if "future_withdrawal_volume" in data.columns
        else None
    )

    return X, y_hotspot, y_volume


# ---------------------------------------------------------------------------
# SPLIT LOADER
# ---------------------------------------------------------------------------

def load_feature_splits(processed_dir: str):
    """
    Load train / val / test CSVs from the processed directory and extract
    the feature matrices.

    Returns
    -------
    (X_train, y_tr_hotspot, y_tr_vol),
    (X_val, y_val_hotspot, y_val_vol),
    (X_test, y_te_hotspot, y_te_vol),
    feature_names
    """
    df_train = pd.read_csv(os.path.join(processed_dir, "train_data.csv"))
    df_val   = pd.read_csv(os.path.join(processed_dir, "val_data.csv"))
    df_test  = pd.read_csv(os.path.join(processed_dir, "test_data.csv"))

    X_train, y_tr_h,  y_tr_v  = extract_features(df_train)
    X_val,   y_val_h, y_val_v = extract_features(df_val)
    X_test,  y_te_h,  y_te_v  = extract_features(df_test)

    return (
        (X_train, y_tr_h,  y_tr_v),
        (X_val,   y_val_h, y_val_v),
        (X_test,  y_te_h,  y_te_v),
        FEATURE_COLUMNS,
    )
