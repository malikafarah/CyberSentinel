import re
with open("frontend/src/pages/Dashboard.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("hour: pred.location_id,", "location: pred.location_id,")
content = content.replace('dataKey="hour"', 'dataKey="location"')
content = content.replace("Time Window:", "Hotspot ID:")

with open("frontend/src/pages/Dashboard.tsx", "w", encoding="utf-8") as f:
    f.write(content)
