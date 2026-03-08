from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
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


async def get_user_plan(user_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        text("SELECT plan FROM users WHERE id = :uid"),
        {"uid": user_id},
    )
    user = result.fetchone()
    return user[0] if user else "free"


async def get_monthly_followup_count(user_id: str, db: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1)

    result = await db.execute(
        text("""
        SELECT COALESCE(SUM(followups_generated),0)
        FROM usage_tracking
        WHERE user_id = :uid
        AND date >= :month_start
        """),
        {"uid": user_id, "month_start": month_start},
    )

    count = result.scalar()
    return count or 0


async def get_email_account_count(user_id: str, db: AsyncSession) -> int:
    result = await db.execute(
        text("SELECT COUNT(*) FROM email_accounts WHERE user_id = :uid"),
        {"uid": user_id},
    )
    return result.scalar()


async def check_followup_limit(user_id: str, db: AsyncSession) -> dict:
    plan = await get_user_plan(user_id, db)
    limits = get_plan_limits(plan)

    limit = limits["followups_per_month"]

    if limit == -1:
        return {"allowed": True, "used": 0, "limit": -1, "plan": plan}

    used = await get_monthly_followup_count(user_id, db)

    return {
        "allowed": used < limit,
        "used": used,
        "limit": limit,
        "plan": plan,
    }


async def check_account_limit(user_id: str, db: AsyncSession) -> dict:
    plan = await get_user_plan(user_id, db)
    limits = get_plan_limits(plan)

    limit = limits["max_email_accounts"]

    current = await get_email_account_count(user_id, db)

    return {
        "allowed": current < limit,
        "current": current,
        "limit": limit,
        "plan": plan,
    }


def check_tone_allowed(plan: str, tone: str) -> bool:
    limits = get_plan_limits(plan)
    return tone in limits["ai_tones"]


def check_auto_send_allowed(plan: str) -> bool:
    limits = get_plan_limits(plan)
    return limits["auto_send"]


def check_analytics_allowed(plan: str) -> bool:
    limits = get_plan_limits(plan)
    return limits["analytics"]
