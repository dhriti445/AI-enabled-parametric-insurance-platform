from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, DisruptionEvent, Notification, Payout, Subscription, User
from app.schemas.dto import TriggerRequest
from app.services.disruption_monitor import evaluate_trigger
from app.services.fraud_detector import FraudSignal, fraud_detector
from app.services.payments import simulate_payment
from app.services.trigger_automation import evaluate_trigger_signals, fetch_disruption_inputs

router = APIRouter(prefix="/triggers", tags=["triggers"])


def _create_auto_claims_for_event(
    *,
    db: Session,
    event: DisruptionEvent,
    reason: str,
) -> list[dict]:
    affected_claims = []
    workers = (
        db.query(User)
        .filter(func.lower(User.location) == event.location.lower(), User.role == "worker")
        .all()
    )

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
                duplicate_claims=1 if duplicate > 8 else 0,
                odd_claim_hour=0,
                weather_mismatch=0,
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
            payout_gateway = "UPI" if worker.platform.lower() in {"swiggy", "zomato", "zepto", "blinkit"} else "Razorpay"
            payment = simulate_payment(payout_gateway, estimated_loss)
            payout = Payout(
                user_id=worker.id,
                claim_id=claim.id,
                amount=estimated_loss,
                payment_gateway=payment["provider"],
            )
            db.add(payout)
            db.add(
                Notification(
                    user_id=worker.id,
                    message=(
                        f"{reason} detected. Automatic payout of Rs.{estimated_loss} "
                        f"processed via {payment['provider']} ({payment['reference']})."
                    ),
                )
            )

        affected_claims.append(
            {
                "worker_id": worker.id,
                "claim_id": claim.id,
                "status": status,
                "fraud_score": fraud_score,
                "estimated_loss": estimated_loss,
                "payout": {
                    "provider": payment["provider"],
                    "reference": payment["reference"],
                    "settlement_eta": payment["settlement_eta"],
                }
                if not flagged
                else None,
            }
        )

    return affected_claims


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
        affected_claims = _create_auto_claims_for_event(db=db, event=event, reason=reason)

    db.commit()

    return {
        "event_id": event.id,
        "triggered": triggered,
        "reason": reason,
        "affected_workers": len(affected_claims),
        "claims": affected_claims,
    }


@router.post("/monitor/auto/{location}")
def monitor_disruption_auto(location: str, force: bool = Query(default=False), db: Session = Depends(get_db)) -> dict:
    if force:
        inputs = {
            "location": location,
            "rainfall_mm": 96.0,
            "aqi": 320,
            "temperature_c": 45.0,
            "curfew_alert": True,
            "wind_speed_kmph": 62.0,
            "source": "admin-forced simulation",
            "fallback_used": False,
            "forced": True,
        }
        reasons = ["Simulated server disruption"]
    else:
        inputs = fetch_disruption_inputs(location)
        reasons = evaluate_trigger_signals(inputs)

    triggered = len(reasons) > 0
    reason = ", ".join(reasons) if reasons else "No disruption"

    event = DisruptionEvent(
        location=location,
        rainfall_mm=inputs.get("rainfall_mm", 0.0),
        aqi=inputs.get("aqi", 50),
        temperature_c=inputs.get("temperature_c", 30.0),
        curfew_alert=inputs.get("curfew_alert", False),
        triggered=triggered,
        reason=reason,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    affected_claims = []
    if triggered:
        affected_claims = _create_auto_claims_for_event(db=db, event=event, reason=reason)
        db.commit()

    return {
        "event_id": event.id,
        "triggered": triggered,
        "reason": reason,
        "source": inputs.get("source", "unknown"),
        "signals": inputs,
        "affected_workers": len(affected_claims),
        "claims": affected_claims,
    }


@router.get("/latest/{location}")
def latest_disruption(location: str, db: Session = Depends(get_db)) -> dict:
    event = (
        db.query(DisruptionEvent)
        .filter(func.lower(DisruptionEvent.location) == location.lower())
        .order_by(DisruptionEvent.created_at.desc())
        .first()
    )

    if not event:
        return {
            "location": location,
            "triggered": False,
            "reason": "No disruption events recorded yet",
            "created_at": None,
            "source": "event-log",
            "event_id": None,
        }

    source = "admin-forced simulation" if "Simulated server disruption" in (event.reason or "") else "event-log"
    return {
        "location": event.location,
        "triggered": event.triggered,
        "reason": event.reason,
        "created_at": event.created_at,
        "source": source,
        "event_id": event.id,
    }


@router.post("/monitor/auto-batch")
def monitor_disruption_auto_batch(db: Session = Depends(get_db)) -> dict:
    locations = ["mumbai", "chennai", "kolkata", "delhi", "bengaluru"]
    results = []

    for location in locations:
        results.append(monitor_disruption_auto(location=location, db=db))

    return {
        "batch": True,
        "cities_checked": len(locations),
        "results": results,
    }
