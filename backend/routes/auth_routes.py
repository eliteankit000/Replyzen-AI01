from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import hash_password, verify_password, create_token, get_current_user

import uuid
import os
import httpx
import urllib.parse
import logging

from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_CLIENT_ID     = os.environ.get("GMAIL_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GMAIL_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.environ.get("GOOGLE_REDIRECT_URI", "")
FRONTEND_URL         = os.environ.get("FRONTEND_URL", "")

GOOGLE_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# ✅ FLOW 1: Login/Signup - Authentication ONLY (no Gmail access)
GOOGLE_AUTH_SCOPES = " ".join([
    "openid",
    "email",
    "profile",
])

# ✅ FLOW 2: Gmail Connection - READ-ONLY Gmail access (Google Compliant)
# IMPORTANT: Only gmail.readonly is used - NO sending capabilities
# All email sending is done via Gmail compose URL (user-initiated)
GOOGLE_GMAIL_SCOPES = " ".join([
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",      # Read Gmail messages ONLY
])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ConsentRequest(BaseModel):
    user_id: str
    consent: bool


async def sync_profile(db: AsyncSession, user_id: str, email: str, full_name: str):
    try:
        await db.execute(
            text("""
                INSERT INTO profiles (id, user_id, email, display_name, created_at)
                VALUES (gen_random_uuid(), :user_id, :email, :full_name, :created_at)
                ON CONFLICT DO NOTHING
            """),
            {
                "user_id":    user_id,
                "email":      email,
                "full_name":  full_name,
                "created_at": datetime.now(timezone.utc),
            }
        )
        await db.commit()
    except Exception as e:
        logger.warning(f"Profile sync failed for {email}: {e}")


# ─── Register ────────────────────────────────────────────────

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"), {"email": req.email}
    )
    if result.fetchone():
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    await db.execute(
        text("""
        INSERT INTO users
        (id, email, password_hash, full_name, plan, auth_provider, created_at, updated_at)
        VALUES
        (:id, :email, :password_hash, :full_name, :plan, :auth_provider, :created_at, :updated_at)
        """),
        {
            "id":            user_id,
            "email":         req.email,
            "password_hash": hash_password(req.password),
            "full_name":     req.full_name,
            "plan":          "free",
            "auth_provider": "email",
            "created_at":    datetime.now(timezone.utc),
            "updated_at":    datetime.now(timezone.utc),
        }
    )
    await db.commit()
    await sync_profile(db, user_id, req.email, req.full_name)
    token = create_token(user_id, req.email)
    return {
        "token": token,
        "user":  {"id": user_id, "email": req.email, "full_name": req.full_name, "plan": "free"}
    }


# ─── Login ───────────────────────────────────────────────────

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM users WHERE email = :email"), {"email": req.email}
    )
    user = result.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = dict(user._mapping)
    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user["id"])
    token   = create_token(user_id, user["email"])
    return {
        "token": token,
        "user": {
            "id":         user_id,
            "email":      user["email"],
            "full_name":  user["full_name"],
            "plan":       user.get("plan", "free"),
            "avatar_url": user.get("avatar_url"),   # ✅ include avatar
        }
    }


# ─── Get Current User ────────────────────────────────────────

@router.get("/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current user profile.
    Returns user data including onboarding status and Gmail connection.
    """
    try:
        result = await db.execute(
            text("""
                SELECT id, email, full_name, plan, avatar_url, is_onboarded, gmail_connected 
                FROM users 
                WHERE id = :id
            """),
            {"id": current_user["user_id"]}
        )
        user = result.fetchone()
        
        if not user:
            logger.error(f"User not found in DB: {current_user['user_id']}")
            raise HTTPException(status_code=404, detail="User not found")

        user_dict = dict(user._mapping)
        user_dict["id"] = str(user_dict["id"])
        
        logger.info(f"Successfully fetched profile for user: {user_dict['email']}")
        return user_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch user profile: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user profile: {str(e)}"
        )


# ─── Google OAuth URL ─────────────────────────────────────────

@router.get("/google/url")
async def google_url(redirect_uri: Optional[str] = None):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  redirect_uri or GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         GOOGLE_SCOPES,
        "access_type":   "offline",
        "prompt":        "consent",
    }
    return {"url": GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)}


# ─── Google OAuth Login (Authentication ONLY - No Gmail) ───────

@router.get("/google/login")
async def google_login():
    """
    Google OAuth login for authentication ONLY.
    Uses basic scopes: openid, email, profile
    Does NOT request Gmail access.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         GOOGLE_AUTH_SCOPES,  # ✅ Auth only (no Gmail)
        "access_type":   "offline",
        "prompt":        "consent",
    }
    return RedirectResponse(GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params))


