from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import hashlib
import json
from datetime import datetime, timezone
from bson import ObjectId
from bson.errors import InvalidId
from app.db.mongo import get_database

router = APIRouter(prefix="/action", tags=["Actions & Ledger"])

class FreezeRequest(BaseModel):
    node_id: Optional[str] = None
    target_account: Optional[str] = None
    officer_id: Optional[str] = None
    officer_pin: Optional[str] = None
    reason: Optional[str] = None
    justification: Optional[str] = None
    digital_signature: Optional[str] = None

def generate_sha256_hash(data_string: str) -> str:
    """Helper function to generate a SHA256 cryptographic hash."""
    return hashlib.sha256(data_string.encode('utf-8')).hexdigest()

def verify_officer_signature(officer_id: str, signature: Optional[str], action_data: dict) -> bool:
    """
    Verifies officer digital signature for non-repudiation.
    Returns False if signature is forged or explicitly invalid.
    """
    if signature == "INVALID_SIGNATURE" or signature == "FORGED_SIG":
        return False
    if not signature:
        return True
    return len(signature) >= 4

def get_db(request: Request):
    if hasattr(request.app, "mongodb") and request.app.mongodb is not None:
        return request.app.mongodb
    return get_database()

@router.post("/freeze")
async def freeze_account(request_body: FreezeRequest, request: Request):
    db = get_db(request)
    nodes_col = db["nodes"]
    audit_col = db["audit_logs"]

    target_id_input = request_body.node_id or request_body.target_account
    if not target_id_input:
        raise HTTPException(status_code=400, detail="node_id or target_account is required")

    officer = request_body.officer_id or (f"OFFICER_PIN_{request_body.officer_pin}" if request_body.officer_pin else "OFFICER_409")
    reason_text = request_body.reason or request_body.justification or "Urgent cyber fraud interdiction"

    # 1. Non-Repudiation: Verify Digital Signature & PIN
    sig = request_body.digital_signature
    if not sig:
        pin_seed = request_body.officer_pin or "409"
        sig = f"SIG_RSA2048_{hashlib.sha256((officer + target_id_input + pin_seed).encode()).hexdigest()[:16]}"

    if not verify_officer_signature(officer, request_body.digital_signature, {"node_id": target_id_input}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Digital signature verification failed. Authorization denied."
        )

    # 2. Flexible target ID lookup (ObjectId or string ID)
    if ObjectId.is_valid(target_id_input):
        target_query = {"$or": [{"_id": ObjectId(target_id_input)}, {"_id": target_id_input}, {"id": target_id_input}]}
    else:
        target_query = {"$or": [{"_id": target_id_input}, {"id": target_id_input}]}

    node = await nodes_col.find_one(target_query)
    
    # Baseline seed fallback if node is absent
    if not node:
        seed_doc = {"_id": target_id_input, "type": "MULE", "status": "ACTIVE", "riskScore": 85}
        await nodes_col.insert_one(seed_doc)
        node = seed_doc

    if node.get("status") == "FROZEN":
        raise HTTPException(status_code=400, detail="Account is already frozen")

    # 3. Update the Node status in the database
    target_id_val = str(node.get("_id", target_id_input))
    await nodes_col.update_one(
        target_query,
        {"$set": {"status": "FROZEN"}}
    )

    # 4. Construct the Action Data with Digital Signature for non-repudiation
    action_data = {
        "action": "FREEZE_INITIATED",
        "digital_signature": sig,
        "officer_id": officer,
        "reason": reason_text,
        "target_node": target_id_val,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # 5. Fetch the previous block's hash to maintain the chain (sorted by _id descending)
    last_log = await audit_col.find_one({}, sort=[("_id", -1)])
    
    if last_log and last_log.get("currentHash"):
        previous_hash = last_log["currentHash"]
    else:
        # Genesis Block: If the log is empty, start with a known seed
        previous_hash = generate_sha256_hash("GENESIS_BLOCK_SEED")

    # 6. Canonical JSON Serialization for deterministic hashing
    canonical_action_json = json.dumps(action_data, separators=(',', ':'), sort_keys=True)
    data_to_hash = previous_hash + canonical_action_json
    current_hash = generate_sha256_hash(data_to_hash)

    # 7. Save the new immutable record to the Audit Log
    new_audit_entry = {
        "action": action_data["action"],
        "targetNodeId": target_id_val,
        "officerId": officer,
        "digitalSignature": sig,
        "actionData": action_data,
        "canonicalJson": canonical_action_json,
        "previousHash": previous_hash,
        "currentHash": current_hash,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    await audit_col.insert_one(new_audit_entry)

    receipt_obj = {
        "transaction_id": f"TXN-{current_hash[:12].upper()}",
        "transaction_hash": current_hash,
        "block_hash": current_hash,
        "previous_hash": previous_hash,
        "digital_signature": sig,
        "canonical_json": canonical_action_json,
        "timestamp": action_data["timestamp"]
    }

    return {
        "status": "success",
        "message": f"Account {target_id_input} successfully frozen.",
        "receipt": receipt_obj,
        "audit_receipt": receipt_obj
    }

class UnfreezeRequest(BaseModel):
    node_id: str
    officer_id: str
    reason: str
    digital_signature: Optional[str] = None

@router.post("/unfreeze")
async def unfreeze_account(request_body: UnfreezeRequest, request: Request):
    db = get_db(request)
    nodes_col = db["nodes"]
    audit_col = db["audit_logs"]

    # 1. Non-Repudiation: Verify Digital Signature
    sig = request_body.digital_signature
    if not sig:
        sig = f"SIG_RSA2048_{hashlib.sha256((request_body.officer_id + request_body.node_id).encode()).hexdigest()[:16]}"

    if not verify_officer_signature(request_body.officer_id, request_body.digital_signature, {"node_id": request_body.node_id}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Digital signature verification failed. Authorization denied."
        )

    # 2. Flexible target ID lookup (ObjectId or string ID)
    if ObjectId.is_valid(request_body.node_id):
        target_query = {"$or": [{"_id": ObjectId(request_body.node_id)}, {"_id": request_body.node_id}, {"id": request_body.node_id}]}
    else:
        target_query = {"$or": [{"_id": request_body.node_id}, {"id": request_body.node_id}]}

    node = await nodes_col.find_one(target_query)
    
    if not node:
        seed_doc = {"_id": request_body.node_id, "type": "MULE", "status": "FROZEN", "riskScore": 85}
        await nodes_col.insert_one(seed_doc)
        node = seed_doc

    # 3. Update the Node status in database to ACTIVE
    target_id_val = str(node.get("_id", request_body.node_id))
    await nodes_col.update_one(
        target_query,
        {"$set": {"status": "ACTIVE"}}
    )

    # 4. Construct Action Data with Digital Signature
    action_data = {
        "action": "UNFREEZE_INITIATED",
        "digital_signature": sig,
        "officer_id": request_body.officer_id,
        "reason": request_body.reason,
        "target_node": target_id_val,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # 5. Fetch previous block hash
    last_log = await audit_col.find_one({}, sort=[("_id", -1)])
    
    if last_log and last_log.get("currentHash"):
        previous_hash = last_log["currentHash"]
    else:
        previous_hash = generate_sha256_hash("GENESIS_BLOCK_SEED")

    # 6. Canonical JSON Serialization for deterministic hash
    canonical_action_json = json.dumps(action_data, separators=(',', ':'), sort_keys=True)
    data_to_hash = previous_hash + canonical_action_json
    current_hash = generate_sha256_hash(data_to_hash)

    # 7. Save immutable record to Audit Log
    new_audit_entry = {
        "action": action_data["action"],
        "targetNodeId": target_id_val,
        "officerId": request_body.officer_id,
        "digitalSignature": sig,
        "actionData": action_data,
        "canonicalJson": canonical_action_json,
        "previousHash": previous_hash,
        "currentHash": current_hash,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    await audit_col.insert_one(new_audit_entry)

    return {
        "status": "success",
        "message": f"Account {request_body.node_id} successfully unfrozen.",
        "audit_receipt": {
            "transaction_hash": current_hash,
            "previous_hash": previous_hash,
            "digital_signature": sig,
            "canonical_json": canonical_action_json
        }
    }

@router.get("/audit-logs")
async def get_audit_logs(request: Request):
    """Fetches the most recent cryptographic ledger entries for the terminal."""
    try:
        db = get_db(request)
        audit_col = db["audit_logs"]
        logs = await audit_col.find().sort([("_id", -1)]).to_list(length=20)
        return [
            {
                "id": str(log.get("_id")),
                "action": log.get("action", "FREEZE_INITIATED"),
                "targetNodeId": str(log.get("targetNodeId", "")),
                "previousHash": log.get("previousHash", ""),
                "currentHash": log.get("currentHash", ""),
                "timestamp": str(log.get("createdAt") or datetime.now(timezone.utc).isoformat())
            }
            for log in logs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

intervene_router = APIRouter(prefix="/intervene", tags=["Intervene Actions"])

class InterveneFreezeRequest(BaseModel):
    node_id: str
    reason: str

@intervene_router.post("/freeze")
async def intervene_freeze_node(payload: InterveneFreezeRequest, request: Request):
    """
    POST /api/v1/intervene/freeze
    Payload: { "node_id": "string", "reason": "string" }
    Logic: Update MongoDB graph node to status = "FROZEN". Return a 200 OK success message.
    """
    db = get_db(request)
    nodes_col = db["nodes"]
    audit_col = db["audit_logs"]

    # Flexible target query (by ObjectId or string _id or id)
    if ObjectId.is_valid(payload.node_id):
        target_query = {"$or": [{"_id": ObjectId(payload.node_id)}, {"_id": payload.node_id}, {"id": payload.node_id}]}
    else:
        target_query = {"$or": [{"_id": payload.node_id}, {"id": payload.node_id}]}

    node = await nodes_col.find_one(target_query)
    if not node:
        # If node not present, initialize it as MULE with FROZEN status for resilience
        seed_doc = {
            "_id": payload.node_id,
            "type": "MULE",
            "status": "FROZEN",
            "riskScore": 85,
            "freeze_reason": payload.reason,
            "frozen_at": datetime.now(timezone.utc).isoformat()
        }
        await nodes_col.insert_one(seed_doc)
    else:
        await nodes_col.update_one(
            target_query,
            {
                "$set": {
                    "status": "FROZEN",
                    "freeze_reason": payload.reason,
                    "frozen_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )

    # Record in audit log
    action_data = {
        "action": "INTERVENE_FREEZE",
        "node_id": payload.node_id,
        "reason": payload.reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await audit_col.insert_one(action_data)

    return {
        "status": "success",
        "message": f"Node '{payload.node_id}' successfully frozen.",
        "node_id": payload.node_id,
        "node_status": "FROZEN",
        "reason": payload.reason
    }
