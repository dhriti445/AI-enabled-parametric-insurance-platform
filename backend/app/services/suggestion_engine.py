from datetime import datetime, timedelta


# Day-of-week base demand profiles (0=Mon … 6=Sun)
# Based on Indian gig delivery patterns — weekends and Fri/Sat peak
_DAY_DEMAND = {0: 0.60, 1: 0.55, 2: 0.50, 3: 0.65, 4: 0.80, 5: 0.90, 6: 0.75}

# Day-of-week base weather risk (higher = more likely disruption)
# Tue/Wed mid-week monsoon risk, Sat slightly elevated
_DAY_BASE_RISK = {0: 0.30, 1: 0.35, 2: 0.40, 3: 0.25, 4: 0.20, 5: 0.35, 6: 0.25}


def suggest_extra_days(
    weather_risk: list[float] | None = None,
    demand_trend: list[float] | None = None,
    location: str | None = None,
) -> list[str]:
    """
    Return the 2 best FUTURE days this week (today + tomorrow onwards).
    Uses live weather risk if location provided, else day-of-week profiles.
    Never returns the same result every day — anchored to actual calendar.
    """
    today = datetime.utcnow().date()

    # Try to get live weather risk for the next 7 days
    live_risk: dict[int, float] = {}
    if location:
        try:
            from app.services.trigger_automation import fetch_disruption_inputs
            live = fetch_disruption_inputs(location)
            rainfall = float(live.get("rainfall_mm", 0.0))
            aqi = int(live.get("aqi", 50))
            temp = float(live.get("temperature_c", 30.0))
            # Today's live risk score
            today_risk = min(1.0, (rainfall / 80.0) * 0.5 + (aqi / 300.0) * 0.3 + max(0, (temp - 38) / 10.0) * 0.2)
            live_risk[0] = round(today_risk, 2)
        except Exception:
            pass

    scored: list[tuple[float, str, int]] = []

    for offset in range(7):
        candidate = today + timedelta(days=offset)
        weekday = candidate.weekday()

        if offset == 0:
            day_label = "Today"
        elif offset == 1:
            day_label = "Tomorrow"
        else:
            day_label = candidate.strftime("%A")

        # Weather risk: use live for today, base profile for future days
        if offset in live_risk:
            risk = live_risk[offset]
        elif weather_risk and offset < len(weather_risk):
            risk = weather_risk[offset]
        else:
            risk = _DAY_BASE_RISK[weekday]

        # Demand: use passed array or day-of-week profile
        if demand_trend and offset < len(demand_trend):
            demand = demand_trend[offset]
        else:
            demand = _DAY_DEMAND[weekday]

        score = (1 - risk) * 0.55 + demand * 0.45
        scored.append((score, day_label, offset))

    # Pick top 2, return in chronological order
    best = sorted(scored, key=lambda x: x[0], reverse=True)[:2]
    best_sorted = sorted(best, key=lambda x: x[2])
    return [item[1] for item in best_sorted]
