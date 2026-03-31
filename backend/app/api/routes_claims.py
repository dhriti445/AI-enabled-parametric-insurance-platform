from datetime import datetime
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, Notification, Payout, Subscription, User
from app.schemas.dto import ManualClaimRequest
from app.services.fraud_detector import FraudSignal, fraud_detector
from app.services.image_verifier import verify_claim_image

router = APIRouter(prefix="/claims", tags=["claims"])

# Create uploads directory if not exists
UPLOADS_DIR = "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)


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
def manual_claim(
    user_id: int = Form(...),
    estimated_income_loss: float = Form(...),
    proof_file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate file type
    allowed_types = {".jpg", ".jpeg", ".png", ".mp4", "image/jpeg", "image/png", "video/mp4"}
    file_ext = os.path.splitext(proof_file.filename)[1].lower()
    if file_ext not in allowed_types and proof_file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and MP4 files are allowed")

    # Save file
    file_path = os.path.join(UPLOADS_DIR, f"{user_id}_{proof_file.filename}")
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(proof_file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

    active_sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id, Subscription.active == True)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if not active_sub:
        raise HTTPException(status_code=400, detail="No active subscription")

    image_ok, image_msg, confidence = verify_claim_image(file_path)
    duplicate_claims = db.query(Claim).filter(Claim.user_id == user.id).count()
    fraud_score, flagged = fraud_detector.score(
        FraudSignal(gps_mismatch=0, duplicate_claims=1 if duplicate_claims > 2 else 0, odd_claim_hour=0)
    )

    status = "Approved"
    if not image_ok:
        status = "Rejected"
    elif flagged:
        status = "Flagged"

    approved_amount = min(estimated_income_loss, active_sub.weekly_coverage)
    claim = Claim(
        user_id=user.id,
        estimated_income_loss=approved_amount,
        status=status,
        fraud_score=max(fraud_score, 1 - confidence),
        manual_proof_url=file_path,
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
