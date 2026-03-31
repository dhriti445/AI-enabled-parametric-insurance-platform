import json
from datetime import datetime
from urllib.parse import urlencode
from urllib.request import urlopen


CITY_COORDS = {
    "mumbai": (19.076, 72.8777),
    "chennai": (13.0827, 80.2707),
    "kolkata": (22.5726, 88.3639),
    "delhi": (28.6139, 77.2090),
    "bengaluru": (12.9716, 77.5946),
    "hyderabad": (17.3850, 78.4867),
    "pune": (18.5204, 73.8567),
    "noida": (28.5355, 77.3910),
    "gurgaon": (28.4595, 77.0266),
}


def _http_get_json(base_url: str, query: dict) -> dict:
    url = f"{base_url}?{urlencode(query)}"
    with urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def _fallback_payload(location: str) -> dict:
    city = location.lower()
    high_risk = city in {"mumbai", "chennai", "kolkata"}
    aqi_risk = city in {"delhi", "noida", "gurgaon"}

    rainfall = 72.0 if high_risk else 24.0
    temperature = 44.0 if city in {"delhi", "noida"} else 36.0
    aqi = 280 if aqi_risk else 135
    curfew_alert = datetime.utcnow().hour >= 20 and high_risk
    wind_speed = 48.0 if high_risk else 26.0

    return {
        "location": location,
        "rainfall_mm": rainfall,
        "aqi": aqi,
        "temperature_c": temperature,
        "curfew_alert": curfew_alert,
        "wind_speed_kmph": wind_speed,
        "source": "mock_fallback",
        "fallback_used": True,
    }


def fetch_disruption_inputs(location: str) -> dict:
    city = location.lower()
    lat, lon = CITY_COORDS.get(city, CITY_COORDS["mumbai"])

    try:
        weather = _http_get_json(
            "https://api.open-meteo.com/v1/forecast",
            {
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,precipitation,wind_speed_10m",
                "timezone": "auto",
            },
        )
        air = _http_get_json(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            {
                "latitude": lat,
                "longitude": lon,
                "current": "pm2_5",
                "timezone": "auto",
            },
        )

        current_weather = weather.get("current", {})
        current_air = air.get("current", {})

        rainfall = float(current_weather.get("precipitation", 0.0))
        temperature = float(current_weather.get("temperature_2m", 30.0))
        wind_speed = float(current_weather.get("wind_speed_10m", 0.0))

        pm2_5 = float(current_air.get("pm2_5", 20.0))
        aqi = int(max(10, min(500, round(pm2_5 * 4))))

        # Mock civic alert to emulate a public alert feed while keeping demo deterministic.
        curfew_alert = datetime.utcnow().hour >= 22 and city in {"delhi", "mumbai", "kolkata"}

        return {
            "location": location,
            "rainfall_mm": rainfall,
            "aqi": aqi,
            "temperature_c": temperature,
            "curfew_alert": curfew_alert,
            "wind_speed_kmph": wind_speed,
            "source": "open-meteo + mock civic alerts",
            "fallback_used": False,
        }
    except Exception:
        return _fallback_payload(location)


def evaluate_trigger_signals(inputs: dict) -> list[str]:
    reasons: list[str] = []

    if inputs["rainfall_mm"] > 60:
        reasons.append("Heavy rainfall")
    if inputs["aqi"] > 250:
        reasons.append("Severe AQI")
    if inputs["temperature_c"] > 43:
        reasons.append("Extreme temperature")
    if inputs["curfew_alert"]:
        reasons.append("Curfew alert")
    if inputs["wind_speed_kmph"] > 45:
        reasons.append("High wind speed")

    return reasons
