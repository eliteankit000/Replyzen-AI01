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

GOOGLE_SCOPES = "openid email profile"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
    result = await db.execute(
        # ✅ include avatar_url in SELECT
        text("SELECT id, email, full_name, plan, avatar_url FROM users WHERE id = :id"),
        {"id": current_user["user_id"]}
    )
    user = result.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_dict = dict(user._mapping)
    user_dict["id"] = str(user_dict["id"])
    return user_dict


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


# ─── Google OAuth Login ───────────────────────────────────────

@router.get("/google/login")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         GOOGLE_SCOPES,
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
        user_id = str(dict(existing_user._mapping)["id"])
        # ✅ Update avatar_url every login so it stays fresh
        await db.execute(
            text("""
            UPDATE users
            SET avatar_url = :avatar_url, updated_at = :updated
            WHERE id = :id
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
        user_id = str(uuid.uuid4())
        await db.execute(
            text("""
            INSERT INTO users
            (id, email, full_name, plan, auth_provider, google_id, avatar_url, created_at, updated_at)
            VALUES
            (:id, :email, :full_name, :plan, :auth_provider, :google_id, :avatar_url, :created_at, :updated_at)
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

    token        = create_token(user_id, email)
    redirect_url = f"{FRONTEND_URL}/auth/callback?token={token}"
    return RedirectResponse(redirect_url)
