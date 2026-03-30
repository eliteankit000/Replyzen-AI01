"""
Inbox Service - Google-compliant inbox management
==================================================
Handles inbox message retrieval, AI reply generation.
All actions are logged for Google OAuth audit trail.

COMPLIANCE:
  - READ-ONLY Gmail access (gmail.readonly)
  - NO programmatic email sending
  - All sends via Gmail compose URL (user-initiated)
  - Comprehensive action logging
"""

import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.openai_service import generate_ai_reply

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Get Inbox Messages (Read-Only) with AI Intelligence
# ═══════════════════════════════════════════════════════════════

async def get_inbox_messages(
    db: AsyncSession,
    user_id: str,
    limit: int = 20,
    status: Optional[str] = None,
) -> List[Dict]:
    """
    Get inbox messages from email threads with AI intelligence fields.
    Returns messages that need replies (read-only view).
    
    Status filter: 'pending' | 'replied' | 'dismissed'
    """
    try:
        # Build query based on status filter
        # Cast to boolean for SQLite compatibility
        if status == "pending":
            condition = "AND t.reply_generated = 0 AND t.is_dismissed = 0 AND t.replied_by_user = 0"
        elif status == "replied":
            condition = "AND t.replied_by_user = 1"
        elif status == "dismissed":
            condition = "AND t.is_dismissed = 1"
        else:
            condition = "AND t.is_dismissed = 0"  # Default: show non-dismissed

        query = f"""
            SELECT 
                t.id,
                t.thread_id,
                t.subject,
                t.snippet,
                t.last_message_from as sender,
                t.last_message_at as timestamp,
                t.reply_generated,
                t.replied_by_user,
                t.is_dismissed,
                t.priority_score,
                t.days_silent,
                -- AI Intelligence fields
                t.ai_summary as summary,
                t.ai_category as category,
                t.ai_opportunity_type as opportunity_type,
                t.ai_urgency_score as urgency_score,
                t.ai_priority_label as priority_label,
                t.ai_needs_followup as needs_followup,
                t.ai_followup_suggested as followup_suggested,
                CASE 
                    WHEN t.replied_by_user = 1 THEN 'replied'
                    WHEN t.is_dismissed = 1 THEN 'dismissed'
                    WHEN t.reply_generated = 1 THEN 'generated'
                    ELSE 'pending'
                END as status
            FROM email_threads t
            WHERE t.user_id = :user_id
              AND t.is_automated = 0
              {condition}
            ORDER BY t.priority_score DESC, t.last_message_at DESC
            LIMIT :limit
        """
        
        result = await db.execute(
            text(query),
            {"user_id": user_id, "limit": limit}
        )
        
        messages = []
        for row in result.fetchall():
            msg = dict(row._mapping)
            # Format timestamp
            if msg.get("timestamp"):
                msg["timestamp"] = msg["timestamp"].isoformat() if hasattr(msg["timestamp"], "isoformat") else msg["timestamp"]
            # Convert boolean fields
            msg["needs_followup"] = bool(msg.get("needs_followup"))
            messages.append(msg)
        
        logger.info(f"[Inbox] Loaded {len(messages)} messages for user {user_id}")
        return messages
        
    except Exception as e:
        logger.error(f"[Inbox] Failed to get messages for {user_id}: {e}", exc_info=True)
        raise


# ═══════════════════════════════════════════════════════════════
# Generate AI Reply Suggestion
# ═══════════════════════════════════════════════════════════════

async def generate_reply_suggestion(
    db: AsyncSession,
    user_id: str,
    message_id: str,
    message: str,
    platform: str = "gmail",
    tone: str = "professional",
) -> Dict:
    """
    Generate AI reply suggestion for a message.

    ⚠️ IMPORTANT: This ONLY generates a suggestion.
    No emails are sent. User must approve via send endpoint.

    DB logging is best-effort — a logging failure never blocks the AI reply.
    """
    # Ensure message content is a non-empty string
    message = (message or "").strip() or "Please generate a professional email reply."

    # ── Step 1: Generate AI reply (this MUST succeed for the endpoint to succeed) ──
    ai_reply = await generate_ai_reply(
        message=message,
        tone=tone,
        context=f"Platform: {platform}",
    )

    suggestion_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # ── Step 2: Store suggestion (best-effort — don't fail if DB insert fails) ──
    try:
        await db.execute(
            text("""
                INSERT INTO inbox_messages
                (id, user_id, thread_id, message, reply, status, platform, tone, created_at)
                VALUES (:id, :user_id, :thread_id, :message, :reply, 'pending', :platform, :tone, :created_at)
            """),
            {
                "id":        suggestion_id,
                "user_id":   user_id,
                "thread_id": message_id,
                "message":   message,
                "reply":     ai_reply,
                "platform":  platform,
                "tone":      tone,
                "created_at": now,
            }
        )
        await db.commit()
    except Exception as log_err:
        logger.warning(f"[Inbox] Could not store inbox_messages log: {log_err}")
        await db.rollback()

    try:
        await db.execute(
            text("""
                INSERT INTO smart_reply_logs
                (id, user_id, thread_id, message_snippet, generated_reply, platform, tone, status, created_at)
                VALUES (:id, :user_id, :thread_id, :message, :reply, :platform, :tone, 'pending', :created_at)
            """),
            {
                "id":        str(uuid.uuid4()),
                "user_id":   user_id,
                "thread_id": message_id,
                "message":   message[:200],
                "reply":     ai_reply,
                "platform":  platform,
                "tone":      tone,
                "created_at": now,
            }
        )
        await db.commit()
    except Exception as log_err:
        logger.warning(f"[Inbox] Could not store smart_reply_logs log: {log_err}")
        await db.rollback()

    logger.info(f"[Inbox] Generated reply suggestion for user {user_id}, message {message_id}")

    return {
        "id":         suggestion_id,
        "message_id": message_id,
        "reply":      ai_reply,
        "tone":       tone,
        "platform":   platform,
        "status":     "pending",
        "created_at": now.isoformat(),
    }


