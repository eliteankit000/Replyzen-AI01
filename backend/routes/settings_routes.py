from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import db
from auth import get_current_user
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


@router.get("")
async def get_settings(current_user: dict = Depends(get_current_user)):
    settings = await db.user_settings.find_one(
        {"user_id": current_user["user_id"]}, {"_id": 0}
    )
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
    return settings


@router.put("/profile")
async def update_profile(req: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    update = {}
    if req.full_name is not None:
        update["full_name"] = req.full_name
    if req.avatar_url is not None:
        update["avatar_url"] = req.avatar_url

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": current_user["user_id"]},
        {"$set": update}
    )
    return {"message": "Profile updated"}


@router.put("")
async def update_settings(req: SettingsUpdateRequest, current_user: dict = Depends(get_current_user)):
    update = {}
    for field, value in req.model_dump(exclude_none=True).items():
        update[field] = value

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.user_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update},
        upsert=True
    )
    return {"message": "Settings updated"}


@router.put("/silence-rules")
async def update_silence_rules(req: SilenceRulesRequest, current_user: dict = Depends(get_current_user)):
    update = {}
    for field, value in req.model_dump(exclude_none=True).items():
        update[field] = value

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.user_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update},
        upsert=True
    )
    return {"message": "Silence rules updated"}


@router.delete("/email-account/{account_id}")
async def disconnect_email(account_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.email_accounts.delete_one(
        {"id": account_id, "user_id": current_user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")

    # Clean up threads for this account
    await db.email_threads.delete_many(
        {"account_id": account_id, "user_id": current_user["user_id"]}
    )

    return {"message": "Account disconnected"}
