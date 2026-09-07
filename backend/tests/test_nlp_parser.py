from app.nlp.intake_parser import extract_entities_hybrid

def test_hybrid_nlp_extraction():
    # Test case with code-mixed Indic text, disguised words, and UPI
    complaint_1 = (
        "Mera account se 50000 kat gaye, fraudster ka number hai 98765-four-3210. "
        "Money transferred to scammer88@paytm and account number 31948571029. "
        "Caller named Rajesh Sharma told me to do KYC."
    )

    result_1 = extract_entities_hybrid(complaint_1)

    # UPI verification
    assert "scammer88@paytm" in result_1["upi_ids"]

    # Disguised phone number verification (four -> 4 -> 9876543210)
    assert any("9876543210" in p for p in result_1["phone_numbers"])

    # Bank account verification
    acc_entities = [item["entity"] if isinstance(item, dict) else item for item in result_1["bank_accounts"]]
    assert "31948571029" in acc_entities

    # Suspect name verification
    suspects = [item["entity"] if isinstance(item, dict) else item for item in result_1["suspect_names"]]
    assert any("Rajesh" in s or "Sharma" in s for s in suspects)

    # Confidence metrics check
    assert "confidence_metrics" in result_1
    assert result_1["confidence_metrics"]["upi_confidence"] > 0.9

if __name__ == "__main__":
    test_hybrid_nlp_extraction()
    print("test_hybrid_nlp_extraction passed successfully!")
