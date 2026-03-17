from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, Goal, Notification, Payout, Subscription, User
from app.schemas.dto import GoalRequest, PlanChoiceRequest
from app.services.payments import simulate_payment
from app.services.suggestion_engine import suggest_extra_days

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

PLANS = {
    "Basic": {"weekly_price": 20.0, "weekly_coverage": 400.0},
    "Standard": {"weekly_price": 30.0, "weekly_coverage": 700.0},
    "Premium": {"weekly_price": 40.0, "weekly_coverage": 1000.0},
}


@router.get("/plans")
def get_plans() -> dict:
    return {"plans": PLANS}


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

    return {
        "user_id": user.id,
        "risk_score": user.risk_score,
        "risk_tier": user.risk_tier,
        "recommended_plan": plan,
        "reason": f"Based on location risk and disruption history in {user.location}",
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
    payment = simulate_payment(payload.provider, plan["weekly_price"])

    sub = Subscription(
        user_id=user.id,
        plan_name=payload.plan_name,
        weekly_price=plan["weekly_price"],
        weekly_coverage=plan["weekly_coverage"],
        payment_reference=payment["reference"],
    )
    db.add(sub)
    db.add(
        Notification(
            user_id=user.id,
            message=f"{payload.plan_name} plan activated. Weekly protection is live.",
        )
    )
    db.commit()
    db.refresh(sub)

    return {
        "subscription_id": sub.id,
        "active_plan": sub.plan_name,
        "weekly_coverage": sub.weekly_coverage,
        "payment_status": payment["status"],
        "payment_reference": payment["reference"],
        "provider": payment["provider"],
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

    extra_days = suggest_extra_days(
        weather_risk=[0.5, 0.2, 0.7, 0.3, 0.1, 0.2, 0.4],
        demand_trend=[0.6, 0.5, 0.4, 0.7, 0.8, 0.9, 0.7],
    )

    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(5)
        .all()
    )

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
        "generated_at": datetime.utcnow().isoformat(),
    }
