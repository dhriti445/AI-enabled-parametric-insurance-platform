from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, Notification, Payout, Subscription, User
from app.schemas.dto import ManualClaimRequest
from app.services.fraud_detector import FraudSignal, fraud_detector
from app.services.image_verifier import verify_claim_image

router = APIRouter(prefix="/claims", tags=["claims"])


@router.get("/user/{user_id}")
def list_claims(user_id: int, db: Session = Depends(get_db)) -> dict:
    claims = db.query(Claim).filter(Claim.user_id == user_id).order_by(Claim.created_at.desc()).all()
    return {
        "claims": [
            {
                "id": c.id,
                "estimated_income_loss": c.estimated_income_loss,
                "status": c.status,
                "fraud_score": c.fraud_score,
                "created_at": c.created_at,
            }
            for c in claims
        ]
    }


@router.post("/manual")
def manual_claim(payload: ManualClaimRequest, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    active_sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id, Subscription.active == True)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if not active_sub:
        raise HTTPException(status_code=400, detail="No active subscription")

    image_ok, image_msg, confidence = verify_claim_image(payload.image_filename)
    duplicate_claims = db.query(Claim).filter(Claim.user_id == user.id).count()
    fraud_score, flagged = fraud_detector.score(
        FraudSignal(gps_mismatch=0, duplicate_claims=1 if duplicate_claims > 2 else 0, odd_claim_hour=0)
    )

    status = "Approved"
    if not image_ok:
        status = "Rejected"
    elif flagged:
        status = "Flagged"

    approved_amount = min(payload.estimated_income_loss, active_sub.weekly_coverage)
    claim = Claim(
        user_id=user.id,
        estimated_income_loss=approved_amount,
        status=status,
        fraud_score=max(fraud_score, 1 - confidence),
        manual_proof_url=payload.image_filename,
        created_at=datetime.utcnow(),
    )
    db.add(claim)
    db.flush()

    payout_info = None
    if status == "Approved":
        payout = Payout(user_id=user.id, claim_id=claim.id, amount=approved_amount, payment_gateway="Stripe Sandbox")
        db.add(payout)
        payout_info = {
            "status": payout.status,
            "amount": approved_amount,
            "gateway": payout.payment_gateway,
        }
        db.add(
            Notification(
                user_id=user.id,
                message=f"Manual claim approved for Rs.{approved_amount}. Payment Successful.",
            )
        )

    db.commit()

    return {
        "claim_id": claim.id,
        "claim_status": status,
        "image_verification": {"accepted": image_ok, "message": image_msg, "confidence": confidence},
        "fraud_score": claim.fraud_score,
        "payout": payout_info,
    }
