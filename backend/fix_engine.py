with open('backend/app/api/engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('"lat": {"$exists": True', '"latitude": {"$exists": True')
content = content.replace('"lng": {"$exists": True', '"longitude": {"$exists": True')
content = content.replace('float(atm_doc["lat"])', 'float(atm_doc["latitude"])')
content = content.replace('float(atm_doc["lng"])', 'float(atm_doc["longitude"])')

with open('backend/app/api/engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
