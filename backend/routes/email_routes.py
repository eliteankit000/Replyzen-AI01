from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from database import db
from auth import get_current_user
from services.gmail_service import (
    get_auth_url, exchange_code_for_tokens, encrypt_tokens,
    decrypt_tokens, get_gmail_service, get_user_email, fetch_threads,
    GMAIL_CLIENT_ID, GMAIL_REDIRECT_URI
)
from plan_permissions import check_account_limit
import uuid
import os
import email.utils
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emails", tags=["emails"])

# Get frontend URL from environment
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


class ConnectGmailRequest(BaseModel):
    email: str


@router.get("/gmail/auth-url")
async def get_gmail_auth_url(current_user: dict = Depends(get_current_user)):
    """Get Google OAuth authorization URL."""
    user_id = current_user["user_id"]
    
    # Check account limit before initiating OAuth
    account_check = await check_account_limit(user_id)
    if not account_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=f"You have reached your email account limit ({account_check['limit']}). Upgrade your plan to connect more accounts."
        )
    
    if not GMAIL_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Gmail OAuth not configured")
    
    # Create state with user_id for callback
    state = user_id
    
    # Get the redirect URI from environment or construct it
    redirect_uri = os.environ.get("GMAIL_REDIRECT_URI", f"{FRONTEND_URL}/auth/gmail/callback")
    
    auth_url = get_auth_url(state=state, redirect_uri=redirect_uri)
    return {"auth_url": auth_url}


