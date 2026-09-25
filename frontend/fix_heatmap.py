with open('frontend/src/pages/Heatmap.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import re
# We want to replace the locMap in getNodeCoordinates with just returning null if lat/lng are missing.
new_func = '''    const getNodeCoordinates = (node: GraphNode): [number, number] | null => {
      if (node.metadata?.lat && node.metadata?.lng) {
        return [Number(node.metadata.lat), Number(node.metadata.lng)];
      }
      if (node.metadata?.latitude && node.metadata?.longitude) {
        return [Number(node.metadata.latitude), Number(node.metadata.longitude)];
      }
      return null;
    };'''

# Find the start and end of the function to replace it
content = re.sub(r'const getNodeCoordinates = \(node: GraphNode\): \[number, number\] \| null => \{.*?\n    \};', new_func, content, flags=re.DOTALL)

with open('frontend/src/pages/Heatmap.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
