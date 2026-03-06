from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import db
from auth import get_current_user
from services.mock_gmail import generate_mock_threads
import uuid
from datetime import datetime, timezone
from typing import Optional

router = APIRouter(prefix="/api/emails", tags=["emails"])


class ConnectGmailRequest(BaseModel):
    email: str


@router.post("/connect-gmail")
async def connect_gmail(req: ConnectGmailRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    existing = await db.email_accounts.find_one(
        {"user_id": user_id, "email": req.email}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Account already connected")

    account_id = str(uuid.uuid4())
    account = {
        "id": account_id,
        "user_id": user_id,
        "email": req.email,
        "provider": "gmail",
        "status": "connected",
        "access_token_encrypted": "mock_encrypted_token",
        "refresh_token_encrypted": "mock_encrypted_refresh",
        "connected_at": datetime.now(timezone.utc).isoformat(),
        "last_synced": None,
    }
    await db.email_accounts.insert_one(account)

    # Generate mock threads for this account
    threads = generate_mock_threads(user_id, account_id, req.email)
    if threads:
        await db.email_threads.insert_many(threads)

    return {"message": "Gmail connected successfully", "account_id": account_id}


@router.get("/accounts")
async def list_accounts(current_user: dict = Depends(get_current_user)):
    accounts = await db.email_accounts.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0, "access_token_encrypted": 0, "refresh_token_encrypted": 0}
    ).to_list(100)
    return accounts


@router.post("/sync")
async def sync_emails(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    accounts = await db.email_accounts.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(100)

    if not accounts:
        raise HTTPException(status_code=400, detail="No email accounts connected")

    total_new = 0
    for account in accounts:
        existing_count = await db.email_threads.count_documents(
            {"user_id": user_id, "account_id": account["id"]}
        )
        if existing_count < 5:
            threads = generate_mock_threads(user_id, account["id"], account["email"])
            if threads:
                await db.email_threads.insert_many(threads)
                total_new += len(threads)

        await db.email_accounts.update_one(
            {"id": account["id"]},
            {"$set": {"last_synced": datetime.now(timezone.utc).isoformat()}}
        )

    return {"message": f"Synced {total_new} new threads", "new_threads": total_new}


@router.get("/threads")
async def list_threads(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}
    if status == "silent":
        query["is_silent"] = True
    elif status == "replied":
        query["is_silent"] = False

    threads = await db.email_threads.find(
        query, {"_id": 0}
    ).sort("last_message_at", -1).skip(offset).limit(limit).to_list(limit)

    total = await db.email_threads.count_documents(query)
    return {"threads": threads, "total": total}


@router.get("/threads/silent")
async def list_silent_threads(
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]

    settings = await db.user_settings.find_one({"user_id": user_id}, {"_id": 0})
    delay_days = settings.get("silence_delay_days", 3) if settings else 3

    threads = await db.email_threads.find(
        {"user_id": user_id, "is_silent": True, "days_silent": {"$gte": delay_days}},
        {"_id": 0}
    ).sort("days_silent", -1).skip(offset).limit(limit).to_list(limit)

    total = await db.email_threads.count_documents(
        {"user_id": user_id, "is_silent": True, "days_silent": {"$gte": delay_days}}
    )
    return {"threads": threads, "total": total}