# ─── Google OAuth Callback ────────────────────────────────────

@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  GOOGLE_REDIRECT_URI,
                "grant_type":    "authorization_code",
            }
        )

    if token_response.status_code != 200:
        logger.error(f"Google token exchange failed: {token_response.text}")
        raise HTTPException(status_code=400, detail="Google authentication failed")

    access_token = token_response.json().get("access_token")

    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )

    if userinfo_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get Google user info")

    google_user = userinfo_response.json()
    email      = google_user.get("email")
    name       = google_user.get("name", "")
    google_id  = google_user.get("sub")
    # ✅ Capture Google profile picture URL
    avatar_url = google_user.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    result = await db.execute(
        text("SELECT * FROM users WHERE email = :email"), {"email": email}
    )
    existing_user = result.fetchone()

    if existing_user:
        user_dict = dict(existing_user._mapping)
        user_id = str(user_dict["id"])
        is_new_user = False
        
        # ✅ Update avatar_url every login so it stays fresh
        await db.execute(
            text("""
            UPDATE users
            SET avatar_url = :avatar_url, updated_at = :updated
            WHERE id::text = :id
            """),
            {
                "avatar_url": avatar_url,
                "updated":    datetime.now(timezone.utc),
                "id":         user_id,
            }
        )
        await db.commit()
        await sync_profile(db, user_id, email, name)

    else:
        is_new_user = True
        user_id = str(uuid.uuid4())
        await db.execute(
            text("""
            INSERT INTO users
            (id, email, full_name, plan, auth_provider, google_id, avatar_url, is_onboarded, created_at, updated_at)
            VALUES
            (:id, :email, :full_name, :plan, :auth_provider, :google_id, :avatar_url, 0, :created_at, :updated_at)
            """),
            {
                "id":            user_id,
                "email":         email,
                "full_name":     name,
                "plan":          "free",
                "auth_provider": "google",
                "google_id":     google_id,
                "avatar_url":    avatar_url,  # ✅ save on first login
                "created_at":    datetime.now(timezone.utc),
                "updated_at":    datetime.now(timezone.utc),
            }
        )
        await db.commit()
        await sync_profile(db, user_id, email, name)

    # Get final user data with is_onboarded status
    result = await db.execute(
        text("SELECT id, email, full_name, plan, avatar_url, is_onboarded FROM users WHERE id = :user_id"),
        {"user_id": user_id}
    )
    user_row = result.fetchone()
    user_data = dict(user_row._mapping) if user_row else {}
    
    token = create_token(user_id, email)
    redirect_url = f"{FRONTEND_URL}/auth/callback?token={token}&is_new_user={str(is_new_user).lower()}&is_onboarded={user_data.get('is_onboarded', 0)}"
    return RedirectResponse(redirect_url)


# ─── Consent Endpoint ────────────────────────────────────────

