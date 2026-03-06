from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from database import db
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

# Razorpay client
rzp_key_id = os.environ.get("RAZORPAY_KEY_ID", "")
rzp_key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
rzp_client = None
if rzp_key_id and rzp_key_secret:
    rzp_client = razorpay.Client(auth=(rzp_key_id, rzp_key_secret))

PLANS = {
    "free": {
        "id": "free",
        "name": "Free",
        "description": "Get started with basic follow-ups",
        "features": ["5 follow-ups/month", "1 email account", "Basic AI drafts", "Manual sending only"],
        "price_monthly": 0,
        "price_yearly": 0,
        "followup_limit": 5,
        "account_limit": 1,
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "description": "For professionals who mean business",
        "features": ["100 follow-ups/month", "3 email accounts", "Advanced AI tones", "Auto-send", "Analytics", "Priority support"],
        "price_monthly": 19,
        "price_yearly": 190,
        "followup_limit": 100,
        "account_limit": 3,
        "razorpay_monthly": os.environ.get("RAZORPAY_PLAN_PRO_MONTHLY", ""),
        "razorpay_yearly": os.environ.get("RAZORPAY_PLAN_PRO_YEARLY", ""),
        "paddle_monthly": os.environ.get("PADDLE_PRICE_PRO_MONTHLY", ""),
        "paddle_yearly": os.environ.get("PADDLE_PRICE_PRO_YEARLY", ""),
    },
    "business": {
        "id": "business",
        "name": "Business",
        "description": "For teams that scale",
        "features": ["Unlimited follow-ups", "10 email accounts", "All AI tones", "Auto-send", "Advanced analytics", "Team collaboration", "API access", "Dedicated support"],
        "price_monthly": 49,
        "price_yearly": 490,
        "followup_limit": -1,
        "account_limit": 10,
        "razorpay_monthly": os.environ.get("RAZORPAY_PLAN_BUSINESS_MONTHLY", ""),
        "razorpay_yearly": os.environ.get("RAZORPAY_PLAN_BUSINESS_YEARLY", ""),
        "paddle_monthly": os.environ.get("PADDLE_PRICE_BUSINESS_MONTHLY", ""),
        "paddle_yearly": os.environ.get("PADDLE_PRICE_BUSINESS_YEARLY", ""),
    }
}


class CheckoutRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"
    provider: str = "razorpay"


@router.get("/plans")
async def get_plans():
    safe_plans = []
    for plan in PLANS.values():
        safe = {k: v for k, v in plan.items() if not k.startswith("razorpay_") and not k.startswith("paddle_")}
        safe_plans.append(safe)
    return safe_plans


@router.post("/checkout")
async def create_checkout(req: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    plan = PLANS.get(req.plan_id)
    if not plan or req.plan_id == "free":
        raise HTTPException(status_code=400, detail="Invalid plan")

    if req.provider == "razorpay":
        if not rzp_client:
            raise HTTPException(status_code=500, detail="Razorpay not configured")

        plan_key = f"razorpay_{req.billing_cycle}"
        rzp_plan_id = plan.get(plan_key, "")
        if not rzp_plan_id:
            raise HTTPException(status_code=400, detail="Plan not available")

        try:
            subscription = rzp_client.subscription.create({
                "plan_id": rzp_plan_id,
                "total_count": 12 if req.billing_cycle == "monthly" else 5,
                "quantity": 1,
                "notes": {"user_id": user_id, "plan": req.plan_id}
            })
            return {
                "provider": "razorpay",
                "subscription_id": subscription["id"],
                "key_id": rzp_key_id,
            }
        except Exception as e:
            logger.error(f"Razorpay checkout error: {e}")
            raise HTTPException(status_code=500, detail="Failed to create checkout")

    elif req.provider == "paddle":
        paddle_key = f"paddle_{req.billing_cycle}"
        price_id = plan.get(paddle_key, "")
        if not price_id:
            raise HTTPException(status_code=400, detail="Plan not available")

        return {
            "provider": "paddle",
            "price_id": price_id,
            "user_id": user_id,
        }

    raise HTTPException(status_code=400, detail="Invalid provider")


@router.get("/subscription")
async def get_subscription(current_user: dict = Depends(get_current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": current_user["user_id"], "status": {"$in": ["active", "trialing"]}},
        {"_id": 0}
    )
    if not sub:
        return {"plan": "free", "status": "active", "provider": None}
    return sub


@router.post("/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "status": "active"}, {"_id": 0}
    )
    if not sub:
        raise HTTPException(status_code=400, detail="No active subscription")

    if sub.get("provider") == "razorpay" and rzp_client:
        try:
            rzp_client.subscription.cancel(sub["subscription_id"])
        except Exception as e:
            logger.error(f"Razorpay cancel error: {e}")

    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.users.update_one({"id": user_id}, {"$set": {"plan": "free"}})

    return {"message": "Subscription cancelled"}


@router.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    webhook_secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

    if webhook_secret:
        expected = hmac.new(
            webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Invalid signature")

    data = json.loads(body)
    event = data.get("event", "")
    payload = data.get("payload", {})

    if event == "subscription.activated":
        sub_data = payload.get("subscription", {}).get("entity", {})
        user_id = sub_data.get("notes", {}).get("user_id", "")
        plan_id = sub_data.get("notes", {}).get("plan", "pro")

        if user_id:
            sub = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "plan": plan_id,
                "provider": "razorpay",
                "subscription_id": sub_data.get("id", ""),
                "status": "active",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.subscriptions.update_one(
                {"user_id": user_id, "provider": "razorpay"},
                {"$set": sub},
                upsert=True
            )
            await db.users.update_one({"id": user_id}, {"$set": {"plan": plan_id}})

    elif event == "subscription.cancelled":
        sub_data = payload.get("subscription", {}).get("entity", {})
        user_id = sub_data.get("notes", {}).get("user_id", "")
        if user_id:
            await db.subscriptions.update_one(
                {"user_id": user_id, "provider": "razorpay"},
                {"$set": {"status": "cancelled"}}
            )
            await db.users.update_one({"id": user_id}, {"$set": {"plan": "free"}})

    # Log billing event
    await db.billing_events.insert_one({
        "id": str(uuid.uuid4()),
        "event": event,
        "provider": "razorpay",
        "data": str(payload)[:500],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"status": "ok"}


@router.post("/webhook/paddle")
async def paddle_webhook(request: Request):
    body = await request.body()
    data = json.loads(body)
    event_type = data.get("event_type", "")

    # Log billing event
    await db.billing_events.insert_one({
        "id": str(uuid.uuid4()),
        "event": event_type,
        "provider": "paddle",
        "data": str(data)[:500],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    if event_type == "subscription.activated":
        custom_data = data.get("data", {}).get("custom_data", {})
        user_id = custom_data.get("user_id", "")
        plan_id = custom_data.get("plan", "pro")

        if user_id:
            sub = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "plan": plan_id,
                "provider": "paddle",
                "subscription_id": data.get("data", {}).get("id", ""),
                "status": "active",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.subscriptions.update_one(
                {"user_id": user_id, "provider": "paddle"},
                {"$set": sub},
                upsert=True
            )
            await db.users.update_one({"id": user_id}, {"$set": {"plan": plan_id}})

    return {"status": "ok"}
