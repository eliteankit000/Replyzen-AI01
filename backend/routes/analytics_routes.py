from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from plan_permissions import get_user_plan, check_analytics_allowed
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def get_overview(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    total_threads = (await db.execute(
        text("SELECT COUNT(*) FROM email_threads WHERE user_id = :uid"),
        {"uid": user_id}
    )).scalar() or 0

    silent_threads = (await db.execute(
        text("SELECT COUNT(*) FROM email_threads WHERE user_id = :uid AND is_silent = TRUE"),
        {"uid": user_id}
    )).scalar() or 0

    followups_sent = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='sent'"),
        {"uid": user_id}
    )).scalar() or 0

    followups_pending = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='pending'"),
        {"uid": user_id}
    )).scalar() or 0

    followups_dismissed = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='dismissed'"),
        {"uid": user_id}
    )).scalar() or 0

    total_followups = followups_sent + followups_pending + followups_dismissed
    response_rate = round((followups_sent / total_followups * 100) if total_followups > 0 else 0, 1)

    accounts_count = (await db.execute(
        text("SELECT COUNT(*) FROM email_accounts WHERE user_id = :uid"),
        {"uid": user_id}
    )).scalar() or 0

    # ✅ FIX: pass db to get_user_plan
    plan = await get_user_plan(user_id, db)

    return {
        "total_threads": total_threads,
        "silent_threads": silent_threads,
        "followups_sent": followups_sent,
        "followups_pending": followups_pending,
        "followups_dismissed": followups_dismissed,
        "response_rate": response_rate,
        "accounts_connected": accounts_count,
        "plan": plan,
        "analytics_allowed": check_analytics_allowed(plan),
    }


@router.get("/followups-over-time")
async def followups_over_time(
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    # ✅ FIX: pass db to get_user_plan
    plan = await get_user_plan(user_id, db)

    if not check_analytics_allowed(plan):
        raise HTTPException(
            status_code=403,
            detail="Analytics is available on the Pro plan. Upgrade to access detailed analytics."
        )

    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    result = await db.execute(
        text("""
        SELECT date, followups_generated, followups_sent
        FROM usage_tracking
        WHERE user_id = :uid AND date >= :start
        ORDER BY date ASC
        """),
        {"uid": user_id, "start": start_date.strftime("%Y-%m-%d")}
    )

    rows = result.fetchall()
    usage_map = {
        row.date: {"generated": row.followups_generated, "sent": row.followups_sent}
        for row in rows
    }

    chart_data = []
    for i in range(days):
        date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        entry = usage_map.get(date)
        chart_data.append({
            "date": date,
            "generated": entry["generated"] if entry else 0,
            "sent": entry["sent"] if entry else 0,
        })

    return chart_data


@router.get("/top-contacts")
async def top_contacts(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    # ✅ FIX: query email_threads instead — followup_suggestions has no recipient column
    result = await db.execute(
        text("""
        SELECT last_message_from, COUNT(*) as count
        FROM email_threads
        WHERE user_id = :uid
        GROUP BY last_message_from
        ORDER BY count DESC
        LIMIT 10
        """),
        {"uid": user_id}
    )

    rows = result.fetchall()
    return [
        {
            "email": row.last_message_from,
            "name": row.last_message_from,
            "count": row.count,
        }
        for row in rows
    ]