@router.post("/consent")
async def store_consent(
    req: ConsentRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Store user consent for Google OAuth permissions.
    Called from frontend after user accepts permission modal.
    """
    try:
        now = datetime.now(timezone.utc)
        await db.execute(
            text("""
            UPDATE users
            SET user_consent = :consent,
                consent_accepted_at = :accepted_at,
                updated_at = :updated
            WHERE id = :user_id
            """),
            {
                "consent": 1 if req.consent else 0,
                "accepted_at": now if req.consent else None,
                "updated": now,
                "user_id": req.user_id,
            }
        )

        # Log consent action for audit trail
        await log_permission(db, req.user_id, "consent_given" if req.consent else "consent_revoked",
                           "google_oauth", "auth", "User accepted Google OAuth permissions")

        await db.commit()
        return {"success": True, "message": "Consent stored successfully"}
    except Exception as e:
        logger.error(f"Failed to store consent for user {req.user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to store consent")


# ─── Permission Logging ──────────────────────────────────────

async def log_permission(db: AsyncSession, user_id: str, action: str,
                         resource: str = None, platform: str = None,
                         details: str = None):
    """
    Log permission usage for audit trail (important for Google review).
    """
    try:
        import uuid as _uuid
        from datetime import datetime, timezone
        await db.execute(
            text("""
            INSERT INTO permission_logs (id, user_id, action, resource, platform, details, created_at)
            VALUES (:id, :user_id, :action, :resource, :platform, :details, :created_at)
            """),
            {
                "id": str(_uuid.uuid4()),
                "user_id": user_id,
                "action": action,
                "resource": resource,
                "platform": platform,
                "details": details,
                "created_at": datetime.now(timezone.utc),
            }
        )
        await db.commit()
    except Exception as e:
        logger.warning(f"Permission logging failed: {e}")


# ═══════════════════════════════════════════════════════════════
# POST /api/auth/complete-onboarding - Mark user as onboarded
# ═══════════════════════════════════════════════════════════════

@router.post("/complete-onboarding", summary="Complete onboarding flow")
async def complete_onboarding(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark the user as having completed the onboarding flow.
    Called after user completes the WelcomeFlow popup.
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        from sqlalchemy import text
        from datetime import datetime, timezone
        
        # Update user as onboarded
        await db.execute(
            text("""
                UPDATE users 
                SET is_onboarded = 1, 
                    consent_accepted_at = :now,
                    user_consent = 1,
                    updated_at = :now
                WHERE id = :user_id
            """),
            {
                "user_id": user_id,
                "now": datetime.now(timezone.utc),
            }
        )
        await db.commit()
        
        logger.info(f"User {user_id} completed onboarding")
        
        return {
            "success": True,
            "message": "Onboarding completed successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to complete onboarding for {user_id}: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete onboarding"
        )



# ═══════════════════════════════════════════════════════════════
# FLOW 2: Gmail Connection (Separate from Login)
# ═══════════════════════════════════════════════════════════════

# ─── Connect Gmail - Step 1: Redirect to Google ─────────────────

@router.get("/google/connect-gmail")
async def connect_gmail(current_user=Depends(get_current_user)):
    """
    Start Gmail connection flow (SEPARATE from login).
    Requests Gmail scopes: readonly, send, modify
    
    This is triggered AFTER user is logged in.
    User must explicitly click "Connect Gmail" button.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    # Create a state token with user_id for security
    import secrets
    state = secrets.token_urlsafe(32)
    
    # Store state in session or temporary storage (for validation in callback)
    # For simplicity, we'll encode user_id in state
    state_with_user = f"{state}:{user_id}"
    
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  f"{FRONTEND_URL}/auth/gmail-callback",  # Different callback
        "response_type": "code",
        "scope":         GOOGLE_GMAIL_SCOPES,  # ✅ Gmail scopes
        "access_type":   "offline",
        "prompt":        "consent",
        "state":         state_with_user,
    }
    
    logger.info(f"User {user_id} initiating Gmail connection")
    return RedirectResponse(GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params))


# ─── Gmail Connection - Step 2: Callback ─────────────────────────

