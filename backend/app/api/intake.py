import re
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongo import get_database
from app.nlp.intake_parser import extract_entities_hybrid

router = APIRouter(prefix="/intake", tags=["NCRP Cybercrime Intake"])

class ComplaintInput(BaseModel):
    text: str
    reported_by: Optional[str] = "Investigator"

class SeedVictimsInput(BaseModel):
    entities: Optional[Dict[str, Any]] = None
    upis: Optional[List[str]] = None
    phones: Optional[List[str]] = None
    accounts: Optional[List[str]] = None
    reported_by: Optional[str] = "Investigator"

def extract_identifiers(text: str) -> Dict[str, Any]:
    """
    Hybrid NLP entity extractor combining regex, code-mixed Indic word normalization, and NER.
    """
    hybrid = extract_entities_hybrid(text)
    
    # Extract string lists for backward compatibility
    acc_list = []
    for item in hybrid.get("bank_accounts", []):
        if isinstance(item, dict):
            acc_list.append(item.get("entity", ""))
        elif isinstance(item, str):
            acc_list.append(item)
    acc_list = [a for a in acc_list if a]

    suspect_names = [
        item.get("entity", "") if isinstance(item, dict) else str(item)
        for item in hybrid.get("suspect_names", [])
    ]

    return {
        "upi_ids": hybrid.get("upi_ids", []),
        "phone_numbers": hybrid.get("phone_numbers", []),
        "account_numbers": acc_list,
        "upis": hybrid.get("upi_ids", []),
        "phones": hybrid.get("phone_numbers", []),
        "accounts": acc_list,
        "suspect_names": suspect_names,
        "confidence_metrics": hybrid.get("confidence_metrics", {}),
        "hybrid_raw": hybrid
    }

def get_db(request: Request):
    if hasattr(request.app, "mongodb") and request.app.mongodb is not None:
        return request.app.mongodb
    return get_database()

