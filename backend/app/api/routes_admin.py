from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, Payout, Subscription, User

router = APIRouter(prefix="/admin", tags=["admin"])


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

    return {
        "metrics": {
            "total_users": total_users,
            "active_subscriptions": active_subscriptions,
            "total_payouts": float(total_payouts),
            "loss_ratio": loss_ratio,
        },
        "fraud_analytics": [
            {"name": item.name, "fraud_score": float(item.fraud_score)} for item in flagged_users
        ],
        "risk_zone_classification": risk_zones,
        "subscription_optimization": optimization,
    }
