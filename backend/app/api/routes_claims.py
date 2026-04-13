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
from app.services.image_verifier import verify_claim_image
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
    worker_lat: float | None = Form(default=None),
    worker_lon: float | None = Form(default=None),
    payout_provider: str = Form(default="UPI"),
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

    # API-only weather consistency signal: no worker rainfall input required.
    weather_mismatch = 1 if (live_rainfall < 8 and historical_rain < 20 and recent_triggered_events == 0) else 0

    odd_hour = 1 if datetime.utcnow().hour in {0, 1, 2, 3, 4} else 0
    fraud_score, flagged, fraud_reasons = fraud_detector.analyze(
        FraudSignal(
            gps_mismatch=gps_mismatch,
            duplicate_claims=1 if duplicate_claims > 2 else 0,
            odd_claim_hour=odd_hour,
            weather_mismatch=weather_mismatch,
        )
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
        payment = simulate_payment(payout_provider, approved_amount)
        payout = Payout(user_id=user.id, claim_id=claim.id, amount=approved_amount, payment_gateway=payment["provider"])
        db.add(payout)
        payout_info = {
            "status": payout.status,
            "amount": approved_amount,
            "gateway": payout.payment_gateway,
            "reference": payment["reference"],
            "settlement_eta": payment["settlement_eta"],
        }
        db.add(
            Notification(
                user_id=user.id,
                message=(
                    f"Manual claim approved for Rs.{approved_amount}. "
                    f"Instant payout via {payment['provider']} ({payment['reference']})."
                ),
            )
        )

    db.commit()

    return {
        "claim_id": claim.id,
        "claim_status": status,
        "image_verification": {"accepted": image_ok, "message": image_msg, "confidence": confidence},
        "fraud_score": claim.fraud_score,
        "fraud_reasons": fraud_reasons,
        "fraud_signals": {
            "gps_distance_km": round(gps_distance_km, 2) if gps_distance_km is not None else None,
            "location_source": location_source,
            "worker_lat": worker_lat,
            "worker_lon": worker_lon,
            "live_rainfall_mm": live_rainfall,
            "historical_rainfall_mm": round(historical_rain, 2),
            "recent_triggered_events": recent_triggered_events,
        },
        "payout": payout_info,
    }
