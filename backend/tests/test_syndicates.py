import networkx as nx
from app.engine.syndicate_detector import detect_fraud_syndicates

def test_detect_fraud_syndicates():
    # Construct a network with 2 distinct dense clusters (fraud rings)
    G = nx.Graph()

    # Syndicate A (Mules sharing Device 1)
    G.add_node("mule_1", riskScore=90)
    G.add_node("mule_2", riskScore=85)
    G.add_node("mule_3", riskScore=95)
    G.add_node("dev_1", riskScore=70)

    G.add_edge("mule_1", "dev_1", weight=2.0)
    G.add_edge("mule_2", "dev_1", weight=2.0)
    G.add_edge("mule_3", "dev_1", weight=2.0)
    G.add_edge("mule_1", "mule_2", weight=1.0)

    # Syndicate B (Mules sharing PAN)
    G.add_node("mule_4", riskScore=80)
    G.add_node("mule_5", riskScore=75)
    G.add_node("pan_1", riskScore=60)

    G.add_edge("mule_4", "pan_1", weight=2.0)
    G.add_edge("mule_5", "pan_1", weight=2.0)
    G.add_edge("mule_4", "mule_5", weight=1.0)

    metrics = detect_fraud_syndicates(G)

    assert isinstance(metrics, dict)
    assert len(metrics) >= 2

    # Verify syndicate_id attribute was set on nodes
    for n in G.nodes():
        assert "syndicate_id" in G.nodes[n]

    # Verify node counts and total risks are calculated
    total_nodes_in_syndicates = sum(s["node_count"] for s in metrics.values())
    assert total_nodes_in_syndicates == 7

if __name__ == "__main__":
    test_detect_fraud_syndicates()
    print("test_detect_fraud_syndicates passed successfully!")
