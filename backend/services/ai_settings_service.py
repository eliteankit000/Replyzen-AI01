"""
AI Settings Service
====================
Manages user AI configuration settings.

Settings:
- sensitivity: low/medium/high (affects opportunity detection)
- followup_timing: 24h/48h/72h (time before flagging follow-up)
- tracked_categories: List of categories to track
- notify_*: Notification preferences
"""

import uuid
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "sensitivity": "medium",
    "followup_timing": "48h",
    "tracked_categories": ["client", "lead", "payment", "support", "partnership"],
    "notify_potential_client": True,
    "notify_followup": True,
    "notify_urgent": True,
}


async def get_ai_settings(db: AsyncSession, user_id: str) -> Dict:
    """
    Get AI settings for a user.
    Creates default settings if none exist.
    
    Returns:
        Settings dict
    """
    try:
        result = await db.execute(
            text("""
                SELECT id, user_id, sensitivity, followup_timing, tracked_categories,
                       notify_potential_client, notify_followup, notify_urgent,
                       created_at, updated_at
                FROM ai_settings
                WHERE user_id = :user_id
            """),
            {"user_id": user_id}
        )
        
        row = result.fetchone()
        
        if row:
            settings = dict(row._mapping)
            # Parse tracked_categories JSON
            if settings.get("tracked_categories"):
                try:
                    settings["tracked_categories"] = json.loads(settings["tracked_categories"])
                except (json.JSONDecodeError, TypeError):
                    settings["tracked_categories"] = DEFAULT_SETTINGS["tracked_categories"]
            # Convert booleans
            settings["notify_potential_client"] = bool(settings.get("notify_potential_client"))
            settings["notify_followup"] = bool(settings.get("notify_followup"))
            settings["notify_urgent"] = bool(settings.get("notify_urgent"))
            return settings
        
        # Create default settings
        return await create_default_settings(db, user_id)
        
    except Exception as e:
        logger.error(f"[AISettings] Failed to get settings: {e}", exc_info=True)
        return DEFAULT_SETTINGS.copy()


async def create_default_settings(db: AsyncSession, user_id: str) -> Dict:
    """Create default AI settings for a new user."""
    try:
        settings_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        await db.execute(
            text("""
                INSERT INTO ai_settings
                (id, user_id, sensitivity, followup_timing, tracked_categories,
                 notify_potential_client, notify_followup, notify_urgent,
                 created_at, updated_at)
                VALUES
                (:id, :user_id, :sensitivity, :followup_timing, :tracked_categories,
                 :notify_potential_client, :notify_followup, :notify_urgent,
                 :created_at, :updated_at)
            """),
            {
                "id": settings_id,
                "user_id": user_id,
                "sensitivity": DEFAULT_SETTINGS["sensitivity"],
                "followup_timing": DEFAULT_SETTINGS["followup_timing"],
                "tracked_categories": json.dumps(DEFAULT_SETTINGS["tracked_categories"]),
                "notify_potential_client": 1,
                "notify_followup": 1,
                "notify_urgent": 1,
                "created_at": now,
                "updated_at": now,
            }
        )
        await db.commit()
        
        logger.info(f"[AISettings] Created default settings for user {user_id}")
        
        return {
            "id": settings_id,
            "user_id": user_id,
            **DEFAULT_SETTINGS,
        }
        
    except Exception as e:
        logger.error(f"[AISettings] Failed to create default settings: {e}", exc_info=True)
        await db.rollback()
        return DEFAULT_SETTINGS.copy()


async def update_ai_settings(
    db: AsyncSession,
    user_id: str,
    updates: Dict,
) -> Dict:
    """
    Update AI settings for a user.
    
    Args:
        db: Database session
        user_id: User ID
        updates: Dict of settings to update
        
    Returns:
        Updated settings dict
    """
    try:
        # Ensure settings exist
        await get_ai_settings(db, user_id)
        
        # Build update query
        set_clauses = ["updated_at = :updated_at"]
        params = {"user_id": user_id, "updated_at": datetime.now(timezone.utc)}
        
        if "sensitivity" in updates:
            set_clauses.append("sensitivity = :sensitivity")
            params["sensitivity"] = updates["sensitivity"]
            
        if "followup_timing" in updates:
            set_clauses.append("followup_timing = :followup_timing")
            params["followup_timing"] = updates["followup_timing"]
            
        if "tracked_categories" in updates:
            set_clauses.append("tracked_categories = :tracked_categories")
            params["tracked_categories"] = json.dumps(updates["tracked_categories"])
            
        if "notify_potential_client" in updates:
            set_clauses.append("notify_potential_client = :notify_potential_client")
            params["notify_potential_client"] = 1 if updates["notify_potential_client"] else 0
            
        if "notify_followup" in updates:
            set_clauses.append("notify_followup = :notify_followup")
            params["notify_followup"] = 1 if updates["notify_followup"] else 0
            
        if "notify_urgent" in updates:
            set_clauses.append("notify_urgent = :notify_urgent")
            params["notify_urgent"] = 1 if updates["notify_urgent"] else 0
        
        await db.execute(
            text(f"""
                UPDATE ai_settings
                SET {', '.join(set_clauses)}
                WHERE user_id = :user_id
            """),
            params
        )
        await db.commit()
        
        logger.info(f"[AISettings] Updated settings for user {user_id}")
        
        # Return updated settings
        return await get_ai_settings(db, user_id)
        
    except Exception as e:
        logger.error(f"[AISettings] Failed to update settings: {e}", exc_info=True)
        await db.rollback()
        raise


def get_followup_hours(timing: str) -> int:
    """Convert followup_timing setting to hours."""
    timing_map = {
        "24h": 24,
        "48h": 48,
        "72h": 72,
    }
    return timing_map.get(timing, 48)


def get_priority_threshold(sensitivity: str) -> int:
    """Get priority score threshold based on sensitivity."""
    sensitivity_map = {
        "low": 70,    # Only high-confidence (70+)
        "medium": 50, # Balanced (50+)
        "high": 30,   # Catch more (30+)
    }
    return sensitivity_map.get(sensitivity, 50)
