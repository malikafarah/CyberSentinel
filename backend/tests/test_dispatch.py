from app.actions.dispatch import dispatch_field_officer, haversine_distance_km

def test_field_dispatch_alert():
    # Benz Circle SBI ATM
    atm_node = {
        "id": "ATM_BENZ_1",
        "name": "Benz Circle SBI ATM",
        "lat": 16.4971,
        "lng": 80.6516,
        "address": "Opposite Jyothi Convention, Benz Circle"
    }

    result = dispatch_field_officer(atm_node, predicted_cashout_time="21:15 IST")

    assert result["status"] == "dispatched"
    assert "dispatch_id" in result
    assert "officer" in result
    assert "SI Ramesh Kumar" in result["officer"] or "PCR" in result["officer"]
    assert result["eta_minutes"] <= 5
    assert "21:15 IST" in result["message"]
    assert "CYBERSENTINEL ALERT" in result["message"]

if __name__ == "__main__":
    test_field_dispatch_alert()
    print("test_field_dispatch_alert passed successfully!")
