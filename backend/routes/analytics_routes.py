from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user
from plan_permissions import get_user_plan, check_analytics_allowed
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def get_overview(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    # Basic overview stats available to all plans
    total_threads = await db.email_threads.count_documents({"user_id": user_id})
    silent_threads = await db.email_threads.count_documents({"user_id": user_id, "is_silent": True})
    followups_sent = await db.followup_suggestions.count_documents({"user_id": user_id, "status": "sent"})
    followups_pending = await db.followup_suggestions.count_documents({"user_id": user_id, "status": "pending"})
    followups_dismissed = await db.followup_suggestions.count_documents({"user_id": user_id, "status": "dismissed"})
    total_followups = followups_sent + followups_pending + followups_dismissed

    response_rate = round((followups_sent / total_followups * 100) if total_followups > 0 else 0, 1)
    accounts_count = await db.email_accounts.count_documents({"user_id": user_id})

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


@router.get("/followups-over-time")
async def followups_over_time(days: int = 30, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    # Plan gate: only Pro has analytics charts
    plan = await get_user_plan(user_id)
    if not check_analytics_allowed(plan):
        raise HTTPException(
            status_code=403,
            detail="Analytics is available on the Pro plan. Upgrade to access detailed analytics."
        )
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    # Get usage data for the period
    usage_data = await db.usage_tracking.find(
        {"user_id": user_id, "date": {"$gte": start_date.strftime("%Y-%m-%d")}},
        {"_id": 0}
    ).sort("date", 1).to_list(days)

    # Fill in missing days
    chart_data = []
    for i in range(days):
        date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        entry = next((u for u in usage_data if u.get("date") == date), None)
        chart_data.append({
            "date": date,
            "generated": entry.get("followups_generated", 0) if entry else 0,
            "sent": entry.get("followups_sent", 0) if entry else 0,
        })

    return chart_data


@router.get("/top-contacts")
async def top_contacts(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    followups = await db.followup_suggestions.find(
        {"user_id": user_id, "status": "sent"},
        {"_id": 0, "recipient": 1, "recipient_name": 1}
    ).to_list(500)

    contact_counts = {}
    for f in followups:
        email = f.get("recipient", "unknown")
        name = f.get("recipient_name", email)
        if email not in contact_counts:
            contact_counts[email] = {"email": email, "name": name, "count": 0}
        contact_counts[email]["count"] += 1

    sorted_contacts = sorted(contact_counts.values(), key=lambda x: x["count"], reverse=True)[:10]
    return sorted_contacts
