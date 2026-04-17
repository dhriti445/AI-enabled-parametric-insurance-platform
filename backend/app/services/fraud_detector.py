"""
Fraud detection service.
Combines an Isolation Forest anomaly model with disaster-specific rule signals
for rain, fire, and flood claims.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np
from sklearn.ensemble import IsolationForest


DisasterContext = Literal["rain", "fire", "flood", "smoke", "unknown"]


@dataclass
class FraudSignal:
    # Core signals (original)
    gps_mismatch: int           # 1 if worker GPS is far from claimed city
    duplicate_claims: int       # 1 if unusually high claim frequency
    odd_claim_hour: int         # 1 if filed at suspicious hour (0-4 AM)
    weather_mismatch: int = 0   # 1 if live weather contradicts claim

    # Disaster-specific signals
    disaster_context: DisasterContext = "unknown"
    image_disaster_type: DisasterContext = "unknown"   # from image verifier
    image_confidence: float = 0.5                      # image model confidence
    live_rainfall_mm: float = 0.0                      # from weather API
    live_aqi: int = 50                                 # from weather API
    live_temperature_c: float = 30.0                   # from weather API
    recent_triggered_events: int = 0                   # disruption events in DB
    historical_rain_mm: float = 0.0                    # avg historical rainfall
    claim_amount_ratio: float = 0.5                    # claim / max_coverage ratio
    extra_signals: dict = field(default_factory=dict)


@dataclass
class FraudAnalysisResult:
    fraud_score: float
    flagged: bool
    reasons: list[str]
    disaster_signals: dict
    model_anomaly: bool


# Disaster-specific thresholds
_RAIN_THRESHOLD_MM = 30.0
_FIRE_AQI_THRESHOLD = 200
_FLOOD_THRESHOLD_MM = 60.0
_EXTREME_HEAT_C = 42.0


def _disaster_consistency_score(signal: FraudSignal) -> tuple[float, list[str]]:
    """
    Returns a penalty score [0, 1] and reasons based on disaster-specific checks.
    Higher penalty = more suspicious.
    """
    penalty = 0.0
    reasons: list[str] = []
    ctx = signal.disaster_context
    img = signal.image_disaster_type

    # --- Rain-specific checks ---
    if ctx == "rain":
        # Only penalise if image actively contradicts (not just unknown)
        if img == "clear":
            penalty += 0.35
            reasons.append(f"Rain/storm claim but image shows clear weather")
        elif img not in ("rain", "flood", "unknown"):
            penalty += 0.15
            reasons.append(f"Rain claim but image classified as '{img}'")
        # Weather check — only penalise if truly dry with no history
        if signal.live_rainfall_mm < 5 and signal.recent_triggered_events == 0 and signal.historical_rain_mm < 5:
            penalty += 0.20
            reasons.append(f"Rain claim but live rainfall is {signal.live_rainfall_mm:.1f}mm with no recent events")

    # --- Fire-specific checks ---
    elif ctx == "fire":
        if img == "clear":
            penalty += 0.35
            reasons.append("Fire claim but image shows clear weather")
        elif img not in ("fire", "smoke", "unknown"):
            penalty += 0.20
            reasons.append(f"Fire claim but image classified as '{img}'")
        if signal.live_aqi < 100 and signal.live_temperature_c < 32:
            penalty += 0.20
            reasons.append(f"Fire claim but AQI={signal.live_aqi} and temp={signal.live_temperature_c}°C (low for fire)")

    # --- Flood-specific checks ---
    elif ctx == "flood":
        if img == "clear":
            penalty += 0.35
            reasons.append("Flood claim but image shows clear weather")
        elif img not in ("flood", "rain", "unknown"):
            penalty += 0.20
            reasons.append(f"Flood claim but image classified as '{img}'")
        if signal.live_rainfall_mm < 5 and signal.recent_triggered_events == 0:
            penalty += 0.20
            reasons.append(f"Flood claim but live rainfall only {signal.live_rainfall_mm:.1f}mm with no triggered events")

    # --- Smoke/AQI checks ---
    elif ctx == "smoke":
        if img == "clear":
            penalty += 0.30
            reasons.append("Smoke claim but image shows clear weather")
        if signal.live_aqi < 80:
            penalty += 0.25
            reasons.append(f"Smoke/AQI claim but current AQI is only {signal.live_aqi}")

    # Image confidence penalty — only penalise very low confidence (< 0.25)
    if signal.image_confidence < 0.25:
        penalty += 0.10
        reasons.append(f"Very low image verification confidence ({signal.image_confidence:.2f})")

    # Inflated claim amount — only penalise if claiming near 100% of coverage
    if signal.claim_amount_ratio > 0.95:
        penalty += 0.08
        reasons.append("Claim amount is at maximum coverage limit")

    return round(min(penalty, 0.80), 3), reasons


class FraudDetector:
    def __init__(self) -> None:
        self.model = IsolationForest(contamination=0.2, random_state=42)
        # Training baseline: [gps_mismatch, duplicate_claims, odd_hour, weather_mismatch]
        baseline = np.array(
            [
                [0, 0, 0, 0],
                [0, 0, 1, 0],
                [0, 1, 0, 0],
                [1, 0, 0, 0],
                [0, 0, 0, 1],
                [0, 0, 0, 0],
                [1, 1, 1, 1],
                [0, 0, 0, 0],
                [1, 0, 1, 0],
                [0, 1, 0, 1],
            ]
        )
        self.model.fit(baseline)

    def analyze(self, signal: FraudSignal) -> tuple[float, bool, list[str]]:
        result = self.analyze_detailed(signal)
        return result.fraud_score, result.flagged, result.reasons

    def analyze_detailed(self, signal: FraudSignal) -> FraudAnalysisResult:
        x = np.array(
            [[signal.gps_mismatch, signal.duplicate_claims, signal.odd_claim_hour, signal.weather_mismatch]]
        )
        prediction = self.model.predict(x)[0]
        model_anomaly = prediction == -1

        # Base score: sum of binary signals, scaled down so a single flag ≠ instant fraud
        raw_sum = int(signal.gps_mismatch) + int(signal.duplicate_claims) + int(signal.odd_claim_hour) + int(signal.weather_mismatch)
        base_score = raw_sum * 0.12  # max 0.48 from 4 signals

        # Anomaly bonus only when model flags AND at least 2 signals are active
        anomaly_bonus = 0.15 if (model_anomaly and raw_sum >= 2) else 0.0
        core_score = round(min(0.55, base_score + anomaly_bonus), 3)

        # Disaster-specific penalty
        disaster_penalty, disaster_reasons = _disaster_consistency_score(signal)

        fraud_score = round(min(1.0, core_score + disaster_penalty), 3)
        flagged = fraud_score >= 0.65

        # Build reason list
        reasons: list[str] = []
        if signal.gps_mismatch:
            reasons.append("GPS route mismatch detected")
        if signal.weather_mismatch:
            reasons.append("Claimed weather differs from observed weather")
        if signal.duplicate_claims:
            reasons.append("Unusual claim frequency")
        if signal.odd_claim_hour:
            reasons.append("Claim filed during unusual time window")
        if model_anomaly and raw_sum >= 2:
            reasons.append("Anomaly model flagged claim pattern")
        reasons.extend(disaster_reasons)

        disaster_signals = {
            "disaster_context": signal.disaster_context,
            "image_disaster_type": signal.image_disaster_type,
            "image_confidence": signal.image_confidence,
            "live_rainfall_mm": signal.live_rainfall_mm,
            "live_aqi": signal.live_aqi,
            "live_temperature_c": signal.live_temperature_c,
            "recent_triggered_events": signal.recent_triggered_events,
            "disaster_penalty": disaster_penalty,
        }

        return FraudAnalysisResult(
            fraud_score=fraud_score,
            flagged=flagged,
            reasons=reasons,
            disaster_signals=disaster_signals,
            model_anomaly=model_anomaly,
        )

    def score(self, signal: FraudSignal) -> tuple[float, bool]:
        fraud_score, flagged, _ = self.analyze(signal)
        return fraud_score, flagged


fraud_detector = FraudDetector()
