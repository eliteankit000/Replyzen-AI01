"""
Email Sync Worker
==================
Background worker for syncing Gmail emails and processing with AI.

Flow:
1. Fetch email list from Gmail
2. Fetch full message for new emails
3. Store in DB (avoid duplicates)
4. Run AI analysis
5. Create notifications for opportunities

Error Handling:
- Token expired → auto refresh
- Refresh fails → mark disconnected, notify user
- AI fails → use fallback analysis
"""

import asyncio
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.email_intelligence_service import analyze_email
from services.notification_service import (
    notify_potential_client,
    notify_high_priority,
    notify_gmail_disconnected,
    notify_sync_complete,
)
from services.activity_log_service import log_email_synced, log_ai_analysis
from services.ai_settings_service import get_ai_settings

logger = logging.getLogger(__name__)

# Global reference to database session factory
_db_session_factory = None


def set_database(session_factory):
    """Set the database session factory for the sync worker."""
    global _db_session_factory
    _db_session_factory = session_factory
    logger.info("[SyncWorker] Database session factory set")


async def sync_emails_for_user(
    db: AsyncSession,
    user_id: str,
    max_emails: int = 50,
) -> Dict:
    """
    Sync emails from Gmail for a specific user.
    
    Returns:
        Dict with sync results
    """
    from services.gmail_service import (
        get_gmail_service,
        refresh_access_token,
    )
    
    result = {
        "success": False,
        "emails_synced": 0,
        "emails_analyzed": 0,
        "opportunities_found": 0,
        "error": None,
    }
    
    try:
        # Update sync status
        await _update_sync_status(db, user_id, "syncing")
        
        # Get Gmail service (handles token refresh)
        try:
            gmail_service = await get_gmail_service(db, user_id)
            if not gmail_service:
                # Try to refresh token
                refreshed = await refresh_access_token(db, user_id)
                if not refreshed:
                    await _handle_gmail_disconnected(db, user_id)
                    result["error"] = "Gmail token expired"
                    return result
                gmail_service = await get_gmail_service(db, user_id)
        except Exception as e:
            await _handle_gmail_disconnected(db, user_id, str(e))
            result["error"] = f"Gmail connection failed: {str(e)}"
            return result
        
        # Get AI settings
        settings = await get_ai_settings(db, user_id)
        
        # Fetch messages from Gmail
        messages = await _fetch_gmail_messages(gmail_service, max_results=max_emails)
        
        if not messages:
            result["success"] = True
            result["emails_synced"] = 0
            await _update_sync_status(db, user_id, "idle", emails_synced=0)
            return result
        
        # Get existing message IDs to avoid duplicates
        existing_ids = await _get_existing_message_ids(db, user_id)
        
        new_count = 0
        analyzed_count = 0
        opportunities = 0
        
        for msg_summary in messages:
            msg_id = msg_summary.get("id")
            thread_id = msg_summary.get("threadId")
            
            # Skip if already exists
            if msg_id in existing_ids or thread_id in existing_ids:
                continue
            
            try:
                # Fetch full message
                full_message = await _fetch_full_message(gmail_service, msg_id)
                if not full_message:
                    continue
                
                # Extract message data
                email_data = _extract_email_data(full_message)
                
                # Store in database
                email_id = await _store_email(db, user_id, thread_id, email_data)
                new_count += 1
                
                # Run AI analysis
                ai_result = await analyze_email(
                    subject=email_data.get("subject", ""),
                    snippet=email_data.get("snippet", ""),
                    sender=email_data.get("sender", ""),
                    full_body=email_data.get("body"),
                )
                
                # Update with AI results
                await _update_email_with_ai(db, email_id, ai_result)
                analyzed_count += 1
                
                # Log AI analysis
                await log_ai_analysis(
                    db, user_id, email_id,
                    ai_result.get("category", "Personal"),
                    ai_result.get("priority_label", "LOW")
                )
                
                # Create notifications for opportunities/high priority
                if ai_result.get("opportunity_type") in ["Client", "Partnership"]:
                    opportunities += 1
                    if settings.get("notify_potential_client", True):
                        await notify_potential_client(
                            db, user_id,
                            email_data.get("subject", ""),
                            email_id,
                            email_data.get("sender", ""),
                        )
                
                if ai_result.get("priority_label") == "HOT":
                    if settings.get("notify_urgent", True):
                        await notify_high_priority(
                            db, user_id,
                            email_data.get("subject", ""),
                            email_id,
                            email_data.get("sender", ""),
                        )
                
            except Exception as e:
                logger.warning(f"[SyncWorker] Error processing message {msg_id}: {e}")
                continue
        
        # Log sync activity
        if new_count > 0:
            await log_email_synced(db, user_id, new_count)
        
        # Create sync complete notification
        if new_count > 0 and opportunities > 0:
            await notify_sync_complete(db, user_id, new_count, opportunities)
        
        # Update sync status
        await _update_sync_status(db, user_id, "idle", emails_synced=new_count)
        
        await db.commit()
        
        result["success"] = True
        result["emails_synced"] = new_count
        result["emails_analyzed"] = analyzed_count
        result["opportunities_found"] = opportunities
        
        logger.info(f"[SyncWorker] Synced {new_count} emails for user {user_id}, {opportunities} opportunities")
        
        return result
        
    except Exception as e:
        logger.error(f"[SyncWorker] Sync failed for user {user_id}: {e}", exc_info=True)
        await _update_sync_status(db, user_id, "error", error=str(e))
        await db.rollback()
        result["error"] = str(e)
        return result


