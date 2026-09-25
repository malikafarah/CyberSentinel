with open('frontend/src/pages/Heatmap.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import re

new_runPrediction = '''  const runPrediction = async () => {
    setIsPredicting(true);
    setDispatchStatus(null);
    try {
      const data = await api.post<any>('/predictions/run', {
        prediction_horizon_hours: 24,
        include_graph_features: true,
        max_candidates: 50
      });
      if (data && data.hotspots) {
        const newNodes: GraphNode[] = data.hotspots.map((h: any) => ({
          id: h.atm_id,
          type: 'ATM',
          riskScore: h.risk_score,
          metadata: { lat: h.latitude, lng: h.longitude, name: h.atm_id }
        }));
        setGraphNodes(newNodes);
        setZones([]);
      }
    } catch (error) {
      console.error('Failed to run ML prediction pipeline:', error);
    } finally {
      setIsPredicting(false);
    }
  };'''

content = re.sub(r'const runPrediction = async \(\) => \{.*?\n  \};', new_runPrediction, content, flags=re.DOTALL)

# Now fix getNodeCoordinates
new_getNode = '''    const getNodeCoordinates = (node: GraphNode): [number, number] | null => {
      if (node.metadata?.lat && node.metadata?.lng) {
        return [Number(node.metadata.lat), Number(node.metadata.lng)];
      }
      if (node.metadata?.latitude && node.metadata?.longitude) {
        return [Number(node.metadata.latitude), Number(node.metadata.longitude)];
      }
      return null;
    };'''

# We know the old function has locMap in it.
content = re.sub(r'const getNodeCoordinates = \(node: GraphNode\): \[number, number\] \| null => \{.*?\n      return locMap\[node\.id\] \|\| null;\n    \};', new_getNode, content, flags=re.DOTALL)

with open('frontend/src/pages/Heatmap.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
