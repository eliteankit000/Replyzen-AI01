"""
Inbox Routes - Google-compliant inbox preview system
=====================================================
Provides read-only inbox preview with AI reply suggestions.
ALL sending is done via Gmail compose URL (user-initiated).

COMPLIANCE: No programmatic email sending.
           Uses gmail.readonly scope only.

Routes:
  GET  /api/inbox/messages           - List inbox messages with AI analysis
  POST /api/inbox/generate-reply     - Generate single AI reply suggestion
  POST /api/inbox/generate-replies   - Generate 3 reply options (Professional/Friendly/Concise)
  POST /api/inbox/gmail-compose-url  - Get Gmail compose URL for sending
  GET  /api/inbox/stats              - Get inbox statistics
  GET  /api/inbox/daily-summary      - Get top 5 priority emails
"""

import logging
import urllib.parse
from typing import Optional, Dict, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from services.inbox_service import (
    get_inbox_messages,
    generate_reply_suggestion,
    get_inbox_stats,
    log_inbox_action,
)
from services.email_intelligence_service import (
    generate_reply_suggestions,
    analyze_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


# ═══════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════

class GenerateReplyRequest(BaseModel):
    message_id: str
    message: Optional[str] = ""
    platform: str = "gmail"
    tone: str = "professional"


class GenerateRepliesRequest(BaseModel):
    """Request for generating 3 reply options."""
    message_id: str
    subject: str
    snippet: str
    sender: str


class GmailComposeRequest(BaseModel):
    """Request for Gmail compose URL."""
    to: str
    subject: str
    body: str


# ═══════════════════════════════════════════════════════════════
# GET /api/inbox/messages - List inbox messages
# ═══════════════════════════════════════════════════════════════

@router.get("/messages", summary="Get inbox messages (read-only preview)")
async def list_messages(
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List inbox messages for preview with AI analysis.
    
    Filters:
      - status: 'pending' | 'replied' | 'dismissed'
      - category: 'Client' | 'Lead' | 'Payment' | 'Support' | 'Partnership' | 'Marketing' | 'Personal' | 'Spam'
      - priority: 'HOT' | 'WARM' | 'LOW'
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Log inbox access for audit trail
        await log_inbox_action(
            db=db,
            user_id=user_id,
            action="inbox_access",
            details="User viewed inbox messages",
        )
        
        messages = await get_inbox_messages(
            db=db,
            user_id=user_id,
            limit=limit,
            status=status,
        )
        
        # Apply additional filters if provided
        if category:
            messages = [m for m in messages if m.get("ai_category") == category]
        if priority:
            messages = [m for m in messages if m.get("ai_priority_label") == priority]
        
        return {
            "success": True,
            "data": messages,
            "count": len(messages),
            "message": "Inbox messages loaded successfully",
        }
    except Exception as e:
        logger.error(f"[Inbox] Failed to load messages for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load inbox messages: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# GET /api/inbox/daily-summary - Get top priority emails
# ═══════════════════════════════════════════════════════════════

@router.get("/daily-summary", summary="Get today's top 5 priority emails")
async def get_daily_summary(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get today's summary with top 5 emails by priority score.
    
    Returns:
      - top_emails: List of top 5 priority emails
      - category_counts: Count of emails per category
      - priority_counts: Count by priority label (HOT/WARM/LOW)
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Get top 5 by priority score
        result = await db.execute(
            text("""
                SELECT 
                    id, subject, snippet, last_message_from as sender,
                    ai_summary as summary, ai_category as category,
                    priority_score, ai_priority_label as priority_label,
                    ai_opportunity_type as opportunity_type,
                    days_silent, last_message_at
                FROM email_threads
                WHERE user_id = :user_id
                  AND is_dismissed = 0
                  AND is_automated = 0
                ORDER BY priority_score DESC
                LIMIT 5
            """),
            {"user_id": user_id}
        )
        
        top_emails = []
        for row in result.fetchall():
            email = dict(row._mapping)
            if email.get("last_message_at"):
                email["last_message_at"] = email["last_message_at"].isoformat() if hasattr(email["last_message_at"], "isoformat") else email["last_message_at"]
            top_emails.append(email)
        
        # Get category counts
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
        category_counts = {row.category or "Personal": row.count for row in result.fetchall()}
        
        # Get priority counts
        result = await db.execute(
            text("""
                SELECT ai_priority_label as priority, COUNT(*) as count
                FROM email_threads
                WHERE user_id = :user_id
                  AND is_dismissed = 0
                  AND is_automated = 0
                GROUP BY ai_priority_label
            """),
            {"user_id": user_id}
        )
        priority_counts = {row.priority or "LOW": row.count for row in result.fetchall()}
        
        return {
            "success": True,
            "data": {
                "top_emails": top_emails,
                "category_counts": category_counts,
                "priority_counts": priority_counts,
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
        }
        
    except Exception as e:
        logger.error(f"[Inbox] Failed to get daily summary for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load daily summary: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/inbox/generate-reply - Generate single AI reply
# ═══════════════════════════════════════════════════════════════

@router.post("/generate-reply", summary="Generate AI reply suggestion (no auto-send)")
async def generate_reply(
    payload: GenerateReplyRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate AI reply suggestion for a message.
    
    ⚠️ IMPORTANT: This ONLY generates a suggestion.
    No emails are sent automatically.
    User must send via Gmail compose URL.
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Log AI generation for audit trail
        await log_inbox_action(
            db=db,
            user_id=user_id,
            action="reply_generated",
            details=f"AI reply generated for message {payload.message_id}",
        )
        
        result = await generate_reply_suggestion(
            db=db,
            user_id=user_id,
            message_id=payload.message_id,
            message=payload.message,
            platform=payload.platform,
            tone=payload.tone,
        )
        
        return {
            "success": True,
            "data": result,
            "message": "Reply suggestion generated. Use Gmail compose to send.",
        }
    except Exception as e:
        logger.error(f"[Inbox] Failed to generate reply for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reply: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/inbox/generate-replies - Generate 3 reply options
# ═══════════════════════════════════════════════════════════════

@router.post("/generate-replies", summary="Generate 3 reply options (Professional/Friendly/Concise)")
async def generate_replies(
    payload: GenerateRepliesRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate 3 different reply options for an email:
    - Professional: Formal, business-appropriate
    - Friendly: Warm, personable
    - Concise: Brief, to-the-point
    
    ⚠️ IMPORTANT: This ONLY generates suggestions.
    User must edit, copy, and send via Gmail.
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Log for audit trail
        await log_inbox_action(
            db=db,
            user_id=user_id,
            action="replies_generated",
            details=f"Generated 3 reply options for message {payload.message_id}",
        )
        
        # Generate 3 reply options
        replies = await generate_reply_suggestions(
            subject=payload.subject,
            snippet=payload.snippet,
            sender=payload.sender,
        )
        
        return {
            "success": True,
            "data": {
                "message_id": payload.message_id,
                "replies": replies,
            },
            "message": "Reply options generated. Edit and send via Gmail.",
        }
        
    except Exception as e:
        logger.error(f"[Inbox] Failed to generate replies for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate replies: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/inbox/gmail-compose-url - Get Gmail compose URL
# ═══════════════════════════════════════════════════════════════

@router.post("/gmail-compose-url", summary="Get Gmail compose URL for sending")
async def get_gmail_compose_url(
    payload: GmailComposeRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a Gmail compose URL with pre-filled recipient, subject, and body.
    
    COMPLIANCE: This is the ONLY way to send emails from this application.
    Opens Gmail in a new tab - user must manually click Send.
    No programmatic sending.
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Log for audit trail
        await log_inbox_action(
            db=db,
            user_id=user_id,
            action="gmail_compose_requested",
            details=f"User requested Gmail compose URL for: {payload.to}",
        )
        
        # Build Gmail compose URL
        gmail_url = (
            f"https://mail.google.com/mail/?view=cm&fs=1"
            f"&to={urllib.parse.quote(payload.to)}"
            f"&su={urllib.parse.quote(payload.subject)}"
            f"&body={urllib.parse.quote(payload.body)}"
        )
        
        return {
            "success": True,
            "data": {
                "gmail_url": gmail_url,
                "to": payload.to,
                "subject": payload.subject,
            },
            "message": "Open Gmail to review and send the email.",
        }
        
    except Exception as e:
        logger.error(f"[Inbox] Failed to generate Gmail URL for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate Gmail URL: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# GET /api/inbox/stats - Get inbox statistics
# ═══════════════════════════════════════════════════════════════

@router.get("/stats", summary="Get inbox statistics")
async def get_stats(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get inbox statistics:
    - Total messages
    - Pending replies
    - Priority breakdown
    - Category breakdown
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        stats = await get_inbox_stats(db, user_id)
        
        return {
            "success": True,
            "data": stats,
        }
    except Exception as e:
        logger.error(f"[Inbox] Failed to load stats for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load inbox stats: {str(e)}",
        )