@router.post("/gmail/callback")
async def gmail_oauth_callback(
    code: str,
    state: str,
    current_user: dict = Depends(get_current_user)
):
    """Handle Gmail OAuth callback."""
    user_id = current_user["user_id"]
    
    # Verify state matches user_id
    if state != user_id:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    
    # Check account limit
    account_check = await check_account_limit(user_id)
    if not account_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=f"You have reached your email account limit ({account_check['limit']}). Upgrade your plan to connect more accounts."
        )
    
    try:
        # Exchange code for tokens
        redirect_uri = os.environ.get("GMAIL_REDIRECT_URI", f"{FRONTEND_URL}/auth/gmail/callback")
        tokens = exchange_code_for_tokens(code, redirect_uri)
        
        # Encrypt tokens
        encrypted = encrypt_tokens(tokens)
        
        # Get user's email from Gmail API
        gmail_email = get_user_email(encrypted)
        
        # Check if account already exists
        existing = await db.email_accounts.find_one(
            {"user_id": user_id, "email": gmail_email},
            {"_id": 0}
        )
        if existing:
            # Update existing account with new tokens
            await db.email_accounts.update_one(
                {"id": existing["id"]},
                {"$set": {
                    **encrypted,
                    "status": "connected",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            return {"message": "Gmail reconnected successfully", "account_id": existing["id"], "email": gmail_email}
        
        # Create new account
        account_id = str(uuid.uuid4())
        account = {
            "id": account_id,
            "user_id": user_id,
            "email": gmail_email,
            "provider": "gmail",
            "status": "connected",
            **encrypted,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "last_synced": None,
        }
        await db.email_accounts.insert_one(account)
        
        return {"message": "Gmail connected successfully", "account_id": account_id, "email": gmail_email}
        
    except Exception as e:
        logger.error(f"Gmail OAuth callback error: {e}")
        raise HTTPException(status_code=500, detail="Failed to connect Gmail account")


@router.post("/connect-gmail")
async def connect_gmail(req: ConnectGmailRequest, current_user: dict = Depends(get_current_user)):
    """Connect Gmail account via OAuth. Redirects to Google OAuth flow."""
    user_id = current_user["user_id"]
    
    # Plan limit check: email accounts
    account_check = await check_account_limit(user_id)
    if not account_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=f"You have reached your email account limit ({account_check['limit']}). Upgrade your plan to connect more accounts."
        )
    
    existing = await db.email_accounts.find_one(
        {"user_id": user_id, "email": req.email}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Account already connected")
    
    # Gmail OAuth is required - return auth URL
    if not GMAIL_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Gmail OAuth not configured. Please contact support.")
    
    return {
        "message": "Please complete Gmail OAuth",
        "requires_oauth": True,
        "auth_url": get_auth_url(state=user_id)
    }


@router.get("/accounts")
async def list_accounts(current_user: dict = Depends(get_current_user)):
    accounts = await db.email_accounts.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0, "access_token_encrypted": 0, "refresh_token_encrypted": 0}
    ).to_list(100)
    return accounts


@router.post("/sync")
async def sync_emails(current_user: dict = Depends(get_current_user)):
    """Sync emails from connected Gmail accounts."""
    user_id = current_user["user_id"]
    accounts = await db.email_accounts.find(
        {"user_id": user_id, "status": "connected"},
        {"_id": 0}
    ).to_list(100)
    
    if not accounts:
        raise HTTPException(status_code=400, detail="No email accounts connected")
    
    total_new = 0
    synced_accounts = 0
    
    for account in accounts:
        # Skip demo accounts - they don't have real tokens
        if account.get("is_demo") or not account.get("access_token_encrypted"):
            continue
        
        try:
            # Fetch threads from Gmail API
            gmail_threads = fetch_threads(
                encrypted_tokens={
                    "access_token_encrypted": account.get("access_token_encrypted", ""),
                    "refresh_token_encrypted": account.get("refresh_token_encrypted", ""),
                    "token_expiry": account.get("token_expiry", ""),
                },
                max_results=30
            )
            
            # Process and store threads
            for gmail_thread in gmail_threads:
                # Check if thread already exists
                existing = await db.email_threads.find_one(
                    {"gmail_thread_id": gmail_thread["gmail_thread_id"], "user_id": user_id},
                    {"_id": 0}
                )
                
                if existing:
                    # Update existing thread
                    await db.email_threads.update_one(
                        {"id": existing["id"]},
                        {"$set": {
                            "snippet": gmail_thread["snippet"],
                            "message_count": gmail_thread["message_count"],
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                else:
                    # Create new thread
                    # Determine if silent (user was last sender)
                    is_silent = gmail_thread["from_email"] == account["email"]
                    
                    # Calculate days silent
                    try:
                        last_date = email.utils.parsedate_to_datetime(gmail_thread["last_message_date"])
                        days_silent = (datetime.now(timezone.utc) - last_date).days if is_silent else 0
                    except Exception:
                        days_silent = 0
                    
                    thread = {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "account_id": account["id"],
                        "gmail_thread_id": gmail_thread["gmail_thread_id"],
                        "subject": gmail_thread["subject"],
                        "participants": [gmail_thread["from_email"], gmail_thread["to_email"]],
                        "participant_names": [],
                        "last_message_at": gmail_thread["last_message_date"],
                        "last_sender": gmail_thread["from_email"],
                        "is_silent": is_silent,
                        "days_silent": days_silent,
                        "snippet": gmail_thread["snippet"],
                        "category": "primary",
                        "message_count": gmail_thread["message_count"],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await db.email_threads.insert_one(thread)
                    total_new += 1
            
            synced_accounts += 1
            
            # Update last synced time
            await db.email_accounts.update_one(
                {"id": account["id"]},
                {"$set": {"last_synced": datetime.now(timezone.utc).isoformat()}}
            )
            
        except Exception as e:
            logger.error(f"Failed to sync account {account['id']}: {e}")
            # Mark account as having sync errors
            await db.email_accounts.update_one(
                {"id": account["id"]},
                {"$set": {"sync_error": str(e), "last_sync_attempt": datetime.now(timezone.utc).isoformat()}}
            )
    
    return {
        "message": f"Synced {total_new} new threads from {synced_accounts} accounts",
        "new_threads": total_new,
        "synced_accounts": synced_accounts
    }


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
