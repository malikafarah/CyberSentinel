import os
import json
import urllib.request
import pandas as pd
from datetime import datetime

def extract_and_merge_mongodb_data(
    base_csv_path: str,
    output_csv_path: str,
    mongo_uri: str = "mongodb://localhost:27017/",
    db_name: str = "cybersentinel_db",
    backend_url: str = "http://localhost:8001/complaints"
) -> str:
    """
    Extracts new complaint/transaction records from MongoDB (or backend REST API),
    formats them to match the raw CSV schema, and merges them with the base CSV.

    Saved to: D:\\Projects\\CyberSentinel\\ml-model\\data\\processed\\merged_mongodb_transactions.csv
    
    Returns output_csv_path if new data was found, otherwise returns base_csv_path.
    """
    print("=" * 60)
    print("  CyberSentinel — MongoDB Data Ingestion Engine")
    print("=" * 60)

    # 1. Verify Base CSV Exists
    if not os.path.exists(base_csv_path):
        print(f"  [WARN] Base CSV not found at {base_csv_path}")
        return base_csv_path

    base_df = pd.read_csv(base_csv_path)
    print(f"  [INFO] Base dataset loaded ({len(base_df):,} records).")

    raw_complaints = []

    # 2a. Attempt Direct MongoDB Query via PyMongo
    try:
        from pymongo import MongoClient
        uri = os.getenv("MONGODB_CONNECTION_STRING", mongo_uri)
        dbname = os.getenv("MONGODB_DB_NAME", db_name)
        print(f"  [INFO] Attempting MongoDB connection: {uri} ({dbname})...")
        
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        db = client[dbname]
        complaints_col = db["complaints"]
        raw_complaints = list(complaints_col.find({}))
        if raw_complaints:
            print(f"  [SUCCESS] Retrieved {len(raw_complaints)} records via Direct PyMongo.")
    except Exception as e:
        print(f"  [NOTICE] PyMongo direct query skipped/offline: {e}")

    # 2b. Fallback: Query Backend REST API if PyMongo yielded no results
    if not raw_complaints:
        try:
            print(f"  [INFO] Querying Backend REST endpoint: {backend_url}...")
            req = urllib.request.Request(backend_url, headers={"User-Agent": "CyberSentinel-ML"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    if isinstance(data, list) and len(data) > 0:
                        raw_complaints = data
                        print(f"  [SUCCESS] Retrieved {len(raw_complaints)} records via Backend REST API.")
        except Exception as e:
            print(f"  [NOTICE] Backend REST API query skipped: {e}")

    # 3. Format and Merge
    mongo_records = []
    if raw_complaints:
        for idx, c in enumerate(raw_complaints, start=1):
            raw_time = c.get("timestamp") or c.get("reported_at") or datetime.now().strftime("%m/%d/%Y %H:%M")
            try:
                dt = pd.to_datetime(raw_time)
                formatted_time = dt.strftime("%m/%d/%Y %H:%M")
            except Exception:
                formatted_time = datetime.now().strftime("%m/%d/%Y %H:%M")

            record = {
                "TransactionID": str(c.get("complaint_id") or c.get("TransactionID") or f"TX_MONGO_{idx:05d}"),
                "AccountID": str(c.get("account_number") or c.get("AccountID") or f"AC_{idx:05d}"),
                "TransactionAmount": float(c.get("amount") or c.get("TransactionAmount") or 15000.0),
                "TransactionDate": formatted_time,
                "TransactionType": str(c.get("TransactionType") or "Debit"),
                "Location": str(c.get("region") or c.get("Location") or "Vijayawada"),
                "DeviceID": str(c.get("DeviceID") or f"D_{idx:05d}"),
                "IP Address": str(c.get("IP Address") or "192.168.1.1"),
                "MerchantID": str(c.get("MerchantID") or "M001"),
                "Channel": str(c.get("Channel") or ("ATM" if "ATM" in str(c.get("crime_category", "")) else "Online")),
                "CustomerAge": int(c.get("CustomerAge") or 35),
                "CustomerOccupation": str(c.get("CustomerOccupation") or "Service"),
                "TransactionDuration": float(c.get("TransactionDuration") or 45.0),
                "LoginAttempts": int(c.get("LoginAttempts") or (2 if "Skimming" in str(c.get("crime_category", "")) else 1)),
                "AccountBalance": float(c.get("AccountBalance") or 50000.0)
            }
            mongo_records.append(record)

    if mongo_records:
        mongo_df = pd.DataFrame(mongo_records)
        missing_cols = set(base_df.columns) - set(mongo_df.columns)
        for col in missing_cols:
            mongo_df[col] = base_df[col].iloc[0] if len(base_df) > 0 else 0

        mongo_df = mongo_df[base_df.columns]
        merged_df = pd.concat([base_df, mongo_df], ignore_index=True)
        merged_df.drop_duplicates(subset=["TransactionID"], keep="last", inplace=True)
        print(f"  [OK] Extracted {len(mongo_records)} new MongoDB records.")
    else:
        merged_df = base_df.copy()
        print("  [INFO] No new MongoDB data detected. Using base dataset.")

    # Always ensure the output CSV file is saved in data/processed/
    os.makedirs(os.path.dirname(output_csv_path), exist_ok=True)
    merged_df.to_csv(output_csv_path, index=False)
    print(f"  [OK] Combined dataset file created -> {output_csv_path}")
    print(f"  [OK] Total records in merged CSV: {len(merged_df):,}")

    return output_csv_path


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    raw_csv = os.path.join(base_dir, 'data', 'raw', 'bank_transactions_data_2_augmented_clean_2.csv')
    processed_out = os.path.join(base_dir, 'data', 'processed', 'merged_mongodb_transactions.csv')
    extract_and_merge_mongodb_data(raw_csv, processed_out)
