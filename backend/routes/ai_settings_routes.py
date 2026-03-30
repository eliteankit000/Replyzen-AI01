"""
AI Settings Routes
===================
API endpoints for AI configuration settings.

Routes:
  GET  /api/ai-settings          - Get user's AI settings
  PUT  /api/ai-settings          - Update AI settings
  GET  /api/ai-settings/activity - Get AI activity log
  GET  /api/ai-settings/stats    - Get AI processing stats
"""

import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from services.ai_settings_service import get_ai_settings, update_ai_settings
from services.activity_log_service import (
    get_recent_activities,
    get_activity_stats,
    log_settings_updated,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai-settings", tags=["ai-settings"])


class UpdateSettingsRequest(BaseModel):
    sensitivity: Optional[str] = None  # low, medium, high
    followup_timing: Optional[str] = None  # 24h, 48h, 72h
    tracked_categories: Optional[List[str]] = None
    notify_potential_client: Optional[bool] = None
    notify_followup: Optional[bool] = None
    notify_urgent: Optional[bool] = None


# ═══════════════════════════════════════════════════════════════
# GET /api/ai-settings - Get settings
# ═══════════════════════════════════════════════════════════════

@router.get("", summary="Get AI settings")
async def get_settings(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's AI configuration settings."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        settings = await get_ai_settings(db, user_id)
        
        return {
            "success": True,
            "data": settings,
        }
        
    except Exception as e:
        logger.error(f"[AISettings] Failed to get settings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load settings",
        )


# ═══════════════════════════════════════════════════════════════
# PUT /api/ai-settings - Update settings
# ═══════════════════════════════════════════════════════════════

@router.put("", summary="Update AI settings")
async def update_settings(
    payload: UpdateSettingsRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user's AI configuration settings."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    # Validate inputs
    if payload.sensitivity and payload.sensitivity not in ["low", "medium", "high"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sensitivity value",
        )
    
    if payload.followup_timing and payload.followup_timing not in ["24h", "48h", "72h"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid followup_timing value",
        )
    
    try:
        # Build updates dict
        updates = {}
        if payload.sensitivity is not None:
            updates["sensitivity"] = payload.sensitivity
        if payload.followup_timing is not None:
            updates["followup_timing"] = payload.followup_timing
        if payload.tracked_categories is not None:
            updates["tracked_categories"] = payload.tracked_categories
        if payload.notify_potential_client is not None:
            updates["notify_potential_client"] = payload.notify_potential_client
        if payload.notify_followup is not None:
            updates["notify_followup"] = payload.notify_followup
        if payload.notify_urgent is not None:
            updates["notify_urgent"] = payload.notify_urgent
        
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No settings to update",
            )
        
        # Update settings
        settings = await update_ai_settings(db, user_id, updates)
        
        # Log activity
        for key, value in updates.items():
            await log_settings_updated(db, user_id, key, value)
        
        return {
            "success": True,
            "data": settings,
            "message": "Settings updated",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AISettings] Failed to update settings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update settings",
        )


# ═══════════════════════════════════════════════════════════════
# GET /api/ai-settings/activity - Get activity log
# ═══════════════════════════════════════════════════════════════

@router.get("/activity", summary="Get AI activity log")
async def get_activity_log(
    limit: int = Query(50, ge=1, le=200),
    activity_type: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get recent AI activity log."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        activities = await get_recent_activities(
            db=db,
            user_id=user_id,
            limit=limit,
            activity_type=activity_type,
        )
        
        return {
            "success": True,
            "data": {
                "activities": activities,
                "count": len(activities),
            },
        }
        
    except Exception as e:
        logger.error(f"[AISettings] Failed to get activity: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load activity log",
        )


# ═══════════════════════════════════════════════════════════════
# GET /api/ai-settings/stats - Get processing stats
# ═══════════════════════════════════════════════════════════════

@router.get("/stats", summary="Get AI processing stats")
async def get_stats(
    days: int = Query(7, ge=1, le=90),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AI processing statistics."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        stats = await get_activity_stats(db, user_id, days)
        
        return {
            "success": True,
            "data": {
                "stats": stats,
                "period_days": days,
            },
        }
        
    except Exception as e:
        logger.error(f"[AISettings] Failed to get stats: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load stats",
        )
