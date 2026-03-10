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
    flow = get_oauth_flow(redirect_uri)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state or ""
    )
    return auth_url


def exchange_code_for_tokens(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    """Exchange authorization code for access and refresh tokens.

    Uses httpx directly instead of Flow.fetch_token() to avoid the PKCE
    code_verifier mismatch — creating a new Flow on callback generates a
    different code_verifier than the one used in get_auth_url(), causing
    Google to return: (invalid_grant) Missing code verifier.
    """
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

    expiry = None
    if token_data.get("expires_in"):
        expiry = (
            datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])
        ).isoformat()

    return {
        "access_token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "token_uri": token_url,
        "expiry": expiry,
    }


def encrypt_tokens(tokens: Dict[str, Any]) -> Dict[str, str]:
    """Encrypt OAuth tokens for secure storage."""
    return {
        "access_token_encrypted": token_encryption.encrypt(tokens["access_token"]) if tokens.get("access_token") else "",
        "refresh_token_encrypted": token_encryption.encrypt(tokens["refresh_token"]) if tokens.get("refresh_token") else "",
        "token_expiry": tokens.get("expiry", ""),
    }


def decrypt_tokens(encrypted_data: Dict[str, str]) -> Dict[str, Any]:
    """Decrypt stored OAuth tokens."""
    return {
        "access_token": token_encryption.decrypt(encrypted_data["access_token_encrypted"]) if encrypted_data.get("access_token_encrypted") else None,
        "refresh_token": token_encryption.decrypt(encrypted_data["refresh_token_encrypted"]) if encrypted_data.get("refresh_token_encrypted") else None,
        "expiry": encrypted_data.get("token_expiry"),
    }


def get_gmail_service(encrypted_tokens: Dict[str, str]):
    """Create Gmail API service from encrypted tokens."""
    tokens = decrypt_tokens(encrypted_tokens)

    expiry = None
    if tokens.get("expiry"):
        try:
            expiry = datetime.fromisoformat(tokens["expiry"].replace("Z", "+00:00"))
        except Exception:
            pass

    credentials = Credentials(
        token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GMAIL_CLIENT_ID,
        client_secret=GMAIL_CLIENT_SECRET,
        expiry=expiry
    )

    # Refresh if expired
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())

    return build("gmail", "v1", credentials=credentials), credentials


def get_user_email(encrypted_tokens: Dict[str, str]) -> str:
    """Get the authenticated user's email address."""
    service, _ = get_gmail_service(encrypted_tokens)
    profile = service.users().getProfile(userId="me").execute()
    return profile.get("emailAddress", "")


def fetch_threads(
    encrypted_tokens: Dict[str, str],
    max_results: int = 50,
    label_ids: List[str] = None
) -> List[Dict[str, Any]]:
    """Fetch email threads from Gmail."""
    service, _ = get_gmail_service(encrypted_tokens)
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
    encrypted_tokens: Dict[str, str],
    to: str,
    subject: str,
    body: str,
    thread_id: Optional[str] = None,
    in_reply_to: Optional[str] = None,
    references: Optional[str] = None
) -> Dict[str, Any]:
    """Send an email via Gmail API."""
    from email.mime.text import MIMEText

    service, credentials = get_gmail_service(encrypted_tokens)
    user_email = get_user_email(encrypted_tokens)

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
    encrypted_tokens: Dict[str, str],
    message_id: str
) -> Dict[str, Any]:
    """Get detailed information about a specific message."""
    service, _ = get_gmail_service(encrypted_tokens)

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
