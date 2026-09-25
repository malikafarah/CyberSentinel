import asyncio
import csv
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

# Using the connection string from seed_db.py
import os
from dotenv import load_dotenv
load_dotenv()
MONGO_URI = os.getenv("MONGODB_CONNECTION_STRING")
DB_NAME = os.getenv("MONGODB_DB_NAME", "cybersentinel_db")
CSV_FILE = '../ml-model/data/synthetic/synthetic_atms.csv'

async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    atms = []
    with open(CSV_FILE, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                lat = float(row['ATM_Latitude'])
                lon = float(row['ATM_Longitude'])
            except ValueError:
                continue # Skip if invalid coords
            
            atms.append({
                "atm_id": row['ATM_ID'],
                "atm_bank": row.get('ATM_Bank', ''),
                "atm_city": row.get('ATM_City', ''),
                "atm_district": row.get('ATM_District', ''),
                "atm_state": row.get('ATM_State', ''),
                "latitude": lat,
                "longitude": lon,
                "atm_type": row.get('ATM_Type', 'BANK_ATM'),
                "onsite_offsite": row.get('ATM_Onsite_Offsite', ''),
                "indoor_outdoor": row.get('ATM_Indoor_Outdoor', ''),
                "cctv_available": row.get('CCTV_Available', 'False').lower() == 'true',
                "shutter_lock_present": row.get('Shutter_Lock_Present', 'False').lower() == 'true',
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    if atms:
        # Clear existing
        await db.atms.delete_many({})
        # Insert new
        await db.atms.insert_many(atms)
        print(f"Inserted {len(atms)} ATMs successfully.")
    else:
        print("No ATMs found to insert.")

if __name__ == "__main__":
    asyncio.run(main())
