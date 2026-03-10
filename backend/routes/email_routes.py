from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from services.gmail_service import (
    get_auth_url,
    exchange_code_for_tokens,
    encrypt_tokens,
    get_user_email,
    fetch_threads,
    GMAIL_CLIENT_ID
)
from plan_permissions import check_account_limit
import uuid
import os
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emails", tags=["emails"])

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# ✅ Must match exactly what's registered in Google Cloud Console
GMAIL_REDIRECT_URI = os.environ.get(
    "GMAIL_REDIRECT_URI",
    "https://replyzen-ai01-production.up.railway.app/api/emails/gmail/callback"
)


class ConnectGmailRequest(BaseModel):
    email: str


@router.get("/gmail/auth-url")
async def get_gmail_auth_url(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    account_check = await check_account_limit(user_id, db)
    if not account_check["allowed"]:
        raise HTTPException(status_code=403, detail="Email account limit reached")

    if not GMAIL_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Gmail OAuth not configured")

    # ✅ Fix: pass redirect_uri so Google knows where to redirect back
    auth_url = get_auth_url(state=user_id, redirect_uri=GMAIL_REDIRECT_URI)

    return {"auth_url": auth_url}


# ✅ GET callback — Google redirects browser here after user approves
@router.get("/gmail/callback")
async def gmail_oauth_callback_get(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db)
):
    user_id = state

    tokens = exchange_code_for_tokens(code, GMAIL_REDIRECT_URI)
    encrypted = encrypt_tokens(tokens)
    gmail_email = get_user_email(encrypted)

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email=:email"),
        {"uid": user_id, "email": gmail_email},
    )
    existing = result.fetchone()

    if existing:
        await db.execute(
            text("""
            UPDATE email_accounts
            SET access_token_encrypted=:access,
                refresh_token_encrypted=:refresh,
                updated_at=:updated
            WHERE id=:id
            """),
            {
                "access": encrypted["access_token_encrypted"],
                "refresh": encrypted["refresh_token_encrypted"],
                "updated": datetime.now(timezone.utc),
                "id": existing[0],
            },
        )
        await db.commit()
    else:
        account_id = str(uuid.uuid4())
        await db.execute(
            text("""
            INSERT INTO email_accounts
            (id,user_id,email,provider,status,access_token_encrypted,refresh_token_encrypted,connected_at)
            VALUES
            (:id,:uid,:email,'gmail','connected',:access,:refresh,:connected)
            """),
            {
                "id": account_id,
                "uid": user_id,
                "email": gmail_email,
                "access": encrypted["access_token_encrypted"],
                "refresh": encrypted["refresh_token_encrypted"],
                "connected": datetime.now(timezone.utc),
            },
        )
        await db.commit()

    # ✅ Redirect user back to settings page after connecting
    return RedirectResponse(f"{FRONTEND_URL}/settings?gmail=connected")


# Keep POST for any direct API calls
@router.post("/gmail/callback")
async def gmail_oauth_callback_post(
    code: str,
    state: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    if state != user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    tokens = exchange_code_for_tokens(code, GMAIL_REDIRECT_URI)
    encrypted = encrypt_tokens(tokens)
    gmail_email = get_user_email(encrypted)

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email=:email"),
        {"uid": user_id, "email": gmail_email},
    )
    existing = result.fetchone()

    if existing:
        await db.execute(
            text("""
            UPDATE email_accounts
            SET access_token_encrypted=:access,
                refresh_token_encrypted=:refresh,
                updated_at=:updated
            WHERE id=:id
            """),
            {
                "access": encrypted["access_token_encrypted"],
                "refresh": encrypted["refresh_token_encrypted"],
                "updated": datetime.now(timezone.utc),
                "id": existing[0],
            },
        )
        await db.commit()
        return {"message": "Gmail reconnected"}

    account_id = str(uuid.uuid4())
    await db.execute(
        text("""
        INSERT INTO email_accounts
        (id,user_id,email,provider,status,access_token_encrypted,refresh_token_encrypted,connected_at)
        VALUES
        (:id,:uid,:email,'gmail','connected',:access,:refresh,:connected)
        """),
        {
            "id": account_id,
            "uid": user_id,
            "email": gmail_email,
            "access": encrypted["access_token_encrypted"],
            "refresh": encrypted["refresh_token_encrypted"],
            "connected": datetime.now(timezone.utc),
        },
    )
    await db.commit()
    return {"message": "Gmail connected", "account_id": account_id}


@router.get("/accounts")
async def list_accounts(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("SELECT id,email,provider,status,connected_at FROM email_accounts WHERE user_id=:uid"),
        {"uid": current_user["user_id"]},
    )
    accounts = [dict(row._mapping) for row in result]
    return accounts


@router.get("/threads")
async def list_threads(
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("""
        SELECT * FROM email_threads
        WHERE user_id=:uid
        ORDER BY last_message_at DESC
        LIMIT :limit OFFSET :offset
        """),
        {"uid": current_user["user_id"], "limit": limit, "offset": offset},
    )
    threads = [dict(row._mapping) for row in result]
    return {"threads": threads}


@router.post("/connect-gmail")
async def connect_gmail_demo(
    req: ConnectGmailRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Demo mode — connects a Gmail account without real OAuth"""
    user_id = current_user["user_id"]

    account_check = await check_account_limit(user_id, db)
    if not account_check["allowed"]:
        raise HTTPException(status_code=403, detail="Email account limit reached")

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email=:email"),
        {"uid": user_id, "email": req.email},
    )
    if result.fetchone():
        raise HTTPException(status_code=400, detail="Account already connected")

    account_id = str(uuid.uuid4())
    await db.execute(
        text("""
        INSERT INTO email_accounts
        (id,user_id,email,provider,status,connected_at)
        VALUES (:id,:uid,:email,'gmail','connected',:connected)
        """),
        {
            "id": account_id,
            "uid": user_id,
            "email": req.email,
            "connected": datetime.now(timezone.utc),
        },
    )
    await db.commit()
    return {"message": "Demo Gmail connected", "account_id": account_id}
