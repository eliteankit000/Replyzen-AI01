"""
Real Gmail OAuth Service - Production Ready
Handles Gmail OAuth authentication, token management, and email operations.
"""
import os
import base64
import json
import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Any
from cryptography.fernet import Fernet
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import email.utils

logger = logging.getLogger(__name__)

# Gmail API configuration
GMAIL_CLIENT_ID = os.environ.get("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.environ.get("GMAIL_CLIENT_SECRET", "")
GMAIL_REDIRECT_URI = os.environ.get("GMAIL_REDIRECT_URI", "")
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


class TokenEncryption:
    """Handles secure encryption/decryption of OAuth tokens."""

    def __init__(self):
        if ENCRYPTION_KEY:
            self.cipher = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)
        else:
            self.cipher = None
            logger.warning("ENCRYPTION_KEY not set - tokens will be stored unencrypted")

    def encrypt(self, data: str) -> str:
        if not self.cipher:
            return data
        return self.cipher.encrypt(data.encode()).decode()

    def decrypt(self, encrypted_data: str) -> str:
        if not self.cipher:
            return encrypted_data
        try:
            return self.cipher.decrypt(encrypted_data.encode()).decode()
        except Exception as e:
            logger.error(f"Token decryption failed: {e}")
            raise ValueError("Failed to decrypt token")


token_encryption = TokenEncryption()


def get_oauth_flow(redirect_uri: Optional[str] = None) -> Flow:
    """Create OAuth flow for Gmail authentication."""
    client_config = {
        "web": {
            "client_id": GMAIL_CLIENT_ID,
            "client_secret": GMAIL_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri or GMAIL_REDIRECT_URI],
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri or GMAIL_REDIRECT_URI
    )
    return flow


def get_auth_url(state: Optional[str] = None, redirect_uri: Optional[str] = None) -> str:
    """Generate OAuth authorization URL for Gmail."""
    import urllib.parse
    params = {
        "client_id": GMAIL_CLIENT_ID,
        "redirect_uri": redirect_uri or GMAIL_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state or "",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)


def exchange_code_for_tokens(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    """Exchange authorization code for access and refresh tokens."""
    effective_redirect = redirect_uri or GMAIL_REDIRECT_URI
    token_url = "https://oauth2.googleapis.com/token"

    response = httpx.post(token_url, data={
        "code": code,
        "client_id": GMAIL_CLIENT_ID,
        "client_secret": GMAIL_CLIENT_SECRET,
        "redirect_uri": effective_redirect,
        "grant_type": "authorization_code",
    })

    if response.status_code != 200:
        logger.error(f"Token exchange failed: {response.text}")
        raise ValueError(f"Token exchange failed: {response.text}")

    token_data = response.json()

    # ✅ Keep expiry as a datetime object (not a string) so it can be
    #    passed directly to PostgreSQL and Google Credentials without conversion
    expiry: Optional[datetime] = None
    if token_data.get("expires_in"):
        expiry = datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])

    return {
        "access_token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "token_uri": token_url,
        "expiry": expiry,  # datetime | None
    }


def encrypt_tokens(tokens: Dict[str, Any]) -> Dict[str, Any]:
    """
    Encrypt OAuth tokens for secure storage.
    Returns keys matching DB column names: access_token, refresh_token, token_expiry
    token_expiry is kept as datetime so PostgreSQL accepts it directly.
    """
    return {
        "access_token": token_encryption.encrypt(tokens["access_token"]) if tokens.get("access_token") else "",
        "refresh_token": token_encryption.encrypt(tokens["refresh_token"]) if tokens.get("refresh_token") else "",
        "token_expiry": tokens.get("expiry"),  # ✅ datetime object, not a string
    }


