import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, status
from dotenv import load_dotenv
from pathlib import Path

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
    """
    Hash user password using bcrypt
    """
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    """
    Verify password against stored hash
    """
    return bcrypt.checkpw(
        password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )

# --------------------------------------------------
# JWT Token Creation
# --------------------------------------------------

def create_token(user_id: str, email: str) -> str:
    """
    Create JWT access token
    """

    now = datetime.now(timezone.utc)

    payload = {
        "user_id": user_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRY_HOURS)
    }

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    return token

# --------------------------------------------------
# JWT Token Decode
# --------------------------------------------------

def decode_token(token: str) -> dict:
    """
    Decode and validate JWT token
    """

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

# --------------------------------------------------
# Get Current Authenticated User
# --------------------------------------------------

async def get_current_user(request: Request) -> dict:
    """
    Extract user from Authorization header
    """

    auth_header = request.headers.get("Authorization")

    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization format"
        )

    token = auth_header.split(" ")[1]

    payload = decode_token(token)

    return payload
