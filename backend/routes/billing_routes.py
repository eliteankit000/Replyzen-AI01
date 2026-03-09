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
from typing import Optional
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


PLANS = {
    "USD": [
        {
            "id": "free",
            "name": "Free",
            "description": "Get started for free",
            "price_monthly": 0,
            "price_yearly": 0,
            "features": ["30 follow-ups per month", "1 email account connection", "Basic AI follow-up drafts", "Manual follow-up sending", "Inbox scan for silent conversations", "Follow-up queue dashboard", "Basic settings"],
        },
        {
            "id": "pro",
            "name": "Pro",
            "description": "For professionals",
            "price_monthly": 19,
            "price_yearly": 190,
            "features": ["2,500 follow-ups per month", "Connect up to 3 email accounts", "Advanced AI tones", "Manual sending", "Auto-send automation", "Analytics dashboard", "Inbox scanning", "Follow-up detection", "Priority support"],
        },
        {
            "id": "business",
            "name": "Business",
            "description": "For teams and power users",
            "price_monthly": 49,
            "price_yearly": 490,
            "features": ["Unlimited follow-ups", "Connect up to 10 email accounts", "All AI tones", "Manual sending", "Auto-send automation", "Inbox scanning", "Follow-up detection", "Dedicated support"],
        },
    ],
    "INR": [
        {
            "id": "free",
            "name": "Free",
            "description": "Get started for free",
            "price_monthly": 0,
            "price_yearly": 0,
            "features": ["30 follow-ups per month", "1 email account connection", "Basic AI follow-up drafts", "Manual follow-up sending", "Inbox scan for silent conversations", "Follow-up queue dashboard", "Basic settings"],
        },
        {
            "id": "pro",
            "name": "Pro",
            "description": "For professionals",
            "price_monthly": 999,
            "price_yearly": 9990,
            "features": ["2,500 follow-ups per month", "Connect up to 3 email accounts", "Advanced AI tones", "Manual sending", "Auto-send automation", "Analytics dashboard", "Inbox scanning", "Follow-up detection", "Priority support"],
        },
        {
            "id": "business",
            "name": "Business",
            "description": "For teams and power users",
            "price_monthly": 2499,
            "price_yearly": 24990,
            "features": ["Unlimited follow-ups", "Connect up to 10 email accounts", "All AI tones", "Manual sending", "Auto-send automation", "Inbox scanning", "Follow-up detection", "Dedicated support"],
        },
    ],
}


# -------------------------------------------------------------------
# Detect Location
# -------------------------------------------------------------------

@router.get("/detect-location")
async def detect_location(request: Request):
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host
    country = "US"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"http://ip-api.com/json/{client_ip}?fields=countryCode")
            if resp.status_code == 200:
                data = resp.json()
                country = data.get("countryCode", "US")
    except Exception as e:
        logger.warning(f"Location detection failed: {e}")

    is_india = country == "IN"
    return {
        "country": country,
        "currency": "INR" if is_india else "USD",
        "payment_provider": "razorpay" if is_india else "paddle",
    }


# -------------------------------------------------------------------
# Plans — returns price_monthly, price_yearly, features, description
# -------------------------------------------------------------------

@router.get("/plans")
async def get_plans(currency: str = "USD"):
    currency = currency.upper()
    return PLANS.get(currency, PLANS["USD"])


# -------------------------------------------------------------------
# Plan Limits
# -------------------------------------------------------------------

PLAN_LIMITS = {
    "free":     {"followups_per_month": 10,  "followups_used": 0, "email_accounts": 1,  "ai_replies": 10},
    "pro":      {"followups_per_month": 200, "followups_used": 0, "email_accounts": 3,  "ai_replies": 200},
    "business": {"followups_per_month": -1,  "followups_used": 0, "email_accounts": 10, "ai_replies": -1},
}

@router.get("/plan-limits")
async def get_plan_limits(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("SELECT plan FROM users WHERE id = :uid"),
        {"uid": current_user["user_id"]}
    )
    row = result.fetchone()
    plan = str(row[0]) if row else "free"
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    return {"plan": plan, **limits}


# -------------------------------------------------------------------
# Current Subscription
# -------------------------------------------------------------------

@router.get("/subscription")
async def get_subscription(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(
            text("""
            SELECT plan, status, provider
            FROM subscriptions
            WHERE user_id = :uid
            AND status IN ('active','trialing')
            LIMIT 1
            """),
            {"uid": current_user["user_id"]}
        )
        sub = result.fetchone()
        if not sub:
            return {"plan": "free", "status": "active"}
        return dict(sub._mapping)
    except Exception as e:
        logger.warning(f"Subscription fetch error: {e}")
        return {"plan": "free", "status": "active"}


# -------------------------------------------------------------------
# Cancel Subscription
# -------------------------------------------------------------------

@router.post("/cancel")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]
    result = await db.execute(
        text("SELECT id, provider, subscription_id FROM subscriptions WHERE user_id = :uid AND status = 'active' LIMIT 1"),
        {"uid": user_id}
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
        text("UPDATE subscriptions SET status = 'cancelled', cancelled_at = :now WHERE id = :id"),
        {"id": sub["id"], "now": now}
    )
    await db.execute(
        text("UPDATE users SET plan = 'free' WHERE id = :uid"),
        {"uid": user_id}
    )
    await db.commit()
    return {"message": "Subscription cancelled"}


# -------------------------------------------------------------------
# Razorpay Webhook
# -------------------------------------------------------------------

@router.post("/webhook/razorpay")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    webhook_secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

    if webhook_secret:
        expected = hmac.new(webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Invalid signature")

    data = json.loads(body)
    event = data.get("event", "")

    if event == "subscription.activated":
        sub = data["payload"]["subscription"]["entity"]
        user_id = sub.get("notes", {}).get("user_id")
        plan = sub.get("notes", {}).get("plan")
        await db.execute(
            text("""
            INSERT INTO subscriptions (id,user_id,plan,provider,subscription_id,status,created_at)
            VALUES (:id,:uid,:plan,'razorpay',:sid,'active',:created)
            ON CONFLICT (user_id) DO UPDATE SET plan=:plan, status='active'
            """),
            {"id": str(uuid.uuid4()), "uid": user_id, "plan": plan, "sid": sub["id"], "created": datetime.now(timezone.utc)}
        )
        await db.execute(text("UPDATE users SET plan=:plan WHERE id=:uid"), {"plan": plan, "uid": user_id})
        await db.commit()

    return {"status": "ok"}
