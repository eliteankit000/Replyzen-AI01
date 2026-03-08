from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from plan_permissions import get_user_plan, check_analytics_allowed
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ---------------------------------------------------------
# Overview Analytics
# ---------------------------------------------------------

@router.get("/overview")
async def get_overview(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    total_threads = await db.execute(
        text("SELECT COUNT(*) FROM email_threads WHERE user_id = :uid"),
        {"uid": user_id}
    )
    total_threads = total_threads.scalar() or 0

    silent_threads = await db.execute(
        text("SELECT COUNT(*) FROM email_threads WHERE user_id = :uid AND is_silent = TRUE"),
        {"uid": user_id}
    )
    silent_threads = silent_threads.scalar() or 0

    followups_sent = await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='sent'"),
        {"uid": user_id}
    )
    followups_sent = followups_sent.scalar() or 0

    followups_pending = await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='pending'"),
        {"uid": user_id}
    )
    followups_pending = followups_pending.scalar() or 0

    followups_dismissed = await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='dismissed'"),
        {"uid": user_id}
    )
    followups_dismissed = followups_dismissed.scalar() or 0

    total_followups = followups_sent + followups_pending + followups_dismissed

    response_rate = round((followups_sent / total_followups * 100) if total_followups > 0 else 0, 1)

    accounts = await db.execute(
        text("SELECT COUNT(*) FROM email_accounts WHERE user_id = :uid"),
        {"uid": user_id}
    )
    accounts_count = accounts.scalar() or 0

    plan = await get_user_plan(user_id)

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


# ---------------------------------------------------------
# Followups Over Time Chart
# ---------------------------------------------------------

@router.get("/followups-over-time")
async def followups_over_time(
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):

    user_id = current_user["user_id"]

    plan = await get_user_plan(user_id)

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
        {
            "uid": user_id,
            "start": start_date.strftime("%Y-%m-%d")
        }
    )

    rows = result.fetchall()

    usage_map = {
        row.date: {
            "generated": row.followups_generated,
            "sent": row.followups_sent
        }
        for row in rows
    }

    chart_data = []

    for i in range(days):
        date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")

        entry = usage_map.get(date)

        chart_data.append({
            "date": date,
            "generated": entry["generated"] if entry else 0,
            "sent": entry["sent"] if entry else 0
        })

    return chart_data


# ---------------------------------------------------------
# Top Contacts
# ---------------------------------------------------------

@router.get("/top-contacts")
async def top_contacts(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):

    user_id = current_user["user_id"]

    result = await db.execute(
        text("""
        SELECT recipient, recipient_name, COUNT(*) as count
        FROM followup_suggestions
        WHERE user_id = :uid AND status = 'sent'
        GROUP BY recipient, recipient_name
        ORDER BY count DESC
        LIMIT 10
        """),
        {"uid": user_id}
    )

    rows = result.fetchall()

    return [
        {
            "email": row.recipient,
            "name": row.recipient_name,
            "count": row.count
        }
        for row in rows
    ]
