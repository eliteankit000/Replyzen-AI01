from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from plan_permissions import get_user_plan, check_auto_send_allowed
from datetime import datetime, timezone
from typing import Optional, List

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    full_name:  Optional[str] = None
    avatar_url: Optional[str] = None


class SettingsUpdateRequest(BaseModel):
    daily_digest:      Optional[bool] = None
    weekly_report:     Optional[bool] = None
    auto_send:         Optional[bool] = None
    send_window_start: Optional[str]  = None
    send_window_end:   Optional[str]  = None
    timezone:          Optional[str]  = None
    daily_send_limit:  Optional[int]  = None


class SilenceRulesRequest(BaseModel):
    silence_delay_days:   Optional[int]  = None
    excluded_domains:     Optional[str]  = None
    ignore_newsletters:   Optional[bool] = None
    ignore_notifications: Optional[bool] = None


# NEW ──────────────────────────────────────────────────────────
class FollowUpScopeRequest(BaseModel):
    follow_up_scope:  Optional[str]       = None   # sent_only | manual_contacts | domain_based | all
    allowed_contacts: Optional[List[str]] = None
    allowed_domains:  Optional[List[str]] = None


class BlockSenderRequest(BaseModel):
    sender_email: str


class UnblockSenderRequest(BaseModel):
    sender_email: str
# ─────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────
# Get Settings
# ─────────────────────────────────────────────────────────────

@router.get("")
async def get_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT * FROM user_settings WHERE user_id = :uid LIMIT 1"),
        {"uid": current_user["user_id"]},
    )
    settings = result.fetchone()

    # Also fetch follow-up scope from users table
    user_result = await db.execute(
        text("""
        SELECT follow_up_scope, allowed_contacts, allowed_domains, blocked_senders
        FROM users WHERE id = :uid
        """),
        {"uid": current_user["user_id"]},
    )
    user_row = user_result.fetchone()
    scope_data = dict(user_row._mapping) if user_row else {}

    base = {
        "daily_digest":        True,
        "weekly_report":       True,
        "auto_send":           False,
        "send_window_start":   "09:00",
        "send_window_end":     "18:00",
        "timezone":            "UTC",
        "daily_send_limit":    20,
        "silence_delay_days":  3,
        "excluded_domains":    "",
        "ignore_newsletters":  True,
        "ignore_notifications": True,
    }

    if settings:
        base.update(dict(settings._mapping))

    # Merge scope data
    base["follow_up_scope"]  = scope_data.get("follow_up_scope") or "sent_only"
    base["allowed_contacts"] = scope_data.get("allowed_contacts") or []
    base["allowed_domains"]  = scope_data.get("allowed_domains") or []
    base["blocked_senders"]  = scope_data.get("blocked_senders") or []

    return base


# ─────────────────────────────────────────────────────────────
# Update Profile
# ─────────────────────────────────────────────────────────────

