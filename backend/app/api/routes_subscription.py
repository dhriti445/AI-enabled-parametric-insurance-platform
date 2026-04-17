from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, Goal, Notification, Payout, Subscription, User
from app.schemas.dto import GoalRequest, PlanChoiceRequest, SubscriptionCancelRequest
from app.services.dynamic_pricing import quote_dynamic_pricing
from app.services.payments import simulate_payment
from app.services.suggestion_engine import suggest_extra_days

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

PLANS = {
    "Basic": {"weekly_price": 20.0, "weekly_coverage": 400.0, "base_coverage_hours": 40, "hourly_coverage_value": 10.0},
    "Standard": {
        "weekly_price": 30.0,
        "weekly_coverage": 700.0,
        "base_coverage_hours": 56,
        "hourly_coverage_value": 12.5,
    },
    "Premium": {
        "weekly_price": 40.0,
        "weekly_coverage": 1000.0,
        "base_coverage_hours": 72,
        "hourly_coverage_value": 14.0,
    },
}


@router.get("/plans")
def get_plans() -> dict:
    return {"plans": PLANS}


@router.get("/status/{user_id}")
def subscription_status(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id, Subscription.active == True)
        .order_by(Subscription.created_at.desc())
        .first()
    )

    return {
        "user_id": user.id,
        "has_active_subscription": sub is not None,
        "active_plan": sub.plan_name if sub else None,
        "weekly_price": sub.weekly_price if sub else 0,
        "weekly_coverage": sub.weekly_coverage if sub else 0,
    }


