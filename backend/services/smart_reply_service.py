"""
Smart Reply Mode Service
========================
Isolated service for queue-based email sending.
NO existing services are modified — this is purely additive.

Responsibilities:
  - CRUD for smart_reply_settings (with mode: manual/auto)
  - Queue emails instead of sending immediately
  - Background worker: send due queued emails
  - Cancel queued emails
  - Daily limit enforcement
  - Generate AI replies on demand
  - Rate limiting
  - Reply logging
"""

import uuid
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import text

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Rate Limiting (in-memory, per-user)
# ─────────────────────────────────────────────
_rate_limit_store = {}  # user_id -> list of timestamps
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 10     # max replies per window per user


def check_rate_limit(user_id: str) -> tuple:
    """
    Check if user has exceeded rate limit.
    Returns (allowed: bool, remaining: int, reset_in: int).
    """
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW)

    if user_id not in _rate_limit_store:
        _rate_limit_store[user_id] = []

    # Clean old entries
    _rate_limit_store[user_id] = [
        ts for ts in _rate_limit_store[user_id]
        if ts > window_start
    ]

    count = len(_rate_limit_store[user_id])
    remaining = max(0, RATE_LIMIT_MAX - count)

    if count >= RATE_LIMIT_MAX:
        oldest = min(_rate_limit_store[user_id])
        reset_in = int((oldest + timedelta(seconds=RATE_LIMIT_WINDOW) - now).total_seconds())
        return False, 0, max(1, reset_in)

    return True, remaining, 0


def record_rate_limit(user_id: str):
    """Record a rate limit hit for the user."""
    if user_id not in _rate_limit_store:
        _rate_limit_store[user_id] = []
    _rate_limit_store[user_id].append(datetime.now(timezone.utc))


# ─────────────────────────────────────────────
# Settings CRUD
# ─────────────────────────────────────────────

def _deserialize_settings(data: dict) -> dict:
    """
    Normalize a smart_reply_settings row from the DB.
    - allowed_categories: stored as JSON TEXT string → deserialize to list
    - enabled / confirmed_first_use: stored as INTEGER (0/1) → convert to bool
    """
    # allowed_categories is stored as a JSON string in the TEXT column
    cats = data.get("allowed_categories", '["faq","inquiry"]')
    if isinstance(cats, str):
        try:
            cats = json.loads(cats)
        except (json.JSONDecodeError, TypeError):
            cats = ["faq", "inquiry"]
    data["allowed_categories"] = cats if isinstance(cats, list) else ["faq", "inquiry"]

    # Booleans stored as INTEGER
    data["enabled"] = bool(data.get("enabled", 0))
    data["confirmed_first_use"] = bool(data.get("confirmed_first_use", 0))

    if not data.get("smart_reply_mode"):
        data["smart_reply_mode"] = "manual"

    return data


async def get_smart_reply_settings(db, user_id: str) -> dict:
    """
    Fetch Smart Reply settings for a user.
    Returns safe defaults if no row exists yet.
    """
    result = await db.execute(
        text("SELECT * FROM smart_reply_settings WHERE user_id = :uid"),
        {"uid": user_id},
    )
    row = result.fetchone()
    if not row:
        return {
            "id":                   None,
            "user_id":              user_id,
            "enabled":              False,
            "smart_reply_mode":     "manual",
            "confidence_threshold": 80,
            "daily_limit":          20,
            "delay_seconds":        120,
            "allowed_categories":   ["faq", "inquiry"],
            "confirmed_first_use":  False,
            "created_at":           None,
            "updated_at":           None,
        }
    return _deserialize_settings(dict(row._mapping))