def decrypt_tokens(db_row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Decrypt stored OAuth tokens.
    Accepts DB column names: access_token, refresh_token, token_expiry
    """
    return {
        "access_token": token_encryption.decrypt(db_row["access_token"]) if db_row.get("access_token") else None,
        "refresh_token": token_encryption.decrypt(db_row["refresh_token"]) if db_row.get("refresh_token") else None,
        "expiry": db_row.get("token_expiry"),  # datetime | None
    }


def get_gmail_service(db_tokens: Dict[str, Any]):
    """
    Create Gmail API service from DB token row.
    Accepts a dict with keys: access_token, refresh_token, token_expiry
    """
    tokens = decrypt_tokens(db_tokens)

    expiry = tokens.get("expiry")

    # expiry may be a datetime (from DB) or None
    if isinstance(expiry, str):
        # Fallback: parse if somehow still a string
        try:
            expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        except Exception:
            expiry = None

    if isinstance(expiry, datetime) and expiry.tzinfo is not None:
        # ✅ Strip tzinfo — Google's Credentials uses datetime.utcnow() (naive) internally
        expiry = expiry.replace(tzinfo=None)

    credentials = Credentials(
        token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GMAIL_CLIENT_ID,
        client_secret=GMAIL_CLIENT_SECRET,
        expiry=expiry
    )

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())

    return build("gmail", "v1", credentials=credentials), credentials


def get_user_email(db_tokens: Dict[str, Any]) -> str:
    """Get the authenticated user's email address."""
    service, _ = get_gmail_service(db_tokens)
    profile = service.users().getProfile(userId="me").execute()
    return profile.get("emailAddress", "")


def fetch_threads(
    db_tokens: Dict[str, Any],
    max_results: int = 50,
    label_ids: List[str] = None
) -> List[Dict[str, Any]]:
    """Fetch email threads from Gmail."""
    service, _ = get_gmail_service(db_tokens)
    threads = []

    try:
        query_params = {
            "userId": "me",
            "maxResults": max_results,
        }
        if label_ids:
            query_params["labelIds"] = label_ids

        response = service.users().threads().list(**query_params).execute()
        thread_list = response.get("threads", [])

        for thread_item in thread_list[:max_results]:
            thread_data = service.users().threads().get(
                userId="me",
                id=thread_item["id"],
                format="metadata",
                metadataHeaders=["Subject", "From", "To", "Date"]
            ).execute()

            messages = thread_data.get("messages", [])
            if not messages:
                continue

            first_msg = messages[0]
            last_msg = messages[-1]

            headers = {h["name"]: h["value"] for h in last_msg.get("payload", {}).get("headers", [])}
            first_headers = {h["name"]: h["value"] for h in first_msg.get("payload", {}).get("headers", [])}

            subject = first_headers.get("Subject", "(No Subject)")
            from_header = headers.get("From", "")
            to_header = headers.get("To", "")
            date_header = headers.get("Date", "")

            from_email = email.utils.parseaddr(from_header)[1]
            to_email = email.utils.parseaddr(to_header)[1]
            snippet = last_msg.get("snippet", "")

            threads.append({
                "gmail_thread_id": thread_data["id"],
                "subject": subject,
                "snippet": snippet,
                "from_email": from_email,
                "to_email": to_email,
                "last_message_date": date_header,
                "message_count": len(messages),
                "messages": messages,
            })

    except HttpError as e:
        logger.error(f"Gmail API error: {e}")
        raise

    return threads


def send_email(
    db_tokens: Dict[str, Any],
    to: str,
    subject: str,
    body: str,
    thread_id: Optional[str] = None,
    in_reply_to: Optional[str] = None,
    references: Optional[str] = None
) -> Dict[str, Any]:
    """Send an email via Gmail API."""
    from email.mime.text import MIMEText

    service, credentials = get_gmail_service(db_tokens)
    user_email = get_user_email(db_tokens)

    message = MIMEText(body)
    message["to"] = to
    message["from"] = user_email
    message["subject"] = subject

    if in_reply_to:
        message["In-Reply-To"] = in_reply_to
    if references:
        message["References"] = references

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    body_data = {"raw": raw}
    if thread_id:
        body_data["threadId"] = thread_id

    try:
        sent_message = service.users().messages().send(
            userId="me",
            body=body_data
        ).execute()

        return {
            "id": sent_message["id"],
            "thread_id": sent_message.get("threadId"),
            "label_ids": sent_message.get("labelIds", []),
        }
    except HttpError as e:
        logger.error(f"Failed to send email: {e}")
        raise


def get_message_details(
    db_tokens: Dict[str, Any],
    message_id: str
) -> Dict[str, Any]:
    """Get detailed information about a specific message."""
    service, _ = get_gmail_service(db_tokens)

    message = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full"
    ).execute()

    headers = {h["name"]: h["value"] for h in message.get("payload", {}).get("headers", [])}

    body = ""
    payload = message.get("payload", {})

    if "body" in payload and payload["body"].get("data"):
        body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="ignore")
    elif "parts" in payload:
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
                body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="ignore")
                break

    return {
        "id": message["id"],
        "thread_id": message.get("threadId"),
        "subject": headers.get("Subject", ""),
        "from": headers.get("From", ""),
        "to": headers.get("To", ""),
        "date": headers.get("Date", ""),
        "message_id": headers.get("Message-ID", ""),
        "body": body,
        "snippet": message.get("snippet", ""),
    }



async def send_gmail_reply(
    db,
    user_id: str,
    thread_id: str,
    subject: str,
    body: str,
    to: str,
) -> Dict[str, Any]:
    """
    Send a Gmail reply (wrapper for inbox service).
    Fetches user's Gmail tokens and sends via Gmail API.
    """
    from sqlalchemy import text
    
    # Get user's Gmail tokens
    result = await db.execute(
        text("""
            SELECT access_token, refresh_token, token_expiry
            FROM email_accounts
            WHERE user_id::text = :user_id AND is_active::boolean = true
            LIMIT 1
        """),
        {"user_id": user_id}
    )
    account = result.fetchone()
    
    if not account:
        raise ValueError("No active Gmail account found for user")
    
    db_tokens = {
        "access_token": account.access_token,
        "refresh_token": account.refresh_token,
        "token_expiry": account.token_expiry,
    }
    
    # Ensure subject has "Re:" prefix
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"
    
    # Send via Gmail API
    result = send_email(
        db_tokens=db_tokens,
        to=to,
        subject=subject,
        body=body,
        thread_id=thread_id,
    )
    
    return result
