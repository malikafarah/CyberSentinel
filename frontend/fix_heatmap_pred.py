with open('frontend/src/pages/Heatmap.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import re

new_func = '''  const runPrediction = async () => {
    setIsPredicting(true);
    setDispatchStatus(null);
    try {
      // Call the actual ML Model prediction pipeline instead of the static DBSCAN engine
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
          metadata: {
            lat: h.latitude,
            lng: h.longitude,
            name: h.atm_id
          }
        }));
        setGraphNodes(newNodes);
        setZones([]); // Clear DBSCAN zones to show pure ML output
      }
    } catch (error) {
      console.error('Failed to run ML prediction pipeline:', error);
    } finally {
      setIsPredicting(false);
    }
  };'''

content = re.sub(r'const runPrediction = async \(\) => \{.*?\n  \};', new_func, content, flags=re.DOTALL)

with open('frontend/src/pages/Heatmap.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
