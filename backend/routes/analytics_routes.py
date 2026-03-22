from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from plan_permissions import get_user_plan, check_analytics_allowed
from datetime import datetime, timezone, timedelta, date

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ─────────────────────────────────────────────────────────────
# Overview (existing — unchanged)
# ─────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    total_threads = (await db.execute(
        text("SELECT COUNT(*) FROM email_threads WHERE user_id = :uid"),
        {"uid": user_id},
    )).scalar() or 0

    silent_threads = (await db.execute(
        text("SELECT COUNT(*) FROM email_threads WHERE user_id = :uid AND is_silent = TRUE"),
        {"uid": user_id},
    )).scalar() or 0

    followups_sent = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='sent'"),
        {"uid": user_id},
    )).scalar() or 0

    followups_pending = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='pending'"),
        {"uid": user_id},
    )).scalar() or 0

    followups_dismissed = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id = :uid AND status='dismissed'"),
        {"uid": user_id},
    )).scalar() or 0

    total_followups  = followups_sent + followups_pending + followups_dismissed
    response_rate    = round((followups_sent / total_followups * 100) if total_followups > 0 else 0, 1)

    accounts_count = (await db.execute(
        text("SELECT COUNT(*) FROM email_accounts WHERE user_id = :uid"),
        {"uid": user_id},
    )).scalar() or 0

    plan = await get_user_plan(user_id, db)

    return {
        "total_threads":       total_threads,
        "silent_threads":      silent_threads,
        "followups_sent":      followups_sent,
        "followups_pending":   followups_pending,
        "followups_dismissed": followups_dismissed,
        "response_rate":       response_rate,
        "accounts_connected":  accounts_count,
        "plan":                plan,
        "analytics_allowed":   check_analytics_allowed(plan),
    }


# ─────────────────────────────────────────────────────────────
# Followups Over Time — FIXED: date passed as date object
# ─────────────────────────────────────────────────────────────

@router.get("/followups-over-time")
async def followups_over_time(
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]
    plan    = await get_user_plan(user_id, db)

    if not check_analytics_allowed(plan):
        raise HTTPException(
            status_code=403,
            detail="Analytics is available on the Pro plan. Upgrade to access detailed analytics.",
        )

    now        = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    # ✅ FIX: pass date object not string — asyncpg requires date type
    result = await db.execute(
        text("""
        SELECT date, followups_generated, followups_sent
        FROM usage_tracking
        WHERE user_id = :uid AND date >= :start
        ORDER BY date ASC
        """),
        {"uid": user_id, "start": start_date.date()},  # ← .date() not .strftime()
    )

    rows      = result.fetchall()
    usage_map = {
        str(row.date): {"generated": row.followups_generated, "sent": row.followups_sent}
        for row in rows
    }

    chart_data = []
    for i in range(days):
        d     = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        entry = usage_map.get(d)
        chart_data.append({
            "date":      d,
            "generated": entry["generated"] if entry else 0,
            "sent":      entry["sent"]      if entry else 0,
        })

    return chart_data


# ─────────────────────────────────────────────────────────────
# Top Contacts (existing — unchanged)
# ─────────────────────────────────────────────────────────────

