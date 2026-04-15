from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, DisruptionEvent, Notification, Payout, Subscription, User
from app.schemas.dto import AdminClaimDecisionRequest
from app.services.payments import simulate_payment

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/claim-reviews")
def list_claim_reviews(db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(Claim, User)
        .join(User, User.id == Claim.user_id)
        .filter(Claim.manual_proof_url.isnot(None), Claim.status.in_(["Pending Review", "Flagged"]))
        .order_by(Claim.created_at.desc())
        .all()
    )

    return {
        "claims": [
            {
                "claim_id": claim.id,
                "worker_id": worker.id,
                "worker_name": worker.name,
                "worker_platform": worker.platform,
                "location": worker.location,
                "estimated_income_loss": claim.estimated_income_loss,
                "status": claim.status,
                "fraud_score": claim.fraud_score,
                "proof_url": claim.manual_proof_url,
                "created_at": claim.created_at,
            }
            for claim, worker in rows
        ]
    }


@router.post("/claim-reviews/{claim_id}/decision")
def decide_claim_review(
    claim_id: int,
    payload: AdminClaimDecisionRequest,
    db: Session = Depends(get_db),
) -> dict:
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.manual_proof_url is None:
        raise HTTPException(status_code=400, detail="Only manual image claims are reviewed here")

    if claim.status not in {"Pending Review", "Flagged"}:
        raise HTTPException(status_code=400, detail=f"Claim already processed with status: {claim.status}")

    existing_payout = db.query(Payout).filter(Payout.claim_id == claim.id).first()
    if existing_payout:
        raise HTTPException(status_code=400, detail="Payout already created for this claim")

    if payload.action == "reject":
        claim.status = "Rejected"
        db.add(
            Notification(
                user_id=claim.user_id,
                message=f"Claim #{claim.id} rejected after insurer review.",
            )
        )
        db.commit()
        return {
            "claim_id": claim.id,
            "status": claim.status,
            "payout": None,
        }

    payment = simulate_payment(payload.provider, claim.estimated_income_loss)
    claim.status = "Approved"
    payout = Payout(
        user_id=claim.user_id,
        claim_id=claim.id,
        amount=claim.estimated_income_loss,
        payment_gateway=payment["provider"],
    )
    db.add(payout)
    db.add(
        Notification(
            user_id=claim.user_id,
            message=(
                f"Claim #{claim.id} approved by insurer. "
                f"Payment via {payment['provider']} ({payment['reference']})."
            ),
        )
    )
    db.commit()

    return {
        "claim_id": claim.id,
        "status": claim.status,
        "payout": {
            "provider": payment["provider"],
            "reference": payment["reference"],
            "settlement_eta": payment["settlement_eta"],
            "amount": claim.estimated_income_loss,
        },
    }


@router.get("/overview")
def overview(db: Session = Depends(get_db)) -> dict:
    total_users = db.query(User).filter(User.role == "worker").count()
    active_subscriptions = db.query(Subscription).filter(Subscription.active == True).count()
    total_payouts = db.query(func.coalesce(func.sum(Payout.amount), 0)).scalar() or 0
    total_claimed = db.query(func.coalesce(func.sum(Claim.estimated_income_loss), 0)).scalar() or 0
    loss_ratio = round((float(total_payouts) / float(total_claimed)) if total_claimed else 0, 3)

    flagged_users = (
        db.query(User.name, Claim.fraud_score)
        .join(Claim, Claim.user_id == User.id)
        .filter(Claim.fraud_score >= 0.65)
        .order_by(Claim.fraud_score.desc())
        .limit(10)
        .all()
    )

    risk_zones = {
        "Low": db.query(User).filter(User.risk_tier == "Low").count(),
        "Medium": db.query(User).filter(User.risk_tier == "Medium").count(),
        "High": db.query(User).filter(User.risk_tier == "High").count(),
    }

    region_pricing = (
        db.query(User.location, func.avg(User.risk_score).label("avg_risk"), func.count(User.id).label("workers"))
        .filter(User.role == "worker")
        .group_by(User.location)
        .all()
    )

    optimization = [
        {
            "region": row.location,
            "avg_risk": round(float(row.avg_risk), 3),
            "recommended_premium_adjustment": "Increase 10%"
            if row.avg_risk > 0.65
            else ("Decrease 5%" if row.avg_risk < 0.35 else "Keep base premium"),
            "workers": int(row.workers),
        }
        for row in region_pricing
    ]

    prediction_window_start = datetime.utcnow() - timedelta(days=28)
    city_rows = (
        db.query(User.location, func.count(User.id).label("workers"))
        .filter(User.role == "worker")
        .group_by(User.location)
        .all()
    )

    weekly_predictions = []
    for city_row in city_rows:
        triggered_events = (
            db.query(DisruptionEvent)
            .filter(
                DisruptionEvent.location == city_row.location,
                DisruptionEvent.created_at >= prediction_window_start,
                DisruptionEvent.triggered == True,
            )
            .all()
        )

        triggered_count = len(triggered_events)
        rainfall_avg = (
            float(sum(event.rainfall_mm for event in triggered_events) / triggered_count)
            if triggered_count
            else 0.0
        )
        forecast_disruptions = round((triggered_count / 4.0) + (rainfall_avg / 120.0), 2)
        expected_claims = int(round(min(city_row.workers, city_row.workers * min(1.0, forecast_disruptions / 3.0))))

        weekly_predictions.append(
            {
                "region": city_row.location,
                "workers": int(city_row.workers),
                "recent_triggered_events": triggered_count,
                "avg_trigger_rainfall_mm": round(rainfall_avg, 2),
                "forecast_disruptions_next_week": forecast_disruptions,
                "predicted_claims_next_week": expected_claims,
                "confidence": "Medium" if triggered_count >= 2 else "Low",
            }
        )

    weekly_predictions.sort(key=lambda row: row["predicted_claims_next_week"], reverse=True)

    pending_reviews = (
        db.query(Claim)
        .filter(Claim.manual_proof_url.isnot(None), Claim.status.in_(["Pending Review", "Flagged"]))
        .count()
    )

    return {
        "metrics": {
            "total_users": total_users,
            "active_subscriptions": active_subscriptions,
            "total_payouts": float(total_payouts),
            "loss_ratio": loss_ratio,
            "pending_claim_reviews": pending_reviews,
        },
        "fraud_analytics": [
            {"name": item.name, "fraud_score": float(item.fraud_score)} for item in flagged_users
        ],
        "risk_zone_classification": risk_zones,
        "subscription_optimization": optimization,
        "weekly_claim_predictions": weekly_predictions,
    }
