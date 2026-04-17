from datetime import datetime
import importlib
from math import asin, cos, radians, sin, sqrt
import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import Claim, DisruptionEvent, Notification, Payout, Subscription, User
from app.schemas.dto import ManualClaimRequest
from app.services.fraud_detector import FraudSignal, fraud_detector
from app.services.image_verifier import verify_claim_image, verify_claim_image_detailed
from app.services.payments import simulate_payment
from app.services.trigger_automation import CITY_COORDS, fetch_disruption_inputs

router = APIRouter(prefix="/claims", tags=["claims"])

# Create uploads directory if not exists
UPLOADS_DIR = "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def _historical_rainfall(db: Session, location: str) -> float:
    events = (
        db.query(DisruptionEvent)
        .filter(DisruptionEvent.location.ilike(location))
        .order_by(DisruptionEvent.created_at.desc())
        .limit(12)
        .all()
    )
    if not events:
        return 0.0
    return float(sum(e.rainfall_mm for e in events) / len(events))


def _extract_image_gps(file_path: str) -> tuple[float, float] | None:
    try:
        pil_image = importlib.import_module("PIL.Image")
        pil_exif_tags = importlib.import_module("PIL.ExifTags")
    except ModuleNotFoundError:
        return None

    try:
        with pil_image.open(file_path) as img:
            exif = img.getexif()
            if not exif:
                return None

            gps_tag = next((tag_id for tag_id, name in pil_exif_tags.TAGS.items() if name == "GPSInfo"), None)
            if gps_tag is None:
                return None

            gps_data = exif.get(gps_tag)
            if not gps_data:
                return None

            gps_keys = pil_exif_tags.GPSTAGS
            parsed = {gps_keys.get(key, key): value for key, value in gps_data.items()}

            def _rational_to_float(value: float | tuple[int, int]) -> float:
                if isinstance(value, tuple) and len(value) == 2 and value[1] != 0:
                    return float(value[0]) / float(value[1])
                return float(value)

            def _dms_to_decimal(values: tuple, ref: str) -> float:
                degrees = _rational_to_float(values[0])
                minutes = _rational_to_float(values[1])
                seconds = _rational_to_float(values[2])
                decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
                return -decimal if ref in {"S", "W"} else decimal

            lat_values = parsed.get("GPSLatitude")
            lat_ref = parsed.get("GPSLatitudeRef")
            lon_values = parsed.get("GPSLongitude")
            lon_ref = parsed.get("GPSLongitudeRef")
            if not lat_values or not lon_values or not lat_ref or not lon_ref:
                return None

            latitude = _dms_to_decimal(lat_values, lat_ref)
            longitude = _dms_to_decimal(lon_values, lon_ref)
            return latitude, longitude
    except Exception:
        return None


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
    condition: str = Form(default="unknown"),
    worker_lat: float | None = Form(default=None),
    worker_lon: float | None = Form(default=None),
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

    # --- Plan-based claim limit enforcement ---
    PLAN_COVERAGE_LIMITS = {"Basic": 400.0, "Standard": 700.0, "Premium": 1000.0}
    plan_limit = PLAN_COVERAGE_LIMITS.get(active_sub.plan_name, active_sub.weekly_coverage)
    if estimated_income_loss > plan_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Claim amount Rs.{estimated_income_loss} exceeds your {active_sub.plan_name} plan limit of Rs.{plan_limit}"
        )

    # --- Plan-based condition restrictions ---
    PLAN_ALLOWED_CONDITIONS = {
        "Basic":    {"storm", "rain", "flood", "other", "unknown"},
        "Standard": {"storm", "rain", "flood", "smoke", "drought", "heatwave", "other", "unknown"},
        "Premium":  {"storm", "rain", "flood", "fire", "smoke", "drought", "heatwave", "curfew", "other", "unknown"},
    }
    allowed = PLAN_ALLOWED_CONDITIONS.get(active_sub.plan_name, set())
    stated_condition_raw = condition.lower().strip() if condition else "unknown"
    if stated_condition_raw not in {"unknown", "other", ""} and stated_condition_raw not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Condition '{stated_condition_raw}' is not covered by your {active_sub.plan_name} plan. Upgrade to access this coverage."
        )

    # --- Image verification (pixel-level model) ---
    img_result = verify_claim_image_detailed(file_path)
    image_ok = img_result.accepted
    image_msg = img_result.message
    confidence = img_result.confidence
    disaster_type = img_result.disaster_type

    duplicate_claims = db.query(Claim).filter(Claim.user_id == user.id).count()

    city_key = user.location.lower().strip()
    expected_lat, expected_lon = CITY_COORDS.get(city_key, CITY_COORDS["mumbai"])
    location_source = "profile-city"

    # Prefer browser/device coordinates; if absent, attempt image EXIF GPS for photos.
    if worker_lat is None or worker_lon is None:
        extracted = _extract_image_gps(file_path) if file_ext in {".jpg", ".jpeg", ".png"} else None
        if extracted:
            worker_lat, worker_lon = extracted
            location_source = "image-exif"

    gps_distance_km = None
    gps_mismatch = 0
    if worker_lat is not None and worker_lon is not None:
        gps_distance_km = _haversine_km(worker_lat, worker_lon, expected_lat, expected_lon)
        gps_mismatch = 1 if gps_distance_km >= 30 else 0
        if location_source == "profile-city":
            location_source = "device-geolocation"

    live_inputs = fetch_disruption_inputs(user.location)
    live_rainfall = float(live_inputs.get("rainfall_mm", 0.0))
    live_aqi = int(live_inputs.get("aqi", 50))
    live_temperature = float(live_inputs.get("temperature_c", 30.0))
    historical_rain = _historical_rainfall(db, user.location)

    recent_triggered_events = (
        db.query(DisruptionEvent)
        .filter(
            DisruptionEvent.location.ilike(user.location),
            DisruptionEvent.triggered == True,
            DisruptionEvent.rainfall_mm >= 30,
        )
        .order_by(DisruptionEvent.created_at.desc())
        .limit(3)
        .count()
    )

    # Weather mismatch: only flag if live rainfall is very low AND no recent events AND historical is also dry
    weather_mismatch = 1 if (live_rainfall < 2 and historical_rain < 5 and recent_triggered_events == 0) else 0

    odd_hour = 1 if datetime.utcnow().hour in {20, 21, 22, 23, 0, 1} else 0

    # Infer disaster context: worker-stated condition takes priority over image/weather inference
    VALID_CONDITIONS = {"storm", "rain", "fire", "flood", "smoke", "drought", "heatwave", "curfew", "other", "unknown"}
    stated_condition = condition.lower().strip() if condition else "unknown"
    if stated_condition not in VALID_CONDITIONS:
        stated_condition = "unknown"

    # Map stated condition to disaster context understood by fraud model
    CONDITION_MAP = {
        "storm": "rain", "rain": "rain", "flood": "flood",
        "fire": "fire", "smoke": "smoke", "drought": "unknown",
        "heatwave": "unknown", "curfew": "unknown", "other": "unknown", "unknown": "unknown",
    }

    if stated_condition not in {"unknown", "other"} and disaster_type == "unknown":
        # Worker stated a condition but image was inconclusive — trust the worker
        disaster_context = CONDITION_MAP[stated_condition]
    elif disaster_type in {"rain", "flood", "fire", "smoke"}:
        disaster_context = disaster_type
    elif live_rainfall >= 30:
        disaster_context = "rain"
    elif live_aqi >= 200:
        disaster_context = "fire"
    else:
        disaster_context = CONDITION_MAP.get(stated_condition, "unknown")

    claim_amount_ratio = estimated_income_loss / (active_sub.weekly_coverage + 1e-6)

    fraud_result = fraud_detector.analyze_detailed(
        FraudSignal(
            gps_mismatch=gps_mismatch,
            duplicate_claims=1 if duplicate_claims > 2 else 0,
            odd_claim_hour=odd_hour,
            weather_mismatch=weather_mismatch,
            disaster_context=disaster_context,
            image_disaster_type=disaster_type,
            image_confidence=confidence,
            live_rainfall_mm=live_rainfall,
            live_aqi=live_aqi,
            live_temperature_c=live_temperature,
            recent_triggered_events=recent_triggered_events,
            historical_rain_mm=historical_rain,
            claim_amount_ratio=claim_amount_ratio,
        )
    )
    fraud_score = fraud_result.fraud_score
    flagged = fraud_result.flagged
    fraud_reasons = fraud_result.reasons

    # --- Auto-approve logic ---
    # If CLIP confidence >= 90% AND image disaster matches stated condition AND no fraud flags → auto-approve + pay
    HIGH_CONFIDENCE_THRESHOLD = 0.90
    image_clearly_matches = (
        confidence >= HIGH_CONFIDENCE_THRESHOLD
        and disaster_type in {"rain", "flood", "fire", "smoke"}
        and disaster_type != "clear"
        and not flagged
        and image_ok
    )

    if not image_ok:
        status = "Rejected"
    elif image_clearly_matches:
        status = "Approved"
    elif flagged:
        status = "Flagged"
    else:
        status = "Pending Review"

    approved_amount = min(estimated_income_loss, active_sub.weekly_coverage)
    claim = Claim(
        user_id=user.id,
        estimated_income_loss=approved_amount,
        status=status,
        fraud_score=fraud_score,
        manual_proof_url=file_path,
        created_at=datetime.utcnow(),
    )
    db.add(claim)
    db.flush()

    payout_info = None
    if status == "Approved":
        # Auto-pay immediately
        payout_gateway = "UPI" if user.platform.lower() in {"swiggy", "zomato", "zepto", "blinkit"} else "Razorpay"
        payment = simulate_payment(payout_gateway, approved_amount)
        payout = Payout(
            user_id=user.id,
            claim_id=claim.id,
            amount=approved_amount,
            payment_gateway=payment["provider"],
        )
        db.add(payout)
        payout_info = {
            "provider": payment["provider"],
            "reference": payment["reference"],
            "amount": approved_amount,
            "settlement_eta": payment["settlement_eta"],
        }
        db.add(Notification(
            user_id=user.id,
            message=(
                f"Claim #{claim.id} auto-approved (CLIP {confidence*100:.0f}% confidence: {disaster_type}). "
                f"Payout of Rs.{approved_amount} via {payment['provider']} ({payment['reference']})."
            ),
        ))
    elif status in {"Pending Review", "Flagged"}:
        db.add(Notification(
            user_id=user.id,
            message=(
                f"Claim #{claim.id} submitted with status '{status}'. "
                "Insurer review is in progress."
            ),
        ))
    elif status == "Rejected":
        db.add(Notification(
            user_id=user.id,
            message=f"Claim #{claim.id} was rejected by AI image verification.",
        ))

    db.commit()

    return {
        "claim_id": claim.id,
        "claim_status": status,
        "stated_condition": stated_condition,
        "image_verification": {
            "accepted": image_ok,
            "message": image_msg,
            "confidence": confidence,
            "disaster_type": disaster_type,
            "pixel_signals": img_result.signals,
        },
        "condition_verification_score": claim.fraud_score,
        "fraud_score": claim.fraud_score,  # kept for backward compat
        "fraud_reasons": fraud_reasons,
        "fraud_signals": {
            "gps_distance_km": round(gps_distance_km, 2) if gps_distance_km is not None else None,
            "location_source": location_source,
            "worker_lat": worker_lat,
            "worker_lon": worker_lon,
            "live_rainfall_mm": live_rainfall,
            "live_aqi": live_aqi,
            "live_temperature_c": live_temperature,
            "historical_rainfall_mm": round(historical_rain, 2),
            "recent_triggered_events": recent_triggered_events,
            "disaster_context": disaster_context,
            "disaster_signals": fraud_result.disaster_signals,
        },
        "payout": payout_info,
    }
