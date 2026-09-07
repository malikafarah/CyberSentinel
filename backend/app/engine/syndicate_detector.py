# backend/app/engine/syndicate_detector.py
import networkx as nx

try:
    from community import community_louvain  # pip install python-louvain
except ImportError:
    community_louvain = None


def detect_fraud_syndicates(G: nx.Graph):
    """
    Applies Louvain community detection to group nodes into fraud rings.
    Especially effective when the graph includes SHARED_DEVICE or SHARED_KYC edges.
    """
    # Louvain algorithm operates on undirected graphs
    undirected_G = G.to_undirected() if G.is_directed() else G

    # 1. Calculate the optimal partition
    # Returns a dictionary: { node_id: community_id }
    if community_louvain is not None:
        partition = community_louvain.best_partition(undirected_G, weight='weight')
    else:
        # Fallback to NetworkX native Louvain modularity algorithm
        try:
            communities = nx.community.louvain_communities(undirected_G, weight='weight', seed=42)
            partition = {}
            for cid, c_nodes in enumerate(communities):
                for node in c_nodes:
                    partition[node] = cid
        except Exception:
            partition = {node: 0 for node in G.nodes()}

    # 2. Append the 'syndicate_id' back to the graph nodes
    nx.set_node_attributes(G, partition, 'syndicate_id')

    # 3. Analyze the syndicates to find the most dangerous ones
    syndicate_metrics = {}
    for node, syndicate_id in partition.items():
        if syndicate_id not in syndicate_metrics:
            syndicate_metrics[syndicate_id] = {'node_count': 0, 'total_risk': 0, 'nodes': []}

        syndicate_metrics[syndicate_id]['node_count'] += 1
        syndicate_metrics[syndicate_id]['total_risk'] += G.nodes[node].get('riskScore', 0)
        syndicate_metrics[syndicate_id]['nodes'].append(node)

    return syndicate_metrics
