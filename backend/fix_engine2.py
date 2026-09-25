with open('backend/app/api/engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('await db["nodes"].find({"type": "ATM"}).to_list(length=20)', 'await db["atms"].find().to_list(length=20)')

with open('backend/app/api/engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
