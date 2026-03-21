"""
Thread Filter Service - Final Version
Core filter: is_real_opportunity()
All existing functions preserved and backward-compatible.
"""
import re
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Existing pattern lists (unchanged)
# ─────────────────────────────────────────────────────────────

AUTOMATED_SENDER_PATTERNS = [
    r'noreply@', r'no-reply@', r'donotreply@', r'do-not-reply@',
    r'notifications?@', r'alerts?@', r'mailer-daemon@', r'postmaster@',
    r'bounce@', r'newsletter@', r'news@', r'updates?@',
    r'promo(tions?)?@', r'marketing@', r'automated@', r'system@',
    r'receipts?@', r'invoices?@', r'shipping@', r'delivery@',
]

AUTOMATED_SUBJECT_PATTERNS = [
    r'unsubscribe', r'newsletter', r'weekly digest', r'daily digest',
    r'monthly update', r'promotional', r'special offer', r'limited time',
    r'discount', r'sale alert', r'order confirmation', r'shipping confirmation',
    r'delivery notification', r'receipt for', r'payment received',
    r'password reset', r'verify your email', r'confirm your', r'activation',
    r'security alert', r'login notification', r'two-factor', r'2fa',
    r'otp', r'verification code',
]

# Hard-filter sender keywords (system level — no regex needed, fast string match)
HARD_FILTER_SENDERS = [
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "notification", "notifications", "alert", "alerts",
    "updates", "update", "automated", "mailer-daemon",
    "postmaster", "bounce", "newsletter", "promo", "marketing",
    "system@", "support@", "admin@", "billing@", "orders@",
    "receipts@", "invoice@", "shipping@", "delivery@",
]

HARD_FILTER_SUBJECTS = [
    "unsubscribe", "otp", "verification", "verify your",
    "password reset", "security alert", "login notification",
    "two-factor", "2fa", "confirm your email", "order confirmation",
    "shipping confirmation", "delivery notification", "payment received",
    "receipt for", "invoice #", "monthly digest", "weekly digest",
    "daily digest",
]


# ─────────────────────────────────────────────────────────────
# NEW CORE: is_real_opportunity()
# ─────────────────────────────────────────────────────────────

