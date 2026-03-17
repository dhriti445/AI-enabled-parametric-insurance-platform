from dataclasses import dataclass

import numpy as np


@dataclass
class RiskInputs:
    rainfall_avg: float
    flood_zone_score: float
    aqi_avg: float


def normalize(value: float, min_v: float, max_v: float) -> float:
    if max_v == min_v:
        return 0.0
    return float(np.clip((value - min_v) / (max_v - min_v), 0.0, 1.0))


def compute_risk_score(inputs: RiskInputs) -> tuple[float, str, float]:
    rain_factor = normalize(inputs.rainfall_avg, 0, 250)
    flood_factor = normalize(inputs.flood_zone_score, 0, 10)
    aqi_factor = normalize(inputs.aqi_avg, 0, 500)

    score = round((0.45 * rain_factor) + (0.3 * flood_factor) + (0.25 * aqi_factor), 3)

    if score < 0.35:
        tier = "Low"
        recommended_premium = 20.0
    elif score < 0.65:
        tier = "Medium"
        recommended_premium = 30.0
    else:
        tier = "High"
        recommended_premium = 40.0

    return score, tier, recommended_premium
