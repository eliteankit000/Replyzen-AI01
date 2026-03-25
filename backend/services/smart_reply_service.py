"""
Smart Reply Mode Service
========================
Isolated service for queue-based email sending.
NO existing services are modified — this is purely additive.

Responsibilities:
  - CRUD for smart_reply_settings
  - Queue emails instead of sending immediately
  - Background worker: send due queued emails
  - Cancel queued emails
  - Daily limit enforcement
"""

import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import text

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Settings CRUD
# ─────────────────────────────────────────────

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
            "confidence_threshold": 80,
            "daily_limit":          20,
            "delay_seconds":        120,
            "allowed_categories":   ["faq", "inquiry"],
            "confirmed_first_use":  False,
            "created_at":           None,
            "updated_at":           None,
        }
    return dict(row._mapping)


async def upsert_smart_reply_settings(db, user_id: str, data: dict) -> dict:
    """
    Create or update Smart Reply settings for a user.
    Only updates fields explicitly passed in `data`.
    """
    await db.execute(
        text("""
        INSERT INTO smart_reply_settings
            (id, user_id, enabled, confidence_threshold, daily_limit,
             delay_seconds, allowed_categories, confirmed_first_use)
        VALUES
            (:id, :uid, :enabled, :conf, :limit, :delay, :cats, :confirmed)
        ON CONFLICT (user_id) DO UPDATE SET
            enabled              = EXCLUDED.enabled,
            confidence_threshold = EXCLUDED.confidence_threshold,
            daily_limit          = EXCLUDED.daily_limit,
            delay_seconds        = EXCLUDED.delay_seconds,
            allowed_categories   = EXCLUDED.allowed_categories,
            confirmed_first_use  = EXCLUDED.confirmed_first_use,
            updated_at           = NOW()
        """),
        {
            "id":        str(uuid.uuid4()),
            "uid":       user_id,
            "enabled":   data.get("enabled", False),
            "conf":      data.get("confidence_threshold", 80),
            "limit":     data.get("daily_limit", 20),
            "delay":     data.get("delay_seconds", 120),
            "cats":      data.get("allowed_categories", ["faq", "inquiry"]),
            "confirmed": data.get("confirmed_first_use", False),
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
