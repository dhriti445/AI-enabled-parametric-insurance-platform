from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest


@dataclass
class FraudSignal:
    gps_mismatch: int
    duplicate_claims: int
    odd_claim_hour: int
    weather_mismatch: int = 0


class FraudDetector:
    def __init__(self) -> None:
        self.model = IsolationForest(contamination=0.2, random_state=42)
        baseline = np.array(
            [
                [0, 0, 0, 0],
                [0, 0, 1, 0],
                [0, 1, 0, 0],
                [1, 0, 0, 0],
                [0, 0, 0, 1],
                [0, 0, 0, 0],
                [1, 1, 1, 1],
            ]
        )
        self.model.fit(baseline)

    def analyze(self, signal: FraudSignal) -> tuple[float, bool, list[str]]:
        x = np.array(
            [[signal.gps_mismatch, signal.duplicate_claims, signal.odd_claim_hour, signal.weather_mismatch]]
        )
        prediction = self.model.predict(x)[0]

        # Rule + model hybrid keeps the score explainable for product demos.
        base_score = float(np.mean(x))
        anomaly_bonus = 0.45 if prediction == -1 else 0.0
        fraud_score = round(min(1.0, base_score + anomaly_bonus), 3)
        flagged = fraud_score >= 0.65

        reasons: list[str] = []
        if signal.gps_mismatch:
            reasons.append("GPS route mismatch detected")
        if signal.weather_mismatch:
            reasons.append("Claimed weather differs from observed weather")
        if signal.duplicate_claims:
            reasons.append("Unusual claim frequency")
        if signal.odd_claim_hour:
            reasons.append("Claim filed during unusual time window")
        if prediction == -1:
            reasons.append("Anomaly model flagged claim pattern")

        return fraud_score, flagged, reasons

    def score(self, signal: FraudSignal) -> tuple[float, bool]:
        fraud_score, flagged, _ = self.analyze(signal)
        return fraud_score, flagged


fraud_detector = FraudDetector()
