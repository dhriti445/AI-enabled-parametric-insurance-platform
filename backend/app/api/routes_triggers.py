from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, DisruptionEvent, Notification, Payout, Subscription, User
from app.schemas.dto import TriggerRequest
from app.services.disruption_monitor import evaluate_trigger
from app.services.fraud_detector import FraudSignal, fraud_detector

router = APIRouter(prefix="/triggers", tags=["triggers"])


@router.post("/monitor")
def monitor_disruption(payload: TriggerRequest, db: Session = Depends(get_db)) -> dict:
    event = DisruptionEvent(
        location=payload.location,
        rainfall_mm=payload.rainfall_mm,
        aqi=payload.aqi,
        temperature_c=payload.temperature_c,
        curfew_alert=payload.curfew_alert,
    )

    triggered, reason = evaluate_trigger(event)
    event.triggered = triggered
    event.reason = reason
    db.add(event)
    db.commit()
    db.refresh(event)

    affected_claims = []
    if triggered:
        workers = db.query(User).filter(User.location == payload.location, User.role == "worker").all()
        for worker in workers:
            active_sub = (
                db.query(Subscription)
                .filter(Subscription.user_id == worker.id, Subscription.active == True)
                .order_by(Subscription.created_at.desc())
                .first()
            )
            if not active_sub:
                continue

            estimated_loss = round(min(active_sub.weekly_coverage, active_sub.weekly_coverage * 0.55), 2)
            duplicate = db.query(Claim).filter(Claim.user_id == worker.id).count()
            fraud_score, flagged = fraud_detector.score(
                FraudSignal(
                    gps_mismatch=0,
                    duplicate_claims=1 if duplicate > 3 else 0,
                    odd_claim_hour=0,
                )
            )

            status = "Flagged" if flagged else "Approved"
            claim = Claim(
                user_id=worker.id,
                disruption_event_id=event.id,
                estimated_income_loss=estimated_loss,
                status=status,
                fraud_score=fraud_score,
            )
            db.add(claim)
            db.flush()

            if not flagged:
                payout = Payout(user_id=worker.id, claim_id=claim.id, amount=estimated_loss)
                db.add(payout)
                db.add(
                    Notification(
                        user_id=worker.id,
                        message=f"{reason} detected. Automatic payout of Rs.{estimated_loss} processed.",
                    )
                )

            affected_claims.append(
                {
                    "worker_id": worker.id,
                    "claim_id": claim.id,
                    "status": status,
                    "fraud_score": fraud_score,
                    "estimated_loss": estimated_loss,
                }
            )

        db.commit()

    return {
        "event_id": event.id,
        "triggered": triggered,
        "reason": reason,
        "affected_workers": len(affected_claims),
        "claims": affected_claims,
    }
