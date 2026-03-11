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
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emails", tags=["emails"])

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

GMAIL_REDIRECT_URI = os.environ.get(
    "GMAIL_REDIRECT_URI",
    "https://replyzen-ai01-production.up.railway.app/api/emails/gmail/callback"
)


class ConnectGmailRequest(BaseModel):
    email: str


async def verify_user_exists(user_id: str, db: AsyncSession):
    result = await db.execute(
        text("SELECT id FROM users WHERE id = :uid"),
        {"uid": user_id}
    )
    if not result.fetchone():
        raise HTTPException(
            status_code=404,
            detail=f"User {user_id} not found in users table. Please re-login and try again."
        )


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
    auth_url = get_auth_url(state=user_id, redirect_uri=GMAIL_REDIRECT_URI)
    return {"auth_url": auth_url}


@router.get("/gmail/callback")
async def gmail_oauth_callback_get(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db)
):
    user_id = state
    await verify_user_exists(user_id, db)

    tokens = exchange_code_for_tokens(code, GMAIL_REDIRECT_URI)
    encrypted = encrypt_tokens(tokens)
    gmail_email = get_user_email(encrypted)

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email_address=:email"),
        {"uid": user_id, "email": gmail_email},
    )
    existing = result.fetchone()

    if existing:
        await db.execute(
            text("""
            UPDATE email_accounts
            SET access_token=:access, refresh_token=:refresh,
                token_expiry=:expiry, updated_at=:updated
            WHERE id=:id
            """),
            {
                "access": encrypted["access_token"],
                "refresh": encrypted["refresh_token"],
                "expiry": encrypted.get("token_expiry"),
                "updated": datetime.now(timezone.utc),
                "id": existing[0],
            },
        )
    else:
        account_id = str(uuid.uuid4())
        await db.execute(
            text("""
            INSERT INTO email_accounts
            (id, user_id, email_address, provider, is_active, access_token, refresh_token, token_expiry, created_at)
            VALUES (:id, :uid, :email, 'gmail', true, :access, :refresh, :expiry, :connected)
            """),
            {
                "id": account_id,
                "uid": user_id,
                "email": gmail_email,
                "access": encrypted["access_token"],
                "refresh": encrypted["refresh_token"],
                "expiry": encrypted.get("token_expiry"),
                "connected": datetime.now(timezone.utc),
            },
        )

    await db.commit()
    return RedirectResponse(f"{FRONTEND_URL}/settings?gmail=connected")


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

    await verify_user_exists(user_id, db)

    tokens = exchange_code_for_tokens(code, GMAIL_REDIRECT_URI)
    encrypted = encrypt_tokens(tokens)
    gmail_email = get_user_email(encrypted)

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email_address=:email"),
        {"uid": user_id, "email": gmail_email},
    )
    existing = result.fetchone()

    if existing:
        await db.execute(
            text("""
            UPDATE email_accounts
            SET access_token=:access, refresh_token=:refresh,
                token_expiry=:expiry, updated_at=:updated
            WHERE id=:id
            """),
            {
                "access": encrypted["access_token"],
                "refresh": encrypted["refresh_token"],
                "expiry": encrypted.get("token_expiry"),
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
        (id, user_id, email_address, provider, is_active, access_token, refresh_token, token_expiry, created_at)
        VALUES (:id, :uid, :email, 'gmail', true, :access, :refresh, :expiry, :connected)
        """),
        {
            "id": account_id,
            "uid": user_id,
            "email": gmail_email,
            "access": encrypted["access_token"],
            "refresh": encrypted["refresh_token"],
            "expiry": encrypted.get("token_expiry"),
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
        text("SELECT id, email_address, provider, is_active, created_at FROM email_accounts WHERE user_id=:uid"),
        {"uid": current_user["user_id"]},
    )
    accounts = [dict(row._mapping) for row in result]
    return accounts


# ✅ NEW: POST /emails/sync — fetch latest threads from Gmail and store them
@router.post("/sync")
async def sync_emails(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    # Get all connected email accounts for this user
    result = await db.execute(
        text("SELECT id, access_token, refresh_token, token_expiry FROM email_accounts WHERE user_id=:uid AND is_active=true"),
        {"uid": user_id}
    )
    accounts = result.fetchall()

    if not accounts:
        raise HTTPException(status_code=404, detail="No connected email accounts found. Please connect Gmail first.")

    total_synced = 0

    for account in accounts:
        account_dict = dict(account._mapping)
        account_id = account_dict["id"]

        db_tokens = {
            "access_token": account_dict["access_token"],
            "refresh_token": account_dict["refresh_token"],
            "token_expiry": account_dict["token_expiry"],
        }

        try:
            threads = fetch_threads(db_tokens, max_results=50)
        except Exception as e:
            logger.error(f"Failed to fetch threads for account {account_id}: {e}")
            continue

        for thread in threads:
            # Check if thread already exists
            existing = await db.execute(
                text("SELECT id FROM email_threads WHERE gmail_thread_id=:tid AND user_id=:uid"),
                {"tid": thread["gmail_thread_id"], "uid": user_id}
            )
            existing_row = existing.fetchone()

            # Parse last message date
            last_message_at = None
            if thread.get("last_message_date"):
                try:
                    import email.utils as eu
                    parsed = eu.parsedate_to_datetime(thread["last_message_date"])
                    last_message_at = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                except Exception:
                    last_message_at = datetime.now(timezone.utc).replace(tzinfo=None)

            if existing_row:
                await db.execute(
                    text("""
                    UPDATE email_threads
                    SET subject=:subject, snippet=:snippet,
                        message_count=:count, last_message_at=:last_at,
                        updated_at=:updated
                    WHERE gmail_thread_id=:tid AND user_id=:uid
                    """),
                    {
                        "subject": thread["subject"],
                        "snippet": thread["snippet"],
                        "count": thread["message_count"],
                        "last_at": last_message_at,
                        "updated": datetime.utcnow(),
                        "tid": thread["gmail_thread_id"],
                        "uid": user_id,
                    }
                )
            else:
                thread_id = str(uuid.uuid4())
                await db.execute(
                    text("""
                    INSERT INTO email_threads
                    (id, user_id, account_id, gmail_thread_id, subject, snippet,
                     from_email, to_email, message_count, last_message_at, created_at)
                    VALUES
                    (:id, :uid, :account_id, :tid, :subject, :snippet,
                     :from_email, :to_email, :count, :last_at, :created)
                    """),
                    {
                        "id": thread_id,
                        "uid": user_id,
                        "account_id": account_id,
                        "tid": thread["gmail_thread_id"],
                        "subject": thread["subject"],
                        "snippet": thread["snippet"],
                        "from_email": thread["from_email"],
                        "to_email": thread["to_email"],
                        "count": thread["message_count"],
                        "last_at": last_message_at,
                        "created": datetime.utcnow(),
                    }
                )
                total_synced += 1

        await db.commit()

    return {"message": f"Sync complete", "new_threads": total_synced}


# ✅ NEW: GET /emails/threads/silent — threads with no reply for X days
@router.get("/threads/silent")
async def get_silent_threads(
    days: int = 3,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]
    cutoff = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        text("""
        SELECT
            id,
            gmail_thread_id,
            subject,
            snippet,
            from_email,
            to_email,
            message_count,
            last_message_at,
            EXTRACT(DAY FROM (NOW() - last_message_at))::int AS days_silent
        FROM email_threads
        WHERE user_id = :uid
          AND last_message_at < :cutoff
        ORDER BY last_message_at ASC
        LIMIT :limit
        """),
        {"uid": user_id, "cutoff": cutoff, "limit": limit}
    )

    threads = []
    for row in result:
        row_dict = dict(row._mapping)
        row_dict["participant_names"] = [row_dict.get("from_email", "")]
        threads.append(row_dict)

    return {"threads": threads}


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
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email_address=:email"),
        {"uid": user_id, "email": req.email},
    )
    if result.fetchone():
        raise HTTPException(status_code=400, detail="Account already connected")

    account_id = str(uuid.uuid4())
    await db.execute(
        text("""
        INSERT INTO email_accounts
        (id, user_id, email_address, provider, is_active, created_at)
        VALUES (:id, :uid, :email, 'gmail', true, :connected)
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
