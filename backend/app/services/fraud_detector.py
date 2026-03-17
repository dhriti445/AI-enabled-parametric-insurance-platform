from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest


@dataclass
class FraudSignal:
    gps_mismatch: int
    duplicate_claims: int
    odd_claim_hour: int


class FraudDetector:
    def __init__(self) -> None:
        self.model = IsolationForest(contamination=0.2, random_state=42)
        baseline = np.array(
            [
                [0, 0, 0],
                [0, 0, 1],
                [0, 1, 0],
                [1, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
            ]
        )
        self.model.fit(baseline)

    def score(self, signal: FraudSignal) -> tuple[float, bool]:
        x = np.array([[signal.gps_mismatch, signal.duplicate_claims, signal.odd_claim_hour]])
        prediction = self.model.predict(x)[0]

        # Rule+model hybrid improves explainability for prototype fraud checks.
        base_score = float(np.mean(x))
        anomaly_bonus = 0.5 if prediction == -1 else 0.0
        fraud_score = round(min(1.0, base_score + anomaly_bonus), 3)
        flagged = fraud_score >= 0.65
        return fraud_score, flagged


fraud_detector = FraudDetector()
