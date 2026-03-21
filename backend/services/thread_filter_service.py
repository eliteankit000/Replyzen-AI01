"""
Thread Filter Service
Handles system-level filtering AND user-controlled follow-up scope.
Existing should_show_reply / get_thread_status / filter_threads_for_reply
logic is fully preserved.
"""
import re
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Automated Sender / Subject Patterns (existing)
# ─────────────────────────────────────────────────────────────

AUTOMATED_SENDER_PATTERNS = [
    r'noreply@', r'no-reply@', r'donotreply@', r'do-not-reply@',
    r'notifications?@', r'alerts?@', r'mailer-daemon@', r'postmaster@',
    r'bounce@', r'support@.*\.com$', r'newsletter@', r'news@',
    r'updates?@', r'promo(tions?)?@', r'marketing@', r'info@',
    r'hello@', r'team@', r'accounts?@', r'billing@', r'orders?@',
    r'receipts?@', r'invoices?@', r'shipping@', r'delivery@',
    r'automated@', r'system@', r'admin@',
]

AUTOMATED_SUBJECT_PATTERNS = [
    r'unsubscribe', r'newsletter', r'weekly digest', r'daily digest',
    r'monthly update', r'promotional', r'special offer', r'limited time',
    r'discount', r'sale alert', r'order confirmation', r'shipping confirmation',
    r'delivery notification', r'receipt for', r'invoice', r'payment received',
    r'password reset', r'verify your email', r'confirm your', r'activation',
    r'security alert', r'login notification', r'two-factor', r'2fa',
    r'otp', r'verification code',
]

# ─────────────────────────────────────────────────────────────
# NEW: System-Level Useless Thread Detection
# ─────────────────────────────────────────────────────────────

SYSTEM_FILTER_SENDER = [
    "noreply", "no-reply", "notification", "notifications",
    "alerts", "alert", "updates", "update", "automated",
    "donotreply", "do-not-reply", "mailer-daemon", "postmaster",
    "bounce", "newsletter", "promo", "marketing", "system",
]

SYSTEM_FILTER_SUBJECT = [
    "unsubscribe", "otp", "verification", "verify",
    "alert", "password reset", "confirm your email",
    "security code", "two-factor", "2fa", "login notification",
    "order confirmation", "shipping confirmation", "delivery notification",
    "payment received", "receipt", "invoice #",
]


def is_useless_thread(thread: Dict[str, Any]) -> tuple[bool, str]:
    """
    System-level hard filter. Returns (is_useless, reason).
    These threads are NEVER shown regardless of user settings.
    """
    sender  = (thread.get("last_message_from") or thread.get("from_email") or "").lower()
    subject = (thread.get("subject") or "").lower()

    for keyword in SYSTEM_FILTER_SENDER:
        if keyword in sender:
            return True, f"automated_sender:{keyword}"

    for keyword in SYSTEM_FILTER_SUBJECT:
        if keyword in subject:
            return True, f"automated_subject:{keyword}"

    return False, ""


# ─────────────────────────────────────────────────────────────
# NEW: User-Controlled Scope Filter
# ─────────────────────────────────────────────────────────────

def should_process_thread(
    thread: Dict[str, Any],
    user: Dict[str, Any],
) -> tuple[bool, str]:
    """
    User-controlled filter. Returns (should_process, reason).

    Checks:
    1. System-level filter (is_useless_thread)
    2. Blocked senders
    3. follow_up_scope: sent_only | manual_contacts | domain_based | all
    """
    # Step 1: system filter
    useless, reason = is_useless_thread(thread)
    if useless:
        return False, reason

    sender = (
        thread.get("last_message_from") or
        thread.get("from_email") or ""
    ).lower().strip()

    user_email = (user.get("email") or "").lower().strip()

    # Step 2: blocked senders
    blocked = [s.lower().strip() for s in (user.get("blocked_senders") or [])]
    if any(b in sender or sender in b for b in blocked):
        return False, "blocked_sender"

    scope = user.get("follow_up_scope") or "sent_only"

    # Step 3: scope logic
    if scope == "sent_only":
        # Only process if the LAST message was sent BY the user
        last_from = (thread.get("last_message_from") or "").lower()
        is_from_user = (
            user_email in last_from or
            last_from in user_email or
            bool(thread.get("last_sender_is_user"))
        )
        if not is_from_user:
            return False, "scope:sent_only — last message not from user"
        return True, "ok"

    elif scope == "manual_contacts":
        allowed = [c.lower().strip() for c in (user.get("allowed_contacts") or [])]
        if any(a in sender or sender in a for a in allowed):
            return True, "ok"
        return False, "scope:manual_contacts — sender not in allowed list"

    elif scope == "domain_based":
        allowed_domains = [d.lower().strip().lstrip("@") for d in (user.get("allowed_domains") or [])]
        if any(domain in sender for domain in allowed_domains):
            return True, "ok"
        return False, "scope:domain_based — sender domain not allowed"

    elif scope == "all":
        return True, "ok"

    return False, f"unknown_scope:{scope}"