@router.get("/google/gmail-callback")
async def gmail_callback(
    code: str,
    state: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Gmail connection OAuth callback.
    Stores Gmail tokens and marks user as gmail_connected.
    """
    if not code:
        logger.error("Gmail callback: no code provided")
        return RedirectResponse(f"{FRONTEND_URL}/settings?error=gmail_connection_failed")
    
    # Extract user_id from state
    try:
        if state and ":" in state:
            _, user_id = state.rsplit(":", 1)
        else:
            raise ValueError("Invalid state parameter")
    except Exception as e:
        logger.error(f"Gmail callback: invalid state - {e}")
        return RedirectResponse(f"{FRONTEND_URL}/settings?error=invalid_state")
    
    try:
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code":          code,
                    "client_id":     GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri":  f"{FRONTEND_URL}/auth/gmail-callback",
                    "grant_type":    "authorization_code",
                }
            )
        
        if token_response.status_code != 200:
            logger.error(f"Gmail token exchange failed: {token_response.text}")
            return RedirectResponse(f"{FRONTEND_URL}/settings?error=token_exchange_failed")
        
        tokens = token_response.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)
        
        if not access_token:
            return RedirectResponse(f"{FRONTEND_URL}/settings?error=no_access_token")
        
        # Get user info
        async with httpx.AsyncClient() as client:
            userinfo_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"}
            )
        
        if userinfo_response.status_code != 200:
            return RedirectResponse(f"{FRONTEND_URL}/settings?error=userinfo_failed")
        
        google_user = userinfo_response.json()
        email = google_user.get("email")
        
        # Store Gmail tokens in email_accounts table
        from datetime import timedelta
        import uuid as _uuid
        
        now = datetime.now(timezone.utc)
        token_expiry = now + timedelta(seconds=expires_in)
        
        # Check if email account already exists
        result = await db.execute(
            text("""
                SELECT id FROM email_accounts 
                WHERE user_id::text = :user_id AND email_address = :email
            """),
            {"user_id": user_id, "email": email}
        )
        existing = result.fetchone()
        
        if existing:
            # Update existing
            await db.execute(
                text("""
                    UPDATE email_accounts
                    SET access_token = :access_token,
                        refresh_token = :refresh_token,
                        token_expiry = :token_expiry,
                        is_active = 1,
                        updated_at = :updated_at
                    WHERE user_id::text = :user_id AND email_address = :email
                """),
                {
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "token_expiry": token_expiry,
                    "updated_at": now,
                    "user_id": user_id,
                    "email": email,
                }
            )
        else:
            # Insert new
            await db.execute(
                text("""
                    INSERT INTO email_accounts
                    (id, user_id, email_address, access_token, refresh_token, token_expiry, is_active, created_at, updated_at)
                    VALUES
                    (:id, :user_id, :email, :access_token, :refresh_token, :token_expiry, 1, :created_at, :updated_at)
                """),
                {
                    "id": str(_uuid.uuid4()),
                    "user_id": user_id,
                    "email": email,
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "token_expiry": token_expiry,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        
        # Mark user as gmail_connected
        await db.execute(
            text("""
                UPDATE users
                SET gmail_connected = 1, updated_at = :updated_at
                WHERE id = :user_id
            """),
            {"user_id": user_id, "updated_at": now}
        )
        
        await db.commit()
        
        logger.info(f"Gmail connected successfully for user {user_id}")
        
        # Redirect to settings with success message
        return RedirectResponse(f"{FRONTEND_URL}/settings?gmail_connected=success")
        
    except Exception as e:
        logger.error(f"Gmail connection error: {e}", exc_info=True)
        await db.rollback()
        return RedirectResponse(f"{FRONTEND_URL}/settings?error=connection_error")


# ─── Check Gmail Connection Status ────────────────────────────────

@router.get("/gmail/status")
async def gmail_status(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Check if user has Gmail connected.
    Returns connection status and email address if connected.
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Check user's gmail_connected flag
        result = await db.execute(
            text("SELECT gmail_connected FROM users WHERE id::text = :user_id"),
            {"user_id": user_id}
        )
        user = result.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        gmail_connected = bool(user.gmail_connected) if user.gmail_connected else False
        
        # Get connected email account info
        connected_email = None
        if gmail_connected:
            result = await db.execute(
                text("""
                    SELECT email_address, is_active, created_at
                    FROM email_accounts
                    WHERE user_id::text = :user_id AND is_active::boolean = true
                    LIMIT 1
                """),
                {"user_id": user_id}
            )
            email_account = result.fetchone()
            if email_account:
                connected_email = {
                    "email": email_account.email_address,
                    "connected_at": email_account.created_at.isoformat() if email_account.created_at else None,
                }
        
        return {
            "gmail_connected": gmail_connected,
            "connected_email": connected_email,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get Gmail status for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check Gmail connection status"
        )
