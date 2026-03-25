"""
Smart Reply Mode - API Routes
Place this file at backend/routes/smartreply.py

FIX LOG:
- Replaced silent try/except import chain with explicit imports (was causing 500s)
- Fixed Pydantic v1/v2 validator compatibility
- Fixed mutable list default for allowedcategories
- Added real error messages in all HTTP exceptions
- FIXED payload.dict() -> payload.model_dump() for Pydantic v2 (was causing HTTP 500 on POST settings)
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, VERSION as PYDANTIC_VERSION
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from auth import get_current_user
from services.smartreplyservice import (
    get_smart_reply_settings,
    upsert_smart_reply_settings,
    cancel_queued_email,
    get_queued_emails,
    get_daily_smart_reply_sent_count
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/smart-reply", tags=["smart-reply"])

# Pydantic version check - FIXED
PYDANTICV2 = int(PYDANTIC_VERSION.split('.')[0]) >= 2

class SmartReplySettingsPayload(BaseModel):
    enabled: bool = False
    confidence_threshold: int = Field(80, ge=0, le=100)
    daily_limit: int = Field(20, ge=1, le=500)
    delay_seconds: int = Field(120, ge=30, le=3600)
    allowed_categories: List[str] = Field(default_factory=lambda: ["faq", "inquiry"])  # FIXED: immutable default
    confirmed_first_use: bool = False

    if PYDANTICV2:
        from pydantic import field_validator
        @field_validator('allowed_categories', mode='before')
        @classmethod
        def lowercase_categories(cls, v):
            if isinstance(v, list):
                return [str(item).strip().lower() for item in v]
            return v
    else:
        from pydantic import validator
        @validator('allowed_categories', each_item=True, pre=True)
        def lowercase_categories(cls, v):
            return str(v).strip().lower()

# FIXED: payloadtodict for Pydantic v2
def payload_to_dict(payload: SmartReplySettingsPayload) -> dict:
    if PYDANTICV2:
        return payload.model_dump()
    return payload.dict()

@router.get("/settings", summary="Get Smart Reply Mode settings")
async def get_settings(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        settings = await get_smart_reply_settings(db, current_user.id)
        daily_sent = await get_daily_smart_reply_sent_count(db, current_user.id)
        return {
            "data": settings,
            "meta": {
                "daily_sent_today": daily_sent,
                "daily_remaining": max(0, settings.get('daily_limit', 20) - daily_sent)
            }
        }
    except Exception as e:
        logger.error(f"SmartReply GET /settings failed for {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load Smart Reply settings: {str(e)}"
        )

@router.post("/settings", summary="Save Smart Reply Mode settings")
async def update_settings(
    payload: SmartReplySettingsPayload,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if payload.enabled and not payload.confirmed_first_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Smart Reply Mode requires explicit user confirmation. Please accept the confirmation dialog first."
        )
    
    try:
        updated = await upsert_smart_reply_settings(db, current_user.id, payload_to_dict(payload))
        logger.info(f"SmartReply Settings saved for {current_user.id}: enabled={payload.enabled}")
        return {"data": updated, "success": True}
    except Exception as e:
        logger.error(f"SmartReply POST /settings failed for {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save Smart Reply settings: {str(e)}"
        )

@router.get("/queue", summary="List email queue items")
async def list_queue(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    VALID = ["queued", "sent", "cancelled"]
    if status_filter and status_filter not in VALID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of {sorted(VALID)}"
        )
    
    try:
        items = await get_queued_emails(db, current_user.id, status_filter)
        return {"data": items, "count": len(items)}
    except Exception as e:
        logger.error(f"SmartReply GET /queue failed for {current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch email queue: {str(e)}"
        )

@router.post("/queue/{queue_id}/cancel", summary="Cancel a queued email")
async def cancel_email(
    queue_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        success = await cancel_queued_email(db, queue_id, current_user.id)
    except Exception as e:
        logger.error(f"SmartReply Cancel {queue_id} failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel queued email: {str(e)}"
        )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found, already sent, or already cancelled."
        )
    
    return {
        "success": True,
        "queue_id": queue_id,
        "message": "Email cancelled successfully."
    }