async def _fetch_gmail_messages(gmail_service, max_results: int = 50) -> List[Dict]:
    """Fetch message list from Gmail API."""
    try:
        # Note: This is a simplified version - in production, use the Gmail API properly
        response = gmail_service.users().messages().list(
            userId='me',
            maxResults=max_results,
            labelIds=['INBOX'],
        ).execute()
        
        return response.get('messages', [])
    except Exception as e:
        logger.error(f"[SyncWorker] Failed to fetch messages: {e}")
        return []


async def _fetch_full_message(gmail_service, message_id: str) -> Optional[Dict]:
    """Fetch full message details from Gmail API."""
    try:
        message = gmail_service.users().messages().get(
            userId='me',
            id=message_id,
            format='full',
        ).execute()
        return message
    except Exception as e:
        logger.error(f"[SyncWorker] Failed to fetch message {message_id}: {e}")
        return None


def _extract_email_data(message: Dict) -> Dict:
    """Extract relevant data from Gmail message."""
    headers = message.get('payload', {}).get('headers', [])
    
    def get_header(name):
        for h in headers:
            if h['name'].lower() == name.lower():
                return h['value']
        return ""
    
    return {
        "gmail_id": message.get('id'),
        "thread_id": message.get('threadId'),
        "subject": get_header('Subject'),
        "sender": get_header('From'),
        "snippet": message.get('snippet', ''),
        "body": message.get('snippet', ''),  # Simplified - full body extraction needs more work
        "date": get_header('Date'),
        "internal_date": message.get('internalDate'),
    }


async def _get_existing_message_ids(db: AsyncSession, user_id: str) -> set:
    """Get set of existing message/thread IDs to avoid duplicates."""
    try:
        result = await db.execute(
            text("""
                SELECT thread_id FROM email_threads
                WHERE user_id = :user_id
            """),
            {"user_id": user_id}
        )
        return {row.thread_id for row in result.fetchall()}
    except Exception as e:
        logger.error(f"[SyncWorker] Failed to get existing IDs: {e}")
        return set()


async def _store_email(
    db: AsyncSession,
    user_id: str,
    thread_id: str,
    email_data: Dict,
) -> str:
    """Store email in database."""
    email_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    await db.execute(
        text("""
            INSERT INTO email_threads
            (id, user_id, thread_id, subject, snippet, last_message_from,
             last_message_at, created_at, updated_at)
            VALUES
            (:id, :user_id, :thread_id, :subject, :snippet, :sender,
             :message_at, :created_at, :updated_at)
        """),
        {
            "id": email_id,
            "user_id": user_id,
            "thread_id": thread_id,
            "subject": email_data.get("subject", "")[:500],
            "snippet": email_data.get("snippet", "")[:1000],
            "sender": email_data.get("sender", ""),
            "message_at": now,
            "created_at": now,
            "updated_at": now,
        }
    )
    
    return email_id


