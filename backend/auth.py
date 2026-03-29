import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, status, Depends
from dotenv import load_dotenv
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User  # make sure this exists

# --------------------------------------------------
# Load Environment Variables
# --------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --------------------------------------------------
# JWT Configuration
# --------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "replyzen-fallback-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", 72))

# --------------------------------------------------
# Password Hashing
# --------------------------------------------------
def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )

# --------------------------------------------------
# JWT Token Creation
# --------------------------------------------------
def create_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# --------------------------------------------------
# JWT Token Decode
# --------------------------------------------------
def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# --------------------------------------------------
# ✅ Get Current Authenticated User (Returns dict for compatibility)
# --------------------------------------------------
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Returns user payload as dict with user_id and email.
    Compatible with all routes expecting dict format.
    """
    import logging
    logger = logging.getLogger(__name__)

    auth_header = request.headers.get("Authorization")

    if not auth_header:
        logger.warning("Authorization header missing in request")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )

    if not auth_header.startswith("Bearer "):
        logger.warning(f"Invalid authorization format: {auth_header[:20]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization format"
        )

    token = auth_header.split(" ")[1]
    
    try:
        payload = decode_token(token)
    except HTTPException as e:
        logger.error(f"Token decode error: {e.detail}")
        raise

    user_id = payload.get("user_id")
    email = payload.get("email")

    if not user_id:
        logger.error(f"Invalid token payload - no user_id: {payload}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    # ✅ Verify user exists in database
    from sqlalchemy import text
    result = await db.execute(
        text("SELECT id, email FROM users WHERE id::text = :user_id"),
        {"user_id": user_id}
    )
    user = result.fetchone()

    if not user:
        logger.error(f"User not found in DB: {user_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    logger.info(f"Authenticated user: {email}")
    
    # Return dict format for compatibility
    return {
        "user_id": str(user_id),
        "email": email or user.email,
    }
