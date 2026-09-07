from app.engine.feedback import recalibrate_models, get_current_hyperparam

def test_ml_recalibration_loop():
    # Simulate a batch with 3 False Positives out of 4 reviews
    batch = [
        {"node_id": "ACC-101", "status": "FALSE_POSITIVE", "reason": "Verified merchant"},
        {"node_id": "ACC-102", "status": "FALSE_POSITIVE", "reason": "Victim refund account"},
        {"node_id": "ACC-103", "status": "FALSE_POSITIVE", "reason": "False alarm"},
        {"node_id": "ACC-104", "status": "TRUE_POSITIVE", "reason": "Confirmed mule"}
    ]

    initial_contamination = get_current_hyperparam("iso_forest_contamination")
    initial_alpha = get_current_hyperparam("pagerank_alpha")

    result = recalibrate_models(batch)

    assert result["status"] == "recalibrated"
    assert result["false_positives"] == 3
    assert result["false_positive_rate"] == 0.75
    # Contamination should decrease when FPR is high
    assert result["new_contamination"] <= initial_contamination
    # Alpha should increase/tighten when FPR is high
    assert result["new_pagerank_alpha"] >= initial_alpha

if __name__ == "__main__":
    test_ml_recalibration_loop()
    print("test_ml_recalibration_loop passed successfully!")
