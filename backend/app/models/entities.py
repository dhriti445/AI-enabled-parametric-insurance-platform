from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RiskTier(str, Enum):
    low = "Low"
    medium = "Medium"
    high = "High"


class PlanType(str, Enum):
    basic = "Basic"
    standard = "Standard"
    premium = "Premium"


class UserRole(str, Enum):
    worker = "worker"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(80), nullable=False)
    location: Mapped[str] = mapped_column(String(120), nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, default=0.3)
    risk_tier: Mapped[str] = mapped_column(String(20), default=RiskTier.low.value)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.worker.value)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    claims: Mapped[list["Claim"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    payouts: Mapped[list["Payout"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    goals: Mapped[list["Goal"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    plan_name: Mapped[str] = mapped_column(String(20), nullable=False)
    weekly_price: Mapped[float] = mapped_column(Float, nullable=False)
    weekly_coverage: Mapped[float] = mapped_column(Float, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_reference: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="subscriptions")


class DisruptionEvent(Base):
    __tablename__ = "disruption_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    location: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    rainfall_mm: Mapped[float] = mapped_column(Float, default=0.0)
    aqi: Mapped[int] = mapped_column(Integer, default=50)
    temperature_c: Mapped[float] = mapped_column(Float, default=28.0)
    curfew_alert: Mapped[bool] = mapped_column(Boolean, default=False)
    triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[str] = mapped_column(String(200), default="No trigger")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    disruption_event_id: Mapped[int | None] = mapped_column(ForeignKey("disruption_events.id"), nullable=True)
    estimated_income_loss: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="Pending")
    fraud_score: Mapped[float] = mapped_column(Float, default=0.0)
    manual_proof_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="claims")


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    claim_id: Mapped[int] = mapped_column(ForeignKey("claims.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="Payment Successful")
    payment_gateway: Mapped[str] = mapped_column(String(30), default="Razorpay Sandbox")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="payouts")


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    monthly_target: Mapped[float] = mapped_column(Float, nullable=False)
    current_progress: Mapped[float] = mapped_column(Float, default=0.0)

    user: Mapped[User] = relationship(back_populates="goals")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    message: Mapped[str] = mapped_column(String(240), nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
