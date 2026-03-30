"""
Notification Service
=====================
Handles creation, retrieval, and management of user notifications.

Notification Types:
- potential_client: New potential client email detected
- followup_required: Email needs follow-up
- high_priority: High priority email arrived
- gmail_disconnected: Gmail connection lost
- sync_complete: Email sync completed

All notifications are stored in DB for persistence.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    email_id: Optional[str] = None,
) -> Dict:
    """
    Create a new notification for a user.
    
    Args:
        db: Database session
        user_id: User ID
        notification_type: Type of notification
        title: Short title
        message: Full message
        email_id: Optional related email ID
        
    Returns:
        Created notification dict
    """
    try:
        notif_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        await db.execute(
            text("""
                INSERT INTO notifications
                (id, user_id, type, title, message, email_id, is_read, created_at)
                VALUES
                (:id, :user_id, :type, :title, :message, :email_id, 0, :created_at)
            """),
            {
                "id": notif_id,
                "user_id": user_id,
                "type": notification_type,
                "title": title,
                "message": message,
                "email_id": email_id,
                "created_at": now,
            }
        )
        await db.commit()
        
        logger.info(f"[Notification] Created {notification_type} notification for user {user_id}")
        
        return {
            "id": notif_id,
            "user_id": user_id,
            "type": notification_type,
            "title": title,
            "message": message,
            "email_id": email_id,
            "is_read": False,
            "created_at": now.isoformat(),
        }
        
    except Exception as e:
        logger.error(f"[Notification] Failed to create notification: {e}", exc_info=True)
        await db.rollback()
        raise


async def get_notifications(
    db: AsyncSession,
    user_id: str,
    limit: int = 50,
    unread_only: bool = False,
) -> List[Dict]:
    """
    Get notifications for a user.
    
    Args:
        db: Database session
        user_id: User ID
        limit: Max notifications to return
        unread_only: If True, only return unread notifications
        
    Returns:
        List of notification dicts
    """
    try:
        condition = "AND is_read = 0" if unread_only else ""
        
        result = await db.execute(
            text(f"""
                SELECT id, user_id, type, title, message, email_id, is_read, created_at
                FROM notifications
                WHERE user_id = :user_id {condition}
                ORDER BY created_at DESC
                LIMIT :limit
            """),
            {"user_id": user_id, "limit": limit}
        )
        
        notifications = []
        for row in result.fetchall():
            notif = dict(row._mapping)
            notif["is_read"] = bool(notif.get("is_read"))
            if notif.get("created_at") and hasattr(notif["created_at"], "isoformat"):
                notif["created_at"] = notif["created_at"].isoformat()
            notifications.append(notif)
        
        return notifications
        
    except Exception as e:
        logger.error(f"[Notification] Failed to get notifications: {e}", exc_info=True)
        return []


async def get_unread_count(db: AsyncSession, user_id: str) -> int:
    """Get count of unread notifications."""
    try:
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM notifications
                WHERE user_id = :user_id AND is_read = 0
            """),
            {"user_id": user_id}
        )
        return result.scalar() or 0
    except Exception as e:
        logger.error(f"[Notification] Failed to get unread count: {e}")
        return 0


async def mark_as_read(
    db: AsyncSession,
    user_id: str,
    notification_id: Optional[str] = None,
    mark_all: bool = False,
) -> bool:
    """
    Mark notifications as read.
    
    Args:
        db: Database session
        user_id: User ID
        notification_id: Specific notification to mark (if not mark_all)
        mark_all: If True, mark all notifications as read
        
    Returns:
        Success boolean
    """
    try:
        if mark_all:
            await db.execute(
                text("""
                    UPDATE notifications
                    SET is_read = 1
                    WHERE user_id = :user_id AND is_read = 0
                """),
                {"user_id": user_id}
            )
        elif notification_id:
            await db.execute(
                text("""
                    UPDATE notifications
                    SET is_read = 1
                    WHERE id = :id AND user_id = :user_id
                """),
                {"id": notification_id, "user_id": user_id}
            )
        
        await db.commit()
        return True
        
    except Exception as e:
        logger.error(f"[Notification] Failed to mark as read: {e}", exc_info=True)
        await db.rollback()
        return False


async def delete_notification(
    db: AsyncSession,
    user_id: str,
    notification_id: str,
) -> bool:
    """Delete a specific notification."""
    try:
        await db.execute(
            text("""
                DELETE FROM notifications
                WHERE id = :id AND user_id = :user_id
            """),
            {"id": notification_id, "user_id": user_id}
        )
        await db.commit()
        return True
    except Exception as e:
        logger.error(f"[Notification] Failed to delete: {e}")
        await db.rollback()
        return False


# ═══════════════════════════════════════════════════════════════
# Notification Creation Helpers
# ═══════════════════════════════════════════════════════════════

async def notify_potential_client(
    db: AsyncSession,
    user_id: str,
    email_subject: str,
    email_id: str,
    sender: str,
) -> Dict:
    """Create notification for potential client detection."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="potential_client",
        title="Potential Client Detected",
        message=f"New email from {sender}: {email_subject[:50]}...",
        email_id=email_id,
    )


async def notify_followup_required(
    db: AsyncSession,
    user_id: str,
    email_subject: str,
    email_id: str,
    days_silent: int,
) -> Dict:
    """Create notification for follow-up required."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="followup_required",
        title="Follow-up Required",
        message=f"No response in {days_silent} days: {email_subject[:50]}...",
        email_id=email_id,
    )


async def notify_high_priority(
    db: AsyncSession,
    user_id: str,
    email_subject: str,
    email_id: str,
    sender: str,
) -> Dict:
    """Create notification for high priority email."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="high_priority",
        title="High Priority Email",
        message=f"Urgent email from {sender}: {email_subject[:50]}...",
        email_id=email_id,
    )


async def notify_gmail_disconnected(
    db: AsyncSession,
    user_id: str,
    reason: str = "Token expired",
) -> Dict:
    """Create notification for Gmail disconnection."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="gmail_disconnected",
        title="Gmail Disconnected",
        message=f"Your Gmail connection was lost: {reason}. Please reconnect in Settings.",
    )


async def notify_sync_complete(
    db: AsyncSession,
    user_id: str,
    emails_synced: int,
    opportunities_found: int,
) -> Dict:
    """Create notification for sync completion."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="sync_complete",
        title="Email Sync Complete",
        message=f"Synced {emails_synced} emails, found {opportunities_found} opportunities.",
    )
