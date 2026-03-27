"""
Inbox Service - Google-reviewer-friendly inbox management
==========================================================
Handles inbox message retrieval, AI reply generation, and sending.
All actions are logged for Google OAuth audit trail.

SAFETY FEATURES:
  - All sends require explicit approval
  - Comprehensive action logging
  - Read-only message access by default
  - User controls all sending actions
"""

import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.openai_service import generate_ai_reply
from services.gmail_service import send_gmail_reply

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Get Inbox Messages (Read-Only)
# ═══════════════════════════════════════════════════════════════

async def get_inbox_messages(
    db: AsyncSession,
    user_id: str,
    limit: int = 20,
    status: Optional[str] = None,
) -> List[Dict]:
    """
    Get inbox messages from email threads.
    Returns messages that need replies (read-only view).
    
    Status filter: 'pending' | 'replied' | 'dismissed'
    """
    try:
        # Build query based on status filter
        # ::boolean cast works for both INTEGER (0→false, 1→true) and BOOLEAN columns
        if status == "pending":
            condition = "AND t.reply_generated::boolean = false AND t.is_dismissed::boolean = false AND t.replied_by_user::boolean = false"
        elif status == "replied":
            condition = "AND t.replied_by_user::boolean = true"
        elif status == "dismissed":
            condition = "AND t.is_dismissed::boolean = true"
        else:
            condition = "AND t.is_dismissed::boolean = false"  # Default: show non-dismissed

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
                CASE 
                    WHEN t.replied_by_user::boolean = true THEN 'replied'
                    WHEN t.is_dismissed::boolean = true THEN 'dismissed'
                    WHEN t.reply_generated::boolean = true THEN 'generated'
                    ELSE 'pending'
                END as status
            FROM email_threads t
            WHERE t.user_id::text = :user_id
              AND t.is_automated::boolean = false
              {condition}
            ORDER BY t.last_message_at DESC
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
# Send Approved Reply
# ═══════════════════════════════════════════════════════════════

async def send_approved_reply(
    db: AsyncSession,
    user_id: str,
    message_id: str,
    reply: str,
    edited: bool = False,
) -> Dict:
    """
    Send an approved reply.
    
    🔒 SECURITY: This should ONLY be called after explicit user approval.
    All sends are logged for audit trail.
    """
    try:
        # Get thread info
        result = await db.execute(
            text("""
                SELECT id, thread_id, subject, last_message_from
                FROM email_threads
                WHERE user_id::text = :user_id AND id::text = :message_id
                LIMIT 1
            """),
            {"user_id": user_id, "message_id": message_id}
        )
        thread = result.fetchone()
        
        if not thread:
            raise ValueError(f"Thread not found: {message_id}")
        
        thread_dict = dict(thread._mapping)
        
        # Send via Gmail service
        sent_result = await send_gmail_reply(
            db=db,
            user_id=user_id,
            thread_id=thread_dict["thread_id"],
            subject=thread_dict["subject"],
            body=reply,
            to=thread_dict["last_message_from"],
        )
        
        # Update inbox_messages status
        await db.execute(
            text("""
                UPDATE inbox_messages
                SET status = 'sent', sent_at = :sent_at
                WHERE user_id::text = :user_id AND thread_id::text = :message_id
            """),
            {
                "user_id": user_id,
                "message_id": message_id,
                "sent_at": datetime.now(timezone.utc),
            }
        )
        
        # Update email_threads
        await db.execute(
            text("""
                UPDATE email_threads
                SET replied_by_user = 1, last_followup_sent_at = :sent_at
                WHERE id::text = :message_id
            """),
            {
                "message_id": message_id,
                "sent_at": datetime.now(timezone.utc),
            }
        )
        
        # Update smart_reply_logs
        await db.execute(
            text("""
                UPDATE smart_reply_logs
                SET status = 'sent'
                WHERE user_id::text = :user_id AND thread_id::text = :message_id
                ORDER BY created_at DESC
                LIMIT 1
            """),
            {"user_id": user_id, "message_id": message_id}
        )
        
        await db.commit()
        
        logger.info(f"[Inbox] Reply sent for user {user_id}, message {message_id} (edited: {edited})")
        
        return {
            "message_id": message_id,
            "status": "sent",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "edited": edited,
        }
        
    except Exception as e:
        logger.error(f"[Inbox] Failed to send reply for {user_id}: {e}", exc_info=True)
        await db.rollback()
        raise


# ═══════════════════════════════════════════════════════════════
# Get Inbox Statistics
# ═══════════════════════════════════════════════════════════════

async def get_inbox_stats(db: AsyncSession, user_id: str) -> Dict:
    """
    Get inbox statistics for the user.
    """
    try:
        # Total messages
        result = await db.execute(
            text("SELECT COUNT(*) FROM email_threads WHERE user_id::text = :user_id AND is_automated::boolean = false"),
            {"user_id": user_id}
        )
        total_messages = result.scalar() or 0
        
        # Pending replies
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM email_threads 
                WHERE user_id::text = :user_id 
                  AND is_dismissed::boolean = false
                  AND replied_by_user::boolean = false
                  AND is_automated::boolean = false
            """),
            {"user_id": user_id}
        )
        pending_replies = result.scalar() or 0
        
        # Sent today
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM inbox_messages
                WHERE user_id::text = :user_id
                  AND status = 'sent'
                  AND sent_at >= CURRENT_DATE
            """),
            {"user_id": user_id}
        )
        sent_today = result.scalar() or 0
        
        # Total sent
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM inbox_messages
                WHERE user_id::text = :user_id AND status = 'sent'
            """),
            {"user_id": user_id}
        )
        total_sent = result.scalar() or 0
        
        # Approval rate (sent / generated)
        result = await db.execute(
            text("""
                SELECT COUNT(*) FROM inbox_messages
                WHERE user_id::text = :user_id
            """),
            {"user_id": user_id}
        )
        total_generated = result.scalar() or 0
        
        approval_rate = (total_sent / total_generated * 100) if total_generated > 0 else 0
        
        return {
            "total_messages": total_messages,
            "pending_replies": pending_replies,
            "sent_today": sent_today,
            "total_sent": total_sent,
            "total_generated": total_generated,
            "approval_rate": round(approval_rate, 1),
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
