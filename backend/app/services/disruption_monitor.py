from app.models.entities import DisruptionEvent


def evaluate_trigger(event: DisruptionEvent) -> tuple[bool, str]:
    reasons: list[str] = []
    if event.rainfall_mm > 60:
        reasons.append("Heavy rainfall")
    if event.aqi > 250:
        reasons.append("Severe AQI")
    if event.temperature_c > 43:
        reasons.append("Extreme temperature")
    if event.curfew_alert:
        reasons.append("Curfew alert")

    triggered = len(reasons) > 0
    reason = ", ".join(reasons) if reasons else "No disruption"
    return triggered, reason
