"""
Smart Reply Mode - API Routes

📁 Place this file at: backend/routes/smart_reply.py

FIX LOG:
  - Replaced silent try/except import chain with explicit imports (was causing 500s)
  - Fixed Pydantic v1/v2 validator compatibility
  - Fixed mutable list default for allowed_categories
  - Added real error messages in all HTTP exceptions
  - FIXED: payload.dict() → _payload_to_dict() for Pydantic v2 (was causing HTTP 500 on POST /settings)
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, VERSION as PYDANTIC_VERSION
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user

from services.smart_reply_service import (
    get_smart_reply_settings,
    upsert_smart_reply_settings,
    cancel_queued_email,
    get_queued_emails,
    get_daily_smart_reply_sent_count,
    generate_reply,
    get_smart_reply_logs,
    check_rate_limit,
    record_rate_limit,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/smart-reply", tags=["smart-reply"])

# ---------------------------------------------------------------------------
# Pydantic v1 / v2 compatible validator
# ---------------------------------------------------------------------------
_PYDANTIC_V2 = int(PYDANTIC_VERSION.split(".")[0]) >= 2

if _PYDANTIC_V2:
    from pydantic import field_validator

    class SmartReplySettingsPayload(BaseModel):
        enabled:              bool      = False
        smart_reply_mode:     str       = Field("manual", pattern="^(manual|auto)$")
        confidence_threshold: int       = Field(80,  ge=0,  le=100)
        daily_limit:          int       = Field(20,  ge=1,  le=500)
        delay_seconds:        int       = Field(120, ge=30, le=3600)
        allowed_categories:   List[str] = Field(default_factory=lambda: ["faq", "inquiry"])
        confirmed_first_use:  bool      = False

        @field_validator("allowed_categories", mode="before")
        @classmethod
        def lowercase_categories(cls, v):
            if isinstance(v, list):
                return [str(item).strip().lower() for item in v]
            return v

else:
    from pydantic import validator as pydantic_validator

    class SmartReplySettingsPayload(BaseModel):
        enabled:              bool      = False
        smart_reply_mode:     str       = Field("manual", regex="^(manual|auto)$")
        confidence_threshold: int       = Field(80,  ge=0,  le=100)
        daily_limit:          int       = Field(20,  ge=1,  le=500)
        delay_seconds:        int       = Field(120, ge=30, le=3600)
        allowed_categories:   List[str] = Field(default_factory=lambda: ["faq", "inquiry"])
        confirmed_first_use:  bool      = False

        @pydantic_validator("allowed_categories", each_item=True, pre=True)
        @classmethod
        def lowercase_categories(cls, v):
            return str(v).strip().lower()


# ---------------------------------------------------------------------------
# FIX: payload.dict() is removed in Pydantic v2 — use model_dump() instead.
# This helper works safely on both versions.
# ---------------------------------------------------------------------------
def _payload_to_dict(payload: SmartReplySettingsPayload) -> dict:
    if _PYDANTIC_V2:
        return payload.model_dump()
    return payload.dict()


# ---------------------------------------------------------------------------
# GET /api/smart-reply/settings
# ---------------------------------------------------------------------------
@router.get("/settings", summary="Get Smart Reply Mode settings")
async def get_settings(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        settings   = await get_smart_reply_settings(db, current_user.id)
        daily_sent = await get_daily_smart_reply_sent_count(db, current_user.id)
        return {
            "data": settings,
            "meta": {
                "daily_sent_today": daily_sent,
                "daily_remaining":  max(0, settings.get("daily_limit", 20) - daily_sent),
            },
        }
    except Exception as e:
        logger.error(f"[SmartReply] GET settings failed for {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load Smart Reply settings: {str(e)}",
        )


# ---------------------------------------------------------------------------
# POST /api/smart-reply/settings
# ---------------------------------------------------------------------------
@router.post("/settings", summary="Save Smart Reply Mode settings")
async def update_settings(
    payload: SmartReplySettingsPayload,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.enabled and not payload.confirmed_first_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Smart Reply Mode requires explicit user confirmation. "
                "Please accept the confirmation dialog first."
            ),
        )

    try:
        # FIX: was payload.dict() — breaks on Pydantic v2
        updated = await upsert_smart_reply_settings(db, current_user.id, _payload_to_dict(payload))
        logger.info(f"[SmartReply] Settings saved for {current_user.id} | enabled={payload.enabled}")
        return {"data": updated, "success": True}
    except Exception as e:
        logger.error(f"[SmartReply] POST settings failed for {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save Smart Reply settings: {str(e)}",
        )


# ---------------------------------------------------------------------------
# GET /api/smart-reply/queue
# ---------------------------------------------------------------------------
@router.get("/queue", summary="List email queue items")
async def list_queue(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    VALID = {"queued", "sent", "cancelled"}
    if status_filter and status_filter not in VALID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {sorted(VALID)}",
        )
    try:
        items = await get_queued_emails(db, current_user.id, status_filter)
        return {"data": items, "count": len(items)}
    except Exception as e:
        logger.error(f"[SmartReply] GET queue failed for {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch email queue: {str(e)}",
        )


# ---------------------------------------------------------------------------
# POST /api/smart-reply/queue/{queue_id}/cancel
# ---------------------------------------------------------------------------
@router.post("/queue/{queue_id}/cancel", summary="Cancel a queued email")
async def cancel_email(
    queue_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        success = await cancel_queued_email(db, queue_id, current_user.id)
    except Exception as e:
        logger.error(f"[SmartReply] Cancel {queue_id} failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel queued email: {str(e)}",
        )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found, already sent, or already cancelled.",
        )

    return {"success": True, "queue_id": queue_id, "message": "Email cancelled successfully."}


# ---------------------------------------------------------------------------
# POST /api/smart-reply/generate — On-demand reply generation
# ---------------------------------------------------------------------------
class GenerateReplyRequest(BaseModel):
    message: str
    platform: str = "gmail"
    user_id: Optional[str] = None  # Optional, will use current_user if not provided


@router.post("/generate", summary="Generate an AI reply for a message")
async def generate_smart_reply(
    payload: GenerateReplyRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")

    # Check rate limit
    allowed, remaining, reset_in = check_rate_limit(user_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {reset_in} seconds.",
        )

    # Check if Smart Reply is enabled
    settings = await get_smart_reply_settings(db, user_id)
    if not settings.get("enabled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Smart Reply Mode is not enabled. Enable it in Settings first.",
        )

    # Check daily limit
    daily_sent = await get_daily_smart_reply_sent_count(db, user_id)
    if daily_sent >= settings.get("daily_limit", 20):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily reply limit reached. Try again tomorrow.",
        )

    try:
        # Record rate limit usage
        record_rate_limit(user_id)

        result = await generate_reply(
            db=db,
            message=payload.message,
            platform=payload.platform,
            user_id=user_id,
        )

        return {
            "data": result,
            "meta": {
                "rate_limit_remaining": remaining - 1,
                "daily_remaining": max(0, settings.get("daily_limit", 20) - daily_sent - 1),
            },
        }
    except Exception as e:
        logger.error(f"[SmartReply] Generate failed for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reply: {str(e)}",
        )


# ---------------------------------------------------------------------------
# GET /api/smart-reply/logs — Recent reply history
# ---------------------------------------------------------------------------
@router.get("/logs", summary="Get recent smart reply logs")
async def get_reply_logs(
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    try:
        logs = await get_smart_reply_logs(db, user_id, limit)
        return {"data": logs, "count": len(logs)}
    except Exception as e:
        logger.error(f"[SmartReply] GET logs failed for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch reply logs: {str(e)}",
        )