# ─────────────────────────────────────────────────────────────
# Existing helpers (unchanged)
# ─────────────────────────────────────────────────────────────

def is_automated_sender(email: str) -> bool:
    if not email:
        return False
    email_lower = email.lower().strip()
    for pattern in AUTOMATED_SENDER_PATTERNS:
        if re.search(pattern, email_lower):
            return True
    return False


def is_automated_subject(subject: str) -> bool:
    if not subject:
        return False
    subject_lower = subject.lower().strip()
    for pattern in AUTOMATED_SUBJECT_PATTERNS:
        if re.search(pattern, subject_lower):
            return True
    return False


def should_show_reply(
    thread: Dict[str, Any],
    user_email: str,
    user_settings: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Determine if a thread should show the 'Generate Reply' button.
    Fully backward-compatible — unchanged from original.
    """
    user_email_lower = user_email.lower().strip() if user_email else ""

    last_message_from = (thread.get("last_message_from") or "").lower().strip()
    from_email        = (thread.get("from_email") or last_message_from).lower().strip()
    subject           = thread.get("subject") or ""
    is_dismissed      = thread.get("is_dismissed", False)
    replied_by_user   = thread.get("replied_by_user", False)
    reply_generated   = thread.get("reply_generated", False)
    status            = thread.get("status", "")

    ignore_newsletters   = True
    ignore_notifications = True
    if user_settings:
        ignore_newsletters   = user_settings.get("ignore_newsletters", True)
        ignore_notifications = user_settings.get("ignore_notifications", True)

    if is_dismissed:
        return {"show_reply": False, "reason": "Thread has been dismissed", "status": "dismissed"}

    if replied_by_user or status == "replied":
        return {"show_reply": False, "reason": "You have already replied to this thread", "status": "replied"}

    if user_email_lower and last_message_from:
        if user_email_lower in last_message_from or last_message_from in user_email_lower:
            return {"show_reply": False, "reason": "Awaiting response from recipient", "status": "awaiting_response"}

    if ignore_notifications and is_automated_sender(from_email):
        return {"show_reply": False, "reason": "Automated sender (noreply/notification)", "status": "automated"}

    if ignore_newsletters and is_automated_subject(subject):
        return {"show_reply": False, "reason": "Newsletter or promotional email", "status": "automated"}

    if reply_generated:
        return {"show_reply": False, "reason": "Reply already generated", "status": "reply_pending"}

    return {"show_reply": True, "reason": "Reply needed", "status": "needs_reply"}


def get_thread_status(
    thread: Dict[str, Any],
    user_email: str,
    followup_status: Optional[str] = None,
) -> str:
    user_email_lower  = user_email.lower().strip() if user_email else ""
    last_message_from = (thread.get("last_message_from") or "").lower().strip()

    if thread.get("is_dismissed"):            return "dismissed"
    if thread.get("replied_by_user") or thread.get("status") == "replied": return "replied"
    if followup_status == "pending":          return "follow_up_scheduled"
    if followup_status == "sent":             return "replied"

    if user_email_lower and last_message_from:
        if user_email_lower in last_message_from or last_message_from in user_email_lower:
            return "awaiting_response"

    from_email = (thread.get("from_email") or last_message_from).lower()
    subject    = thread.get("subject") or ""
    if is_automated_sender(from_email) or is_automated_subject(subject):
        return "automated"

    return "needs_reply"


def filter_threads_for_reply(
    threads: List[Dict[str, Any]],
    user_email: str,
    user_settings: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    result = []
    for thread in threads:
        reply_info  = should_show_reply(thread, user_email, user_settings)
        thread_copy = dict(thread)
        thread_copy["show_reply"]    = reply_info["show_reply"]
        thread_copy["reply_reason"]  = reply_info["reason"]
        thread_copy["thread_status"] = reply_info["status"]
        result.append(thread_copy)
    return result
