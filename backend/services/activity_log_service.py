"""
Activity Log Service
=====================
Logs all user and system activities for analytics and debugging.

Activity Types:
- email_synced: Email sync completed
- ai_analysis: AI analyzed an email
- reply_generated: AI generated a reply
- gmail_compose: User opened Gmail compose
- followup_detected: Follow-up requirement detected
- notification_created: Notification sent to user
- settings_updated: User updated settings
"""

import uuid
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def log_activity(
    db: AsyncSession,
    user_id: str,
    activity_type: str,
    description: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Log a user/system activity.
    
    Args:
        db: Database session
        user_id: User ID
        activity_type: Type of activity
        description: Human-readable description
        metadata: Optional JSON metadata
        
    Returns:
        Activity log ID
    """
    try:
        log_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        await db.execute(
            text("""
                INSERT INTO activity_logs
                (id, user_id, type, description, metadata, created_at)
                VALUES
                (:id, :user_id, :type, :description, :metadata, :created_at)
            """),
            {
                "id": log_id,
                "user_id": user_id,
                "type": activity_type,
                "description": description,
                "metadata": json.dumps(metadata) if metadata else None,
                "created_at": now,
            }
        )
        await db.commit()
        
        return log_id
        
    except Exception as e:
        logger.error(f"[ActivityLog] Failed to log activity: {e}", exc_info=True)
        await db.rollback()
        return ""


async def get_recent_activities(
    db: AsyncSession,
    user_id: str,
    limit: int = 50,
    activity_type: Optional[str] = None,
) -> List[Dict]:
    """
    Get recent activities for a user.
    
    Args:
        db: Database session
        user_id: User ID
        limit: Max activities to return
        activity_type: Filter by type (optional)
        
    Returns:
        List of activity dicts
    """
    try:
        type_filter = "AND type = :type" if activity_type else ""
        params = {"user_id": user_id, "limit": limit}
        if activity_type:
            params["type"] = activity_type
        
        result = await db.execute(
            text(f"""
                SELECT id, user_id, type, description, metadata, created_at
                FROM activity_logs
                WHERE user_id = :user_id {type_filter}
                ORDER BY created_at DESC
                LIMIT :limit
            """),
            params
        )
        
        activities = []
        for row in result.fetchall():
            activity = dict(row._mapping)
            # Parse metadata JSON
            if activity.get("metadata"):
                try:
                    activity["metadata"] = json.loads(activity["metadata"])
                except (json.JSONDecodeError, TypeError):
                    pass
            # Format timestamp
            if activity.get("created_at") and hasattr(activity["created_at"], "isoformat"):
                activity["created_at"] = activity["created_at"].isoformat()
            activities.append(activity)
        
        return activities
        
    except Exception as e:
        logger.error(f"[ActivityLog] Failed to get activities: {e}", exc_info=True)
        return []


async def get_activity_stats(
    db: AsyncSession,
    user_id: str,
    days: int = 7,
) -> Dict:
    """
    Get activity statistics for analytics.
    
    Args:
        db: Database session
        user_id: User ID
        days: Number of days to look back
        
    Returns:
        Stats dict with counts by type
    """
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        
        result = await db.execute(
            text("""
                SELECT type, COUNT(*) as count
                FROM activity_logs
                WHERE user_id = :user_id AND created_at >= :cutoff
                GROUP BY type
            """),
            {"user_id": user_id, "cutoff": cutoff}
        )
        
        stats = {}
        for row in result.fetchall():
            stats[row.type] = row.count
        
        return stats
        
    except Exception as e:
        logger.error(f"[ActivityLog] Failed to get stats: {e}", exc_info=True)
        return {}


async def get_daily_activity_counts(
    db: AsyncSession,
    user_id: str,
    days: int = 30,
) -> List[Dict]:
    """
    Get daily activity counts for trend charts.
    
    Returns:
        List of {date, count} dicts
    """
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        
        result = await db.execute(
            text("""
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM activity_logs
                WHERE user_id = :user_id AND created_at >= :cutoff
                GROUP BY DATE(created_at)
                ORDER BY date
            """),
            {"user_id": user_id, "cutoff": cutoff}
        )
        
        return [{"date": str(row.date), "count": row.count} for row in result.fetchall()]
        
    except Exception as e:
        logger.error(f"[ActivityLog] Failed to get daily counts: {e}", exc_info=True)
        return []


# ═══════════════════════════════════════════════════════════════
# Activity Logging Helpers
# ═══════════════════════════════════════════════════════════════

async def log_email_synced(db: AsyncSession, user_id: str, count: int) -> str:
    """Log email sync activity."""
    return await log_activity(
        db, user_id, "email_synced",
        f"Synced {count} emails from Gmail",
        {"emails_synced": count}
    )


async def log_ai_analysis(db: AsyncSession, user_id: str, email_id: str, category: str, priority: str) -> str:
    """Log AI analysis activity."""
    return await log_activity(
        db, user_id, "ai_analysis",
        f"AI analyzed email: {category} ({priority})",
        {"email_id": email_id, "category": category, "priority": priority}
    )


async def log_reply_generated(db: AsyncSession, user_id: str, email_id: str, tone: str) -> str:
    """Log reply generation activity."""
    return await log_activity(
        db, user_id, "reply_generated",
        f"Generated {tone} reply",
        {"email_id": email_id, "tone": tone}
    )


async def log_gmail_compose(db: AsyncSession, user_id: str, to: str, subject: str) -> str:
    """Log Gmail compose activity."""
    return await log_activity(
        db, user_id, "gmail_compose",
        f"Opened Gmail compose to {to}",
        {"to": to, "subject": subject[:50]}
    )


async def log_followup_detected(db: AsyncSession, user_id: str, email_id: str, days_silent: int) -> str:
    """Log follow-up detection activity."""
    return await log_activity(
        db, user_id, "followup_detected",
        f"Follow-up needed after {days_silent} days",
        {"email_id": email_id, "days_silent": days_silent}
    )


async def log_settings_updated(db: AsyncSession, user_id: str, setting_name: str, new_value: Any) -> str:
    """Log settings update activity."""
    return await log_activity(
        db, user_id, "settings_updated",
        f"Updated {setting_name}",
        {"setting": setting_name, "value": str(new_value)}
    )
