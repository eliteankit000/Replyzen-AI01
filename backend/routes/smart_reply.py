"""
Smart Reply Mode - API Routes

Mount this router in your main app file:
    from routes.smart_reply import router as smart_reply_router
    app.include_router(smart_reply_router)

FIX LOG:
  - Replaced silent try/except import chain with explicit imports (was causing 500s)
  - Fixed Pydantic v1/v2 validator compatibility
  - Fixed mutable list default for allowed_categories
  - Added real error messages in all HTTP exceptions
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, VERSION as PYDANTIC_VERSION
from sqlalchemy.ext.asyncio import AsyncSession

# -------------------------------------------------------------------------
# IMPORTANT: Replace these two lines with the exact imports from your other
# route files (e.g. routes/settings.py). Wrong imports = silent 500 errors.
# -------------------------------------------------------------------------
from database import get_db                # match your project
from dependencies import get_current_user  # match your project
# -------------------------------------------------------------------------

from services.smart_reply_service import (
    get_smart_reply_settings,
    upsert_smart_reply_settings,
    cancel_queued_email,
    get_queued_emails,
    get_daily_smart_reply_sent_count,
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
        confidence_threshold: int       = Field(80,  ge=0,  le=100)
        daily_limit:          int       = Field(20,  ge=1,  le=500)
        delay_seconds:        int       = Field(120, ge=30, le=3600)
        # FIX: Field(default_factory) avoids mutable default list corruption
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
    # Safety: must explicitly confirm before enabling
    if payload.enabled and not payload.confirmed_first_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Smart Reply Mode requires explicit user confirmation. "
                "Please accept the confirmation dialog first."
            ),
        )

    try:
        updated = await upsert_smart_reply_settings(db, current_user.id, payload.dict())
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
