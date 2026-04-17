"""
Mock payment gateway service.
Simulates Razorpay, Stripe, and UPI with realistic transaction flows:
- Unique order/payment IDs
- Webhook event simulation
- Occasional failure scenarios (configurable)
- Settlement timeline tracking
"""
from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal


PaymentStatus = Literal[
    "Payment Successful",
    "Payment Failed",
    "Payment Pending",
    "Refund Initiated",
]

GatewayProvider = Literal["Razorpay", "Stripe", "UPI"]


@dataclass
class PaymentEvent:
    event_type: str
    timestamp: str
    payload: dict


@dataclass
class PaymentResult:
    provider: str
    provider_label: str
    order_id: str
    payment_id: str
    reference: str
    amount: float
    currency: str
    status: PaymentStatus
    settlement_eta: str
    settlement_date: str
    webhook_events: list[PaymentEvent] = field(default_factory=list)
    failure_reason: str | None = None
    metadata: dict = field(default_factory=dict)


_GATEWAY_CONFIG: dict[str, dict] = {
    "Razorpay": {
        "label": "Razorpay Sandbox",
        "currency": "INR",
        "order_prefix": "order_",
        "payment_prefix": "pay_",
        "settlement": "T+0 simulated",
        "failure_rate": 0.05,  # 5% simulated failure for realism
    },
    "Stripe": {
        "label": "Stripe Sandbox",
        "currency": "INR",
        "order_prefix": "pi_",
        "payment_prefix": "ch_",
        "settlement": "T+0 simulated",
        "failure_rate": 0.04,
    },
    "UPI": {
        "label": "UPI Simulator",
        "currency": "INR",
        "order_prefix": "UPI",
        "payment_prefix": "TXN",
        "settlement": "Instant",
        "failure_rate": 0.03,
    },
}


def _generate_id(prefix: str, length: int = 14) -> str:
    return prefix + uuid.uuid4().hex[:length].upper()


def _build_webhook_events(
    provider: str, order_id: str, payment_id: str, amount: float, status: PaymentStatus
) -> list[PaymentEvent]:
    now = datetime.utcnow()
    events: list[PaymentEvent] = []

    events.append(
        PaymentEvent(
            event_type=f"{provider.lower()}.order.created",
            timestamp=now.isoformat(),
            payload={"order_id": order_id, "amount": amount, "currency": "INR"},
        )
    )

    if status == "Payment Successful":
        events.append(
            PaymentEvent(
                event_type=f"{provider.lower()}.payment.captured",
                timestamp=(now + timedelta(seconds=2)).isoformat(),
                payload={"payment_id": payment_id, "order_id": order_id, "amount": amount},
            )
        )
        events.append(
            PaymentEvent(
                event_type=f"{provider.lower()}.settlement.processed",
                timestamp=(now + timedelta(seconds=5)).isoformat(),
                payload={"payment_id": payment_id, "settled_amount": amount},
            )
        )
    elif status == "Payment Failed":
        events.append(
            PaymentEvent(
                event_type=f"{provider.lower()}.payment.failed",
                timestamp=(now + timedelta(seconds=2)).isoformat(),
                payload={"payment_id": payment_id, "order_id": order_id, "error": "insufficient_funds"},
            )
        )
    elif status == "Payment Pending":
        events.append(
            PaymentEvent(
                event_type=f"{provider.lower()}.payment.pending",
                timestamp=(now + timedelta(seconds=1)).isoformat(),
                payload={"payment_id": payment_id, "order_id": order_id},
            )
        )

    return events


def simulate_payment(
    provider: str,
    amount: float,
    force_success: bool = True,
) -> dict:
    """
    Simulate a payment transaction.

    Args:
        provider: Gateway name ("Razorpay", "Stripe", "UPI")
        amount: Amount in INR
        force_success: If True, always succeeds (for auto-payout flows).
                       If False, applies realistic failure rate.

    Returns:
        dict compatible with existing callers (provider, reference, amount, status, settlement_eta)
        plus extended fields (order_id, payment_id, webhook_events, metadata).
    """
    cfg = _GATEWAY_CONFIG.get(provider, _GATEWAY_CONFIG["Razorpay"])

    order_id = _generate_id(cfg["order_prefix"])
    payment_id = _generate_id(cfg["payment_prefix"])
    reference = f"{provider[:3].upper()}-{int(datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:6].upper()}"

    # Determine status
    if force_success:
        status: PaymentStatus = "Payment Successful"
        failure_reason = None
    else:
        roll = random.random()
        if roll < cfg["failure_rate"]:
            status = "Payment Failed"
            failure_reason = "Simulated gateway decline (test mode)"
        elif roll < cfg["failure_rate"] + 0.02:
            status = "Payment Pending"
            failure_reason = None
        else:
            status = "Payment Successful"
            failure_reason = None

    settlement_date = (datetime.utcnow() + timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    webhook_events = _build_webhook_events(provider, order_id, payment_id, amount, status)

    result = PaymentResult(
        provider=provider,
        provider_label=cfg["label"],
        order_id=order_id,
        payment_id=payment_id,
        reference=reference,
        amount=amount,
        currency=cfg["currency"],
        status=status,
        settlement_eta=cfg["settlement"],
        settlement_date=settlement_date,
        webhook_events=webhook_events,
        failure_reason=failure_reason,
        metadata={
            "gateway_mode": "sandbox",
            "initiated_at": datetime.utcnow().isoformat(),
            "idempotency_key": uuid.uuid4().hex,
        },
    )

    # Return dict for backward compatibility + extended fields
    return {
        # Legacy fields (existing callers rely on these)
        "provider": result.provider_label,
        "reference": result.reference,
        "amount": result.amount,
        "status": result.status,
        "settlement_eta": result.settlement_eta,
        # Extended fields
        "order_id": result.order_id,
        "payment_id": result.payment_id,
        "currency": result.currency,
        "settlement_date": result.settlement_date,
        "failure_reason": result.failure_reason,
        "webhook_events": [
            {"event": e.event_type, "timestamp": e.timestamp, "payload": e.payload}
            for e in result.webhook_events
        ],
        "metadata": result.metadata,
    }
