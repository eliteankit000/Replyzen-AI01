"""
Notification Routes
====================
API endpoints for user notifications.

Routes:
  GET  /api/notifications           - Get user notifications
  GET  /api/notifications/unread    - Get unread count
  POST /api/notifications/read      - Mark notification(s) as read
  DELETE /api/notifications/:id     - Delete a notification
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from services.notification_service import (
    get_notifications,
    get_unread_count,
    mark_as_read,
    delete_notification,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class MarkReadRequest(BaseModel):
    notification_id: Optional[str] = None
    mark_all: bool = False


# ═══════════════════════════════════════════════════════════════
# GET /api/notifications - Get notifications
# ═══════════════════════════════════════════════════════════════

@router.get("", summary="Get user notifications")
async def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user notifications, optionally filtered to unread only."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        notifications = await get_notifications(
            db=db,
            user_id=user_id,
            limit=limit,
            unread_only=unread_only,
        )
        
        unread = await get_unread_count(db, user_id)
        
        return {
            "success": True,
            "data": {
                "notifications": notifications,
                "unread_count": unread,
                "total": len(notifications),
            },
        }
        
    except Exception as e:
        logger.error(f"[Notifications] Failed to get notifications: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load notifications",
        )


# ═══════════════════════════════════════════════════════════════
# GET /api/notifications/unread - Get unread count
# ═══════════════════════════════════════════════════════════════

@router.get("/unread", summary="Get unread notification count")
async def get_unread(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get count of unread notifications."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        count = await get_unread_count(db, user_id)
        
        return {
            "success": True,
            "data": {
                "unread_count": count,
            },
        }
        
    except Exception as e:
        logger.error(f"[Notifications] Failed to get unread count: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get unread count",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/notifications/read - Mark as read
# ═══════════════════════════════════════════════════════════════

@router.post("/read", summary="Mark notification(s) as read")
async def mark_read(
    payload: MarkReadRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a specific notification or all notifications as read."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    if not payload.mark_all and not payload.notification_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either notification_id or mark_all=true required",
        )
    
    try:
        success = await mark_as_read(
            db=db,
            user_id=user_id,
            notification_id=payload.notification_id,
            mark_all=payload.mark_all,
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to mark as read",
            )
        
        return {
            "success": True,
            "message": "Marked as read",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Notifications] Failed to mark as read: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mark as read",
        )


# ═══════════════════════════════════════════════════════════════
# DELETE /api/notifications/:id - Delete notification
# ═══════════════════════════════════════════════════════════════

@router.delete("/{notification_id}", summary="Delete a notification")
async def remove_notification(
    notification_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific notification."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        success = await delete_notification(db, user_id, notification_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found",
            )
        
        return {
            "success": True,
            "message": "Notification deleted",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Notifications] Failed to delete: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete notification",
        )
