from __future__ import annotations

from functools import lru_cache

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from app.services.trigger_automation import fetch_disruption_inputs

SAFE_WATER_LOGGING_ZONES = {"pune", "bengaluru", "hyderabad"}


@lru_cache(maxsize=1)
def _pricing_model() -> RandomForestRegressor:
    # Synthetic training set for demo pricing behavior based on risk + weather.
    rng = np.random.default_rng(42)
    rows = 350

    risk_score = rng.uniform(0.15, 0.95, rows)
    rainfall = rng.uniform(0.0, 85.0, rows)
    aqi = rng.uniform(30.0, 320.0, rows)
    temperature = rng.uniform(20.0, 46.0, rows)
    wind_speed = rng.uniform(5.0, 65.0, rows)
    flood_zone_score = rng.uniform(0.0, 10.0, rows)

    x = np.column_stack([risk_score, rainfall, aqi, temperature, wind_speed, flood_zone_score])

    # Target is premium delta in INR/week. Positive values increase premium in risky conditions.
    y = (
        (risk_score * 8.0)
        + (rainfall / 18.0)
        + (aqi / 220.0)
        + np.maximum(temperature - 36.0, 0.0) / 2.5
        + (wind_speed / 35.0)
        + (flood_zone_score / 2.8)
        - 5.5
    )

    model = RandomForestRegressor(n_estimators=140, random_state=42)
    model.fit(x, y)
    return model


def _coverage_hours_boost(rainfall_mm: float, wind_speed_kmph: float, curfew_alert: bool) -> int:
    if rainfall_mm >= 55 or wind_speed_kmph >= 45:
        return 12
    if rainfall_mm >= 35 or wind_speed_kmph >= 30 or curfew_alert:
        return 6
    return 0


def quote_dynamic_pricing(
    *,
    location: str,
    user_risk_score: float,
    base_weekly_price: float,
    base_coverage_hours: int,
    hourly_coverage_value: float,
) -> dict:
    live = fetch_disruption_inputs(location)

    rainfall_mm = float(live.get("rainfall_mm", 0.0))
    aqi = float(live.get("aqi", 60.0))
    temperature_c = float(live.get("temperature_c", 30.0))
    wind_speed_kmph = float(live.get("wind_speed_kmph", 10.0))
    curfew_alert = bool(live.get("curfew_alert", False))

    city = location.lower().strip()
    flood_zone_score = 2.0 if city in SAFE_WATER_LOGGING_ZONES else 7.5

    features = np.array(
        [[user_risk_score, rainfall_mm, aqi, temperature_c, wind_speed_kmph, flood_zone_score]],
        dtype=float,
    )

    model_delta = float(_pricing_model().predict(features)[0])
    safe_zone_discount = 2.0 if city in SAFE_WATER_LOGGING_ZONES else 0.0

    adjusted_weekly_premium = round(max(10.0, base_weekly_price + model_delta - safe_zone_discount), 2)

    extra_coverage_hours = _coverage_hours_boost(
        rainfall_mm=rainfall_mm,
        wind_speed_kmph=wind_speed_kmph,
        curfew_alert=curfew_alert,
    )
    final_coverage_hours = base_coverage_hours + extra_coverage_hours
    adjusted_weekly_coverage = round(final_coverage_hours * hourly_coverage_value, 2)

    return {
        "base_weekly_price": base_weekly_price,
        "adjusted_weekly_price": adjusted_weekly_premium,
        "price_delta": round(adjusted_weekly_premium - base_weekly_price, 2),
        "safe_zone_discount": safe_zone_discount,
        "base_coverage_hours": base_coverage_hours,
        "extra_coverage_hours": extra_coverage_hours,
        "final_coverage_hours": final_coverage_hours,
        "adjusted_weekly_coverage": adjusted_weekly_coverage,
        "inputs": {
            "location": location,
            "rainfall_mm": rainfall_mm,
            "aqi": int(aqi),
            "temperature_c": temperature_c,
            "wind_speed_kmph": wind_speed_kmph,
            "curfew_alert": curfew_alert,
            "source": live.get("source", "unknown"),
        },
    }
