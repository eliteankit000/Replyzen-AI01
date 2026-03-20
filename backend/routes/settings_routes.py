from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from plan_permissions import get_user_plan, check_auto_send_allowed
from datetime import datetime, timezone
from typing import Optional

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


class SettingsUpdateRequest(BaseModel):
    daily_digest: Optional[bool] = None
    weekly_report: Optional[bool] = None
    auto_send: Optional[bool] = None
    send_window_start: Optional[str] = None
    send_window_end: Optional[str] = None
    timezone: Optional[str] = None
    daily_send_limit: Optional[int] = None


class SilenceRulesRequest(BaseModel):
    silence_delay_days: Optional[int] = None
    excluded_domains: Optional[str] = None
    ignore_newsletters: Optional[bool] = None
    ignore_notifications: Optional[bool] = None


# -------------------------------------------------------
# Get Settings
# -------------------------------------------------------

@router.get("")
async def get_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("""
        SELECT *
        FROM user_settings
        WHERE user_id = :uid
        LIMIT 1
        """),
        {"uid": current_user["user_id"]}
    )

    settings = result.fetchone()

    if not settings:
        return {
            "daily_digest": True,
            "weekly_report": True,
            "auto_send": False,
            "send_window_start": "09:00",
            "send_window_end": "18:00",
            "timezone": "UTC",
            "daily_send_limit": 20,
            "silence_delay_days": 3,
            "excluded_domains": "",
            "ignore_newsletters": True,
            "ignore_notifications": True,
        }

    return dict(settings._mapping)


# -------------------------------------------------------
# Update Profile
# -------------------------------------------------------

@router.put("/profile")
async def update_profile(
    req: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    update_fields = {}

    if req.full_name is not None:
        update_fields["full_name"] = req.full_name

    if req.avatar_url is not None:
        update_fields["avatar_url"] = req.avatar_url

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_fields["updated_at"] = datetime.now(timezone.utc)

    query_parts = []
    params = {"uid": current_user["user_id"]}

    for key, value in update_fields.items():
        query_parts.append(f"{key} = :{key}")
        params[key] = value

    query = f"""
    UPDATE users
    SET {", ".join(query_parts)}
    WHERE id = :uid
    """

    await db.execute(text(query), params)
    await db.commit()

    return {"message": "Profile updated"}


# -------------------------------------------------------
# Update Settings
# -------------------------------------------------------

@router.put("")
async def update_settings(
    req: SettingsUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    update = req.model_dump(exclude_none=True)

    # ✅ FIX 1: Pass `db` as the second argument to get_user_plan.
    #
    # BEFORE: plan = await get_user_plan(current_user["user_id"])
    #   get_user_plan signature is get_user_plan(user_id, db) — two required args.
    #   Calling it with only user_id raises TypeError: missing positional argument 'db'
    #   FastAPI catches this as an unhandled exception → 500 → "Failed to save settings".
    #   This crash happened on EVERY auto_send toggle attempt, for every plan.
    #
    # AFTER: pass db so the function can query the users table for the live plan.
    if "auto_send" in update and update["auto_send"]:
        plan = await get_user_plan(current_user["user_id"], db)  # ← db added

        if not check_auto_send_allowed(plan):
            raise HTTPException(
                status_code=403,
                detail="Auto-send is available on Pro and Business plans."
            )

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc)

    set_clause = ", ".join([f"{k} = :{k}" for k in update.keys()])

    params = update.copy()
    params["uid"] = current_user["user_id"]

    # ✅ FIX 2: Use INSERT ... ON CONFLICT (upsert) instead of plain UPDATE.
    #
    # BEFORE: plain UPDATE affected 0 rows silently for new users who never had
    #   a settings row created. The request returned 200 but nothing was saved —
    #   the next page load would show the default values again.
    #
    # AFTER: ensure a settings row always exists first, then update it.
    #   We use a two-step approach compatible with all Postgres versions:
    #   1. INSERT the row with defaults if it doesn't exist yet (ON CONFLICT DO NOTHING)
    #   2. UPDATE the specific fields the user changed
    await db.execute(
        text("""
        INSERT INTO user_settings (user_id, created_at, updated_at)
        VALUES (:uid, :now, :now)
        ON CONFLICT (user_id) DO NOTHING
        """),
        {"uid": current_user["user_id"], "now": datetime.now(timezone.utc)}
    )

    await db.execute(
        text(f"""
        UPDATE user_settings
        SET {set_clause}
        WHERE user_id = :uid
        """),
        params
    )

    await db.commit()

    return {"message": "Settings updated"}


# -------------------------------------------------------
# Update Silence Rules
# -------------------------------------------------------

@router.put("/silence-rules")
async def update_silence_rules(
    req: SilenceRulesRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    update = req.model_dump(exclude_none=True)

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc)

    set_clause = ", ".join([f"{k} = :{k}" for k in update.keys()])

    params = update.copy()
    params["uid"] = current_user["user_id"]

    # ✅ FIX 2 (same upsert fix applied here too):
    #   Silence rules hit the same user_settings table — same problem applies.
    #   Without the INSERT guard, toggling ignore_newsletters on a new account
    #   silently saves nothing.
    await db.execute(
        text("""
        INSERT INTO user_settings (user_id, created_at, updated_at)
        VALUES (:uid, :now, :now)
        ON CONFLICT (user_id) DO NOTHING
        """),
        {"uid": current_user["user_id"], "now": datetime.now(timezone.utc)}
    )

    await db.execute(
        text(f"""
        UPDATE user_settings
        SET {set_clause}
        WHERE user_id = :uid
        """),
        params
    )

    await db.commit()

    return {"message": "Silence rules updated"}


# -------------------------------------------------------
# Disconnect Email Account
# -------------------------------------------------------

@router.delete("/email-account/{account_id}")
async def disconnect_email(
    account_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("""
        DELETE FROM email_accounts
        WHERE id = :aid AND user_id = :uid
        RETURNING id
        """),
        {
            "aid": account_id,
            "uid": current_user["user_id"]
        }
    )

    deleted = result.fetchone()

    if not deleted:
        raise HTTPException(status_code=404, detail="Account not found")

    await db.execute(
        text("""
        DELETE FROM email_threads
        WHERE account_id = :aid AND user_id = :uid
        """),
        {
            "aid": account_id,
            "uid": current_user["user_id"]
        }
    )

    await db.commit()

    return {"message": "Account disconnected"}
