from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import hash_password, verify_password, create_token, get_current_user
import uuid
import os
import httpx
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.environ.get("GMAIL_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GMAIL_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_AUTH_REDIRECT_URI", "")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

GOOGLE_SCOPES = " ".join([
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
])


# ─────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    code: str
    redirect_uri: Optional[str] = None


# ─────────────────────────────────────────────
# Register
# ─────────────────────────────────────────────

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": req.email}
    )
    existing = result.fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_data = {
        "id": user_id,
        "email": req.email,
        "password_hash": hash_password(req.password),
        "full_name": req.full_name,
        "plan": "free",
        "auth_provider": "email",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    await db.execute(
        text("""
        INSERT INTO users (id, email, password_hash, full_name, plan, auth_provider, created_at, updated_at)
        VALUES (:id, :email, :password_hash, :full_name, :plan, :auth_provider, :created_at, :updated_at)
        """),
        user_data
    )
    await db.commit()

    token = create_token(user_id, req.email)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "plan": "free"
        }
    }


# ─────────────────────────────────────────────
# Login
# ─────────────────────────────────────────────

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM users WHERE email = :email"),
        {"email": req.email}
    )
    user = result.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = dict(user._mapping)

    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user["id"])
    token = create_token(user_id, user["email"])

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user["email"],
            "full_name": user["full_name"],
            "plan": user.get("plan", "free")
        }
    }


# ─────────────────────────────────────────────
# Get Me
# ─────────────────────────────────────────────

@router.get("/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("SELECT id, email, full_name, plan FROM users WHERE id = :id"),
        {"id": current_user["user_id"]}
    )
    user = result.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_dict = dict(user._mapping)
    user_dict["id"] = str(user_dict["id"])
    return user_dict


# ─────────────────────────────────────────────
# ✅ NEW: Google OAuth — Get Auth URL
# Called by frontend: GET /api/auth/google/url?redirect_uri=...
# ─────────────────────────────────────────────

@router.get("/google/url")
async def get_google_auth_url(redirect_uri: Optional[str] = None):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured. Set GMAIL_CLIENT_ID env var.")

    final_redirect = redirect_uri or GOOGLE_REDIRECT_URI

    if not final_redirect:
        raise HTTPException(status_code=500, detail="No redirect_uri provided and GOOGLE_AUTH_REDIRECT_URI not set.")

    params = (
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={final_redirect}"
        f"&response_type=code"
        f"&scope={GOOGLE_SCOPES.replace(' ', '%20')}"
        f"&access_type=offline"
        f"&prompt=consent"
    )

    url = GOOGLE_AUTH_URL + params

    return {"url": url}


# ─────────────────────────────────────────────
# ✅ NEW: Google OAuth — Handle Callback
# Called by frontend: POST /api/auth/google/callback
# Body: { code: "...", redirect_uri: "..." }
# ─────────────────────────────────────────────

@router.post("/google/callback")
async def google_callback(
    req: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db)
):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured.")

    final_redirect = req.redirect_uri or GOOGLE_REDIRECT_URI

    # Step 1: Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": req.code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": final_redirect,
                "grant_type": "authorization_code",
            }
        )

    if token_response.status_code != 200:
        logger.error(f"Google token exchange failed: {token_response.text}")
        raise HTTPException(status_code=400, detail="Failed to exchange Google auth code.")

    token_data = token_response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="No access token returned from Google.")

    # Step 2: Get user info from Google
    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )

    if userinfo_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get user info from Google.")

    google_user = userinfo_response.json()
    google_email = google_user.get("email")
    google_name = google_user.get("name", "")
    google_id = google_user.get("sub", "")

    if not google_email:
        raise HTTPException(status_code=400, detail="Could not get email from Google account.")

    # Step 3: Find or create user in DB
    result = await db.execute(
        text("SELECT * FROM users WHERE email = :email"),
        {"email": google_email}
    )
    existing_user = result.fetchone()

    if existing_user:
        # User exists — log them in
        user = dict(existing_user._mapping)
        user_id = str(user["id"])

        # Update google_id if not set
        if not user.get("google_id"):
            await db.execute(
                text("UPDATE users SET google_id = :gid, updated_at = :now WHERE id = :id"),
                {"gid": google_id, "now": datetime.now(timezone.utc), "id": user_id}
            )
            await db.commit()
    else:
        # New user — register them
        user_id = str(uuid.uuid4())
        await db.execute(
            text("""
            INSERT INTO users (id, email, full_name, plan, auth_provider, google_id, created_at, updated_at)
            VALUES (:id, :email, :full_name, :plan, :auth_provider, :google_id, :created_at, :updated_at)
            """),
            {
                "id": user_id,
                "email": google_email,
                "full_name": google_name,
                "plan": "free",
                "auth_provider": "google",
                "google_id": google_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        )
        await db.commit()

        user = {
            "id": user_id,
            "email": google_email,
            "full_name": google_name,
            "plan": "free"
        }

    # Step 4: Create JWT and return
    token = create_token(user_id, google_email)

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": google_email,
            "full_name": google_name or user.get("full_name", ""),
            "plan": user.get("plan", "free")
        }
    }
