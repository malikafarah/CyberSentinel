# backend/app/engine/forecasting.py
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

try:
    from prophet import Prophet
except ImportError:
    Prophet = None


def generate_synthetic_historical_withdrawals(hours_back: int = 168) -> pd.DataFrame:
    """
    Generates realistic historical ATM withdrawal & fraud volume data across key interdiction zones.
    Includes payday cycles, weekend evening surges, and temporal anomaly spikes.
    """
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    records = []

    zones = [
        {
            "zone_id": "ZONE-BENZ-CIRCLE",
            "zone_name": "Benz Circle Commercial Hub (Vijayawada)",
            "base_volume": 45,
            "center": {"lat": 16.4971, "lng": 80.6516},
            "lat_bounds": (16.4871, 16.5071),
            "lng_bounds": (80.6416, 80.6616),
            "atms": ["ATM_BENZ_1", "ATM_BENZ_2", "ATM_BENZ_SBI_01"]
        },
        {
            "zone_id": "ZONE-PATAMATA",
            "zone_name": "Patamata High-Density ATM Strip",
            "base_volume": 32,
            "center": {"lat": 16.5020, "lng": 80.6580},
            "lat_bounds": (16.4920, 16.5120),
            "lng_bounds": (80.6480, 80.6680),
            "atms": ["ATM_PATAMATA_1", "ATM_PATAMATA_HDFC_09"]
        },
        {
            "zone_id": "ZONE-MG-ROAD",
            "zone_name": "MG Road Financial Corridor",
            "base_volume": 28,
            "center": {"lat": 16.5060, "lng": 80.6490},
            "lat_bounds": (16.4960, 16.5160),
            "lng_bounds": (80.6390, 80.6590),
            "atms": ["ATM_MG_ROAD_1", "ATM_MG_ROAD_ICICI_04"]
        },
        {
            "zone_id": "ZONE-GOVINDARAJA",
            "zone_name": "Govindaraja High-Risk Transit Hub",
            "base_volume": 22,
            "center": {"lat": 16.5140, "lng": 80.6280},
            "lat_bounds": (16.5040, 16.5240),
            "lng_bounds": (80.6180, 80.6380),
            "atms": ["ATM_GOV_01", "ATM_GOV_02"]
        }
    ]

    for h in range(hours_back, 0, -1):
        ts = now - timedelta(hours=h)
        hour_of_day = ts.hour
        day_of_week = ts.weekday()
        day_of_month = ts.day

        # Diurnal pattern
        if 18 <= hour_of_day <= 22:
            diurnal_mult = 1.9
        elif 11 <= hour_of_day <= 17:
            diurnal_mult = 1.3
        elif 0 <= hour_of_day <= 5:
            diurnal_mult = 0.25
        else:
            diurnal_mult = 0.9

        # Weekend pattern
        weekend_mult = 1.45 if day_of_week in [4, 5, 6] else 1.0

        # Payday surge (1st-5th and 28th-31st)
        payday_mult = 1.6 if (1 <= day_of_month <= 5 or day_of_month >= 28) else 1.0

        for z in zones:
            noise = np.random.normal(0, 3)
            y = max(1.0, z["base_volume"] * diurnal_mult * weekend_mult * payday_mult + noise)
            records.append({
                "ds": ts.strftime('%Y-%m-%d %H:%M:%S'),
                "y": round(y, 2),
                "zone_id": z["zone_id"],
                "zone_name": z["zone_name"],
                "lat": z["center"]["lat"],
                "lng": z["center"]["lng"],
                "lat_min": z["lat_bounds"][0],
                "lat_max": z["lat_bounds"][1],
                "lng_min": z["lng_bounds"][0],
                "lng_max": z["lng_bounds"][1],
                "atms": z["atms"]
            })

    return pd.DataFrame(records)


