from datetime import datetime


def simulate_payment(provider: str, amount: float) -> dict:
    provider_name = provider if provider in {"Razorpay", "Stripe"} else "Razorpay"
    reference = f"{provider_name[:3].upper()}-{int(datetime.utcnow().timestamp())}"
    return {
        "provider": f"{provider_name} Sandbox",
        "reference": reference,
        "amount": amount,
        "status": "Payment Successful",
    }
