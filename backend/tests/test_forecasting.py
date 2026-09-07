from app.engine.forecasting import forecast_atm_hotspots, generate_synthetic_historical_withdrawals

def test_forecasting_engine():
    # 1. Test synthetic historical generation
    df = generate_synthetic_historical_withdrawals(hours_back=72)
    assert not df.empty
    assert 'ds' in df.columns
    assert 'y' in df.columns
    assert 'zone_id' in df.columns

    # 2. Test forecasting for 12 hours
    forecast_12h = forecast_atm_hotspots(df, hours_ahead=12)
    assert isinstance(forecast_12h, list)
    assert len(forecast_12h) > 0

    top_zone = forecast_12h[0]
    assert "zone_id" in top_zone
    assert "predicted_risk_level" in top_zone
    assert "forecasted_cashout_volume" in top_zone
    assert "peak_hour" in top_zone
    assert "center" in top_zone
    assert "bounding_box" in top_zone
    assert len(top_zone["hourly_forecast"]) == 12

    # 3. Test forecasting for 24 hours
    forecast_24h = forecast_atm_hotspots(df, hours_ahead=24)
    assert len(forecast_24h[0]["hourly_forecast"]) == 24

if __name__ == "__main__":
    test_forecasting_engine()
    print("test_forecasting_engine passed successfully!")