def forecast_atm_hotspots(historical_data: Optional[pd.DataFrame] = None, hours_ahead: int = 12) -> List[Dict[str, Any]]:
    """
    Spatiotemporal Time-Series Forecasting for Likely Cash-Out Hotspots.
    Groups by geographic zone and projects hourly risk volumes for the next N hours.
    """
    if historical_data is None or historical_data.empty:
        historical_data = generate_synthetic_historical_withdrawals(hours_back=168)

    forecast_results = []
    threshold_for_high_risk = 250.0 * (hours_ahead / 12.0)
    high_threshold = 450.0 * (hours_ahead / 12.0)

    for zone, group in historical_data.groupby('zone_id'):
        zone_name = str(group.iloc[0].get('zone_name', zone))
        center_lat = float(group.iloc[0].get('lat', 16.5000))
        center_lng = float(group.iloc[0].get('lng', 80.6500))
        lat_min = float(group.iloc[0].get('lat_min', center_lat - 0.01))
        lat_max = float(group.iloc[0].get('lat_max', center_lat + 0.01))
        lng_min = float(group.iloc[0].get('lng_min', center_lng - 0.01))
        lng_max = float(group.iloc[0].get('lng_max', center_lng + 0.01))
        atms = list(group.iloc[0].get('atms', []))

        # Check if Prophet is available
        if Prophet is not None:
            try:
                df_train = group[['ds', 'y']].copy()
                df_train['ds'] = pd.to_datetime(df_train['ds'])
                
                m = Prophet(
                    daily_seasonality=True,
                    weekly_seasonality=True,
                    yearly_seasonality=False,
                    interval_width=0.95
                )
                try:
                    m.add_country_holidays(country_name='IN')
                except Exception:
                    pass

                m.fit(df_train)
                future = m.make_future_dataframe(periods=hours_ahead, freq='h')
                forecast = m.predict(future)
                future_forecast = forecast.tail(hours_ahead)[['ds', 'yhat', 'yhat_upper', 'yhat_lower']].copy()
                future_forecast['yhat'] = future_forecast['yhat'].clip(lower=0)
                future_forecast['yhat_upper'] = future_forecast['yhat_upper'].clip(lower=0)

            except Exception:
                # Fallback to seasonal harmonic engine
                future_forecast = _forecast_seasonal_harmonic(group, hours_ahead)
        else:
            future_forecast = _forecast_seasonal_harmonic(group, hours_ahead)

        # Aggregate predicted risk for this zone
        predicted_volume = float(future_forecast['yhat'].sum())
        peak_idx = future_forecast['yhat'].idxmax()
        peak_row = future_forecast.loc[peak_idx]
        peak_hour_val = peak_row['ds']
        peak_hour_str = peak_hour_val.isoformat() if hasattr(peak_hour_val, 'isoformat') else str(peak_hour_val)

        # Risk categorization
        if predicted_volume >= high_threshold:
            risk_level = "CRITICAL"
            risk_score = min(99.0, 90.0 + (predicted_volume - high_threshold) / 20.0)
        elif predicted_volume >= threshold_for_high_risk:
            risk_level = "HIGH"
            risk_score = min(89.0, 75.0 + (predicted_volume - threshold_for_high_risk) / 15.0)
        else:
            risk_level = "MODERATE"
            risk_score = max(55.0, 60.0 + (predicted_volume / threshold_for_high_risk) * 14.0)

        # Hourly trend timeline
        hourly_trend = []
        for _, row in future_forecast.iterrows():
            row_ds = row['ds']
            row_time_str = row_ds.isoformat() if hasattr(row_ds, 'isoformat') else str(row_ds)
            hourly_trend.append({
                "time": row_time_str,
                "predicted_cashout": round(float(row['yhat']), 2),
                "upper_bound": round(float(row.get('yhat_upper', row['yhat'] * 1.25)), 2)
            })

        forecast_results.append({
            "zone_id": zone,
            "zone_name": zone_name,
            "predicted_risk_level": risk_level,
            "risk_score": round(risk_score, 1),
            "forecasted_cashout_volume": round(predicted_volume, 2),
            "peak_hour": peak_hour_str,
            "peak_hourly_volume": round(float(peak_row['yhat']), 2),
            "center": {"lat": center_lat, "lng": center_lng},
            "bounding_box": {
                "north": lat_max,
                "south": lat_min,
                "east": lng_max,
                "west": lng_min
            },
            "targeted_atms": atms,
            "hourly_forecast": hourly_trend
        })

    # Sort descending by forecasted cash-out volume
    forecast_results.sort(key=lambda f: f["forecasted_cashout_volume"], reverse=True)
    return forecast_results


def _forecast_seasonal_harmonic(group: pd.DataFrame, hours_ahead: int) -> pd.DataFrame:
    """
    High-precision seasonal decomposition engine accounting for diurnal cycle,
    weekend volatility, and payday spikes when Prophet is in fallback mode.
    """
    recent_y = group['y'].tail(24).values
    baseline_avg = np.mean(recent_y) if len(recent_y) > 0 else 30.0

    last_ds_str = str(group['ds'].iloc[-1])
    try:
        last_dt = datetime.fromisoformat(last_ds_str)
    except Exception:
        last_dt = datetime.now(timezone.utc)

    future_rows = []
    for step in range(1, hours_ahead + 1):
        future_dt = last_dt + timedelta(hours=step)
        hr = future_dt.hour
        dow = future_dt.weekday()
        dom = future_dt.day

        # Diurnal wave
        diurnal = 1.0 + 0.7 * np.sin(2 * np.pi * (hr - 8) / 24)
        if 18 <= hr <= 22:
            diurnal = max(diurnal, 1.85)

        # Weekend & Payday multipliers
        weekend = 1.35 if dow in [4, 5, 6] else 1.0
        payday = 1.5 if (1 <= dom <= 5 or dom >= 28) else 1.0

        yhat = max(5.0, baseline_avg * diurnal * weekend * payday)
        yhat_upper = yhat * 1.28
        yhat_lower = max(0.0, yhat * 0.75)

        future_rows.append({
            "ds": future_dt,
            "yhat": yhat,
            "yhat_upper": yhat_upper,
            "yhat_lower": yhat_lower
        })

    return pd.DataFrame(future_rows)