async def _update_email_with_ai(
    db: AsyncSession,
    email_id: str,
    ai_result: Dict,
) -> None:
    """Update email with AI analysis results."""
    await db.execute(
        text("""
            UPDATE email_threads
            SET ai_summary = :summary,
                ai_category = :category,
                ai_opportunity_type = :opportunity_type,
                priority_score = :priority_score,
                ai_urgency_score = :urgency_score,
                ai_priority_label = :priority_label,
                ai_needs_followup = :needs_followup,
                ai_followup_suggested = :followup_suggested,
                ai_analyzed_at = :analyzed_at,
                updated_at = :updated_at
            WHERE id = :id
        """),
        {
            "id": email_id,
            "summary": ai_result.get("summary", "")[:500],
            "category": ai_result.get("category", "Personal"),
            "opportunity_type": ai_result.get("opportunity_type", "None"),
            "priority_score": ai_result.get("priority_score", 50),
            "urgency_score": ai_result.get("urgency_score", 5),
            "priority_label": ai_result.get("priority_label", "LOW"),
            "needs_followup": 1 if ai_result.get("needs_followup") else 0,
            "followup_suggested": ai_result.get("followup_suggested", ""),
            "analyzed_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )


async def _update_sync_status(
    db: AsyncSession,
    user_id: str,
    status: str,
    error: Optional[str] = None,
    emails_synced: Optional[int] = None,
) -> None:
    """Update sync status in database."""
    try:
        now = datetime.now(timezone.utc)
        
        # Check if record exists
        result = await db.execute(
            text("SELECT id FROM sync_status WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        
        if result.fetchone():
            await db.execute(
                text("""
                    UPDATE sync_status
                    SET sync_status = :status,
                        error_message = :error,
                        emails_synced = COALESCE(:emails_synced, emails_synced),
                        last_sync_at = :last_sync,
                        updated_at = :updated_at
                    WHERE user_id = :user_id
                """),
                {
                    "user_id": user_id,
                    "status": status,
                    "error": error,
                    "emails_synced": emails_synced,
                    "last_sync": now if status == "idle" else None,
                    "updated_at": now,
                }
            )
        else:
            await db.execute(
                text("""
                    INSERT INTO sync_status
                    (id, user_id, sync_status, error_message, emails_synced, created_at, updated_at)
                    VALUES
                    (:id, :user_id, :status, :error, :emails_synced, :created_at, :updated_at)
                """),
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "status": status,
                    "error": error,
                    "emails_synced": emails_synced or 0,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        
        await db.commit()
        
    except Exception as e:
        logger.error(f"[SyncWorker] Failed to update sync status: {e}")


async def _handle_gmail_disconnected(
    db: AsyncSession,
    user_id: str,
    reason: str = "Token expired",
) -> None:
    """Handle Gmail disconnection - notify user and update status."""
    try:
        # Mark account as inactive
        await db.execute(
            text("""
                UPDATE email_accounts
                SET is_active = 0, updated_at = :updated_at
                WHERE user_id = :user_id
            """),
            {"user_id": user_id, "updated_at": datetime.now(timezone.utc)}
        )
        
        # Update user's gmail_connected flag
        await db.execute(
            text("""
                UPDATE users
                SET gmail_connected = 0, updated_at = :updated_at
                WHERE id = :user_id
            """),
            {"user_id": user_id, "updated_at": datetime.now(timezone.utc)}
        )
        
        # Notify user
        await notify_gmail_disconnected(db, user_id, reason)
        
        await db.commit()
        
        logger.warning(f"[SyncWorker] Gmail disconnected for user {user_id}: {reason}")
        
    except Exception as e:
        logger.error(f"[SyncWorker] Failed to handle disconnection: {e}")


async def run_sync_for_all_users():
    """Run email sync for all users with connected Gmail."""
    if not _db_session_factory:
        logger.error("[SyncWorker] Database not configured")
        return
    
    try:
        async with _db_session_factory() as db:
            result = await db.execute(
                text("""
                    SELECT DISTINCT user_id 
                    FROM email_accounts 
                    WHERE is_active = 1
                """)
            )
            
            users = [row.user_id for row in result.fetchall()]
            
            logger.info(f"[SyncWorker] Running sync for {len(users)} users")
            
            for user_id in users:
                try:
                    await sync_emails_for_user(db, user_id)
                except Exception as e:
                    logger.error(f"[SyncWorker] Error for user {user_id}: {e}")
                    continue
                
    except Exception as e:
        logger.error(f"[SyncWorker] Failed to run sync: {e}", exc_info=True)


async def run_sync_cron_loop(interval_minutes: int = 30):
    """Main cron loop for email syncing."""
    logger.info(f"[SyncWorker] Starting sync cron (interval: {interval_minutes}m)")
    
    while True:
        try:
            await run_sync_for_all_users()
        except Exception as e:
            logger.error(f"[SyncWorker] Cron error: {e}", exc_info=True)
        
        await asyncio.sleep(interval_minutes * 60)
