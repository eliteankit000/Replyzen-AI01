from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from plan_permissions import get_user_plan, check_analytics_allowed
from datetime import datetime, timezone, timedelta, date

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# ─────────────────────────────────────────────────────────────
# Automated sender/domain patterns to exclude from contacts
# ─────────────────────────────────────────────────────────────
AUTOMATED_FILTERS = [
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "notification", "notifications", "alerts", "alert",
    "updates", "update", "newsletter", "digest",
    "mailer", "bounce", "automated", "system",
    "support@", "billing@", "admin@", "info@",
    "hello@notify", "notify.", "hello@mail",
    # Social/promo platforms
    "linkedin.com", "quora.com", "reddit", "twitter",
    "facebook", "instagram", "youtube", "tiktok",
    # E-commerce / SaaS marketing
    "shopify", "etsy", "amazon", "ebay", "flipkart",
    "myprotein", "udemy", "coursera", "skillshare",
    "mongodb", "replit", "github", "gitlab",
    "stripe", "paypal", "razorpay", "paddle",
    "vercel", "railway", "netlify", "heroku",
    "sendgrid", "mailchimp", "hubspot", "salesforce",
    # Banks / finance
    "bank", "axis", "hdfc", "icici", "sbi", "kotak",
    "paytm", "phonepe", "gpay",
    # Common system patterns
    "@email.", "@mail.", "@em.", "@e.",
]


def build_contact_filters():
    """Build SQL WHERE clauses to filter automated senders."""
    clauses = []
    for pattern in AUTOMATED_FILTERS:
        clauses.append(f"last_message_from NOT ILIKE '%{pattern}%'")
    return " AND ".join(clauses)


