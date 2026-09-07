import re
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongo import get_database

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

def extract_identifiers(text: str) -> Dict[str, List[str]]:
    """
    NLP Extractor using Regex to parse entities from NCRP complaint text:
    - UPI IDs (e.g. victim@hdfc, scammer@paytm, 9876543210@ybl)
    - Phone Numbers (10-digit Indian numbers with optional +91 prefix)
    - Bank Account Numbers (9-18 digit numeric strings)
    """
    upi_pattern = r'[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+'
    phone_pattern = r'(?:\+91[\-\s]?)?[6-9]\d{9}'
    account_pattern = r'\b\d{9,18}\b'

    upis = list(set(re.findall(upi_pattern, text)))
    phones = list(set(re.findall(phone_pattern, text)))
    
    raw_accounts = re.findall(account_pattern, text)
    # Exclude numbers matched as phone numbers
    accounts = list(set([acc for acc in raw_accounts if not any(acc in p for p in phones)]))

    return {
        "upi_ids": upis,
        "phone_numbers": phones,
        "account_numbers": accounts,
        "upis": upis,
        "phones": phones,
        "accounts": accounts,
    }

def get_db(request: Request):
    if hasattr(request.app, "mongodb") and request.app.mongodb is not None:
        return request.app.mongodb
    return get_database()

@router.post("/extract")
async def extract_ncrp_entities(complaint: ComplaintInput):
    """
    NLP Entity Extraction endpoint without mutating database.
    """
    try:
        extracted = extract_identifiers(complaint.text)
        return {
            "status": "success",
            "entities": {
                "upis": extracted["upi_ids"],
                "phones": extracted["phone_numbers"],
                "accounts": extracted["account_numbers"]
            },
            "extracted_identifiers": extracted
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/seed-victims")
async def seed_victim_nodes(payload: SeedVictimsInput, request: Request):
    """
    Seed extracted victim identifiers into MongoDB nodes collection with Risk Score 100.
    """
    try:
        db = get_db(request)
        nodes_col = db["nodes"]

        # Parse entities from various potential payload shapes
        upis = []
        phones = []
        accounts = []

        if payload.entities:
            upis.extend(payload.entities.get("upis", []) or payload.entities.get("upi_ids", []) or [])
            phones.extend(payload.entities.get("phones", []) or payload.entities.get("phone_numbers", []) or [])
            accounts.extend(payload.entities.get("accounts", []) or payload.entities.get("account_numbers", []) or [])

        if payload.upis:
            upis.extend(payload.upis)
        if payload.phones:
            phones.extend(payload.phones)
        if payload.accounts:
            accounts.extend(payload.accounts)

        all_identifiers = list(set(upis + phones + accounts))
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
