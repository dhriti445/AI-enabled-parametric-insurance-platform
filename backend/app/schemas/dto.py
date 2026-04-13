from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str
    platform: str
    location: str
    role: Literal["worker", "insurer", "admin"] = "worker"


class LoginRequest(BaseModel):
    email_or_phone: str
    expected_role: Literal["worker", "admin", "insurer"] | None = None


class AuthResponse(BaseModel):
    user_id: int
    name: str
    role: str
    location: str
    risk_score: float
    risk_tier: str


class PlanChoiceRequest(BaseModel):
    user_id: int
    plan_name: str
    provider: str = "Razorpay"


class TriggerRequest(BaseModel):
    location: str
    rainfall_mm: float = 0
    aqi: int = 50
    temperature_c: float = 30
    curfew_alert: bool = False


class ManualClaimRequest(BaseModel):
    user_id: int
    estimated_income_loss: float = Field(..., ge=50, le=3000)
    image_filename: str


class GoalRequest(BaseModel):
    user_id: int
    monthly_target: float = Field(..., ge=5000, le=100000)


class ClaimResponse(BaseModel):
    id: int
    user_id: int
    estimated_income_loss: float
    status: str
    fraud_score: float
    created_at: datetime

    class Config:
        from_attributes = True
