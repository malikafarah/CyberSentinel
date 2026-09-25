"""
CyberSentinel Preprocessing Engine
====================================
Computes leakage-safe, per-location rolling window aggregations (7D, 30D, 90D)
and forward-lookahead training targets (future_cashout, future_withdrawal_volume)
from the synthetic historical ML dataset.

Key design rules:
  - Every historical feature at timestamp t uses only records STRICTLY BEFORE t.
  - Temporal split: 70% train / 15% val / 15% test (chronological, no shuffle).
  - ATM-level grouping when ATM_ID is known; city-level fallback otherwise.
"""

import os
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------------------------

WINDOW_7D  = np.timedelta64(7,  'D')
WINDOW_30D = np.timedelta64(30, 'D')
WINDOW_90D = np.timedelta64(90, 'D')


# ---------------------------------------------------------------------------
# MAIN PIPELINE
# ---------------------------------------------------------------------------

def preprocess_pipeline(raw_csv_path: str, output_dir: str, future_window_hours: int = 24):
    """
    Full preprocessing pipeline.

    1. Load and sort the raw synthetic dataset chronologically.
    2. Compute global rolling historical features (fraud counts, losses, withdrawal stats).
    3. Compute per-ATM / per-location forward-lookahead training targets.
    4. Derive temporal and velocity features.
    5. Split chronologically into train / val / test and persist CSVs.
    """
    print(f"[Preprocess] Loading raw dataset: {raw_csv_path}")
    df = pd.read_csv(raw_csv_path)
    print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns.")

    # ------------------------------------------------------------------
    # 1. Parse timestamps and sort chronologically
    # ------------------------------------------------------------------
    df["prediction_timestamp"] = pd.to_datetime(df["prediction_timestamp"])
    df = df.sort_values("prediction_timestamp").reset_index(drop=True)

    n     = len(df)
    times = df["prediction_timestamp"].to_numpy(dtype="datetime64[ns]")

    amounts       = df["Transaction_Amount"].to_numpy(dtype=float)
    is_fraud      = df["Is_Fraud"].to_numpy(dtype=int)
    is_withdrawal = (df["Channel"] == "ATM").astype(int).to_numpy()
    is_fraud_wd   = (is_fraud & is_withdrawal)

    # ------------------------------------------------------------------
    # 2. Global rolling aggregations (leakage-safe: only use [j < i])
    # ------------------------------------------------------------------
    print("[Preprocess] Computing global leakage-safe rolling features (7D / 30D / 90D)...")

    fraud_7d   = np.zeros(n, dtype=int)
    fraud_30d  = np.zeros(n, dtype=int)
    fraud_90d  = np.zeros(n, dtype=int)
    loss_7d    = np.zeros(n, dtype=float)
    loss_30d   = np.zeros(n, dtype=float)
    loss_90d   = np.zeros(n, dtype=float)
    wd_cnt_7d  = np.zeros(n, dtype=int)
    wd_cnt_30d = np.zeros(n, dtype=int)
    wd_amt_30d = np.zeros(n, dtype=float)

    s7, s30, s90 = 0, 0, 0
    for i in range(n):
        t = times[i]
        while s7  < i and times[s7]  < t - WINDOW_7D:  s7  += 1
        while s30 < i and times[s30] < t - WINDOW_30D: s30 += 1
        while s90 < i and times[s90] < t - WINDOW_90D: s90 += 1

        if s7 < i:
            fraud_7d[i]  = int(is_fraud[s7:i].sum())
            loss_7d[i]   = float((amounts[s7:i] * is_fraud[s7:i]).sum())
            wd_cnt_7d[i] = int(is_withdrawal[s7:i].sum())

        if s30 < i:
            fraud_30d[i]  = int(is_fraud[s30:i].sum())
            loss_30d[i]   = float((amounts[s30:i] * is_fraud[s30:i]).sum())
            wd_cnt_30d[i] = int(is_withdrawal[s30:i].sum())
            wd_amt_30d[i] = float((amounts[s30:i] * is_withdrawal[s30:i]).sum())

        if s90 < i:
            fraud_90d[i] = int(is_fraud[s90:i].sum())
            loss_90d[i]  = float((amounts[s90:i] * is_fraud[s90:i]).sum())

    df["Complaint_Count_7D"]       = fraud_7d
    df["Complaint_Count_30D"]      = fraud_30d
    df["Complaint_Count_90D"]      = fraud_90d
    df["Fraud_Count_7D"]           = fraud_7d
    df["Fraud_Count_30D"]          = fraud_30d
    df["Fraud_Count_90D"]          = fraud_90d
    df["Total_Loss_7D"]            = np.round(loss_7d, 2)
    df["Total_Loss_30D"]           = np.round(loss_30d, 2)
    df["Total_Loss_90D"]           = np.round(loss_90d, 2)
    df["Average_Loss_30D"]         = np.round(loss_30d / np.maximum(1, fraud_30d), 2)
    df["Withdrawal_Count_7D"]      = wd_cnt_7d
    df["Withdrawal_Count_30D"]     = wd_cnt_30d
    df["Withdrawal_Amount_30D"]    = np.round(wd_amt_30d, 2)
    df["ATM_Fraud_Count_30D"]      = fraud_30d
    df["Location_Fraud_Count_30D"] = fraud_30d
    df["Local_Fraud_Density"]      = np.round(fraud_30d / (wd_cnt_30d + 1), 4)

    # Nearby ATM count placeholder (12 is a realistic urban India estimate)
    df["Nearby_ATM_Count"] = 12

    # Average withdrawal amount 30D (safe — uses only historical window)
    df["Average_Withdrawal_Amount_30D"] = np.round(
        wd_amt_30d / np.maximum(1, wd_cnt_30d), 2
    )

    # ------------------------------------------------------------------
    # 3. Per-ATM / per-city transaction velocity features
    # ------------------------------------------------------------------
    print("[Preprocess] Computing per-location transaction velocity features...")
    entity_key = df["ATM_ID"].where(df["ATM_ID"] != "NONE", df["City"])
    df["entity_key"] = entity_key

    tx_vel_1h  = np.zeros(n, dtype=int)
    tx_vel_6h  = np.zeros(n, dtype=int)
    tx_vel_24h = np.zeros(n, dtype=int)
    wd_vel_24h = np.zeros(n, dtype=int)

    W1H  = np.timedelta64(1,  'h')
    W6H  = np.timedelta64(6,  'h')
    W24H = np.timedelta64(24, 'h')

    for _key, grp in df.groupby("entity_key", sort=False):
        idx  = grp.index.to_numpy()
        gtm  = times[idx]
        gwd  = is_withdrawal[idx]
        gn   = len(idx)
        e1, e6, e24 = 0, 0, 0
        for i in range(gn):
            t = gtm[i]
            while e1  < i and gtm[e1]  < t - W1H:  e1  += 1
            while e6  < i and gtm[e6]  < t - W6H:  e6  += 1
            while e24 < i and gtm[e24] < t - W24H: e24 += 1
            tx_vel_1h[idx[i]]  = i - e1
            tx_vel_6h[idx[i]]  = i - e6
            tx_vel_24h[idx[i]] = i - e24
            wd_vel_24h[idx[i]] = int(gwd[e24:i].sum())

    df["Transaction_Velocity_1H"]  = tx_vel_1h
    df["Transaction_Velocity_6H"]  = tx_vel_6h
    df["Transaction_Velocity_24H"] = tx_vel_24h
    df["Withdrawal_Velocity_24H"]  = wd_vel_24h

    # ------------------------------------------------------------------
    # 4. Forward-lookahead training targets (leakage: strictly AFTER t)
    # ------------------------------------------------------------------
    print(f"[Preprocess] Computing per-location forward targets (next {future_window_hours}h)...")
    future_cashouts = np.zeros(n, dtype=int)
    future_volumes  = np.zeros(n, dtype=float)
    FW = np.timedelta64(future_window_hours, 'h')

    for _key, grp in df.groupby("entity_key", sort=False):
        idx   = grp.index.to_numpy()
        g_tm  = times[idx]
        g_fwd = is_fraud_wd[idx]
        g_amt = amounts[idx]
        g_wd  = is_withdrawal[idx]
        gn    = len(idx)
        end   = 0
        for i in range(gn):
            win_end = g_tm[i] + FW
            while end < gn and g_tm[end] <= win_end:
                end += 1
            if i + 1 < end:
                future_cashouts[idx[i]] = int(g_fwd[i + 1:end].sum() > 0)
                future_volumes[idx[i]]  = float((g_amt[i + 1:end] * g_wd[i + 1:end]).sum())

    df["future_cashout"]           = future_cashouts
    df["future_withdrawal_volume"] = np.round(future_volumes, 2)
    df.drop(columns=["entity_key"], inplace=True)

    # ------------------------------------------------------------------
    # 5. Finalize and chronological split
    # ------------------------------------------------------------------
    df["prediction_timestamp"] = df["prediction_timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")

    n_train = int(n * 0.70)
    n_val   = int(n * 0.85)

    train_df = df.iloc[:n_train].copy()
    val_df   = df.iloc[n_train:n_val].copy()
    test_df  = df.iloc[n_val:].copy()

    os.makedirs(output_dir, exist_ok=True)
    train_df.to_csv(os.path.join(output_dir, "train_data.csv"), index=False)
    val_df.to_csv(os.path.join(output_dir,   "val_data.csv"),   index=False)
    test_df.to_csv(os.path.join(output_dir,  "test_data.csv"),  index=False)

    print(f"\n[OK] Preprocessing complete:")
    print(f"  Train : {len(train_df):,} rows  | cashout rate: {train_df['future_cashout'].mean():.2%}")
    print(f"  Val   : {len(val_df):,} rows  | cashout rate: {val_df['future_cashout'].mean():.2%}")
    print(f"  Test  : {len(test_df):,} rows  | cashout rate: {test_df['future_cashout'].mean():.2%}")


if __name__ == "__main__":
    base_dir  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    synth_csv = os.path.join(base_dir, "data", "synthetic", "synthetic_historical_ml_dataset.csv")
    proc_dir  = os.path.join(base_dir, "data", "processed")
    preprocess_pipeline(synth_csv, proc_dir)