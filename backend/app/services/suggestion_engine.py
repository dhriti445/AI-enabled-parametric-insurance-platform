from datetime import datetime, timedelta


def suggest_extra_days(weather_risk: list[float], demand_trend: list[float]) -> list[str]:
    today = datetime.utcnow().date()
    scored_days: list[tuple[float, str]] = []

    for i in range(7):
        day = today + timedelta(days=i)
        risk = weather_risk[i] if i < len(weather_risk) else 0.5
        demand = demand_trend[i] if i < len(demand_trend) else 0.5
        score = (1 - risk) * 0.55 + demand * 0.45
        scored_days.append((score, day.strftime("%A")))

    best = sorted(scored_days, key=lambda x: x[0], reverse=True)[:2]
    return [item[1] for item in best]
