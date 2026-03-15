"""
Thread Filter Service - Determines if a thread should show reply generation option.
This service filters out emails that should NOT receive AI-generated replies.
"""
import re
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Common automated sender patterns
AUTOMATED_SENDER_PATTERNS = [
    r'noreply@',
    r'no-reply@',
    r'donotreply@',
    r'do-not-reply@',
    r'notifications?@',
    r'alerts?@',
    r'mailer-daemon@',
    r'postmaster@',
    r'bounce@',
    r'support@.*\.com$',  # Generic support emails
    r'newsletter@',
    r'news@',
    r'updates?@',
    r'promo(tions?)?@',
    r'marketing@',
    r'info@',
    r'hello@',
    r'team@',
    r'accounts?@',
    r'billing@',
    r'orders?@',
    r'receipts?@',
    r'invoices?@',
    r'shipping@',
    r'delivery@',
    r'automated@',
    r'system@',
    r'admin@',
]

# Automated subject patterns (newsletters, promotions)
AUTOMATED_SUBJECT_PATTERNS = [
    r'unsubscribe',
    r'newsletter',
    r'weekly digest',
    r'daily digest',
    r'monthly update',
    r'promotional',
    r'special offer',
    r'limited time',
    r'discount',
    r'sale alert',
    r'order confirmation',
    r'shipping confirmation',
    r'delivery notification',
    r'receipt for',
    r'invoice',
    r'payment received',
    r'password reset',
    r'verify your email',
    r'confirm your',
    r'activation',
    r'security alert',
    r'login notification',
    r'two-factor',
    r'2fa',
    r'otp',
    r'verification code',
]


def is_automated_sender(email: str) -> bool:
    """Check if the sender email looks like an automated/noreply address."""
    if not email:
        return False
    
    email_lower = email.lower().strip()
    
    for pattern in AUTOMATED_SENDER_PATTERNS:
        if re.search(pattern, email_lower):
            return True
    
    return False


def is_automated_subject(subject: str) -> bool:
    """Check if the subject indicates an automated/newsletter email."""
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
    user_settings: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Determine if a thread should show the "Generate Reply" button.
    
    Returns:
        {
            "show_reply": bool,
            "reason": str,
            "status": str  # "needs_reply" | "replied" | "awaiting_response" | "dismissed" | "automated" | "sent_by_user"
        }
    
    A reply should be shown ONLY when:
    1. The email is incoming (not sent by user)
    2. The user has not already replied to this thread
    3. The last message is not from the user
    4. The sender is not automated (noreply, newsletter, etc.)
    5. The thread is not dismissed by the user
    6. No AI reply has been generated yet (unless manually regenerating)
    """
    user_email_lower = user_email.lower().strip() if user_email else ""
    
    # Get thread fields
    last_message_from = (thread.get("last_message_from") or "").lower().strip()
    from_email = (thread.get("from_email") or last_message_from).lower().strip()
    subject = thread.get("subject") or ""
    is_dismissed = thread.get("is_dismissed", False)
    replied_by_user = thread.get("replied_by_user", False)
    reply_generated = thread.get("reply_generated", False)
    status = thread.get("status", "")
    
    # Check settings for ignoring automated emails
    ignore_newsletters = True
    ignore_notifications = True
    if user_settings:
        ignore_newsletters = user_settings.get("ignore_newsletters", True)
        ignore_notifications = user_settings.get("ignore_notifications", True)
    
    # 1. Check if thread is dismissed
    if is_dismissed:
        return {
            "show_reply": False,
            "reason": "Thread has been dismissed",
            "status": "dismissed"
        }
    
    # 2. Check if user already replied to this thread
    if replied_by_user or status == "replied":
        return {
            "show_reply": False,
            "reason": "You have already replied to this thread",
            "status": "replied"
        }
    
    # 3. Check if user sent the last message (awaiting response from others)
    if user_email_lower and last_message_from:
        if user_email_lower in last_message_from or last_message_from in user_email_lower:
            return {
                "show_reply": False,
                "reason": "Awaiting response from recipient",
                "status": "awaiting_response"
            }
    
    # 4. Check if the sender is automated
    if ignore_notifications and is_automated_sender(from_email):
        return {
            "show_reply": False,
            "reason": "Automated sender (noreply/notification)",
            "status": "automated"
        }
    
    # 5. Check if subject indicates newsletter/promotional
    if ignore_newsletters and is_automated_subject(subject):
        return {
            "show_reply": False,
            "reason": "Newsletter or promotional email",
            "status": "automated"
        }
    
    # 6. Check if reply was already generated (prevent duplicates)
    if reply_generated:
        return {
            "show_reply": False,
            "reason": "Reply already generated",
            "status": "reply_pending"
        }
    
    # All checks passed - show reply button
    return {
        "show_reply": True,
        "reason": "Reply needed",
        "status": "needs_reply"
    }


def get_thread_status(
    thread: Dict[str, Any],
    user_email: str,
    followup_status: Optional[str] = None
) -> str:
    """
    Get the display status for a thread.
    
    Returns one of:
    - "needs_reply" - Incoming email needs response
    - "replied" - User has replied
    - "awaiting_response" - User sent last message, waiting for reply
    - "follow_up_scheduled" - Follow-up is scheduled
    - "dismissed" - Thread was dismissed
    - "automated" - Automated/newsletter email
    """
    user_email_lower = user_email.lower().strip() if user_email else ""
    last_message_from = (thread.get("last_message_from") or "").lower().strip()
    
    if thread.get("is_dismissed"):
        return "dismissed"
    
    if thread.get("replied_by_user") or thread.get("status") == "replied":
        return "replied"
    
    if followup_status == "pending":
        return "follow_up_scheduled"
    
    if followup_status == "sent":
        return "replied"
    
    if user_email_lower and last_message_from:
        if user_email_lower in last_message_from or last_message_from in user_email_lower:
            return "awaiting_response"
    
    from_email = (thread.get("from_email") or last_message_from).lower()
    subject = thread.get("subject") or ""
    
    if is_automated_sender(from_email) or is_automated_subject(subject):
        return "automated"
    
    return "needs_reply"


def filter_threads_for_reply(
    threads: List[Dict[str, Any]],
    user_email: str,
    user_settings: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Filter a list of threads and add reply eligibility info to each.
    """
    result = []
    
    for thread in threads:
        reply_info = should_show_reply(thread, user_email, user_settings)
        thread_copy = dict(thread)
        thread_copy["show_reply"] = reply_info["show_reply"]
        thread_copy["reply_reason"] = reply_info["reason"]
        thread_copy["thread_status"] = reply_info["status"]
        result.append(thread_copy)
    
    return result