@router.get("/recommendation/{user_id}")
def recommendation(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.risk_score < 0.35:
        plan = "Basic"
    elif user.risk_score < 0.65:
        plan = "Standard"
    else:
        plan = "Premium"

    dynamic_quote = quote_dynamic_pricing(
        location=user.location,
        user_risk_score=user.risk_score,
        base_weekly_price=PLANS[plan]["weekly_price"],
        base_coverage_hours=PLANS[plan]["base_coverage_hours"],
        hourly_coverage_value=PLANS[plan]["hourly_coverage_value"],
    )

    return {
        "user_id": user.id,
        "risk_score": user.risk_score,
        "risk_tier": user.risk_tier,
        "recommended_plan": plan,
        "reason": f"Based on location risk and disruption history in {user.location}",
        "dynamic_pricing": dynamic_quote,
    }


@router.get("/pricing-preview/{user_id}")
def pricing_preview(user_id: int, plan_name: str = "Standard", db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if plan_name not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan = PLANS[plan_name]
    quote = quote_dynamic_pricing(
        location=user.location,
        user_risk_score=user.risk_score,
        base_weekly_price=plan["weekly_price"],
        base_coverage_hours=plan["base_coverage_hours"],
        hourly_coverage_value=plan["hourly_coverage_value"],
    )

    return {
        "user_id": user.id,
        "plan_name": plan_name,
        "location": user.location,
        "risk_score": user.risk_score,
        "quote": quote,
    }


@router.post("/activate")
def activate_plan(payload: PlanChoiceRequest, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.plan_name not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    db.query(Subscription).filter(Subscription.user_id == user.id, Subscription.active == True).update({"active": False})

    plan = PLANS[payload.plan_name]
    quote = quote_dynamic_pricing(
        location=user.location,
        user_risk_score=user.risk_score,
        base_weekly_price=plan["weekly_price"],
        base_coverage_hours=plan["base_coverage_hours"],
        hourly_coverage_value=plan["hourly_coverage_value"],
    )
    payment = simulate_payment(payload.provider, quote["adjusted_weekly_price"])

    sub = Subscription(
        user_id=user.id,
        plan_name=payload.plan_name,
        weekly_price=quote["adjusted_weekly_price"],
        weekly_coverage=quote["adjusted_weekly_coverage"],
        payment_reference=payment["reference"],
    )
    db.add(sub)
    db.add(
        Notification(
            user_id=user.id,
            message=(
                f"{payload.plan_name} activated at Rs.{quote['adjusted_weekly_price']}/week "
                f"with {quote['final_coverage_hours']} coverage hours."
            ),
        )
    )
    db.commit()
    db.refresh(sub)

    return {
        "subscription_id": sub.id,
        "active_plan": sub.plan_name,
        "weekly_premium": sub.weekly_price,
        "weekly_coverage": sub.weekly_coverage,
        "dynamic_pricing": quote,
        "payment_status": payment["status"],
        "payment_reference": payment["reference"],
        "provider": payment["provider"],
    }


@router.post("/cancel")
def cancel_subscription(payload: SubscriptionCancelRequest, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id, Subscription.active == True)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if not sub:
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    sub.active = False
    db.add(
        Notification(
            user_id=user.id,
            message=f"{sub.plan_name} subscription cancelled. You can reactivate anytime from Plans.",
        )
    )
    db.commit()

    return {
        "user_id": user.id,
        "cancelled_plan": sub.plan_name,
        "status": "Cancelled",
    }


@router.post("/goals")
def set_goal(payload: GoalRequest, db: Session = Depends(get_db)) -> dict:
    goal = db.query(Goal).filter(Goal.user_id == payload.user_id).first()
    if goal:
        goal.monthly_target = payload.monthly_target
    else:
        goal = Goal(user_id=payload.user_id, monthly_target=payload.monthly_target, current_progress=0)
        db.add(goal)

    db.commit()
    db.refresh(goal)
    return {
        "goal_id": goal.id,
        "monthly_target": goal.monthly_target,
        "current_progress": goal.current_progress,
    }


@router.get("/dashboard/{user_id}")
def dashboard(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sub = (
        db.query(Subscription)
        .filter(Subscription.user_id == user.id, Subscription.active == True)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    total_payouts = db.query(func.coalesce(func.sum(Payout.amount), 0)).filter(Payout.user_id == user.id).scalar() or 0
    claims_count = db.query(Claim).filter(Claim.user_id == user.id).count()

    protected = (sub.weekly_coverage if sub else 0) + float(total_payouts)

    goal = db.query(Goal).filter(Goal.user_id == user.id).first()
    if goal and claims_count > 0:
        goal.current_progress = min(goal.monthly_target, goal.current_progress + (claims_count * 500))
        db.commit()

    extra_days = suggest_extra_days(location=user.location)

    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(8)
        .all()
    )

    def _format_notification(msg: str) -> dict:
        msg_lower = msg.lower()
        if "approved" in msg_lower:
            icon, color = "✅", "emerald"
        elif "rejected" in msg_lower:
            icon, color = "❌", "red"
        elif "submitted" in msg_lower or "pending" in msg_lower or "flagged" in msg_lower:
            icon, color = "🕐", "amber"
        elif "activated" in msg_lower or "payout" in msg_lower:
            icon, color = "💰", "brand"
        elif "cancelled" in msg_lower:
            icon, color = "🚫", "slate"
        else:
            icon, color = "ℹ️", "slate"
        return {"message": msg, "icon": icon, "color": color}

    return {
        "welcome": f"Welcome, {user.name}",
        "active_plan": sub.plan_name if sub else "No active plan",
        "weekly_coverage_status": "Active" if sub else "Inactive",
        "earnings_protected": protected,
        "total_payouts_received": float(total_payouts),
        "stats": {
            "total_earnings_protected": protected,
            "disruptions_detected": claims_count,
            "total_compensation_received": float(total_payouts),
        },
        "goal": {
            "monthly_target": goal.monthly_target if goal else 0,
            "current_progress": goal.current_progress if goal else 0,
            "remaining": (goal.monthly_target - goal.current_progress) if goal else 0,
        },
        "work_suggestion": f"Best days to work extra this week: {', '.join(extra_days)}",
        "latest_notifications": [n.message for n in notifications],
        "notifications_structured": [_format_notification(n.message) for n in notifications],
        "generated_at": datetime.utcnow().isoformat(),
    }
