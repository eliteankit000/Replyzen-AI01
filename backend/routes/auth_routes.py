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

# ---------------------------------------------------
# Environment Variables
# ---------------------------------------------------

GOOGLE_CLIENT_ID = os.environ.get("GMAIL_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GMAIL_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

GOOGLE_SCOPES = "openid email profile"

# ---------------------------------------------------
# Pydantic Models
# ---------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------------------------------------------------
# Helper: Sync user into profiles table
# ---------------------------------------------------

async def sync_profile(db: AsyncSession, user_id: str, email: str, full_name: str):
    try:
        await db.execute(
            text("""
                INSERT INTO profiles (id, user_id, email, display_name, created_at)
                VALUES (gen_random_uuid(), :user_id, :email, :full_name, :created_at)
                ON CONFLICT DO NOTHING
            """),
            {
                "user_id": user_id,
                "email": email,
                "full_name": full_name,
                "created_at": datetime.now(timezone.utc),
            }
        )
        await db.commit()
    except Exception as e:
        logger.warning(f"Profile sync failed for {email}: {e}")


# ---------------------------------------------------
# Register
# ---------------------------------------------------

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

    await db.execute(
        text("""
        INSERT INTO users
        (id, email, password_hash, full_name, plan, auth_provider, created_at, updated_at)
        VALUES
        (:id, :email, :password_hash, :full_name, :plan, :auth_provider, :created_at, :updated_at)
        """),
        {
            "id": user_id,
            "email": req.email,
            "password_hash": hash_password(req.password),
            "full_name": req.full_name,
            "plan": "free",
            "auth_provider": "email",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )

    await db.commit()

    # ← Sync into profiles
    await sync_profile(db, user_id, req.email, req.full_name)

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


# ---------------------------------------------------
# Login
# ---------------------------------------------------

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


# ---------------------------------------------------
# Get Current User
# ---------------------------------------------------

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


# ---------------------------------------------------
# Google OAuth URL — returns JSON { url } for frontend
# ---------------------------------------------------

@router.get("/google/url")
async def google_url(redirect_uri: Optional[str] = None):

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    effective_redirect = redirect_uri or GOOGLE_REDIRECT_URI

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": effective_redirect,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent"
    }

    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)

    return {"url": url}


# ---------------------------------------------------
# Google OAuth Login — direct browser redirect
# ---------------------------------------------------

@router.get("/google/login")
async def google_login():

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent"
    }

    url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)

    return RedirectResponse(url)


# ---------------------------------------------------
# Google OAuth Callback
# ---------------------------------------------------

@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            }
        )

    if token_response.status_code != 200:
        logger.error(f"Google token exchange failed: {token_response.text}")
        raise HTTPException(status_code=400, detail="Google authentication failed")

    token_data = token_response.json()
    access_token = token_data.get("access_token")

    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )

    if userinfo_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get Google user info")

    google_user = userinfo_response.json()

    email = google_user.get("email")
    name = google_user.get("name", "")
    google_id = google_user.get("sub")

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    result = await db.execute(
        text("SELECT * FROM users WHERE email = :email"),
        {"email": email}
    )

    existing_user = result.fetchone()

    if existing_user:
        user = dict(existing_user._mapping)
        user_id = str(user["id"])

        # ← Sync existing user into profiles (in case they were missing)
        await sync_profile(db, user_id, email, name)

    else:
        user_id = str(uuid.uuid4())

        await db.execute(
            text("""
            INSERT INTO users
            (id, email, full_name, plan, auth_provider, google_id, created_at, updated_at)
            VALUES
            (:id, :email, :full_name, :plan, :auth_provider, :google_id, :created_at, :updated_at)
            """),
            {
                "id": user_id,
                "email": email,
                "full_name": name,
                "plan": "free",
                "auth_provider": "google",
                "google_id": google_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        )

        await db.commit()

        # ← Sync new user into profiles
        await sync_profile(db, user_id, email, name)

    token = create_token(user_id, email)
    redirect_url = f"{FRONTEND_URL}/auth/callback?token={token}"

    return RedirectResponse(redirect_url)
