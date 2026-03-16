from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_EMAILS = [
    "aniketar111@gmail.com",
    "anthoraiofficial@gmail.com",
]


def require_admin(current_user: dict = Depends(get_current_user)):
    email = (current_user.get("email") or "").lower().strip()
    if email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/stats")
async def get_admin_stats(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    async def count(query, params={}):
        try:
            result = await db.execute(text(query), params)
            return result.scalar() or 0
        except Exception as e:
            logger.warning(f"Admin stats query failed: {e}")
            return 0

    total_users          = await count("SELECT COUNT(*) FROM users")
    active_subscriptions = await count("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'")
    emails_connected     = await count("SELECT COUNT(*) FROM email_accounts")
    followups_generated  = await count("SELECT COUNT(*) FROM followups")

    return {
        "total_users":          total_users,
        "active_subscriptions": active_subscriptions,
        "emails_connected":     emails_connected,
        "followups_generated":  followups_generated,
    }