# ─────────────────────────────────────────────────────────────
# Overview
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

    total_followups = followups_sent + followups_pending + followups_dismissed
    response_rate   = round((followups_sent / total_followups * 100) if total_followups > 0 else 0, 1)

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
# Followups Over Time — FIXED: date object not string
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

    result = await db.execute(
        text("""
        SELECT date, followups_generated, followups_sent
        FROM usage_tracking
        WHERE user_id = :uid AND date >= :start
        ORDER BY date ASC
        """),
        {"uid": user_id, "start": start_date.date()},
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
# Top Contacts — FIXED: filters all automated/promo senders
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
          AND is_automated = false
          AND last_message_from IS NOT NULL
          AND last_message_from != ''
          -- Hard keyword filters
          AND last_message_from NOT ILIKE '%noreply%'
          AND last_message_from NOT ILIKE '%no-reply%'
          AND last_message_from NOT ILIKE '%donotreply%'
          AND last_message_from NOT ILIKE '%notification%'
          AND last_message_from NOT ILIKE '%newsletter%'
          AND last_message_from NOT ILIKE '%digest%'
          AND last_message_from NOT ILIKE '%alerts%'
          AND last_message_from NOT ILIKE '%mailer%'
          AND last_message_from NOT ILIKE '%bounce%'
          AND last_message_from NOT ILIKE '%automated%'
          AND last_message_from NOT ILIKE '%unsubscribe%'
          -- Marketing email subdomain patterns
          AND last_message_from NOT ILIKE '%@em.%'
          AND last_message_from NOT ILIKE '%@em1.%'
          AND last_message_from NOT ILIKE '%@em2.%'
          AND last_message_from NOT ILIKE '%@em3.%'
          AND last_message_from NOT ILIKE '%@nl.%'
          AND last_message_from NOT ILIKE '%@m.%'
          AND last_message_from NOT ILIKE '%@mail.%'
          AND last_message_from NOT ILIKE '%@email.%'
          AND last_message_from NOT ILIKE '%@emaila.%'
          AND last_message_from NOT ILIKE '%@news.%'
          AND last_message_from NOT ILIKE '%@info.%'
          AND last_message_from NOT ILIKE '%@get.%'
          AND last_message_from NOT ILIKE '%@go.%'
          AND last_message_from NOT ILIKE '%@send.%'
          AND last_message_from NOT ILIKE '%@updates.%'
          AND last_message_from NOT ILIKE '%@notify.%'
          AND last_message_from NOT ILIKE '%@e.%'
          -- Known automated domains/services
          AND last_message_from NOT ILIKE '%cloudflare%'
          AND last_message_from NOT ILIKE '%ngrok%'
          AND last_message_from NOT ILIKE '%namecheap%'
          AND last_message_from NOT ILIKE '%nutrabay%'
          AND last_message_from NOT ILIKE '%insideapple%'
          AND last_message_from NOT ILIKE '%1mg%'
          AND last_message_from NOT ILIKE '%apple.com%'
          AND last_message_from NOT ILIKE '%linkedin%'
          AND last_message_from NOT ILIKE '%quora%'
          AND last_message_from NOT ILIKE '%reddit%'
          AND last_message_from NOT ILIKE '%twitter%'
          AND last_message_from NOT ILIKE '%facebook%'
          AND last_message_from NOT ILIKE '%instagram%'
          AND last_message_from NOT ILIKE '%youtube%'
          AND last_message_from NOT ILIKE '%shopify%'
          AND last_message_from NOT ILIKE '%mongodb%'
          AND last_message_from NOT ILIKE '%replit%'
          AND last_message_from NOT ILIKE '%github%'
          AND last_message_from NOT ILIKE '%vercel%'
          AND last_message_from NOT ILIKE '%railway%'
          AND last_message_from NOT ILIKE '%netlify%'
          AND last_message_from NOT ILIKE '%heroku%'
          AND last_message_from NOT ILIKE '%stripe%'
          AND last_message_from NOT ILIKE '%paypal%'
          AND last_message_from NOT ILIKE '%razorpay%'
          AND last_message_from NOT ILIKE '%paddle%'
          AND last_message_from NOT ILIKE '%bank%'
          AND last_message_from NOT ILIKE '%axis%'
          AND last_message_from NOT ILIKE '%hdfc%'
          AND last_message_from NOT ILIKE '%icici%'
          AND last_message_from NOT ILIKE '%udemy%'
          AND last_message_from NOT ILIKE '%coursera%'
          AND last_message_from NOT ILIKE '%myprotein%'
          AND last_message_from NOT ILIKE '%amazon%'
          AND last_message_from NOT ILIKE '%flipkart%'
          AND last_message_from NOT ILIKE '%etsy%'
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
# Tone Performance
# ─────────────────────────────────────────────────────────────

@router.get("/tone-performance")
async def tone_performance(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
# Timing Performance
# ─────────────────────────────────────────────────────────────

@router.get("/timing-performance")
async def timing_performance(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
# Missed Opportunities
# ─────────────────────────────────────────────────────────────

@router.get("/missed-opportunities")
async def missed_opportunities(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    try:
        # ✅ Use is_opportunity to match exactly what /threads/silent shows
        count = (await db.execute(
            text("""
            SELECT COUNT(*) FROM email_threads et
            WHERE et.user_id = :uid
              AND et.is_dismissed = false
              AND et.replied_by_user = false
              AND et.is_opportunity = true
              AND (et.is_filtered = false OR et.is_filtered IS NULL)
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
# Follow-Up Score
# ─────────────────────────────────────────────────────────────

@router.get("/score")
async def followup_score(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    try:
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

        reply_rate        = (recovered / sent * 100) if sent > 0 else 0
        reply_score       = min(reply_rate, 100)

        recent_sent = (await db.execute(
            text("""
            SELECT COUNT(*) FROM followup_suggestions
            WHERE user_id=:uid AND status='sent'
              AND sent_at > NOW() - INTERVAL '7 days'
            """),
            {"uid": user_id},
        )).scalar() or 0
        consistency_score = min(recent_sent * 10, 100)

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

        timing_score  = (ideal_timing / total_with_timing * 100) if total_with_timing > 0 else 50
        final_score   = round((reply_score * 0.5) + (consistency_score * 0.3) + (timing_score * 0.2))
        final_score   = max(0, min(100, final_score))

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
# Insights — FIXED: missed count now matches Opportunities page
# ─────────────────────────────────────────────────────────────

@router.get("/insights")
async def get_insights(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    # Base counts
    followups_sent = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id=:uid AND status='sent'"),
        {"uid": user_id},
    )).scalar() or 0

    ready_to_send = (await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id=:uid AND status='pending'"),
        {"uid": user_id},
    )).scalar() or 0

    # Recovered conversations + avg reply time
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

    reply_rate = round(
        (recovered_conversations / followups_sent * 100)
        if followups_sent > 0 else 0.0, 1
    )

    # Best tone
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

    # Best timing
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

    # ✅ FIXED: Missed opportunities — matches /threads/silent exactly
    missed = 0
    try:
        missed = (await db.execute(
            text("""
            SELECT COUNT(*) FROM email_threads et
            WHERE et.user_id = :uid
              AND et.is_dismissed = false
              AND et.replied_by_user = false
              AND et.is_opportunity = true
              AND (et.is_filtered = false OR et.is_filtered IS NULL)
              AND NOT EXISTS (
                  SELECT 1 FROM followup_suggestions fs
                  WHERE fs.thread_id = et.id
                    AND fs.status IN ('sent', 'pending')
              )
            """),
            {"uid": user_id},
        )).scalar() or 0
    except Exception:
        # Fallback if is_opportunity column not yet migrated
        try:
            missed = (await db.execute(
                text("""
                SELECT COUNT(*) FROM email_threads et
                WHERE et.user_id = :uid
                  AND et.is_dismissed = false
                  AND et.replied_by_user = false
                  AND et.last_sender_is_user = true
                  AND (et.is_automated = false OR et.is_automated IS NULL)
                  AND NOT EXISTS (
                      SELECT 1 FROM followup_suggestions fs
                      WHERE fs.thread_id = et.id
                        AND fs.status IN ('sent', 'pending')
                  )
                """),
                {"uid": user_id},
            )).scalar() or 0
        except Exception:
            missed = 0

    # Dynamic insight messages
    insights = []

    if followups_sent == 0:
        insights.append({
            "type": "tip",
            "text": "Send your first follow-up to start seeing performance insights here."
        })
    else:
        if reply_rate >= 40:
            insights.append({
                "type": "positive",
                "text": f"You recover {reply_rate:.0f}% of silent conversations — well above average!"
            })
        elif reply_rate >= 20:
            insights.append({
                "type": "neutral",
                "text": f"Your follow-ups recover {reply_rate:.0f}% of conversations. Consistency will improve this."
            })
        elif reply_rate > 0:
            insights.append({
                "type": "tip",
                "text": "Try a friendlier or more direct tone — small changes can significantly boost reply rates."
            })

        if best_tone:
            insights.append({
                "type": "positive",
                "text": f"Your '{best_tone}' tone gets the most replies. Use it more often."
            })

        if best_days is not None and best_days > 0:
            insights.append({
                "type": "positive",
                "text": f"You get more replies when following up after {best_days} day{'s' if best_days != 1 else ''}."
            })

        if avg_reply_time_hours > 0:
            if avg_reply_time_hours < 24:
                insights.append({
                    "type": "positive",
                    "text": f"Contacts reply within {avg_reply_time_hours:.0f}h on average — great timing!"
                })
            elif avg_reply_time_hours >= 72:
                insights.append({
                    "type": "tip",
                    "text": "Long reply times suggest following up earlier (2–3 days) may work better."
                })

        if missed > 0:
            insights.append({
                "type": "action",
                "text": f"You have {missed} conversation{'s' if missed != 1 else ''} that need a follow-up — don't let them go cold."
            })

        if ready_to_send > 0:
            insights.append({
                "type": "action",
                "text": f"{ready_to_send} draft{'s' if ready_to_send != 1 else ''} ready to send — review and send them now."
            })

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