@router.post("/extract")
async def extract_ncrp_entities(complaint: ComplaintInput):
    """
    Hybrid NLP Entity Extraction endpoint without mutating database.
    """
    try:
        extracted = extract_identifiers(complaint.text)
        return {
            "status": "success",
            "algorithm": "Hybrid Regex + NER Context Parser",
            "entities": {
                "upis": extracted["upi_ids"],
                "phones": extracted["phone_numbers"],
                "accounts": extracted["account_numbers"],
                "suspect_names": extracted["suspect_names"]
            },
            "confidence_metrics": extracted["confidence_metrics"],
            "extracted_identifiers": extracted
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/seed-victims")
@router.post("/graph/seed-victims")
async def seed_victim_nodes(payload: SeedVictimsInput, request: Request):
    """
    Seed extracted victim identifiers into MongoDB nodes collection with Risk Score 100.
    Supports both /api/v1/intake/seed-victims and /api/v1/graph/seed-victims.
    """
    try:
        db = get_db(request)
        if db is None:
            raise HTTPException(status_code=503, detail="Database connection is not available.")
        nodes_col = db["nodes"]

        # Parse entities from various potential payload shapes
        upis = []
        phones = []
        accounts = []

        if payload.entities and isinstance(payload.entities, dict):
            upis.extend(payload.entities.get("upis", []) or payload.entities.get("upi_ids", []) or [])
            phones.extend(payload.entities.get("phones", []) or payload.entities.get("phone_numbers", []) or [])
            accounts.extend(payload.entities.get("accounts", []) or payload.entities.get("account_numbers", []) or [])

        if payload.upis:
            upis.extend(payload.upis)
        if payload.phones:
            phones.extend(payload.phones)
        if payload.accounts:
            accounts.extend(payload.accounts)

        # Normalize and deduplicate string identifiers
        all_identifiers = []
        for raw_id in (upis + phones + accounts):
            if isinstance(raw_id, dict):
                val = raw_id.get("entity") or raw_id.get("value") or raw_id.get("id")
                if val:
                    all_identifiers.append(str(val).strip())
            elif raw_id is not None:
                cleaned = str(raw_id).strip()
                if cleaned:
                    all_identifiers.append(cleaned)
        all_identifiers = list(set(all_identifiers))

        if not all_identifiers:
            return {
                "status": "success",
                "message": "No identifiers found to seed.",
                "seeded_count": 0,
                "seed_nodes": []
            }

        updated_seed_nodes = []
        reported_by = payload.reported_by or "Investigator"

        for identifier in all_identifiers:
            query = {
                "$or": [
                    {"_id": identifier},
                    {"id": identifier},
                    {"metadata.label": {"$regex": re.escape(identifier), "$options": "i"}},
                    {"metadata.account": identifier},
                    {"metadata.upi": identifier},
                    {"metadata.phone": identifier},
                    {"metadata.name": {"$regex": re.escape(identifier), "$options": "i"}}
                ]
            }
            if ObjectId.is_valid(identifier):
                try:
                    query["$or"].append({"_id": ObjectId(identifier)})
                except Exception:
                    pass

            existing_node = await nodes_col.find_one(query)

            if existing_node:
                target_id = existing_node.get("_id")
                await nodes_col.update_one(
                    {"_id": target_id},
                    {
                        "$set": {
                            "type": "VICTIM",
                            "riskScore": 100.0,
                            "is_seed_node": True,
                            "status": "ACTIVE"
                        }
                    }
                )
                updated_seed_nodes.append({
                    "node_id": str(target_id),
                    "identifier": identifier,
                    "status": "UPDATED_EXISTING_NODE",
                    "type": "VICTIM",
                    "riskScore": 100.0
                })
            else:
                new_node = {
                    "type": "VICTIM",
                    "riskScore": 100.0,
                    "status": "ACTIVE",
                    "is_seed_node": True,
                    "metadata": {
                        "label": f"Victim Account ({identifier})",
                        "identifier": identifier,
                        "reported_by": reported_by,
                        "source": "NCRP_COMPLAINT_INTAKE"
                    }
                }
                result = await nodes_col.insert_one(new_node)
                new_id = str(result.inserted_id)
                updated_seed_nodes.append({
                    "node_id": new_id,
                    "identifier": identifier,
                    "status": "SEEDED_NEW_VICTIM_NODE",
                    "type": "VICTIM",
                    "riskScore": 100.0
                })

        return {
            "status": "success",
            "message": f"Successfully seeded {len(updated_seed_nodes)} victim nodes into graph with Risk Score 100.",
            "seeded_count": len(updated_seed_nodes),
            "seed_nodes": updated_seed_nodes
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to seed victim nodes: {str(e)}")

@router.post("/complaint")
async def process_ncrp_complaint(complaint: ComplaintInput, request: Request):
    """
    NCRP Cybercrime Complaint Intake Endpoint.
    1. Extracts identifiers (UPI IDs, Phones, Accounts) from complaint text using NLP regex.
    2. Queries MongoDB nodes_col for matching entity records.
    3. Updates matched nodes to type: 'VICTIM', riskScore: 100, and flags them as seed nodes.
    4. Auto-seeds missing nodes into MongoDB to drive downstream graph engine propagation.
    """
    try:
        db = get_db(request)
        nodes_col = db["nodes"]
        complaints_col = db["complaints"]

        # 1. Run NLP Extraction
        extracted = extract_identifiers(complaint.text)
        all_identifiers = set(extracted["upi_ids"] + extracted["phone_numbers"] + extracted["account_numbers"])

        # Log original complaint to MongoDB
        reported_by = complaint.reported_by or "Investigator"
        complaint_record = {
            "text": complaint.text,
            "reported_by": reported_by,
            "extracted_entities": extracted,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await complaints_col.insert_one(complaint_record)

        updated_seed_nodes = []

        # 2. Match and update existing entities in MongoDB
        for identifier in all_identifiers:
            query = {
                "$or": [
                    {"_id": identifier},
                    {"id": identifier},
                    {"metadata.label": {"$regex": identifier, "$options": "i"}},
                    {"metadata.account": identifier},
                    {"metadata.upi": identifier},
                    {"metadata.phone": identifier},
                    {"metadata.name": {"$regex": identifier, "$options": "i"}}
                ]
            }
            if ObjectId.is_valid(identifier):
                query["$or"].append({"_id": ObjectId(identifier)})

            existing_node = await nodes_col.find_one(query)

            if existing_node:
                target_id = existing_node.get("_id")
                await nodes_col.update_one(
                    {"_id": target_id},
                    {
                        "$set": {
                            "type": "VICTIM",
                            "riskScore": 100.0,
                            "is_seed_node": True,
                            "status": "ACTIVE"
                        }
                    }
                )
                updated_seed_nodes.append({
                    "node_id": str(target_id),
                    "identifier": identifier,
                    "status": "UPDATED_EXISTING_NODE",
                    "type": "VICTIM",
                    "riskScore": 100.0
                })
            else:
                # 3. If node does not exist, insert as a new seed VICTIM node
                new_node = {
                    "type": "VICTIM",
                    "riskScore": 100.0,
                    "status": "ACTIVE",
                    "is_seed_node": True,
                    "metadata": {
                        "label": f"Victim Account ({identifier})",
                        "identifier": identifier,
                        "reported_by": reported_by,
                        "source": "NCRP_COMPLAINT_INTAKE"
                    }
                }
                result = await nodes_col.insert_one(new_node)
                new_id = str(result.inserted_id)
                updated_seed_nodes.append({
                    "node_id": new_id,
                    "identifier": identifier,
                    "status": "SEEDED_NEW_VICTIM_NODE",
                    "type": "VICTIM",
                    "riskScore": 100.0
                })

        return {
            "status": "success",
            "message": f"NCRP Complaint processed successfully. Extracted {len(all_identifiers)} identifiers.",
            "entities": {
                "upis": extracted["upi_ids"],
                "phones": extracted["phone_numbers"],
                "accounts": extracted["account_numbers"]
            },
            "extracted_identifiers": extracted,
            "seed_nodes_updated_count": len(updated_seed_nodes),
            "seed_nodes": updated_seed_nodes
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ATM Intake
# ─────────────────────────────────────────────────────────────────────────────

class ATMInput(BaseModel):
    atm_id: str
    atm_bank: Optional[str] = None
    atm_city: Optional[str] = None
    atm_district: Optional[str] = None
    atm_state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    atm_type: Optional[str] = "BANK_ATM"
    onsite_offsite: Optional[str] = None
    indoor_outdoor: Optional[str] = None
    cctv_available: Optional[bool] = None
    operating_status: Optional[str] = "ACTIVE"
    location_type: Optional[str] = None
    security_guard_present: Optional[bool] = None
    shutter_lock_present: Optional[bool] = None


@router.post("/atm", status_code=201)
async def intake_atm(atm: ATMInput, request: Request):
    """
    Store or update an ATM record in db.atms.
    ATMs stored here are used as candidates by POST /api/v1/predictions/run.

    Rejects ATMs with missing or zero coordinates — use latitude=null
    and longitude=null for unmapped ATMs; the predictions endpoint will
    skip them automatically.
    """
    db = get_db(request)

    # Reject (0, 0) coordinates
    if atm.latitude == 0.0 or atm.longitude == 0.0:
        raise HTTPException(
            status_code=422,
            detail="ATM coordinates (0, 0) are not valid. "
                   "Use null for unknown coordinates rather than 0.",
        )

    doc = atm.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()

    await db["atms"].update_one(
        {"atm_id": atm.atm_id},
        {"$set": doc},
        upsert=True,
    )
    return {"status": "success", "atm_id": atm.atm_id, "action": "upserted"}


@router.post("/atm/bulk", status_code=201)
async def intake_atm_bulk(atms: List[ATMInput], request: Request):
    """Bulk ingest ATM records. Skips ATMs with (0, 0) coordinates."""
    db = get_db(request)
    upserted, skipped = 0, 0
    now = datetime.now(timezone.utc).isoformat()

    for atm in atms:
        if atm.latitude == 0.0 or atm.longitude == 0.0:
            skipped += 1
            continue
        doc = atm.model_dump()
        doc["created_at"] = now
        await db["atms"].update_one({"atm_id": atm.atm_id}, {"$set": doc}, upsert=True)
        upserted += 1

    return {"status": "success", "upserted": upserted, "skipped_zero_coords": skipped}


# ─────────────────────────────────────────────────────────────────────────────
# Transaction Intake (for graph building)
# ─────────────────────────────────────────────────────────────────────────────

class TransactionInput(BaseModel):
    transaction_id: str
    source_hashed_acc_no: Optional[str] = None
    destination_hashed_acc_no: Optional[str] = None
    transaction_amount: float
    transaction_date: Optional[str] = None
    transaction_time: Optional[str] = None
    transaction_type: Optional[str] = "TRANSFER"
    payment_mode: Optional[str] = None
    bank_name: Optional[str] = None
    atm_id: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    is_fraud: Optional[int] = 0
    fraud_type: Optional[str] = None
    complaint_id: Optional[str] = None


@router.post("/transaction", status_code=201)
async def intake_transaction(tx: TransactionInput, request: Request):
    """
    Store a transaction record in db.transactions.
    Transactions stored here are used by GET /engine/graph/build to construct
    the financial relationship graph from actual data.
    """
    db = get_db(request)
    doc = tx.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()

    # Reject (0, 0) coordinates
    if doc.get("latitude") == 0.0:
        doc["latitude"] = None
    if doc.get("longitude") == 0.0:
        doc["longitude"] = None

    existing = await db["transactions"].find_one({"transaction_id": tx.transaction_id})
    if existing:
        return {"status": "already_exists", "transaction_id": tx.transaction_id}

    await db["transactions"].insert_one(doc)
    return {"status": "success", "transaction_id": tx.transaction_id}


@router.post("/transaction/bulk", status_code=201)
async def intake_transaction_bulk(transactions: List[TransactionInput], request: Request):
    """Bulk ingest transaction records. Deduplicates by transaction_id."""
    db = get_db(request)
    now = datetime.now(timezone.utc).isoformat()
    inserted, skipped = 0, 0
    existing_ids = set()

    tx_ids = [t.transaction_id for t in transactions]
    existing_docs = await db["transactions"].find(
        {"transaction_id": {"$in": tx_ids}}, {"transaction_id": 1}
    ).to_list(length=len(tx_ids))
    existing_ids = {d["transaction_id"] for d in existing_docs}

    new_docs = []
    for tx in transactions:
        if tx.transaction_id in existing_ids:
            skipped += 1
            continue
        doc = tx.model_dump()
        doc["created_at"] = now
        if doc.get("latitude") == 0.0:
            doc["latitude"] = None
        if doc.get("longitude") == 0.0:
            doc["longitude"] = None
        new_docs.append(doc)
        inserted += 1

    if new_docs:
        await db["transactions"].insert_many(new_docs)

    return {"status": "success", "inserted": inserted, "skipped_duplicates": skipped}
