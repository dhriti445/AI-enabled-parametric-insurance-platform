from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import User, UserRole
from app.schemas.dto import AuthResponse, LoginRequest, RegisterRequest
from app.services.risk_engine import RiskInputs, compute_risk_score

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    exists = db.query(User).filter((User.email == payload.email) | (User.phone == payload.phone)).first()
    if exists:
        raise HTTPException(status_code=400, detail="User with this email or phone already exists")

    rainfall_proxy = 80 if payload.location.lower() in {"mumbai", "chennai", "kolkata"} else 35
    flood_zone_proxy = 7 if payload.location.lower() in {"mumbai", "chennai"} else 4
    aqi_proxy = 210 if payload.location.lower() in {"delhi", "noida", "gurgaon"} else 130

    score, tier, _ = compute_risk_score(
        RiskInputs(rainfall_avg=rainfall_proxy, flood_zone_score=flood_zone_proxy, aqi_avg=aqi_proxy)
    )

    role = UserRole.admin.value if payload.email.endswith("@insurer.com") else UserRole.worker.value

    user = User(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
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
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = (
        db.query(User)
        .filter((User.email == payload.email_or_phone) | (User.phone == payload.email_or_phone))
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return AuthResponse(
        user_id=user.id,
        name=user.name,
        role=user.role,
        location=user.location,
        risk_score=user.risk_score,
        risk_tier=user.risk_tier,
    )
