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

VALID_PLANS = {"free", "pro", "business"}

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
    total_users         = await safe_count(db, "SELECT COUNT(*) FROM public.users")
    emails_connected    = await safe_count(db, "SELECT COUNT(*) FROM public.email_accounts")
    followups_generated = await safe_count(db, "SELECT COUNT(*) FROM public.followup_suggestions")

    # Count paid plan users as "active subscriptions"
    active_subscriptions = await safe_count(
        db,
        "SELECT COUNT(*) FROM public.users WHERE plan IN ('pro', 'business')"
    )

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
                SELECT id, email, full_name, plan, created_at, true AS is_active
                FROM public.users
                WHERE email ILIKE :search OR full_name ILIKE :search
                ORDER BY created_at DESC
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
                SELECT id, email, full_name, plan, created_at, true AS is_active
                FROM public.users
                ORDER BY created_at DESC
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

@router.patch("/users/{user_id}/plan")
async def update_user_plan(
    user_id: str,
    body: dict,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    plan = body.get("plan")
    if not plan:
        raise HTTPException(status_code=400, detail="plan is required")

    if plan not in VALID_PLANS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan '{plan}'. Must be one of: {', '.join(sorted(VALID_PLANS))}"
        )

    try:
        await db.execute(
            text("UPDATE public.users SET plan = :plan, updated_at = NOW() WHERE id = :id"),
            {"plan": plan, "id": user_id}
        )

        # Try to update subscriptions table too (if it exists)
        try:
            await db.execute(
                text("""
                UPDATE public.subscriptions
                SET plan = :plan
                WHERE user_id = :id AND status IN ('active', 'trialing')
                """),
                {"plan": plan, "id": user_id}
            )
        except Exception:
            pass  # subscriptions table may not exist — that's fine

        await db.commit()
        logger.info(f"Admin {current_user.get('email')} updated user {user_id} plan to {plan}")
        return {"success": True, "user_id": user_id, "plan": plan}

    except Exception as e:
        logger.error(f"Update plan failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        await db.execute(
            text("DELETE FROM public.users WHERE id = :id"),
            {"id": user_id}
        )
        await db.commit()
        return {"success": True, "deleted_user_id": user_id}
    except Exception as e:
        logger.error(f"Delete user failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
# ✅ FIX: Show users with paid plans from users table directly.
# The subscriptions table may be empty since billing stores plan in users.plan.

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
        # First try the subscriptions table
        has_subscriptions = await safe_count(db, "SELECT COUNT(*) FROM public.subscriptions")

        if has_subscriptions > 0:
            # Real subscriptions table has data — use it
            if status:
                query = text("""
                    SELECT s.id, s.user_id, s.status, s.plan,
                           s.created_at, s.expires_at,
                           u.email, u.full_name
                    FROM public.subscriptions s
                    LEFT JOIN public.users u ON u.id = s.user_id
                    WHERE s.status = :status
                    ORDER BY s.created_at DESC
                    LIMIT :limit OFFSET :offset
                """)
                result = await db.execute(query, {
                    "status": status, "limit": limit, "offset": offset
                })
                total = await safe_count(db,
                    "SELECT COUNT(*) FROM public.subscriptions WHERE status = :status",
                    {"status": status}
                )
            else:
                query = text("""
                    SELECT s.id, s.user_id, s.status, s.plan,
                           s.created_at, s.expires_at,
                           u.email, u.full_name
                    FROM public.subscriptions s
                    LEFT JOIN public.users u ON u.id = s.user_id
                    ORDER BY s.created_at DESC
                    LIMIT :limit OFFSET :offset
                """)
                result = await db.execute(query, {"limit": limit, "offset": offset})
                total = await safe_count(db, "SELECT COUNT(*) FROM public.subscriptions")

            rows = result.mappings().all()
            return {
                "subscriptions": [dict(r) for r in rows],
                "total": total,
                "page": page,
                "pages": -(-total // limit)
            }

        else:
            # ✅ FALLBACK: subscriptions table empty — derive from users.plan
            plan_filter = ""
            params: dict = {"limit": limit, "offset": offset}

            if status == "active":
                plan_filter = "AND u.plan IN ('pro', 'business')"
            elif status in ("cancelled", "expired"):
                plan_filter = "AND u.plan = 'free'"

            query = text(f"""
                SELECT
                    u.id,
                    u.id AS user_id,
                    CASE WHEN u.plan IN ('pro', 'business') THEN 'active' ELSE 'free' END AS status,
                    u.plan,
                    u.created_at,
                    NULL AS expires_at,
                    u.email,
                    u.full_name
                FROM public.users u
                WHERE 1=1 {plan_filter}
                ORDER BY u.created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            result = await db.execute(query, params)
            rows = result.mappings().all()

            count_query = f"SELECT COUNT(*) FROM public.users WHERE 1=1 {plan_filter}"
            total = await safe_count(db, count_query)

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
# ✅ FIX: was selecting ea.email but column is email_address

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
            SELECT
                ea.id,
                ea.email_address AS email,
                ea.provider,
                ea.created_at,
                ea.is_active,
                u.email AS user_email,
                u.full_name
            FROM public.email_accounts ea
            LEFT JOIN public.users u ON u.id = ea.user_id
            ORDER BY ea.created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        result = await db.execute(query, {"limit": limit, "offset": offset})
        rows   = result.mappings().all()
        total  = await safe_count(db, "SELECT COUNT(*) FROM public.email_accounts")

        return {
            "email_accounts": [dict(r) for r in rows],
            "total":          total,
            "page":           page,
            "pages":          -(-total // limit)
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
            SELECT
                f.id,
                f.status,
                f.generated_at AS created_at,
                f.sent_at,
                f.tone,
                u.email AS user_email,
                u.full_name
            FROM public.followup_suggestions f
            LEFT JOIN public.users u ON u.id = f.user_id
            ORDER BY f.generated_at DESC
            LIMIT :limit OFFSET :offset
        """)
        result = await db.execute(query, {"limit": limit, "offset": offset})
        rows   = result.mappings().all()
        total  = await safe_count(db, "SELECT COUNT(*) FROM public.followup_suggestions")

        return {
            "followups": [dict(r) for r in rows],
            "total":     total,
            "page":      page,
            "pages":     -(-total // limit)
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
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {str(e)}"

    counts = {}
    for table in ["users", "email_accounts", "followup_suggestions", "email_threads"]:
        try:
            result = await db.execute(text(f"SELECT COUNT(*) FROM public.{table}"))
            counts[table] = result.scalar() or 0
        except Exception:
            counts[table] = "error"

    return {
        "database":       db_status,
        "api":            "ok",
        "table_counts":   counts,
        "allowed_origins": [
            "http://localhost:3000",
            "http://localhost:5173",
            "https://replyzenai.com",
            "https://www.replyzenai.com",
            "https://replyzen-ai-01-wjzx.vercel.app",
            "https://replyzen-ai-01-3boy.vercel.app",
        ]
    }
