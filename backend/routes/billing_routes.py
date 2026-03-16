from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
import os
import uuid
import hmac
import hashlib
import json
from datetime import datetime, timezone
import logging
import razorpay
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

rzp_key_id = os.environ.get("RAZORPAY_KEY_ID", "")
rzp_key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
rzp_client = None

if rzp_key_id and rzp_key_secret:
    rzp_client = razorpay.Client(auth=(rzp_key_id, rzp_key_secret))


class CheckoutRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"
    provider: str = "razorpay"


# -----------------------------
# PLAN DEFINITIONS
# -----------------------------
PLANS = {
    "USD": [
        {
            "id": "free",
            "name": "Free",
            "description": "Get started for free",
            "price_monthly": 0,
            "price_yearly": 0,
            "features": [
                "30 follow-ups per month",
                "1 email account connection",
                "Basic AI follow-up drafts",
                "Manual follow-up sending",
                "Inbox scan for silent conversations",
                "Follow-up queue dashboard",
                "Basic settings",
            ],
        },
        {
            "id": "pro",
            "name": "Pro",
            "description": "For professionals",
            "price_monthly": 19,
            "price_yearly": 190,
            "features": [
                "2,500 follow-ups per month",
                "Connect up to 3 email accounts",
                "Advanced AI tones",
                "Manual sending",
                "Auto-send automation",
                "Analytics dashboard",
                "Inbox scanning",
                "Follow-up detection",
                "Priority support",
            ],
        },
        {
            "id": "business",
            "name": "Business",
            "description": "For teams and power users",
            "price_monthly": 49,
            "price_yearly": 490,
            "features": [
                "Unlimited follow-ups",
                "Connect up to 10 email accounts",
                "All AI tones",
                "Manual sending",
                "Auto-send automation",
                "Inbox scanning",
                "Follow-up detection",
                "Dedicated support",
            ],
        },
    ]
}


# -----------------------------
# PLAN LIMITS
# -----------------------------
PLAN_LIMITS = {
    "free": {"followups_per_month": 30, "max_email_accounts": 1, "ai_replies": 30},
    "pro": {"followups_per_month": 2500, "max_email_accounts": 3, "ai_replies": 2500},
    "business": {"followups_per_month": -1, "max_email_accounts": 10, "ai_replies": -1},
}


# -------------------------------------------------------
# LOCATION DETECTION
# -------------------------------------------------------
@router.get("/detect-location")
async def detect_location(request: Request):

    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host

    country = "US"

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"http://ip-api.com/json/{client_ip}?fields=countryCode"
            )
            if resp.status_code == 200:
                data = resp.json()
                country = data.get("countryCode", "US")
    except Exception as e:
        logger.warning(f"Location detection failed: {e}")

    is_india = country == "IN"

    return {
        "country": country,
        "currency": "INR" if is_india else "USD",
        "symbol": "₹" if is_india else "$",
        "payment_provider": "razorpay" if is_india else "paddle",
    }


# -------------------------------------------------------
# GET PLANS
# -------------------------------------------------------
@router.get("/plans")
async def get_plans(currency: str = "USD"):
    currency = currency.upper()
    return PLANS.get(currency, PLANS["USD"])


# -------------------------------------------------------
# PLAN LIMITS + USAGE
# FIXED SECTION
# -------------------------------------------------------
@router.get("/plan-limits")
async def get_plan_limits(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):

    user_id = current_user["user_id"]

    # Get user plan
    result = await db.execute(
        text("SELECT plan FROM users WHERE id = :uid"),
        {"uid": user_id},
    )

    row = result.fetchone()
    plan = str(row[0]) if row else "free"

    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

    # Count followups used this month
    usage_query = await db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM email_threads
            WHERE user_id = :uid
            AND needs_followup = true
            AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
            """
        ),
        {"uid": user_id},
    )

    followups_used = usage_query.scalar() or 0

    return {
        "plan": plan,
        "followups_used": followups_used,
        **limits,
    }


# -------------------------------------------------------
# GET SUBSCRIPTION
# -------------------------------------------------------
@router.get("/subscription")
async def get_subscription(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):

    try:
        result = await db.execute(
            text(
                """
                SELECT plan, status, provider
                FROM subscriptions
                WHERE user_id = :uid
                AND status IN ('active','trialing')
                LIMIT 1
                """
            ),
            {"uid": current_user["user_id"]},
        )

        sub = result.fetchone()

        if not sub:
            return {"plan": "free", "status": "active"}

        return dict(sub._mapping)

    except Exception as e:
        logger.warning(f"Subscription fetch error: {e}")
        return {"plan": "free", "status": "active"}


# -------------------------------------------------------
# CANCEL SUBSCRIPTION
# -------------------------------------------------------
@router.post("/cancel")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):

    user_id = current_user["user_id"]

    result = await db.execute(
        text(
            """
            SELECT id, provider, subscription_id
            FROM subscriptions
            WHERE user_id = :uid
            AND status = 'active'
            LIMIT 1
            """
        ),
        {"uid": user_id},
    )

    sub = result.fetchone()

    if not sub:
        raise HTTPException(status_code=400, detail="No active subscription")

    sub = dict(sub._mapping)

    if sub["provider"] == "razorpay" and rzp_client:
        try:
            rzp_client.subscription.cancel(sub["subscription_id"])
        except Exception as e:
            logger.error(f"Razorpay cancel error: {e}")

    now = datetime.now(timezone.utc)

    await db.execute(
        text(
            """
            UPDATE subscriptions
            SET status = 'cancelled', cancelled_at = :now
            WHERE id = :id
            """
        ),
        {"id": sub["id"], "now": now},
    )

    await db.execute(
        text("UPDATE users SET plan = 'free' WHERE id = :uid"),
        {"uid": user_id},
    )

    await db.commit()

    return {"message": "Subscription cancelled"}