# ═══════════════════════════════════════════════════════════════
# Get Inbox Statistics (Enhanced with AI insights)
# ═══════════════════════════════════════════════════════════════

async def get_inbox_stats(db: AsyncSession, user_id: str) -> Dict:
    """
    Get inbox statistics for the user including AI priority breakdown.
    """
    try:
        # Total messages
        result = await db.execute(
            text("SELECT COUNT(*) FROM email_threads WHERE user_id = :user_id AND is_automated = 0"),
            {"user_id": user_id}
        )
        total_messages = result.scalar() or 0
        
        # Pending replies
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM email_threads 
                WHERE user_id = :user_id 
                  AND is_dismissed = 0
                  AND replied_by_user = 0
                  AND is_automated = 0
            """),
            {"user_id": user_id}
        )
        pending_replies = result.scalar() or 0
        
        # HOT priority count
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM email_threads 
                WHERE user_id = :user_id 
                  AND is_dismissed = 0
                  AND is_automated = 0
                  AND ai_priority_label = 'HOT'
            """),
            {"user_id": user_id}
        )
        hot_count = result.scalar() or 0
        
        # WARM priority count
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM email_threads 
                WHERE user_id = :user_id 
                  AND is_dismissed = 0
                  AND is_automated = 0
                  AND ai_priority_label = 'WARM'
            """),
            {"user_id": user_id}
        )
        warm_count = result.scalar() or 0
        
        # Needs follow-up count
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM email_threads 
                WHERE user_id = :user_id 
                  AND is_dismissed = 0
                  AND is_automated = 0
                  AND ai_needs_followup = 1
            """),
            {"user_id": user_id}
        )
        needs_followup = result.scalar() or 0
        
        # Total AI-generated replies
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM inbox_messages
                WHERE user_id = :user_id
            """),
            {"user_id": user_id}
        )
        total_generated = result.scalar() or 0
        
        # Category breakdown
        result = await db.execute(
            text("""
                SELECT ai_category as category, COUNT(*) as count
                FROM email_threads
                WHERE user_id = :user_id
                  AND is_dismissed = 0
                  AND is_automated = 0
                GROUP BY ai_category
            """),
            {"user_id": user_id}
        )
        category_breakdown = {row.category or "Personal": row.count for row in result.fetchall()}
        
        return {
            "total_messages": total_messages,
            "pending_replies": pending_replies,
            "hot_priority": hot_count,
            "warm_priority": warm_count,
            "needs_followup": needs_followup,
            "total_generated": total_generated,
            "category_breakdown": category_breakdown,
        }
        
    except Exception as e:
        logger.error(f"[Inbox] Failed to get stats for {user_id}: {e}", exc_info=True)
        raise


# ═══════════════════════════════════════════════════════════════
# Log Inbox Action (Audit Trail)
# ═══════════════════════════════════════════════════════════════

async def log_inbox_action(
    db: AsyncSession,
    user_id: str,
    action: str,
    details: str = None,
    platform: str = "gmail",
):
    """
    Log inbox actions for audit trail.
    Important for Google OAuth verification.
    
    Actions:
      - inbox_access: User viewed inbox
      - reply_generated: AI generated reply suggestion
      - reply_sent: User approved and sent reply
      - reply_send_failed: Send attempt failed
    """
    try:
        await db.execute(
            text("""
                INSERT INTO permission_logs 
                (id, user_id, action, resource, platform, details, created_at)
                VALUES (:id, :user_id, :action, 'inbox', :platform, :details, :created_at)
            """),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "action": action,
                "platform": platform,
                "details": details,
                "created_at": datetime.now(timezone.utc),
            }
        )
        await db.commit()
        logger.debug(f"[Inbox] Logged action '{action}' for user {user_id}")
    except Exception as e:
        logger.warning(f"[Inbox] Failed to log action for {user_id}: {e}")
        await db.rollback()