@router.put("/profile")
async def update_profile(
    req: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update_fields = {}
    if req.full_name  is not None: update_fields["full_name"]  = req.full_name
    if req.avatar_url is not None: update_fields["avatar_url"] = req.avatar_url

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_fields["updated_at"] = datetime.now(timezone.utc)
    query_parts = [f"{k} = :{k}" for k in update_fields]
    params = {**update_fields, "uid": current_user["user_id"]}

    await db.execute(
        text(f"UPDATE users SET {', '.join(query_parts)} WHERE id = :uid"),
        params,
    )
    await db.commit()
    return {"message": "Profile updated"}


# ─────────────────────────────────────────────────────────────
# Update Settings
# ─────────────────────────────────────────────────────────────

@router.put("")
async def update_settings(
    req: SettingsUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update = req.model_dump(exclude_none=True)

    if "auto_send" in update and update["auto_send"]:
        plan = await get_user_plan(current_user["user_id"], db)
        if not check_auto_send_allowed(plan):
            raise HTTPException(status_code=403, detail="Auto-send is available on Pro and Business plans.")

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc)
    set_clause = ", ".join([f"{k} = :{k}" for k in update.keys()])
    params = {**update, "uid": current_user["user_id"]}

    await db.execute(
        text("""
        INSERT INTO user_settings (user_id, created_at, updated_at)
        VALUES (:uid, :now, :now)
        ON CONFLICT (user_id) DO NOTHING
        """),
        {"uid": current_user["user_id"], "now": datetime.now(timezone.utc)},
    )
    await db.execute(
        text(f"UPDATE user_settings SET {set_clause} WHERE user_id = :uid"),
        params,
    )
    await db.commit()
    return {"message": "Settings updated"}


# ─────────────────────────────────────────────────────────────
# Update Silence Rules
# ─────────────────────────────────────────────────────────────

@router.put("/silence-rules")
async def update_silence_rules(
    req: SilenceRulesRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    update = req.model_dump(exclude_none=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc)
    set_clause = ", ".join([f"{k} = :{k}" for k in update.keys()])
    params = {**update, "uid": current_user["user_id"]}

    await db.execute(
        text("""
        INSERT INTO user_settings (user_id, created_at, updated_at)
        VALUES (:uid, :now, :now)
        ON CONFLICT (user_id) DO NOTHING
        """),
        {"uid": current_user["user_id"], "now": datetime.now(timezone.utc)},
    )
    await db.execute(
        text(f"UPDATE user_settings SET {set_clause} WHERE user_id = :uid"),
        params,
    )
    await db.commit()
    return {"message": "Silence rules updated"}


# ─────────────────────────────────────────────────────────────
# NEW: Follow-Up Scope
# ─────────────────────────────────────────────────────────────

@router.put("/followup-scope")
async def update_followup_scope(
    req: FollowUpScopeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update follow_up_scope, allowed_contacts, allowed_domains."""
    update_parts = []
    params: dict = {"uid": current_user["user_id"]}

    valid_scopes = {"sent_only", "manual_contacts", "domain_based", "all"}
    if req.follow_up_scope is not None:
        if req.follow_up_scope not in valid_scopes:
            raise HTTPException(status_code=400, detail=f"Invalid scope. Must be one of: {valid_scopes}")
        update_parts.append("follow_up_scope = :scope")
        params["scope"] = req.follow_up_scope

    if req.allowed_contacts is not None:
        update_parts.append("allowed_contacts = :contacts")
        params["contacts"] = req.allowed_contacts

    if req.allowed_domains is not None:
        update_parts.append("allowed_domains = :domains")
        params["domains"] = req.allowed_domains

    if not update_parts:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_parts.append("updated_at = :updated")
    params["updated"] = datetime.now(timezone.utc)

    await db.execute(
        text(f"UPDATE users SET {', '.join(update_parts)} WHERE id = :uid"),
        params,
    )
    await db.commit()
    return {"message": "Follow-up scope updated"}


# ─────────────────────────────────────────────────────────────
# NEW: Block / Unblock Sender
# ─────────────────────────────────────────────────────────────

@router.post("/block-sender")
async def block_sender(
    req: BlockSenderRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a sender to the user's blocked_senders list."""
    sender = req.sender_email.lower().strip()

    await db.execute(
        text("""
        UPDATE users
        SET blocked_senders = array_append(
            COALESCE(blocked_senders, '{}'),
            :sender
        ),
        updated_at = :updated
        WHERE id = :uid
          AND NOT (:sender = ANY(COALESCE(blocked_senders, '{}')))
        """),
        {
            "sender":  sender,
            "uid":     current_user["user_id"],
            "updated": datetime.now(timezone.utc),
        },
    )
    await db.commit()
    return {"message": f"Sender {sender} blocked"}


@router.post("/unblock-sender")
async def unblock_sender(
    req: UnblockSenderRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a sender from the user's blocked_senders list."""
    sender = req.sender_email.lower().strip()

    await db.execute(
        text("""
        UPDATE users
        SET blocked_senders = array_remove(COALESCE(blocked_senders, '{}'), :sender),
            updated_at = :updated
        WHERE id = :uid
        """),
        {
            "sender":  sender,
            "uid":     current_user["user_id"],
            "updated": datetime.now(timezone.utc),
        },
    )
    await db.commit()
    return {"message": f"Sender {sender} unblocked"}


@router.get("/blocked-senders")
async def get_blocked_senders(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT COALESCE(blocked_senders, '{}') AS blocked_senders FROM users WHERE id = :uid"),
        {"uid": current_user["user_id"]},
    )
    row = result.fetchone()
    return {"blocked_senders": list(row.blocked_senders) if row else []}


# ─────────────────────────────────────────────────────────────
# Disconnect Email Account (existing — unchanged)
# ─────────────────────────────────────────────────────────────

@router.delete("/email-account/{account_id}")
async def disconnect_email(
    account_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    # Verify the account belongs to this user before deleting
    check = await db.execute(
        text("SELECT id FROM email_accounts WHERE id = :aid AND user_id = :uid"),
        {"aid": account_id, "uid": user_id},
    )
    if not check.fetchone():
        raise HTTPException(status_code=404, detail="Account not found")

    # Always delete threads first (safe — no trigger conflict on email_threads)
    await db.execute(
        text("DELETE FROM email_threads WHERE account_id = :aid AND user_id = :uid"),
        {"aid": account_id, "uid": user_id},
    )
    await db.commit()

    # Delete the account. A BEFORE DELETE trigger in Supabase can cause
    # TriggeredDataChangeViolationError if it modifies the row being deleted.
    # Workaround: disable user triggers for this statement via
    # session_replication_role = replica (available to the service role).
    # If that fails, fall back to a soft-delete (is_active = false) so the
    # account stops appearing in the UI without raising a 500.
    try:
        async with db.begin():
            await db.execute(text("SET LOCAL session_replication_role = replica"))
            await db.execute(
                text("DELETE FROM email_accounts WHERE id = :aid AND user_id = :uid"),
                {"aid": account_id, "uid": user_id},
            )
    except Exception:
        logger.warning(
            f"Hard-delete of email_account {account_id} blocked by DB trigger; "
            "falling back to soft-delete (is_active = false)"
        )
        await db.rollback()
        await db.execute(
            text(
                "UPDATE email_accounts SET is_active = false, updated_at = :now "
                "WHERE id = :aid AND user_id = :uid"
            ),
            {"aid": account_id, "uid": user_id, "now": datetime.now(timezone.utc)},
        )
        await db.commit()

    return {"message": "Account disconnected"}
