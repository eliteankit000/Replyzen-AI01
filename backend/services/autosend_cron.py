"""
Auto-Send Cron Job Service - SQLAlchemy Version
Background worker that automatically sends approved follow-up emails.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
import uuid

from sqlalchemy import text

logger = logging.getLogger(__name__)

SessionLocal = None


def set_database(session_factory):
    """
    Store SQLAlchemy session factory.
    """
    global SessionLocal
    SessionLocal = session_factory


# ---------------------------------------------------------
# Distributed Cron Lock (Prevents multi-server duplicate runs)
# ---------------------------------------------------------

async def acquire_cron_lock(db) -> bool:
    """
    Acquire distributed cron lock using database.
    Only one server instance will run the cron job.
    """

    instance_id = str(uuid.uuid4())

    result = await db.execute(
        text("""
        INSERT INTO cron_locks(name, locked_at, locked_by)
        VALUES ('autosend', NOW(), :id)
        ON CONFLICT (name)
        DO UPDATE
        SET locked_at = NOW(),
            locked_by = :id
        WHERE cron_locks.locked_at < NOW() - INTERVAL '5 minutes'
        RETURNING locked_by
        """),
        {"id": instance_id}
    )

    row = result.fetchone()

    if row and row.locked_by == instance_id:
        logger.info("Cron lock acquired")
        return True

    logger.info("Cron lock held by another instance")
    return False


# ---------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------

async def get_user_send_window(db, user_id: str) -> dict:

    result = await db.execute(
        text("""
        SELECT auto_send,
               send_window_start,
               send_window_end,
               daily_send_limit,
               timezone
        FROM user_settings
        WHERE user_id = :uid
        """),
        {"uid": user_id}
    )

    row = result.fetchone()

    if not row:
        return {
            "enabled": False,
            "start": "09:00",
            "end": "18:00",
            "daily_limit": 20,
            "timezone": "UTC"
        }

    return {
        "enabled": row.auto_send,
        "start": row.send_window_start,
        "end": row.send_window_end,
        "daily_limit": row.daily_send_limit,
        "timezone": row.timezone
    }


def is_within_send_window(start_time: str, end_time: str) -> bool:

    now = datetime.now(timezone.utc)
    current = now.strftime("%H:%M")

    if start_time <= end_time:
        return start_time <= current <= end_time

    return current >= start_time or current <= end_time


async def get_daily_send_count(db, user_id: str) -> int:

    result = await db.execute(
        text("""
        SELECT COUNT(*)
        FROM auto_send_logs
        WHERE user_id = :uid
        AND status = 'sent'
        AND sent_at >= CURRENT_DATE
        """),
        {"uid": user_id}
    )

    return result.scalar() or 0


async def log_auto_send(
    db,
    user_id: str,
    followup_id: str,
    status: str,
    error: Optional[str] = None
):

    await db.execute(
        text("""
        INSERT INTO auto_send_logs
        (id,user_id,followup_id,status,error,sent_at)
        VALUES
        (:id,:uid,:fid,:status,:error,:sent_at)
        """),
        {
            "id": str(uuid.uuid4()),
            "uid": user_id,
            "fid": followup_id,
            "status": status,
            "error": error,
            "sent_at": datetime.now(timezone.utc)
        }
    )


# ---------------------------------------------------------
# Send Email
# ---------------------------------------------------------

async def send_followup_email(followup: dict, account: dict) -> bool:

    try:

        from services.gmail_service import send_email

        subject = followup.get("subject") or "Follow-up"

        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        send_email(
            encrypted_tokens={
                "access_token_encrypted": account.get("access_token_encrypted"),
                "refresh_token_encrypted": account.get("refresh_token_encrypted"),
                "token_expiry": account.get("token_expiry")
            },
            to=followup.get("recipient"),
            subject=subject,
            body=followup.get("ai_draft"),
            thread_id=followup.get("thread_id")
        )

        return True

    except Exception as e:
        logger.warning(f"Follow-up send failed ({followup.get('id')}): {e}")
        return False


# ---------------------------------------------------------
# Main Cron Processor
# ---------------------------------------------------------

async def process_auto_send_queue():

    logger.info("Starting auto-send cron job")

    processed = 0
    sent = 0
    errors = 0

    if SessionLocal is None:
        logger.error("Database session not configured")
        return {"processed": 0, "sent": 0, "errors": 0}

    async with SessionLocal() as db:

        # Acquire distributed cron lock
        if not await acquire_cron_lock(db):
            logger.info("Another instance holds cron lock. Skipping run.")
            return {"processed": 0, "sent": 0, "errors": 0}

        # Early exit if no pending followups
        pending_check = await db.execute(
            text("SELECT COUNT(*) FROM followup_suggestions WHERE status='pending'")
        )

        if pending_check.scalar() == 0:
            logger.info("No pending followups for auto-send")
            return {"processed": 0, "sent": 0, "errors": 0}

        users = await db.execute(
            text("""
            SELECT user_id
            FROM user_settings
            WHERE auto_send = TRUE
            """)
        )

        users = users.fetchall()

        for user in users:

            user_id = user.user_id

            send_window = await get_user_send_window(db, user_id)

            if not send_window["enabled"]:
                continue

            if not is_within_send_window(send_window["start"], send_window["end"]):
                continue

            daily_count = await get_daily_send_count(db, user_id)

            if daily_count >= send_window["daily_limit"]:
                continue

            remaining_limit = send_window["daily_limit"] - daily_count

            result = await db.execute(
                text("""
                SELECT *
                FROM followup_suggestions
                WHERE user_id = :uid
                AND status = 'pending'
                """),
                {"uid": user_id}
            )

            followups = result.fetchall()[:remaining_limit]

            for f in followups:

                processed += 1

                if not f.account_id:
                    await log_auto_send(db, user_id, f.id, "error", "Missing account_id")
                    errors += 1
                    continue

                account_result = await db.execute(
                    text("""
                    SELECT *
                    FROM email_accounts
                    WHERE id = :aid
                    """),
                    {"aid": f.account_id}
                )

                account = account_result.fetchone()

                if not account:
                    await log_auto_send(db, user_id, f.id, "error", "Account not found")
                    errors += 1
                    continue

                success = await send_followup_email(
                    dict(f._mapping),
                    dict(account._mapping)
                )

                if success:

                    await db.execute(
                        text("""
                        UPDATE followup_suggestions
                        SET status='sent',
                            sent_at=NOW(),
                            auto_sent=TRUE
                        WHERE id=:id
                        """),
                        {"id": f.id}
                    )

                    await log_auto_send(db, user_id, f.id, "sent")

                    sent += 1

                else:

                    await log_auto_send(db, user_id, f.id, "error", "Send failed")

                    errors += 1

                await asyncio.sleep(1)

        await db.commit()

    result = {"processed": processed, "sent": sent, "errors": errors}

    logger.info(f"Auto-send cron job completed: {result}")

    return result


# ---------------------------------------------------------
# Cron Loop
# ---------------------------------------------------------

async def run_cron_loop(interval_minutes: int = 30):

    logger.info(f"Starting auto-send cron loop ({interval_minutes} minutes)")

    while True:

        try:
            await process_auto_send_queue()

        except Exception as e:
            logger.warning(f"Cron loop network warning: {e}")

        await asyncio.sleep(interval_minutes * 60)