@router.get("/top-contacts")
async def top_contacts(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    result = await db.execute(
        text("""
        SELECT last_message_from, COUNT(*) as count
        FROM email_threads
        WHERE user_id = :uid
        GROUP BY last_message_from
        ORDER BY count DESC
        LIMIT 10
        """),
        {"uid": user_id},
    )
    rows = result.fetchall()
    return [
        {"email": row.last_message_from, "name": row.last_message_from, "count": row.count}
        for row in rows
    ]


# ─────────────────────────────────────────────────────────────
# NEW: Tone Performance
# ─────────────────────────────────────────────────────────────

@router.get("/tone-performance")
async def tone_performance(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reply rate broken down by AI tone used."""
    user_id = current_user["user_id"]

    try:
        result = await db.execute(
            text("""
            SELECT
                fs.tone,
                COUNT(*) AS total_sent,
                COUNT(*) FILTER (
                    WHERE et.last_sender_is_user = false
                      AND et.updated_at > fs.sent_at
                ) AS replies_received
            FROM followup_suggestions fs
            JOIN email_threads et ON et.id = fs.thread_id
            WHERE fs.user_id = :uid
              AND fs.status = 'sent'
              AND fs.sent_at IS NOT NULL
            GROUP BY fs.tone
            ORDER BY replies_received DESC
            """),
            {"uid": user_id},
        )
        rows = result.fetchall()
        return [
            {
                "tone":             row.tone or "professional",
                "total_sent":       int(row.total_sent),
                "replies_received": int(row.replies_received),
                "reply_rate":       round(
                    (int(row.replies_received) / int(row.total_sent) * 100)
                    if int(row.total_sent) > 0 else 0, 1
                ),
            }
            for row in rows
        ]
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────
# NEW: Timing Performance
# ─────────────────────────────────────────────────────────────

@router.get("/timing-performance")
async def timing_performance(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reply rate by how many days before follow-up was sent."""
    user_id = current_user["user_id"]

    try:
        result = await db.execute(
            text("""
            SELECT
                EXTRACT(DAY FROM (fs.sent_at - et.last_message_at))::int AS days_waited,
                COUNT(*) AS total,
                COUNT(*) FILTER (
                    WHERE et.last_sender_is_user = false
                      AND et.updated_at > fs.sent_at
                ) AS replies
            FROM followup_suggestions fs
            JOIN email_threads et ON et.id = fs.thread_id
            WHERE fs.user_id = :uid
              AND fs.status = 'sent'
              AND fs.sent_at IS NOT NULL
              AND et.last_message_at IS NOT NULL
            GROUP BY days_waited
            HAVING EXTRACT(DAY FROM (fs.sent_at - et.last_message_at)) BETWEEN 0 AND 14
            ORDER BY days_waited ASC
            """),
            {"uid": user_id},
        )
        rows = result.fetchall()
        return [
            {
                "days_waited": int(row.days_waited or 0),
                "total":       int(row.total),
                "replies":     int(row.replies),
                "reply_rate":  round(
                    (int(row.replies) / int(row.total) * 100)
                    if int(row.total) > 0 else 0, 1
                ),
            }
            for row in rows
        ]
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────
# NEW: Missed Opportunities
# ─────────────────────────────────────────────────────────────

@router.get("/missed-opportunities")
async def missed_opportunities(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Threads that went silent with no follow-up sent."""
    user_id = current_user["user_id"]

    try:
        count = (await db.execute(
            text("""
            SELECT COUNT(*)
            FROM email_threads et
            WHERE et.user_id = :uid
              AND et.is_dismissed = false
              AND et.replied_by_user = false
              AND et.last_sender_is_user = true
              AND et.last_message_at < NOW() - INTERVAL '3 days'
              AND NOT EXISTS (
                  SELECT 1 FROM followup_suggestions fs
                  WHERE fs.thread_id = et.id
                    AND fs.status IN ('sent', 'pending')
              )
            """),
            {"uid": user_id},
        )).scalar() or 0

        return {"missed_opportunities": int(count)}
    except Exception:
        return {"missed_opportunities": 0}


# ─────────────────────────────────────────────────────────────
# NEW: Follow-Up Score
# ─────────────────────────────────────────────────────────────

@router.get("/score")
async def followup_score(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Composite follow-up performance score 0–100.
    Formula: (reply_rate * 0.5) + (consistency * 0.3) + (timing * 0.2)
    """
    user_id = current_user["user_id"]

    try:
        # Reply rate component
        sent = (await db.execute(
            text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id=:uid AND status='sent'"),
            {"uid": user_id},
        )).scalar() or 0

        recovered = 0
        if sent > 0:
            rec_result = await db.execute(
                text("""
                SELECT COUNT(*) FROM followup_suggestions fs
                JOIN email_threads et ON et.id = fs.thread_id
                WHERE fs.user_id = :uid AND fs.status = 'sent'
                  AND et.last_sender_is_user = false
                  AND et.updated_at > fs.sent_at
                """),
                {"uid": user_id},
            )
            recovered = rec_result.scalar() or 0

        reply_rate   = (recovered / sent * 100) if sent > 0 else 0
        reply_score  = min(reply_rate, 100)

        # Consistency: sent in last 7 days vs. 30 days
        recent_sent = (await db.execute(
            text("""
            SELECT COUNT(*) FROM followup_suggestions
            WHERE user_id=:uid AND status='sent'
              AND sent_at > NOW() - INTERVAL '7 days'
            """),
            {"uid": user_id},
        )).scalar() or 0
        consistency_score = min(recent_sent * 10, 100)

        # Timing: ratio of on-time follow-ups (3–5 days ideal)
        total_with_timing = (await db.execute(
            text("""
            SELECT COUNT(*) FROM followup_suggestions fs
            JOIN email_threads et ON et.id = fs.thread_id
            WHERE fs.user_id = :uid AND fs.status = 'sent'
              AND fs.sent_at IS NOT NULL AND et.last_message_at IS NOT NULL
            """),
            {"uid": user_id},
        )).scalar() or 0

        ideal_timing = (await db.execute(
            text("""
            SELECT COUNT(*) FROM followup_suggestions fs
            JOIN email_threads et ON et.id = fs.thread_id
            WHERE fs.user_id = :uid AND fs.status = 'sent'
              AND fs.sent_at IS NOT NULL AND et.last_message_at IS NOT NULL
              AND EXTRACT(DAY FROM (fs.sent_at - et.last_message_at)) BETWEEN 2 AND 6
            """),
            {"uid": user_id},
        )).scalar() or 0

        timing_score = (ideal_timing / total_with_timing * 100) if total_with_timing > 0 else 50

        # Final weighted score
        final_score = round(
            (reply_score * 0.5) + (consistency_score * 0.3) + (timing_score * 0.2)
        )
        final_score = max(0, min(100, final_score))

        # Score label
        if final_score >= 70:
            label = "Excellent"
        elif final_score >= 50:
            label = "Good"
        elif final_score >= 30:
            label = "Improving"
        else:
            label = "Getting Started"

        return {
            "score":             final_score,
            "label":             label,
            "reply_rate":        round(reply_rate, 1),
            "consistency_score": round(consistency_score, 1),
            "timing_score":      round(timing_score, 1),
        }
    except Exception:
        return {"score": 0, "label": "Getting Started", "reply_rate": 0,
                "consistency_score": 0, "timing_score": 0}


# ─────────────────────────────────────────────────────────────
# ENHANCED: Insights endpoint (full version)
# ─────────────────────────────────────────────────────────────

@router.get("/insights")
async def get_insights(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    # ── Base counts ─────────────────────────────────────────
    followups_sent = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id=:uid AND status='sent'"),
        {"uid": user_id},
    )).scalar() or 0

    ready_to_send = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id=:uid AND status='pending'"),
        {"uid": user_id},
    )).scalar() or 0

    # ── Recovered conversations + avg reply time ─────────────
    recovered_conversations = 0
    avg_reply_time_hours    = 0.0

    try:
        result = await db.execute(
            text("""
            SELECT
                COUNT(*) AS recovered,
                AVG(EXTRACT(EPOCH FROM (et.updated_at - fs.sent_at)) / 3600.0) AS avg_hours
            FROM followup_suggestions fs
            JOIN email_threads et ON et.id = fs.thread_id
            WHERE fs.user_id = :uid
              AND fs.status = 'sent'
              AND fs.sent_at IS NOT NULL
              AND et.updated_at IS NOT NULL
              AND et.last_sender_is_user = false
              AND et.updated_at > fs.sent_at
            """),
            {"uid": user_id},
        )
        row = result.fetchone()
        if row:
            recovered_conversations = int(row[0] or 0)
            avg_reply_time_hours    = round(float(row[1] or 0.0), 1)
    except Exception:
        pass

    # ── Reply rate ───────────────────────────────────────────
    reply_rate = round(
        (recovered_conversations / followups_sent * 100)
        if followups_sent > 0 else 0.0, 1
    )

    # ── Best tone ────────────────────────────────────────────
    best_tone = None
    try:
        tone_result = await db.execute(
            text("""
            SELECT fs.tone,
                   COUNT(*) FILTER (
                       WHERE et.last_sender_is_user = false
                         AND et.updated_at > fs.sent_at
                   ) * 100.0 / NULLIF(COUNT(*), 0) AS rate
            FROM followup_suggestions fs
            JOIN email_threads et ON et.id = fs.thread_id
            WHERE fs.user_id = :uid AND fs.status = 'sent'
            GROUP BY fs.tone
            ORDER BY rate DESC NULLS LAST
            LIMIT 1
            """),
            {"uid": user_id},
        )
        tone_row = tone_result.fetchone()
        if tone_row and tone_row[1] and float(tone_row[1]) > 0:
            best_tone = tone_row[0]
    except Exception:
        pass

    # ── Best timing ──────────────────────────────────────────
    best_days = None
    try:
        timing_result = await db.execute(
            text("""
            SELECT
                EXTRACT(DAY FROM (fs.sent_at - et.last_message_at))::int AS days_waited,
                COUNT(*) FILTER (
                    WHERE et.last_sender_is_user = false
                      AND et.updated_at > fs.sent_at
                ) * 100.0 / NULLIF(COUNT(*), 0) AS rate
            FROM followup_suggestions fs
            JOIN email_threads et ON et.id = fs.thread_id
            WHERE fs.user_id = :uid AND fs.status = 'sent'
              AND fs.sent_at IS NOT NULL AND et.last_message_at IS NOT NULL
            GROUP BY days_waited
            HAVING COUNT(*) >= 2
            ORDER BY rate DESC NULLS LAST
            LIMIT 1
            """),
            {"uid": user_id},
        )
        timing_row = timing_result.fetchone()
        if timing_row:
            best_days = int(timing_row[0] or 0)
    except Exception:
        pass

    # ── Missed opportunities ─────────────────────────────────
    missed = 0
    try:
        missed = (await db.execute(
            text("""
            SELECT COUNT(*) FROM email_threads et
            WHERE et.user_id = :uid
              AND et.is_dismissed = false
              AND et.replied_by_user = false
              AND et.last_sender_is_user = true
              AND et.last_message_at < NOW() - INTERVAL '3 days'
              AND NOT EXISTS (
                  SELECT 1 FROM followup_suggestions fs
                  WHERE fs.thread_id = et.id AND fs.status IN ('sent','pending')
              )
            """),
            {"uid": user_id},
        )).scalar() or 0
    except Exception:
        pass

    # ── Dynamic insight messages ─────────────────────────────
    insights = []

    if followups_sent == 0:
        insights.append({
            "type": "tip",
            "text": "Send your first follow-up to start seeing performance insights here."
        })
    else:
        # Reply rate insight
        if reply_rate >= 40:
            insights.append({
                "type": "positive",
                "text": f"You recover {reply_rate:.0f}% of silent conversations — well above average. Keep it up!"
            })
        elif reply_rate >= 20:
            insights.append({
                "type": "neutral",
                "text": f"Your follow-ups recover {reply_rate:.0f}% of conversations. Consistency will improve this."
            })
        elif reply_rate > 0:
            insights.append({
                "type": "tip",
                "text": "Try a friendlier or more direct tone — small wording changes can significantly boost reply rates."
            })

        # Tone insight
        if best_tone:
            insights.append({
                "type": "positive",
                "text": f"Your '{best_tone}' tone gets the most replies. Use it more often."
            })

        # Timing insight
        if best_days is not None and best_days > 0:
            insights.append({
                "type": "positive",
                "text": f"You get more replies when following up after {best_days} day{'s' if best_days != 1 else ''}."
            })

        # Reply time insight
        if avg_reply_time_hours > 0:
            if avg_reply_time_hours < 24:
                insights.append({
                    "type": "positive",
                    "text": f"Contacts reply within {avg_reply_time_hours:.0f}h on average — your timing is working."
                })
            elif avg_reply_time_hours >= 72:
                insights.append({
                    "type": "tip",
                    "text": "Long reply times suggest following up earlier (2–3 days) may work better."
                })

        # Missed opportunities
        if missed > 5:
            insights.append({
                "type": "action",
                "text": f"You have {missed} conversations that need a follow-up. Don't let them go cold."
            })

        # Ready drafts
        if ready_to_send > 0:
            insights.append({
                "type": "action",
                "text": f"{ready_to_send} draft{'s' if ready_to_send != 1 else ''} ready to send — review and send them now."
            })

        # Recovery celebration
        if recovered_conversations > 0 and len(insights) < 3:
            insights.append({
                "type": "positive",
                "text": f"{recovered_conversations} conversation{'s' if recovered_conversations != 1 else ''} recovered that would have gone cold."
            })

    return {
        "recovered_conversations": recovered_conversations,
        "reply_rate":              reply_rate,
        "avg_reply_time_hours":    avg_reply_time_hours,
        "ready_to_send":           ready_to_send,
        "followups_sent":          followups_sent,
        "missed_opportunities":    int(missed),
        "best_tone":               best_tone,
        "best_days":               best_days,
        "insights":                insights[:3],
    }