async def upsert_smart_reply_settings(db, user_id: str, data: dict) -> dict:
    """
    Create or update Smart Reply settings for a user.
    - allowed_categories is serialized to a JSON string (TEXT column).
    - enabled / confirmed_first_use are stored as INTEGER (0/1).
    """
    cats = data.get("allowed_categories", ["faq", "inquiry"])
    if isinstance(cats, list):
        cats = json.dumps(cats)  # TEXT column expects JSON string

    await db.execute(
        text("""
        INSERT INTO smart_reply_settings
            (id, user_id, enabled, smart_reply_mode, confidence_threshold, daily_limit,
             delay_seconds, allowed_categories, confirmed_first_use)
        VALUES
            (:id, :uid, :enabled, :mode, :conf, :limit, :delay, :cats, :confirmed)
        ON CONFLICT (user_id) DO UPDATE SET
            enabled              = EXCLUDED.enabled,
            smart_reply_mode     = EXCLUDED.smart_reply_mode,
            confidence_threshold = EXCLUDED.confidence_threshold,
            daily_limit          = EXCLUDED.daily_limit,
            delay_seconds        = EXCLUDED.delay_seconds,
            allowed_categories   = EXCLUDED.allowed_categories,
            confirmed_first_use  = EXCLUDED.confirmed_first_use,
            updated_at           = CURRENT_TIMESTAMP
        """),
        {
            "id":        str(uuid.uuid4()),
            "uid":       user_id,
            "enabled":   1 if data.get("enabled") else 0,
            "mode":      data.get("smart_reply_mode", "manual"),
            "conf":      data.get("confidence_threshold", 80),
            "limit":     data.get("daily_limit", 20),
            "delay":     data.get("delay_seconds", 120),
            "cats":      cats,
            "confirmed": 1 if data.get("confirmed_first_use") else 0,
        },
    )
    await db.commit()
    return await get_smart_reply_settings(db, user_id)


# ─────────────────────────────────────────────
# Queue Management
# ─────────────────────────────────────────────

async def queue_email(
    db,
    user_id: str,
    followup: dict,
    delay_seconds: int,
) -> str:
    """
    Add an email to the send queue.
    Returns the new queue item ID.

    The email will NOT be sent until:
      - scheduled_at <= NOW()
      - cancelled = false
      - status = 'queued'
    """
    queue_id     = str(uuid.uuid4())
    scheduled_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)

    subject = followup.get("subject", "")
    if subject and not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    await db.execute(
        text("""
        INSERT INTO email_queue
            (id, user_id, followup_id, to_email, subject, body,
             status, scheduled_at, cancelled, created_at)
        VALUES
            (:id, :uid, :fid, :to, :subject, :body,
             'queued', :scheduled_at, false, NOW())
        """),
        {
            "id":           queue_id,
            "uid":          user_id,
            "fid":          str(followup.get("id", "")),
            "to":           followup.get("recipient_email") or followup.get("recipient", ""),
            "subject":      subject,
            "body":         followup.get("generated_text") or followup.get("ai_draft", ""),
            "scheduled_at": scheduled_at,
        },
    )
    await db.commit()

    logger.info(
        f"[SmartReply] Queued email {queue_id} for user {user_id} | "
        f"sends at {scheduled_at.isoformat()} ({delay_seconds}s delay)"
    )
    return queue_id


async def cancel_queued_email(db, queue_id: str, user_id: str) -> bool:
    """
    Cancel a queued email (user-initiated).
    Only succeeds if email is still in 'queued' state and not yet cancelled.
    Returns True if cancelled, False if not found / already sent.
    """
    result = await db.execute(
        text("""
        UPDATE email_queue
        SET status = 'cancelled',
            cancelled = true,
            cancelled_at = NOW()
        WHERE id = :id
          AND user_id = :uid
          AND status = 'queued'
          AND cancelled = false
        RETURNING id
        """),
        {"id": queue_id, "uid": user_id},
    )
    await db.commit()
    row = result.fetchone()
    if row:
        logger.info(f"[SmartReply] Email {queue_id} cancelled by user {user_id}")
    return row is not None


async def get_queued_emails(db, user_id: str, status: Optional[str] = None) -> list:
    """
    Fetch a user's email queue for display in the UI.
    Optional status filter: 'queued' | 'sent' | 'cancelled'
    """
    if status:
        result = await db.execute(
            text("""
            SELECT id, user_id, followup_id, to_email, subject,
                   status, scheduled_at, cancelled, created_at, sent_at, cancelled_at
            FROM email_queue
            WHERE user_id = :uid AND status = :status
            ORDER BY created_at DESC
            LIMIT 50
            """),
            {"uid": user_id, "status": status},
        )
    else:
        result = await db.execute(
            text("""
            SELECT id, user_id, followup_id, to_email, subject,
                   status, scheduled_at, cancelled, created_at, sent_at, cancelled_at
            FROM email_queue
            WHERE user_id = :uid
            ORDER BY created_at DESC
            LIMIT 50
            """),
            {"uid": user_id},
        )

    rows = result.fetchall()
    items = []
    for r in rows:
        item = dict(r._mapping)
        # Serialize datetimes to ISO strings for JSON response
        for field in ("scheduled_at", "created_at", "sent_at", "cancelled_at"):
            if item.get(field) and hasattr(item[field], "isoformat"):
                item[field] = item[field].isoformat()
        items.append(item)
    return items


