"""
Inbox Routes - Google-reviewer-friendly inbox preview system
=============================================================
Provides read-only inbox preview with AI reply suggestions.
ALL sends require explicit user approval (logged for audit).

Routes:
  GET  /api/inbox/messages        - List inbox messages
  POST /api/inbox/generate-reply  - Generate AI reply suggestion
  POST /api/inbox/send            - Send reply (ONLY with approval flag)
  GET  /api/inbox/stats           - Get inbox statistics
"""

import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from services.inbox_service import (
    get_inbox_messages,
    generate_reply_suggestion,
    send_approved_reply,
    get_inbox_stats,
    log_inbox_action,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


# ═══════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════

class GenerateReplyRequest(BaseModel):
    message_id: str
    message: str
    platform: str = "gmail"
    tone: str = "professional"


class SendReplyRequest(BaseModel):
    message_id: str
    reply: str
    approved: bool  # MUST be true to send
    edited: bool = False


# ═══════════════════════════════════════════════════════════════
# GET /api/inbox/messages - List inbox messages
# ═══════════════════════════════════════════════════════════════

@router.get("/messages", summary="Get inbox messages (read-only preview)")
async def list_messages(
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List inbox messages for preview.
    Returns messages from Gmail/social platforms.
    
    Status filter: 'pending' | 'replied' | 'dismissed'
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
# POST /api/inbox/generate-reply - Generate AI reply suggestion
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
    User must explicitly approve via /send endpoint.
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
            "message": "Reply suggestion generated. Review before sending.",
        }
    except Exception as e:
        logger.error(f"[Inbox] Failed to generate reply for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reply: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/inbox/send - Send reply (REQUIRES EXPLICIT APPROVAL)
# ═══════════════════════════════════════════════════════════════

@router.post("/send", summary="Send reply (requires explicit user approval)")
async def send_reply(
    payload: SendReplyRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a reply email/message.
    
    🔒 SECURITY: Requires explicit approval flag.
    All sends are logged for audit trail.
    Used for Google OAuth verification compliance.
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    # ⚠️ CRITICAL: Must have explicit approval
    if not payload.approved:
        logger.warning(f"[Inbox] Send attempt without approval by {user_id} for message {payload.message_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reply cannot be sent without explicit user approval",
        )
    
    try:
        # Log send action BEFORE sending (audit trail)
        await log_inbox_action(
            db=db,
            user_id=user_id,
            action="reply_sent",
            details=f"User approved and sent reply for message {payload.message_id} (edited: {payload.edited})",
        )
        
        result = await send_approved_reply(
            db=db,
            user_id=user_id,
            message_id=payload.message_id,
            reply=payload.reply,
            edited=payload.edited,
        )
        
        return {
            "success": True,
            "data": result,
            "message": "Reply sent successfully",
        }
    except Exception as e:
        logger.error(f"[Inbox] Failed to send reply for {user_id}: {e}", exc_info=True)
        
        # Log failure for audit
        await log_inbox_action(
            db=db,
            user_id=user_id,
            action="reply_send_failed",
            details=f"Failed to send reply for message {payload.message_id}: {str(e)}",
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send reply: {str(e)}",
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
    - Sent today
    - Approval rate
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
