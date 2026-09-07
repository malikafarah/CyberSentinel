from app.api.fusion import FusionSignal

def test_fusion_signal_schema():
    sig_npci = FusionSignal(
        identifier="9876543210@paytm",
        source="NPCI_eFRM",
        risk_score=94.5,
        reason="UPI velocity spike: 12 incoming transfers in 90 seconds"
    )
    assert sig_npci.identifier == "9876543210@paytm"
    assert sig_npci.source == "NPCI_eFRM"
    assert sig_npci.risk_score == 94.5

    sig_dot = FusionSignal(
        identifier="+919876543210",
        source="DoT_Chakshu",
        risk_score=88.0,
        reason="IMEI churn & MNRL revocation listing"
    )
    assert sig_dot.source == "DoT_Chakshu"
    assert sig_dot.risk_score == 88.0

if __name__ == "__main__":
    test_fusion_signal_schema()
    print("test_fusion_signal_schema passed successfully!")