# ─────────────────────────────────────────────
# Daily Limit
# ─────────────────────────────────────────────

async def get_daily_smart_reply_sent_count(db, user_id: str) -> int:
    """
    Count emails sent via Smart Reply queue today (calendar day, UTC).
    Used to enforce the daily_limit setting.
    """
    result = await db.execute(
        text("""
        SELECT COUNT(*)
        FROM email_queue
        WHERE user_id = :uid
          AND status = 'sent'
          AND created_at >= CURRENT_DATE
        """),
        {"uid": user_id},
    )
    return result.scalar() or 0


# ─────────────────────────────────────────────
# Confidence & Category Gate
# ─────────────────────────────────────────────

def passes_smart_reply_rules(
    settings: dict,
    confidence_score: Optional[int],
    category: Optional[str],
) -> tuple[bool, str]:
    """
    Check whether a followup passes Smart Reply rules before queuing.
    Returns (allowed: bool, reason: str).
    """
    if not settings.get("enabled"):
        return False, "Smart Reply Mode is disabled"

    threshold = settings.get("confidence_threshold", 80)
    if confidence_score is not None and confidence_score < threshold:
        return False, f"Confidence {confidence_score} below threshold {threshold}"

    allowed_cats = settings.get("allowed_categories") or []
    if allowed_cats and category and category.lower() not in [c.lower() for c in allowed_cats]:
        return False, f"Category '{category}' not in allowed list {allowed_cats}"

    return True, "ok"


# ─────────────────────────────────────────────
# Background Queue Worker
# ─────────────────────────────────────────────

async def process_email_queue(db, gmail_send_fn) -> dict:
    """
    Background worker — called from the cron loop.

    Fetches all queued emails where:
      - status = 'queued'
      - cancelled = false
      - scheduled_at <= NOW()

    Sends each using the existing gmail_send_fn (send_email from gmail_service).
    Updates status to 'sent' on success.
    Does NOT alter the existing cron lock or auto-send flow.
    """
    sent = errors = 0

    result = await db.execute(
        text("""
        SELECT
            eq.id,
            eq.user_id,
            eq.followup_id,
            eq.to_email,
            eq.subject,
            eq.body,
            eq.scheduled_at,
            ea.access_token,
            ea.refresh_token,
            ea.token_expiry
        FROM email_queue eq
        JOIN email_accounts ea
             ON ea.user_id = eq.user_id AND ea.is_active = true
        WHERE eq.status    = 'queued'
          AND eq.cancelled = false
          AND eq.scheduled_at <= NOW()
        ORDER BY eq.scheduled_at ASC
        LIMIT 100
        """),
    )
    due_emails = result.fetchall()

    if not due_emails:
        logger.info("[SmartReply Worker] No due emails in queue")
        return {"sent": 0, "errors": 0}

    logger.info(f"[SmartReply Worker] Processing {len(due_emails)} due email(s)")

    for row in due_emails:
        item = dict(row._mapping)
        try:
            db_tokens = {
                "access_token":  item["access_token"],
                "refresh_token": item["refresh_token"],
                "token_expiry":  item["token_expiry"],
            }

            # ── Use the existing gmail_service.send_email unchanged ──
            gmail_send_fn(
                db_tokens=db_tokens,
                to=item["to_email"],
                subject=item["subject"],
                body=item["body"],
            )

            # Mark queue item as sent
            await db.execute(
                text("""
                UPDATE email_queue
                SET status = 'sent', sent_at = NOW()
                WHERE id = :id
                """),
                {"id": item["id"]},
            )

            # If linked to a followup suggestion, update that too
            if item.get("followup_id"):
                await db.execute(
                    text("""
                    UPDATE followup_suggestions
                    SET status = 'sent', sent_at = NOW(), auto_sent = TRUE
                    WHERE id::text = :fid
                    """),
                    {"fid": item["followup_id"]},
                )

            sent += 1
            logger.info(f"[SmartReply Worker] Sent queue item {item['id']} → {item['to_email']}")

        except Exception as e:
            # Mark error but do not crash worker — continue to next item
            await db.execute(
                text("""
                UPDATE email_queue
                SET error_message = :err
                WHERE id = :id
                """),
                {"id": item["id"], "err": str(e)},
            )
            logger.error(f"[SmartReply Worker] Failed to send {item['id']}: {e}")
            errors += 1

    await db.commit()
    logger.info(f"[SmartReply Worker] Done — sent={sent}, errors={errors}")
    return {"sent": sent, "errors": errors}


