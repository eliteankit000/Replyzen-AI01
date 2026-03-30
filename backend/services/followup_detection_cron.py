"""
Follow-up Detection Cron Job
==============================
Background worker that detects emails needing follow-up.

Logic:
- Runs every X hours (configurable)
- Checks emails where:
  - category = Client OR Lead
  - last_reply_at > user_setting (24h/48h/72h)
- Sets needs_followup = true
- Creates notification

COMPLIANCE: This is READ-ONLY detection - no emails are sent.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.ai_settings_service import get_ai_settings, get_followup_hours
from services.notification_service import notify_followup_required
from services.activity_log_service import log_followup_detected

logger = logging.getLogger(__name__)

# Global reference to database session factory
_db_session_factory = None


def set_database(session_factory):
    """Set the database session factory for the cron job."""
    global _db_session_factory
    _db_session_factory = session_factory
    logger.info("[FollowupCron] Database session factory set")


async def detect_followups_for_user(db: AsyncSession, user_id: str) -> int:
    """
    Detect emails needing follow-up for a specific user.
    
    Returns:
        Number of emails flagged for follow-up
    """
    try:
        # Get user's AI settings
        settings = await get_ai_settings(db, user_id)
        followup_hours = get_followup_hours(settings.get("followup_timing", "48h"))
        
        # Calculate cutoff time
        cutoff = datetime.now(timezone.utc) - timedelta(hours=followup_hours)
        
        # Find emails that need follow-up:
        # - Category is Client or Lead
        # - Last message was before cutoff
        # - Not already flagged for follow-up
        # - User hasn't replied
        # - Not dismissed
        result = await db.execute(
            text("""
                SELECT 
                    id, subject, last_message_from as sender, 
                    last_message_at, days_silent
                FROM email_threads
                WHERE user_id = :user_id
                  AND (ai_category = 'Client' OR ai_category = 'Lead')
                  AND last_message_at < :cutoff
                  AND (ai_needs_followup = 0 OR ai_needs_followup IS NULL)
                  AND (replied_by_user = 0 OR replied_by_user IS NULL)
                  AND (is_dismissed = 0 OR is_dismissed IS NULL)
                  AND (last_sender_is_user = 0 OR last_sender_is_user IS NULL)
                LIMIT 50
            """),
            {"user_id": user_id, "cutoff": cutoff}
        )
        
        emails_to_flag = result.fetchall()
        flagged_count = 0
        
        for email in emails_to_flag:
            email_dict = dict(email._mapping)
            
            # Calculate days silent
            if email_dict.get("last_message_at"):
                days_silent = (datetime.now(timezone.utc) - email_dict["last_message_at"]).days
            else:
                days_silent = email_dict.get("days_silent", 0)
            
            # Flag for follow-up
            await db.execute(
                text("""
                    UPDATE email_threads
                    SET ai_needs_followup = 1,
                        days_silent = :days_silent,
                        updated_at = :updated_at
                    WHERE id = :id
                """),
                {
                    "id": email_dict["id"],
                    "days_silent": days_silent,
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            
            # Create notification if enabled
            if settings.get("notify_followup", True):
                try:
                    await notify_followup_required(
                        db=db,
                        user_id=user_id,
                        email_subject=email_dict.get("subject", "No subject"),
                        email_id=email_dict["id"],
                        days_silent=days_silent,
                    )
                except Exception as e:
                    logger.warning(f"[FollowupCron] Failed to create notification: {e}")
            
            # Log activity
            try:
                await log_followup_detected(
                    db=db,
                    user_id=user_id,
                    email_id=email_dict["id"],
                    days_silent=days_silent,
                )
            except Exception as e:
                logger.warning(f"[FollowupCron] Failed to log activity: {e}")
            
            flagged_count += 1
        
        await db.commit()
        
        if flagged_count > 0:
            logger.info(f"[FollowupCron] Flagged {flagged_count} emails for follow-up for user {user_id}")
        
        return flagged_count
        
    except Exception as e:
        logger.error(f"[FollowupCron] Error detecting follow-ups for {user_id}: {e}", exc_info=True)
        await db.rollback()
        return 0


async def run_followup_detection() -> int:
    """
    Run follow-up detection for all users.
    
    Returns:
        Total number of emails flagged
    """
    if not _db_session_factory:
        logger.error("[FollowupCron] Database not configured")
        return 0
    
    total_flagged = 0
    
    try:
        async with _db_session_factory() as db:
            # Get all users with Gmail connected
            result = await db.execute(
                text("""
                    SELECT DISTINCT user_id 
                    FROM email_accounts 
                    WHERE is_active = 1
                """)
            )
            
            users = [row.user_id for row in result.fetchall()]
            
            logger.info(f"[FollowupCron] Running follow-up detection for {len(users)} users")
            
            for user_id in users:
                try:
                    flagged = await detect_followups_for_user(db, user_id)
                    total_flagged += flagged
                except Exception as e:
                    logger.error(f"[FollowupCron] Error for user {user_id}: {e}")
                    continue
        
        logger.info(f"[FollowupCron] Completed: {total_flagged} emails flagged for follow-up")
        return total_flagged
        
    except Exception as e:
        logger.error(f"[FollowupCron] Failed to run detection: {e}", exc_info=True)
        return 0


async def run_cron_loop(interval_hours: int = 6):
    """
    Main cron loop that runs follow-up detection periodically.
    
    Args:
        interval_hours: Hours between runs
    """
    logger.info(f"[FollowupCron] Starting cron loop (interval: {interval_hours}h)")
    
    while True:
        try:
            await run_followup_detection()
        except Exception as e:
            logger.error(f"[FollowupCron] Cron loop error: {e}", exc_info=True)
        
        # Wait for next run
        await asyncio.sleep(interval_hours * 3600)
