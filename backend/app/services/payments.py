from datetime import datetime


def simulate_payment(provider: str, amount: float) -> dict:
    supported = {
        "Razorpay": {"label": "Razorpay Sandbox", "settlement": "T+0 simulated"},
        "Stripe": {"label": "Stripe Sandbox", "settlement": "T+0 simulated"},
        "UPI": {"label": "UPI Simulator", "settlement": "Instant"},
    }
    provider_name = provider if provider in supported else "Razorpay"
    reference = f"{provider_name[:3].upper()}-{int(datetime.utcnow().timestamp())}"
    return {
        "provider": supported[provider_name]["label"],
        "reference": reference,
        "amount": amount,
        "status": "Payment Successful",
        "settlement_eta": supported[provider_name]["settlement"],
    }