def is_real_opportunity(
    thread: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Final gate: determines if a thread is a real follow-up opportunity.

    Returns:
    {
        "allowed": bool,
        "reason": str,
        "context": str   ← human-readable "why this matters" for UI
    }

    Steps:
    1. Hard system filter (noreply, OTP, newsletters…)
    2. Blocked senders
    3. User scope (sent_only | manual_contacts | domain_based | all)
    4. Actionability (last message must be from user = waiting for reply)
    5. Already replied check
    6. Silence threshold
    """
    sender      = (thread.get("last_message_from") or thread.get("from_email") or "").lower().strip()
    subject     = (thread.get("subject") or "").lower().strip()
    user_email  = (user.get("email") or "").lower().strip()
    days_silent = int(thread.get("days_silent") or 0)

    # ── STEP 1: Hard system filter ───────────────────────────
    for kw in HARD_FILTER_SENDERS:
        if kw in sender:
            return {"allowed": False, "reason": "system_filtered", "context": ""}

    for kw in HARD_FILTER_SUBJECTS:
        if kw in subject:
            return {"allowed": False, "reason": "system_filtered", "context": ""}

    # ── STEP 2: Blocked senders ──────────────────────────────
    blocked = [s.lower().strip() for s in (user.get("blocked_senders") or [])]
    if any(b in sender or sender in b for b in blocked):
        return {"allowed": False, "reason": "blocked_sender", "context": ""}

    # ── STEP 3: User scope filter ────────────────────────────
    scope = (user.get("follow_up_scope") or "sent_only").strip()

    if scope == "sent_only":
        last_sender_is_user = (
            bool(thread.get("last_sender_is_user")) or
            (user_email and user_email in sender) or
            (user_email and sender in user_email)
        )
        if not last_sender_is_user:
            return {
                "allowed": False,
                "reason":  "not_sent_by_user",
                "context": "",
            }

    elif scope == "manual_contacts":
        allowed_contacts = [c.lower().strip() for c in (user.get("allowed_contacts") or [])]
        if not any(a in sender or sender in a for a in allowed_contacts):
            return {"allowed": False, "reason": "not_in_contacts", "context": ""}

    elif scope == "domain_based":
        allowed_domains = [
            d.lower().strip().lstrip("@")
            for d in (user.get("allowed_domains") or [])
        ]
        if not any(d in sender for d in allowed_domains):
            return {"allowed": False, "reason": "domain_not_allowed", "context": ""}

    elif scope == "all":
        pass  # no extra filtering

    else:
        return {"allowed": False, "reason": f"invalid_scope:{scope}", "context": ""}

    # ── STEP 4: Must be actionable (user sent last message) ──
    last_sender_is_user = (
        bool(thread.get("last_sender_is_user")) or
        (user_email and user_email in sender)
    )
    if not last_sender_is_user:
        return {
            "allowed": False,
            "reason":  "no_followup_needed",
            "context": "",
        }

    # ── STEP 5: Already replied ──────────────────────────────
    if thread.get("replied_by_user") or thread.get("is_dismissed"):
        return {
            "allowed": False,
            "reason":  "already_replied_or_dismissed",
            "context": "",
        }

    # ── STEP 6: Silence threshold ────────────────────────────
    follow_up_days = int(user.get("silence_delay_days") or user.get("follow_up_days") or 3)
    if days_silent < follow_up_days:
        return {
            "allowed": False,
            "reason":  "too_early",
            "context": "",
        }

    # ── PASSED: Build human-readable context ─────────────────
    original_subject = thread.get("subject") or "this conversation"
    context = _build_context(original_subject, days_silent, thread)

    return {"allowed": True, "reason": "valid_opportunity", "context": context}


def _build_context(subject: str, days_silent: int, thread: Dict[str, Any]) -> str:
    """Build a human-readable 'why this matters' string for the UI card."""
    thread_type = (thread.get("type") or "").lower()

    if thread_type == "client_proposal":
        return f"No reply for {days_silent} day{'s' if days_silent != 1 else ''} after your proposal"
    if thread_type == "payment":
        return f"Payment conversation silent for {days_silent} day{'s' if days_silent != 1 else ''}"
    if thread_type == "interview":
        return f"No response from recruiter for {days_silent} day{'s' if days_silent != 1 else ''}"
    if thread_type == "lead":
        return f"Lead hasn't responded in {days_silent} day{'s' if days_silent != 1 else ''}"
    if thread_type == "partnership":
        return f"Partnership discussion quiet for {days_silent} day{'s' if days_silent != 1 else ''}"

    if days_silent >= 7:
        return f"Client hasn't responded in over a week"
    if days_silent >= 3:
        return f"Waiting for response — {days_silent} days since your last message"

    return f"No reply for {days_silent} day{'s' if days_silent != 1 else ''} after your message"


# ─────────────────────────────────────────────────────────────
# Existing helpers — all unchanged, fully backward-compatible
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
    user_email_lower  = user_email.lower().strip() if user_email else ""
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
        return {"show_reply": False, "reason": "Automated sender", "status": "automated"}
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

    if thread.get("is_dismissed"):               return "dismissed"
    if thread.get("replied_by_user"):            return "replied"
    if followup_status == "pending":             return "follow_up_scheduled"
    if followup_status == "sent":                return "replied"
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


# ─────────────────────────────────────────────────────────────
# NEW HELPER: User scope filter (standalone, used in cron)
# ─────────────────────────────────────────────────────────────

def should_process_thread(
    thread: Dict[str, Any],
    user: Dict[str, Any],
) -> tuple[bool, str]:
    result = is_real_opportunity(thread, user)
    return result["allowed"], result["reason"]
