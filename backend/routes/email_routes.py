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
from services.thread_filter_service import (
    should_show_reply,
    get_thread_status,
    filter_threads_for_reply,
    is_automated_sender,
    is_automated_subject
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


class DismissThreadRequest(BaseModel):
    thread_id: str


async def verify_user_exists(user_id: str, db: AsyncSession):
    result = await db.execute(
        text("SELECT id FROM users WHERE id = :uid"),
        {"uid": user_id}
    )
    if not result.fetchone():
        raise HTTPException(
            status_code=404,
            detail=f"User {user_id} not found. Please re-login and try again."
        )


async def get_user_settings(user_id: str, db: AsyncSession) -> dict:
    """Get user settings for thread filtering."""
    result = await db.execute(
        text("SELECT ignore_newsletters, ignore_notifications FROM user_settings WHERE user_id = :uid"),
        {"uid": user_id}
    )
    row = result.fetchone()
    if row:
        return dict(row._mapping)
    return {"ignore_newsletters": True, "ignore_notifications": True}


async def get_user_email_address(user_id: str, db: AsyncSession) -> str:
    """Get the user's primary email address."""
    result = await db.execute(
        text("SELECT email FROM users WHERE id = :uid"),
        {"uid": user_id}
    )
    row = result.fetchone()
    return row[0] if row else ""


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


@router.post("/sync")
async def sync_emails(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]
    user_email = await get_user_email_address(user_id, db)
    user_settings = await get_user_settings(user_id, db)

    result = await db.execute(
        text("SELECT id, email_address, access_token, refresh_token, token_expiry FROM email_accounts WHERE user_id=:uid AND is_active=true"),
        {"uid": user_id}
    )
    accounts = result.fetchall()

    if not accounts:
        raise HTTPException(status_code=404, detail="No connected email accounts found. Please connect Gmail first.")

    total_synced = 0
    errors = []

    for account in accounts:
        account_dict = dict(account._mapping)
        account_id = account_dict["id"]
        account_email = account_dict.get("email_address", "")

        db_tokens = {
            "access_token": account_dict["access_token"],
            "refresh_token": account_dict["refresh_token"],
            "token_expiry": account_dict["token_expiry"],
        }

        # Retry logic for Gmail API
        max_retries = 3
        retry_count = 0
        threads = []
        
        while retry_count < max_retries:
            try:
                threads = fetch_threads(db_tokens, max_results=50)
                break
            except Exception as e:
                retry_count += 1
                logger.warning(f"Gmail API attempt {retry_count}/{max_retries} failed for account {account_id}: {e}")
                if retry_count >= max_retries:
                    errors.append(f"Failed to fetch from {account_email}")
                    logger.error(f"Gmail API failed after {max_retries} retries for account {account_id}: {e}")
                    continue

        for thread in threads:
            # Check for duplicate thread_id
            existing = await db.execute(
                text("SELECT id FROM email_threads WHERE thread_id=:tid AND user_id=:uid"),
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
                    last_message_at = datetime.utcnow()

            # Determine if sender is automated
            from_email = thread.get("from_email", "")
            subject = thread.get("subject", "")
            is_automated = is_automated_sender(from_email) or is_automated_subject(subject)
            
            # Determine if last message is from user
            last_from = thread.get("from_email", "").lower()
            is_last_from_user = (account_email.lower() in last_from) or (user_email.lower() in last_from if user_email else False)

            if existing_row:
                await db.execute(
                    text("""
                    UPDATE email_threads
                    SET subject=:subject,
                        last_message_at=:last_at,
                        last_message_from=:from_email,
                        is_automated=:is_auto,
                        last_sender_is_user=:is_user_sender,
                        snippet=:snippet,
                        message_count=:msg_count,
                        updated_at=:updated
                    WHERE thread_id=:tid AND user_id=:uid
                    """),
                    {
                        "subject": thread["subject"],
                        "last_at": last_message_at,
                        "from_email": thread["from_email"],
                        "is_auto": is_automated,
                        "is_user_sender": is_last_from_user,
                        "snippet": thread.get("snippet", ""),
                        "msg_count": thread.get("message_count", 1),
                        "updated": datetime.utcnow(),
                        "tid": thread["gmail_thread_id"],
                        "uid": user_id,
                    }
                )
            else:
                thread_row_id = str(uuid.uuid4())
                await db.execute(
                    text("""
                    INSERT INTO email_threads
                    (id, user_id, account_id, thread_id, subject,
                     last_message_at, last_message_from, created_at, 
                     is_silent, needs_followup, is_dismissed, reply_generated,
                     is_automated, last_sender_is_user, snippet, message_count)
                    VALUES
                    (:id, :uid, :account_id, :tid, :subject,
                     :last_at, :from_email, :created, 
                     false, false, false, false,
                     :is_auto, :is_user_sender, :snippet, :msg_count)
                    """),
                    {
                        "id": thread_row_id,
                        "uid": user_id,
                        "account_id": account_id,
                        "tid": thread["gmail_thread_id"],
                        "subject": thread["subject"],
                        "last_at": last_message_at,
                        "from_email": thread["from_email"],
                        "created": datetime.utcnow(),
                        "is_auto": is_automated,
                        "is_user_sender": is_last_from_user,
                        "snippet": thread.get("snippet", ""),
                        "msg_count": thread.get("message_count", 1),
                    }
                )
                total_synced += 1

        await db.commit()

    response = {"message": "Sync complete", "new_threads": total_synced}
    if errors:
        response["warnings"] = errors
    return response


@router.get("/threads/silent")
async def get_silent_threads(
    days: int = 3,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get silent threads - conversations where:
    1. User has replied (last_sender_is_user = true)
    2. Other person hasn't responded (thread is silent)
    3. Thread is not dismissed
    4. Not an automated sender
    
    OR traditional silent threads where:
    1. Incoming email hasn't been replied to after X days
    2. Last message is NOT from the user
    3. Thread is not dismissed
    4. Not an automated sender
    """
    user_id = current_user["user_id"]
    user_email = await get_user_email_address(user_id, db)
    user_settings = await get_user_settings(user_id, db)
    cutoff = datetime.utcnow() - timedelta(days=days)

    # Query threads that need follow-up attention
    result = await db.execute(
        text("""
        SELECT
            et.id,
            et.thread_id,
            et.subject,
            et.last_message_from,
            et.last_message_at,
            et.priority,
            et.is_silent,
            et.is_dismissed,
            et.reply_generated,
            et.is_automated,
            et.last_sender_is_user,
            et.snippet,
            EXTRACT(DAY FROM (NOW() - et.last_message_at))::int AS days_silent,
            COALESCE(fs.status, 'none') AS followup_status
        FROM email_threads et
        LEFT JOIN followup_suggestions fs ON fs.thread_id = et.id AND fs.user_id = et.user_id
        WHERE et.user_id = :uid
          AND et.last_message_at < :cutoff
          AND et.is_dismissed = false
          AND (et.is_automated = false OR et.is_automated IS NULL)
        ORDER BY et.last_message_at ASC
        LIMIT :limit
        """),
        {"uid": user_id, "cutoff": cutoff, "limit": limit}
    )

    threads = []
    for row in result:
        row_dict = dict(row._mapping)
        
        # Apply thread filter to determine if reply should be shown
        reply_info = should_show_reply(row_dict, user_email, user_settings)
        row_dict["show_reply"] = reply_info["show_reply"]
        row_dict["reply_reason"] = reply_info["reason"]
        row_dict["thread_status"] = reply_info["status"]
        
        # Map to what Dashboard.js expects
        row_dict["participant_names"] = [row_dict.get("last_message_from", "")]
        threads.append(row_dict)

    return {"threads": threads}


@router.get("/threads")
async def list_threads(
    limit: int = 50,
    offset: int = 0,
    filter_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all threads with reply eligibility status.
    filter_type can be: needs_reply, replied, awaiting_response, dismissed
    """
    user_id = current_user["user_id"]
    user_email = await get_user_email_address(user_id, db)
    user_settings = await get_user_settings(user_id, db)
    
    base_query = """
        SELECT 
            et.*,
            EXTRACT(DAY FROM (NOW() - et.last_message_at))::int AS days_silent,
            COALESCE(fs.status, 'none') AS followup_status
        FROM email_threads et
        LEFT JOIN followup_suggestions fs ON fs.thread_id = et.id AND fs.user_id = et.user_id
        WHERE et.user_id=:uid
    """
    
    params = {"uid": user_id, "limit": limit, "offset": offset}
    
    # Apply filter based on type
    if filter_type == "needs_reply":
        base_query += " AND et.is_dismissed = false AND et.reply_generated = false AND (et.last_sender_is_user = false OR et.last_sender_is_user IS NULL)"
    elif filter_type == "replied":
        base_query += " AND (et.reply_generated = true OR fs.status = 'sent')"
    elif filter_type == "awaiting_response":
        base_query += " AND et.last_sender_is_user = true AND et.is_dismissed = false"
    elif filter_type == "dismissed":
        base_query += " AND et.is_dismissed = true"
    
    base_query += " ORDER BY et.last_message_at DESC LIMIT :limit OFFSET :offset"
    
    result = await db.execute(text(base_query), params)
    
    threads = []
    for row in result:
        row_dict = dict(row._mapping)
        
        # Apply thread filter
        reply_info = should_show_reply(row_dict, user_email, user_settings)
        row_dict["show_reply"] = reply_info["show_reply"]
        row_dict["reply_reason"] = reply_info["reason"]
        row_dict["thread_status"] = reply_info["status"]
        
        threads.append(row_dict)
    
    return {"threads": threads}


@router.post("/threads/{thread_id}/dismiss")
async def dismiss_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Dismiss a thread so it won't show up for reply generation."""
    user_id = current_user["user_id"]
    
    result = await db.execute(
        text("""
        UPDATE email_threads
        SET is_dismissed = true, updated_at = :updated
        WHERE id = :tid AND user_id = :uid
        """),
        {"tid": thread_id, "uid": user_id, "updated": datetime.utcnow()}
    )
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    return {"message": "Thread dismissed", "thread_id": thread_id}


@router.post("/threads/{thread_id}/undismiss")
async def undismiss_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a dismissed thread."""
    user_id = current_user["user_id"]
    
    result = await db.execute(
        text("""
        UPDATE email_threads
        SET is_dismissed = false, updated_at = :updated
        WHERE id = :tid AND user_id = :uid
        """),
        {"tid": thread_id, "uid": user_id, "updated": datetime.utcnow()}
    )
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    return {"message": "Thread restored", "thread_id": thread_id}


@router.get("/threads/{thread_id}/reply-status")
async def get_thread_reply_status(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if a specific thread should show the reply generation button."""
    user_id = current_user["user_id"]
    user_email = await get_user_email_address(user_id, db)
    user_settings = await get_user_settings(user_id, db)
    
    result = await db.execute(
        text("""
        SELECT 
            et.*,
            COALESCE(fs.status, 'none') AS followup_status
        FROM email_threads et
        LEFT JOIN followup_suggestions fs ON fs.thread_id = et.id AND fs.user_id = et.user_id
        WHERE et.id = :tid AND et.user_id = :uid
        """),
        {"tid": thread_id, "uid": user_id}
    )
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    thread = dict(row._mapping)
    reply_info = should_show_reply(thread, user_email, user_settings)
    
    return {
        "thread_id": thread_id,
        "show_reply": reply_info["show_reply"],
        "reason": reply_info["reason"],
        "status": reply_info["status"]
    }


@router.post("/connect-gmail")
async def connect_gmail_demo(
    req: ConnectGmailRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