# ─────────────────────────────────────────────
# Generate Reply (on-demand, for manual/suggestion mode)
# ─────────────────────────────────────────────

async def generate_reply(db, message: str, platform: str, user_id: str, user_settings: dict = None) -> dict:
    """
    Generate an AI reply for a given message.
    Used in manual/suggestion mode — does NOT auto-send.

    Args:
        db: Database session
        message: The incoming message/comment to reply to
        platform: Platform name (gmail, instagram, etc.)
        user_id: User ID
        user_settings: Optional user settings dict

    Returns:
        dict with reply text, confidence, tone, status
    """
    from services.openai_service import generate_followup_draft

    # Determine tone from user settings or default
    tone = "professional"
    if user_settings:
        # Could be extended with per-platform tone settings
        tone = user_settings.get("default_tone", "professional")

    try:
        # Generate reply using existing AI service
        reply_text = await generate_followup_draft(
            subject=message[:100],  # Use message as subject context
            snippet=message,
            days_silent=1,
            tone=tone,
        )

        confidence = 85  # Default confidence for generated replies

        # Log the generated reply
        await log_smart_reply(db, user_id, message, reply_text, platform, tone, "pending")

        return {
            "reply": reply_text,
            "confidence": confidence,
            "tone": tone,
            "status": "pending",
            "platform": platform,
        }

    except Exception as e:
        logger.error(f"[SmartReply] Generate reply failed for user {user_id}: {e}")
        # Fallback reply
        fallback = f"Hi,\n\nThank you for reaching out. I'll get back to you shortly.\n\nBest regards"
        await log_smart_reply(db, user_id, message, fallback, platform, tone, "fallback")
        return {
            "reply": fallback,
            "confidence": 50,
            "tone": tone,
            "status": "fallback",
            "platform": platform,
        }


# ─────────────────────────────────────────────
# Smart Reply Logging
# ─────────────────────────────────────────────

async def log_smart_reply(db, user_id: str, message: str, reply: str,
                          platform: str = "gmail", tone: str = "professional",
                          status: str = "pending", thread_id: str = None):
    """
    Log a smart reply for audit trail and history.
    """
    try:
        log_id = str(uuid.uuid4())
        await db.execute(
            text("""
            INSERT INTO smart_reply_logs
                (id, user_id, thread_id, message_snippet, generated_reply, platform, tone, status, created_at)
            VALUES
                (:id, :user_id, :thread_id, :message, :reply, :platform, :tone, :status, :created_at)
            """),
            {
                "id": log_id,
                "user_id": user_id,
                "thread_id": thread_id,
                "message": message[:500],  # Truncate long messages
                "reply": reply[:2000],
                "platform": platform,
                "tone": tone,
                "status": status,
                "created_at": datetime.now(timezone.utc),
            },
        )
        await db.commit()
        return log_id
    except Exception as e:
        logger.warning(f"[SmartReply] Log failed: {e}")
        return None


async def get_smart_reply_logs(db, user_id: str, limit: int = 20) -> list:
    """
    Get recent smart reply logs for a user.
    """
    result = await db.execute(
        text("""
        SELECT id, thread_id, message_snippet, generated_reply, platform, tone, status, created_at
        FROM smart_reply_logs
        WHERE user_id = :uid
        ORDER BY created_at DESC
        LIMIT :limit
        """),
        {"uid": user_id, "limit": limit},
    )
    rows = result.fetchall()
    items = []
    for r in rows:
        item = dict(r._mapping)
        if item.get("created_at") and hasattr(item["created_at"], "isoformat"):
            item["created_at"] = item["created_at"].isoformat()
        items.append(item)
    return items
