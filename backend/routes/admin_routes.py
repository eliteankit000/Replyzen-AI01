from fastapi import APIRouter, HTTPException, Depends, Query
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

async def safe_count(db, query, params={}):
    try:
        result = await db.execute(text(query), params)
        return result.scalar() or 0
    except Exception as e:
        logger.warning(f"Admin query failed: {e}")
        return 0

# ─── STATS ────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_admin_stats(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    total_users = await safe_count(db, "SELECT COUNT(*) FROM auth.users")
    active_subscriptions = await safe_count(db, "SELECT COUNT(*) FROM subscriptions WHERE status = 'active'")
    emails_connected     = await safe_count(db, "SELECT COUNT(*) FROM email_accounts")
    followups_generated  = await safe_count(db, "SELECT COUNT(*) FROM followups")

    return {
        "total_users":          total_users,
        "active_subscriptions": active_subscriptions,
        "emails_connected":     emails_connected,
        "followups_generated":  followups_generated,
    }

# ─── USER MANAGEMENT ──────────────────────────────────────────────────────────

@router.get("/users")
async def get_all_users(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(None)
):
    offset = (page - 1) * limit
    try:
        if search:
            query = text("""
                SELECT 
                    u.id, u.email, u.full_name, u.plan, u.created_at, u.is_active,
                    COALESCE(u.full_name, a.raw_user_meta_data->>'full_name') as display_name
                FROM public.users u
                LEFT JOIN auth.users a ON a.id = u.id
                WHERE u.email ILIKE :search OR u.full_name ILIKE :search
                ORDER BY u.created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            result = await db.execute(query, {
                "search": f"%{search}%",
                "limit": limit,
                "offset": offset
            })
            total = await safe_count(db,
                "SELECT COUNT(*) FROM public.users WHERE email ILIKE :s OR full_name ILIKE :s",
                {"s": f"%{search}%"}
            )
        else:
            query = text("""
                SELECT 
                    u.id, u.email,
                    COALESCE(u.full_name, a.raw_user_meta_data->>'full_name') as full_name,
                    u.plan, u.created_at, u.is_active
                FROM public.users u
                LEFT JOIN auth.users a ON a.id = u.id
                ORDER BY u.created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            result = await db.execute(query, {"limit": limit, "offset": offset})
            total = await safe_count(db, "SELECT COUNT(*) FROM public.users")

        rows = result.mappings().all()
        return {
            "users": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "pages": -(-total // limit)
        }
    except Exception as e:
        logger.error(f"Get users failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── SUBSCRIPTIONS / PAYMENT LOGS ─────────────────────────────────────────────

@router.get("/subscriptions")
async def get_subscriptions(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None)
):
    offset = (page - 1) * limit
    try:
        if status:
            query = text("""
                SELECT s.id, s.user_id, s.status, s.plan, s.created_at, s.expires_at,
                       u.email, u.full_name
                FROM subscriptions s
                LEFT JOIN users u ON u.id = s.user_id
                WHERE s.status = :status
                ORDER BY s.created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            result = await db.execute(query, {"status": status, "limit": limit, "offset": offset})
            total = await safe_count(db, "SELECT COUNT(*) FROM subscriptions WHERE status = :status", {"status": status})
        else:
            query = text("""
                SELECT s.id, s.user_id, s.status, s.plan, s.created_at, s.expires_at,
                       u.email, u.full_name
                FROM subscriptions s
                LEFT JOIN users u ON u.id = s.user_id
                ORDER BY s.created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            result = await db.execute(query, {"limit": limit, "offset": offset})
            total = await safe_count(db, "SELECT COUNT(*) FROM subscriptions")

        rows = result.mappings().all()
        return {
            "subscriptions": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "pages": -(-total // limit)
        }
    except Exception as e:
        logger.error(f"Get subscriptions failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── EMAIL ACCOUNT MONITORING ─────────────────────────────────────────────────

@router.get("/email-accounts")
async def get_email_accounts(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    offset = (page - 1) * limit
    try:
        query = text("""
            SELECT ea.id, ea.email, ea.provider, ea.created_at, ea.is_active,
                   u.email as user_email, u.full_name
            FROM email_accounts ea
            LEFT JOIN users u ON u.id = ea.user_id
            ORDER BY ea.created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        result = await db.execute(query, {"limit": limit, "offset": offset})
        rows = result.mappings().all()
        total = await safe_count(db, "SELECT COUNT(*) FROM email_accounts")

        return {
            "email_accounts": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "pages": -(-total // limit)
        }
    except Exception as e:
        logger.error(f"Get email accounts failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── FOLLOW-UP ACTIVITY ───────────────────────────────────────────────────────

@router.get("/followups")
async def get_followup_activity(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    offset = (page - 1) * limit
    try:
        query = text("""
            SELECT f.id, f.status, f.created_at, f.sent_at,
                   u.email as user_email, u.full_name
            FROM followups f
            LEFT JOIN users u ON u.id = f.user_id
            ORDER BY f.created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        result = await db.execute(query, {"limit": limit, "offset": offset})
        rows = result.mappings().all()
        total = await safe_count(db, "SELECT COUNT(*) FROM followups")

        return {
            "followups": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "pages": -(-total // limit)
        }
    except Exception as e:
        logger.error(f"Get followups failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── SYSTEM HEALTH ────────────────────────────────────────────────────────────

@router.get("/health")
async def system_health(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    # Database check
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {str(e)}"

    # Table row counts
    counts = {}
    for table in ["users", "subscriptions", "email_accounts", "followups"]:
        try:
            result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
            counts[table] = result.scalar() or 0
        except Exception:
            counts[table] = "error"

    return {
        "database":      db_status,
        "api":           "ok",
        "table_counts":  counts,
        "allowed_origins": [
            "http://localhost:3000",
            "http://localhost:5173",
            "https://replyzenai.com",
            "https://www.replyzenai.com",
            "https://replyzen-ai-01-wjzx.vercel.app",
            "https://replyzen-ai-01-3boy.vercel.app",
        ]
    }
