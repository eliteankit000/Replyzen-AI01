from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from database import db
from auth import hash_password, verify_password, create_token, get_current_user
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": req.email,
        "password_hash": hash_password(req.password),
        "full_name": req.full_name,
        "avatar_url": None,
        "plan": "free",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)

    # Create default settings
    settings = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "daily_digest": True,
        "weekly_report": True,
        "auto_send": False,
        "send_window_start": "09:00",
        "send_window_end": "18:00",
        "timezone": "UTC",
        "daily_send_limit": 20,
        "silence_delay_days": 3,
        "excluded_domains": "",
        "ignore_newsletters": True,
        "ignore_notifications": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.user_settings.insert_one(settings)

    token = create_token(user_id, req.email)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "plan": "free",
        }
    }


@router.post("/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user["id"], user["email"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "plan": user.get("plan", "free"),
        }
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
