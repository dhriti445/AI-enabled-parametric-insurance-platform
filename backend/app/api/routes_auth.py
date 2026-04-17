from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import User, UserRole
from app.schemas.dto import AuthResponse, LoginRequest, RegisterRequest
from app.services.risk_engine import RiskInputs, compute_risk_score

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    normalized_email = payload.email.strip().lower()
    normalized_phone = payload.phone.strip()

    exists = db.query(User).filter((User.email == normalized_email) | (User.phone == normalized_phone)).first()
    if exists:
        raise HTTPException(status_code=400, detail="User with this email or phone already exists")

    rainfall_proxy = 80 if payload.location.lower() in {"mumbai", "chennai", "kolkata"} else 35
    flood_zone_proxy = 7 if payload.location.lower() in {"mumbai", "chennai"} else 4
    aqi_proxy = 210 if payload.location.lower() in {"delhi", "noida", "gurgaon"} else 130

    score, tier, _ = compute_risk_score(
        RiskInputs(rainfall_avg=rainfall_proxy, flood_zone_score=flood_zone_proxy, aqi_avg=aqi_proxy)
    )

    selected_role = payload.role.lower().strip()
    if selected_role in {"admin", "insurer"}:
        role = UserRole.admin.value
    elif selected_role == "worker":
        role = UserRole.worker.value
    else:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = User(
        name=payload.name,
        email=normalized_email,
        phone=normalized_phone,
        platform=payload.platform,
        location=payload.location,
        risk_score=score,
        risk_tier=tier,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return AuthResponse(
        user_id=user.id,
        name=user.name,
        role=user.role,
        location=user.location,
        risk_score=user.risk_score,
        risk_tier=user.risk_tier,
        email=user.email,
        phone=user.phone,
        platform=user.platform,
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    identifier = payload.email_or_phone.strip()
    normalized_email = identifier.lower()

    user = (
        db.query(User)
        .filter((User.email == normalized_email) | (User.phone == identifier))
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.expected_role:
        expected = payload.expected_role
        expected_normalized = "admin" if expected == "insurer" else expected
        if user.role != expected_normalized:
            raise HTTPException(status_code=403, detail=f"This account is registered as {user.role}, not {expected_normalized}")

    return AuthResponse(
        user_id=user.id,
        name=user.name,
        role=user.role,
        location=user.location,
        risk_score=user.risk_score,
        risk_tier=user.risk_tier,
        email=user.email,
        phone=user.phone,
        platform=user.platform,
    )


from pydantic import BaseModel

class ProfileUpdateRequest(BaseModel):
    name: str

@router.patch("/profile/{user_id}")
def update_profile(user_id: int, payload: ProfileUpdateRequest, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    user.name = name
    db.commit()
    db.refresh(user)
    return {"user_id": user.id, "name": user.name}


@router.delete("/profile/{user_id}")
def delete_account(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "deleted", "user_id": user_id}
