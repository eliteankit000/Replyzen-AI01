"""
Auto-Send Cron Job Service - Enhanced with Smart Reply Mode
============================================================
CHANGES vs original:
  1. After safety check passes, check if Smart Reply Mode is enabled for user.
  2. If enabled  → queue email via email_queue (NOT sent immediately).
  3. If disabled → existing behavior: send immediately via gmail_service.
  4. At end of each cron run, the Smart Reply queue worker fires
     to send any due queued emails.

ALL existing logic (classify, score, filter, safety check, locking,
window checks, daily limits, logging) is 100% preserved and unchanged.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

from sqlalchemy import text

logger = logging.getLogger(__name__)

SessionLocal = None


def set_database(session_factory):
    global SessionLocal
    SessionLocal = session_factory


# ─────────────────────────────────────────────
# Distributed Cron Lock
# ─────────────────────────────────────────────
# UNCHANGED from original

async def acquire_cron_lock(db) -> bool:
    instance_id = str(uuid.uuid4())
    result = await db.execute(
        text("""
        INSERT INTO cron_locks(name, locked_at, locked_by)
        VALUES ('autosend', NOW(), :id)
        ON CONFLICT (name)
        DO UPDATE
        SET locked_at = NOW(), locked_by = :id
        WHERE cron_locks.locked_at < NOW() - INTERVAL '5 minutes'
        RETURNING locked_by
        """),
        {"id": instance_id},
    )
    row = result.fetchone()
    if row and row.locked_by == instance_id:
        logger.info("Cron lock acquired")
        return True
    logger.info("Cron lock held by another instance")
    return False


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
# UNCHANGED from original

async def get_user_send_window(db, user_id: str) -> dict:
    result = await db.execute(
        text("""
        SELECT auto_send, send_window_start, send_window_end,
               daily_send_limit, timezone
        FROM user_settings WHERE user_id = :uid
        """),
        {"uid": user_id},
    )
    row = result.fetchone()
    if not row:
        return {"enabled": False, "start": "09:00", "end": "18:00",
                "daily_limit": 20, "timezone": "UTC"}
    return {
        "enabled":     row.auto_send,
        "start":       row.send_window_start,
        "end":         row.send_window_end,
        "daily_limit": row.daily_send_limit,
        "timezone":    row.timezone,
    }


def is_within_send_window(start_time: str, end_time: str) -> bool:
    now     = datetime.now(timezone.utc)
    current = now.strftime("%H:%M")
    if start_time <= end_time:
        return start_time <= current <= end_time
    return current >= start_time or current <= end_time


async def get_daily_send_count(db, user_id: str) -> int:
    result = await db.execute(
        text("""
        SELECT COUNT(*) FROM auto_send_logs
        WHERE user_id = :uid AND status = 'sent' AND sent_at >= CURRENT_DATE
        """),
        {"uid": user_id},
    )
    return result.scalar() or 0


async def log_auto_send(db, user_id, followup_id, status, error=None):
    await db.execute(
        text("""
        INSERT INTO auto_send_logs (id, user_id, followup_id, status, error, sent_at)
        VALUES (:id, :uid, :fid, :status, :error, :sent_at)
        """),
        {
            "id":      str(uuid.uuid4()),
            "uid":     user_id,
            "fid":     followup_id,
            "status":  status,
            "error":   error,
            "sent_at": datetime.now(timezone.utc),
        },
    )


async def log_followup_action(db, thread_id, user_id, status, reason=None):
    """Log to followup_logs table for audit trail."""
    try:
        await db.execute(
            text("""
            INSERT INTO followup_logs (id, thread_id, user_id, status, reason, created_at)
            VALUES (:id, :tid, :uid, :status, :reason, :now)
            """),
            {
                "id":     str(uuid.uuid4()),
                "tid":    thread_id,
                "uid":    user_id,
                "status": status,
                "reason": reason,
                "now":    datetime.now(timezone.utc),
            },
        )
    except Exception as e:
        logger.warning(f"followup_log insert failed: {e}")


# ─────────────────────────────────────────────
# Intelligence Layer: Classify & Score
# ─────────────────────────────────────────────
# UNCHANGED from original

async def classify_and_score_threads(db, user_id: str):
    """
    Step 1 of cron: classify unclassified threads, score priority,
    mark filtered threads so they never enter the queue.
    """
    from services.classification_service import classify_thread, calculate_priority
    from services.thread_filter_service import is_automated_sender, is_automated_subject

    result = await db.execute(
        text("""
        SELECT id, subject, snippet, last_message_from, last_message_at,
               is_dismissed, replied_by_user, last_sender_is_user,
               EXTRACT(DAY FROM (NOW() - last_message_at))::int AS days_silent
        FROM email_threads
        WHERE user_id = :uid
          AND (type IS NULL OR type = 'other')
          AND is_dismissed = false
        LIMIT 100
        """),
        {"uid": user_id},
    )
    threads = result.fetchall()

    for row in threads:
        t = dict(row._mapping)
        thread_id   = t["id"]
        sender      = t.get("last_message_from", "")
        subject     = t.get("subject", "")
        days_silent = t.get("days_silent") or 0

        is_auto     = is_automated_sender(sender) or is_automated_subject(subject)
        is_filtered = is_auto or bool(t.get("is_dismissed")) or bool(t.get("replied_by_user"))

        if is_filtered:
            await db.execute(
                text("""
                UPDATE email_threads
                SET type = 'notification', importance = 'low',
                    is_actionable = false, priority_score = 0,
                    priority_level = 'low', is_filtered = true,
                    updated_at = NOW()
                WHERE id = :tid
                """),
                {"tid": thread_id},
            )
            await log_followup_action(db, thread_id, user_id, "filtered", "automated or dismissed")
            continue

        classification = await classify_thread(t)
        thread_type    = classification["type"]

        priority = calculate_priority(
            thread_type=thread_type,
            days_silent=days_silent,
            last_sender_is_user=bool(t.get("last_sender_is_user")),
        )

        should_filter = thread_type in ("newsletter", "notification") or not classification["is_actionable"]

        await db.execute(
            text("""
            UPDATE email_threads
            SET type = :type,
                importance = :importance,
                is_actionable = :actionable,
                priority_score = :score,
                priority_level = :level,
                is_filtered = :filtered,
                updated_at = NOW()
            WHERE id = :tid
            """),
            {
                "type":       thread_type,
                "importance": classification["importance"],
                "actionable": classification["is_actionable"],
                "score":      priority["score"],
                "level":      priority["level"],
                "filtered":   should_filter,
                "tid":        thread_id,
            },
        )

    await db.commit()
    logger.info(f"Classified {len(threads)} threads for user {user_id}")


# ─────────────────────────────────────────────
# Auto-Send Safety Layer
# ─────────────────────────────────────────────
# UNCHANGED from original

async def auto_send_safety_check(db, followup: dict) -> tuple[bool, str]:
    """
    Before sending, verify:
    1. Thread is still silent (no reply received)
    2. Last sender is NOT the user
    3. Thread not dismissed
    4. Priority is high
    """
    result = await db.execute(
        text("""
        SELECT last_sender_is_user, is_dismissed, replied_by_user,
               priority_level, last_message_at
        FROM email_threads WHERE id = :tid
        """),
        {"tid": followup.get("thread_id")},
    )
    thread = result.fetchone()
    if not thread:
        return False, "Thread not found"

    t = dict(thread._mapping)

    if t.get("is_dismissed"):
        return False, "Thread dismissed"
    if t.get("replied_by_user"):
        return False, "User already replied"
    if t.get("last_sender_is_user"):
        return False, "Awaiting recipient reply"
    if t.get("priority_level") not in ("high", "medium"):
        return False, f"Priority too low ({t.get('priority_level')})"

    return True, "ok"


# ─────────────────────────────────────────────
# Send Email (direct — used when Smart Reply is OFF)
# ─────────────────────────────────────────────
# UNCHANGED from original

async def send_followup_email(followup: dict, account: dict) -> bool:
    try:
        from services.gmail_service import send_email

        subject = followup.get("subject") or "Follow-up"
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        db_tokens = {
            "access_token":  account.get("access_token"),
            "refresh_token": account.get("refresh_token"),
            "token_expiry":  account.get("token_expiry"),
        }

        send_email(
            db_tokens=db_tokens,
            to=followup.get("recipient_email") or followup.get("recipient"),
            subject=subject,
            body=followup.get("generated_text") or followup.get("ai_draft"),
            thread_id=followup.get("gmail_thread_id"),
        )
        return True
    except Exception as e:
        logger.warning(f"Follow-up send failed ({followup.get('id')}): {e}")
        return False


# ─────────────────────────────────────────────
# NEW: Smart Reply Gate
# ─────────────────────────────────────────────

async def route_followup_via_smart_reply_or_direct(
    db,
    user_id: str,
    followup_dict: dict,
) -> tuple[str, str]:
    """
    Decision point after safety check passes:

    IF Smart Reply Mode is enabled for this user:
      → Queue the email (do NOT send now)
      → Return ('queued', queue_id)

    ELSE (Smart Reply disabled):
      → Send immediately via existing gmail logic
      → Return ('sent', '') or ('error', reason)

    This is the ONLY new logic injected into process_auto_send_queue.
    Everything else in that function is 100% unchanged.
    """
    from services.smart_reply_service import (
        get_smart_reply_settings,
        passes_smart_reply_rules,
        queue_email,
        get_daily_smart_reply_sent_count,
    )

    sr_settings = await get_smart_reply_settings(db, user_id)

    if not sr_settings.get("enabled"):
        # ── Original behavior: send immediately ──────────────────────────
        success = await send_followup_email(followup_dict, followup_dict)
        if success:
            return ("sent", "")
        return ("error", "Send failed")

    # ── Smart Reply Mode is ON: apply rules then queue ───────────────────

    confidence = followup_dict.get("confidence_score")
    category   = followup_dict.get("category") or followup_dict.get("type")

    allowed, reason = passes_smart_reply_rules(sr_settings, confidence, category)
    if not allowed:
        logger.info(f"[SmartReply] Skipped followup {followup_dict['id']}: {reason}")
        return ("skipped", reason)

    # Check Smart Reply's own daily limit (separate from legacy auto-send limit)
    daily_sr_count = await get_daily_smart_reply_sent_count(db, user_id)
    if daily_sr_count >= sr_settings["daily_limit"]:
        logger.info(f"[SmartReply] Daily limit reached for user {user_id}")
        return ("skipped", "Smart Reply daily limit reached")

    # Queue it — email will be sent after delay_seconds
    queue_id = await queue_email(db, user_id, followup_dict, sr_settings["delay_seconds"])

    # Mark followup as queued (not sent yet) so cron won't pick it up again
    await db.execute(
        text("UPDATE followup_suggestions SET status = 'queued' WHERE id = :id"),
        {"id": followup_dict["id"]},
    )

    logger.info(
        f"[SmartReply] Queued followup {followup_dict['id']} as queue item {queue_id} "
        f"(delay={sr_settings['delay_seconds']}s)"
    )
    return ("queued", queue_id)


# ─────────────────────────────────────────────
# Main Cron Processor
# ─────────────────────────────────────────────

async def process_auto_send_queue():
    logger.info("Starting auto-send cron job")
    processed = sent = errors = 0

    if SessionLocal is None:
        logger.error("Database session not configured")
        return {"processed": 0, "sent": 0, "errors": 0}

    async with SessionLocal() as db:
        if not await acquire_cron_lock(db):
            logger.info("Another instance holds cron lock. Skipping run.")
            return {"processed": 0, "sent": 0, "errors": 0}

        pending_check = await db.execute(
            text("SELECT COUNT(*) FROM followup_suggestions WHERE status='pending'")
        )
        if pending_check.scalar() == 0:
            logger.info("No pending followups for auto-send")
            # Still run Smart Reply worker for any previously queued emails
            await _run_smart_reply_worker(db)
            return {"processed": 0, "sent": 0, "errors": 0}

        users_result = await db.execute(
            text("SELECT user_id FROM user_settings WHERE auto_send = TRUE")
        )
        users = users_result.fetchall()

        for user_row in users:
            user_id     = user_row.user_id
            send_window = await get_user_send_window(db, user_id)

            if not send_window["enabled"]:
                continue
            if not is_within_send_window(send_window["start"], send_window["end"]):
                continue

            daily_count = await get_daily_send_count(db, user_id)
            if daily_count >= send_window["daily_limit"]:
                continue

            # ─── Step 1: Classify & score unprocessed threads ───
            await classify_and_score_threads(db, user_id)

            remaining = send_window["daily_limit"] - daily_count

            # ─── Step 2: Fetch pending followups ───
            result = await db.execute(
                text("""
                SELECT fs.*, et.subject, et.last_message_from AS recipient_email,
                       et.thread_id AS gmail_thread_id, et.priority_level,
                       ea.access_token, ea.refresh_token, ea.token_expiry
                FROM followup_suggestions fs
                JOIN email_threads et ON et.id = fs.thread_id
                JOIN email_accounts ea ON ea.user_id = fs.user_id AND ea.is_active = true
                WHERE fs.user_id = :uid
                  AND fs.status = 'pending'
                  AND (et.is_filtered = false OR et.is_filtered IS NULL)
                  AND (et.is_actionable = true OR et.is_actionable IS NULL)
                ORDER BY et.priority_score DESC NULLS LAST
                LIMIT :lim
                """),
                {"uid": user_id, "lim": remaining},
            )
            followups = result.fetchall()

            for f in followups:
                processed += 1
                followup_dict = dict(f._mapping)

                # ─── Step 3: Safety check (UNCHANGED) ───
                ok, reason = await auto_send_safety_check(db, followup_dict)
                if not ok:
                    logger.info(f"Auto-send skipped ({followup_dict['id']}): {reason}")
                    await log_followup_action(db, followup_dict.get("thread_id"),
                                              user_id, "cancelled", reason)
                    errors += 1
                    continue

                # ─── Step 4: NEW — Route via Smart Reply or send directly ───
                outcome, detail = await route_followup_via_smart_reply_or_direct(
                    db, user_id, followup_dict
                )

                if outcome == "sent":
                    # Direct send succeeded (Smart Reply OFF) — same as original
                    await db.execute(
                        text("""
                        UPDATE followup_suggestions
                        SET status='sent', sent_at=NOW(), auto_sent=TRUE
                        WHERE id=:id
                        """),
                        {"id": followup_dict["id"]},
                    )
                    await db.execute(
                        text("""
                        UPDATE email_threads
                        SET replied_by_user=true, last_sender_is_user=true,
                            last_followup_sent_at=NOW(), updated_at=NOW()
                        WHERE id=:tid
                        """),
                        {"tid": followup_dict["thread_id"]},
                    )
                    await log_auto_send(db, user_id, followup_dict["id"], "sent")
                    await log_followup_action(db, followup_dict.get("thread_id"),
                                              user_id, "sent")
                    sent += 1

                elif outcome == "queued":
                    # Queued via Smart Reply — log it, no immediate send
                    await log_auto_send(db, user_id, followup_dict["id"], "queued")
                    await log_followup_action(
                        db, followup_dict.get("thread_id"),
                        user_id, "queued", f"Smart Reply queue item: {detail}"
                    )
                    sent += 1  # count as "processed successfully"

                elif outcome in ("error", "skipped"):
                    await log_auto_send(db, user_id, followup_dict["id"], "error", detail)
                    errors += 1

                await asyncio.sleep(1)

        await db.commit()

        # ─── Step 5: NEW — Process due Smart Reply queue items ───────────────
        await _run_smart_reply_worker(db)

    result = {"processed": processed, "sent": sent, "errors": errors}
    logger.info(f"Auto-send cron job completed: {result}")
    return result


async def _run_smart_reply_worker(db):
    """
    Runs at the end of every cron cycle.
    Sends queued emails whose delay window has elapsed.
    """
    try:
        from services.smart_reply_service import process_email_queue
        from services.gmail_service import send_email
        worker_result = await process_email_queue(db, send_email)
        logger.info(f"Smart Reply worker result: {worker_result}")
    except Exception as e:
        logger.error(f"Smart Reply worker error: {e}")


# ─────────────────────────────────────────────
# Cron Loop
# ─────────────────────────────────────────────
# UNCHANGED from original

async def run_cron_loop(interval_minutes: int = 30):
    logger.info(f"Starting auto-send cron loop ({interval_minutes} minutes)")
    while True:
        try:
            await process_auto_send_queue()
        except Exception as e:
            logger.warning(f"Cron loop error: {e}")
        await asyncio.sleep(interval_minutes * 60)
