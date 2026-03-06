from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from database import db
from auth import hash_password, verify_password, create_token, get_current_user
import uuid
import os
import httpx
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Google OAuth configuration
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
        "auth_provider": "email",
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
    
    # Check if user registered with Google (no password)
    if user.get("auth_provider") == "google" and not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Please sign in with Google")

    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user["id"], user["email"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "plan": user.get("plan", "free"),
            "avatar_url": user.get("avatar_url"),
        }
    }


@router.get("/google/url")
async def get_google_auth_url(redirect_uri: Optional[str] = None):
    """Get Google OAuth authorization URL for login/signup."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    # Use provided redirect_uri or default
    final_redirect = redirect_uri or GOOGLE_REDIRECT_URI
    if not final_redirect:
        raise HTTPException(status_code=500, detail="Google OAuth redirect URI not configured")
    
    scopes = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]
    
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={final_redirect}&"
        "response_type=code&"
        f"scope={'+'.join(scopes)}&"
        "access_type=offline&"
        "prompt=consent"
    )
    
    return {"auth_url": auth_url}


@router.post("/google/callback")
async def google_auth_callback(req: GoogleAuthRequest):
    """Handle Google OAuth callback for login/signup."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    redirect_uri = req.redirect_uri or GOOGLE_REDIRECT_URI
    if not redirect_uri:
        raise HTTPException(status_code=500, detail="Google OAuth redirect URI not configured")
    
    try:
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "code": req.code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                }
            )
            
            if token_response.status_code != 200:
                logger.error(f"Token exchange failed: {token_response.text}")
                raise HTTPException(status_code=400, detail="Failed to authenticate with Google")
            
            tokens = token_response.json()
            access_token = tokens.get("access_token")
            
            # Get user info from Google
            userinfo_response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if userinfo_response.status_code != 200:
                logger.error(f"Userinfo request failed: {userinfo_response.text}")
                raise HTTPException(status_code=400, detail="Failed to get user info from Google")
            
            userinfo = userinfo_response.json()
        
        google_email = userinfo.get("email")
        google_name = userinfo.get("name", "")
        google_picture = userinfo.get("picture", "")
        google_id = userinfo.get("id")
        
        if not google_email:
            raise HTTPException(status_code=400, detail="Could not get email from Google")
        
        # Check if user already exists
        existing_user = await db.users.find_one({"email": google_email}, {"_id": 0})
        
        if existing_user:
            # Update existing user with Google info if needed
            update_data = {
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if not existing_user.get("avatar_url") and google_picture:
                update_data["avatar_url"] = google_picture
            if not existing_user.get("google_id"):
                update_data["google_id"] = google_id
            
            await db.users.update_one({"id": existing_user["id"]}, {"$set": update_data})
            
            token = create_token(existing_user["id"], google_email)
            return {
                "token": token,
                "user": {
                    "id": existing_user["id"],
                    "email": google_email,
                    "full_name": existing_user.get("full_name", google_name),
                    "plan": existing_user.get("plan", "free"),
                    "avatar_url": existing_user.get("avatar_url") or google_picture,
                },
                "is_new_user": False
            }
        
        # Create new user
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": google_email,
            "password_hash": None,  # No password for Google users
            "full_name": google_name,
            "avatar_url": google_picture,
            "google_id": google_id,
            "plan": "free",
            "auth_provider": "google",
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
        
        token = create_token(user_id, google_email)
        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": google_email,
                "full_name": google_name,
                "plan": "free",
                "avatar_url": google_picture,
            },
            "is_new_user": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
