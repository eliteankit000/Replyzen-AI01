from database import db
from datetime import datetime, timezone

PLAN_LIMITS = {
    "free": {
        "followups_per_month": 30,
        "max_email_accounts": 1,
        "auto_send": False,
        "analytics": False,
        "ai_tones": ["professional"],
        "support_tier": "basic",
    },
    "pro": {
        "followups_per_month": 2500,
        "max_email_accounts": 3,
        "auto_send": True,
        "analytics": True,
        "ai_tones": ["professional", "friendly", "casual"],
        "support_tier": "priority",
    },
    "business": {
        "followups_per_month": -1,
        "max_email_accounts": 10,
        "auto_send": True,
        "analytics": False,
        "ai_tones": ["professional", "friendly", "casual"],
        "support_tier": "dedicated",
    },
}


def get_plan_limits(plan: str) -> dict:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])


async def get_user_plan(user_id: str) -> str:
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "plan": 1})
    return user.get("plan", "free") if user else "free"


async def get_monthly_followup_count(user_id: str) -> int:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$followups_generated"}}},
    ]
    result = await db.usage_tracking.aggregate(pipeline).to_list(1)
    return result[0]["total"] if result else 0


async def get_email_account_count(user_id: str) -> int:
    return await db.email_accounts.count_documents({"user_id": user_id})


async def check_followup_limit(user_id: str) -> dict:
    plan = await get_user_plan(user_id)
    limits = get_plan_limits(plan)
    limit = limits["followups_per_month"]
    if limit == -1:
        return {"allowed": True, "used": 0, "limit": -1, "plan": plan}
    used = await get_monthly_followup_count(user_id)
    return {"allowed": used < limit, "used": used, "limit": limit, "plan": plan}


async def check_account_limit(user_id: str) -> dict:
    plan = await get_user_plan(user_id)
    limits = get_plan_limits(plan)
    limit = limits["max_email_accounts"]
    current = await get_email_account_count(user_id)
    return {"allowed": current < limit, "current": current, "limit": limit, "plan": plan}


def check_tone_allowed(plan: str, tone: str) -> bool:
    limits = get_plan_limits(plan)
    return tone in limits["ai_tones"]


def check_auto_send_allowed(plan: str) -> bool:
    limits = get_plan_limits(plan)
    return limits["auto_send"]


def check_analytics_allowed(plan: str) -> bool:
    limits = get_plan_limits(plan)
    return limits["analytics"]
