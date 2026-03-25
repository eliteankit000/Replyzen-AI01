"""
Smart Reply Mode — API Routes
==============================
Mount this router in your main app file:

    from routes.smart_reply import router as smart_reply_router
    app.include_router(smart_reply_router)

4 endpoints:
  GET  /api/smart-reply/settings         → fetch settings
  POST /api/smart-reply/settings         → save settings
  GET  /api/smart-reply/queue            → list queue items (filterable by status)
  POST /api/smart-reply/queue/{id}/cancel → cancel a queued email

All endpoints are protected by your existing auth dependency.
Adjust the import path for `get_current_user` and `get_db` to match your project.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, validator
from sqlalchemy.ext.asyncio import AsyncSession

# ── Adjust these imports to match your project structure ──────────────────────
# These are the same patterns used across your other route files.
try:
    from database import get_db
except ImportError:
    from db import get_db  # fallback common name

try:
    from dependencies import get_current_user
except ImportError:
    try:
        from auth import get_current_user
    except ImportError:
        from middleware.auth import get_current_user
# ─────────────────────────────────────────────────────────────────────────────

from services.smart_reply_service import (
    get_smart_reply_settings,
    upsert_smart_reply_settings,
    cancel_queued_email,
    get_queued_emails,
    get_daily_smart_reply_sent_count,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/smart-reply",
    tags=["smart-reply"],
)


# ─────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────

class SmartReplySettingsPayload(BaseModel):
    enabled:              bool       = False
    confidence_threshold: int        = Field(80,  ge=0,   le=100)
    daily_limit:          int        = Field(20,  ge=1,   le=500)
    delay_seconds:        int        = Field(120, ge=30,  le=3600)
    allowed_categories:   List[str]  = ["faq", "inquiry"]
    confirmed_first_use:  bool       = False

    @validator("allowed_categories", each_item=True)
    def lowercase_categories(cls, v):
        return v.strip().lower()


class SmartReplySettingsResponse(BaseModel):
    id:                   Optional[str]
    user_id:              str
    enabled:              bool
    confidence_threshold: int
    daily_limit:          int
    delay_seconds:        int
    allowed_categories:   List[str]
    confirmed_first_use:  bool
    created_at:           Optional[str]
    updated_at:           Optional[str]


class QueueItemResponse(BaseModel):
    id:           str
    to_email:     str
    subject:      str
    status:       str
    scheduled_at: Optional[str]
    created_at:   Optional[str]
    sent_at:      Optional[str]
    cancelled_at: Optional[str]
    cancelled:    bool


# ─────────────────────────────────────────────
# GET /api/smart-reply/settings
# ─────────────────────────────────────────────

@router.get(
    "/settings",
    summary="Get Smart Reply Mode settings for the authenticated user",
)
async def get_settings(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns current Smart Reply settings.
    If the user has never configured Smart Reply, returns safe defaults
    (enabled=false) without creating a DB row.
    """
    try:
        settings = await get_smart_reply_settings(db, current_user.id)
        daily_sent = await get_daily_smart_reply_sent_count(db, current_user.id)

        return {
            "data": settings,
            "meta": {
                "daily_sent_today": daily_sent,
                "daily_remaining":  max(0, settings.get("daily_limit", 20) - daily_sent),
            },
        }
    except Exception as e:
        logger.error(f"Failed to fetch smart reply settings for {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load Smart Reply settings",
        )


# ─────────────────────────────────────────────
# POST /api/smart-reply/settings
# ─────────────────────────────────────────────

@router.post(
    "/settings",
    summary="Save Smart Reply Mode settings",
)
async def update_settings(
    payload: SmartReplySettingsPayload,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upserts Smart Reply settings for the authenticated user.

    Safety rules enforced server-side:
    - confirmed_first_use must be True before enabling
    - delay_seconds minimum is 30 (cannot bypass delay entirely)
    """
    if payload.enabled and not payload.confirmed_first_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Smart Reply Mode requires explicit user confirmation. "
                "Set confirmed_first_use=true after the user accepts the confirmation dialog."
            ),
        )

    try:
        updated = await upsert_smart_reply_settings(
            db, current_user.id, payload.dict()
        )
        logger.info(
            f"[SmartReply] Settings updated for user {current_user.id} | "
            f"enabled={payload.enabled}"
        )
        return {"data": updated, "success": True}

    except Exception as e:
        logger.error(f"Failed to save smart reply settings for {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save Smart Reply settings",
        )


# ─────────────────────────────────────────────
# GET /api/smart-reply/queue
# ─────────────────────────────────────────────

@router.get(
    "/queue",
    summary="List email queue items for the authenticated user",
)
async def list_queue(
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter by status: queued | sent | cancelled",
    ),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns queued, sent, and/or cancelled emails for the current user.
    Useful for rendering the Smart Reply activity panel in the UI.
    """
    VALID_STATUSES = {"queued", "sent", "cancelled"}
    if status_filter and status_filter not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status filter. Must be one of: {VALID_STATUSES}",
        )

    try:
        items = await get_queued_emails(db, current_user.id, status_filter)
        return {"data": items, "count": len(items)}
    except Exception as e:
        logger.error(f"Failed to fetch queue for {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch email queue",
        )


# ─────────────────────────────────────────────
# POST /api/smart-reply/queue/{queue_id}/cancel
# ─────────────────────────────────────────────

@router.post(
    "/queue/{queue_id}/cancel",
    summary="Cancel a queued email before it is sent",
)
async def cancel_email(
    queue_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancels a queued email.
    Fails gracefully if the email was already sent or already cancelled.

    The user_id check is enforced in the service layer —
    users can only cancel their own queued emails.
    """
    try:
        success = await cancel_queued_email(db, queue_id, current_user.id)
    except Exception as e:
        logger.error(f"Failed to cancel queue item {queue_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel queued email",
        )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Email not found, already sent, or already cancelled. "
                "You can only cancel emails that are still in the queue."
            ),
        )

    return {
        "success": True,
        "queue_id": queue_id,
        "message": "Email cancelled. It will not be sent.",
    }
