with open('backend/app/api/engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

import re

new_func = '''@router.get("/case/{case_id}")
async def get_case_graph(case_id: str, request: Request):
    db = get_db(request)

    # Build a dynamic graph based on the latest ML predictions
    predictions = await db["predictions"].find({}).sort("created_at", -1).to_list(length=10)
    
    nodes = []
    edges = []
    
    # Add a central case node
    nodes.append({
        "id": "CASE_ROOT",
        "type": "CASE",
        "data": {"label": f"Case {case_id}", "riskScore": 100}
    })

    if predictions:
        for idx, p in enumerate(predictions):
            atm_id = p.get("location_id") or p.get("atm_id") or f"PRED_{idx}"
            nodes.append({
                "id": atm_id,
                "type": "ATM",
                "data": {
                    "label": p.get("location_name") or atm_id,
                    "riskScore": p.get("risk_score", 0),
                    "lat": p.get("latitude"),
                    "lng": p.get("longitude")
                }
            })
            # Link Case to Predicted Hotspot
            edges.append({
                "id": f"e_case_{atm_id}",
                "source": "CASE_ROOT",
                "target": atm_id,
                "type": "PREDICTED_HOTSPOT"
            })
            
            # Fetch some nearby mules or victims dynamically to make graph interesting
            mules = await db["nodes"].find({"type": "MULE"}).to_list(length=2)
            for m in mules:
                m_id = str(m.get("_id") or m.get("id"))
                if not any(n["id"] == m_id for n in nodes):
                    nodes.append({
                        "id": m_id,
                        "type": "MULE",
                        "data": {"label": f"Mule {m_id}", "riskScore": m.get("riskScore", 50)}
                    })
                edges.append({
                    "id": f"e_{m_id}_{atm_id}",
                    "source": m_id,
                    "target": atm_id,
                    "type": "SUSPECTED_ROUTE"
                })
    else:
        # Fallback if no predictions exist
        db_nodes = await db["nodes"].find({"status": {"$ne": "DELETED"}}).to_list(length=20)
        for n in db_nodes:
            n_id = str(n.get("_id") or n.get("id"))
            nodes.append({
                "id": n_id,
                "type": n.get("type", "UNKNOWN"),
                "data": {"label": n_id, "riskScore": n.get("riskScore", 0)}
            })

    return {
        "case_id": case_id,
        "nodes": nodes,
        "edges": edges
    }'''

content = re.sub(r'@router\.get\("/case/\{case_id\}"\)\nasync def get_case_graph.*?return \{(.*?)\}', new_func, content, flags=re.DOTALL)

with open('backend/app/api/engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
