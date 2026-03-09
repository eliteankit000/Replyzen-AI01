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
        INSERT INTO users (id,email,password_hash,full_name,plan,auth_provider,created_at,updated_at)
        VALUES (:id,:email,:password_hash,:full_name,:plan,:auth_provider,:created_at,:updated_at)
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

    # ✅ FIX: Convert UUID to str — database returns UUID object, not string
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

@router.get("/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        text("SELECT id,email,full_name,plan FROM users WHERE id = :id"),
        {"id": current_user["user_id"]}
    )
    user = result.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ✅ FIX: Convert all fields to safe JSON types
    user_dict = dict(user._mapping)
    user_dict["id"] = str(user_dict["id"])
    return user_dict
