"""
Thread Classification & Priority Scoring Service
Opportunity Intelligence Layer for Replyzen AI
"""
import re
import logging
import os
from typing import Dict, Any, Optional
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

api_key = os.environ.get("OPENAI_API_KEY", "")
client = AsyncOpenAI(api_key=api_key) if api_key else None

# ─────────────────────────────────────────────
# Keyword Rules
# ─────────────────────────────────────────────

TYPE_KEYWORDS = {
    "payment":          ["payment", "invoice", "billing", "receipt", "due", "overdue", "charge", "subscription", "refund"],
    "client_proposal":  ["proposal", "quote", "contract", "estimate", "scope", "project", "hire", "freelance", "budget"],
    "interview":        ["interview", "hr", "hiring", "position", "role", "candidate", "offer", "onboarding", "recruiter"],
    "lead":             ["demo", "trial", "interested", "inquiry", "question", "pricing", "sales", "info request"],
    "partnership":      ["partnership", "collaborate", "collab", "joint", "sponsor", "affiliate", "opportunity"],
    "newsletter":       ["unsubscribe", "newsletter", "digest", "weekly update", "monthly update", "promotional"],
    "notification":     ["noreply", "no-reply", "donotreply", "notification", "alert", "automated", "system"],
}

AUTOMATED_SENDER_RE = re.compile(
    r"(noreply|no-reply|donotreply|do-not-reply|notifications?|alerts?|"
    r"mailer-daemon|postmaster|bounce|newsletter|news@|updates?@|"
    r"promo|marketing|automated|system@|admin@|billing@|orders?@|"
    r"receipts?|invoices?|shipping|delivery)",
    re.IGNORECASE,
)


# ─────────────────────────────────────────────
# Thread Classification
# ─────────────────────────────────────────────

def _keyword_classify(subject: str, snippet: str, sender: str) -> Optional[str]:
    """Fast keyword-based classification. Returns type or None."""
    text = f"{subject} {snippet} {sender}".lower()

    # Hard-coded automated checks first
    if AUTOMATED_SENDER_RE.search(sender):
        return "notification"
    if re.search(r"unsubscribe", text):
        return "newsletter"

    for thread_type, keywords in TYPE_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return thread_type

    return None


async def _ai_classify(subject: str, snippet: str) -> str:
    """Fallback: use OpenAI to classify thread type."""
    if not client:
        return "other"
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You classify email threads. Reply with ONLY one of these labels:\n"
                        "client_proposal, lead, payment, interview, partnership, "
                        "newsletter, notification, other\n"
                        "No explanation, just the label."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Subject: {subject}\nSnippet: {snippet}",
                },
            ],
            max_tokens=10,
            temperature=0,
        )
        result = response.choices[0].message.content.strip().lower()
        valid = {"client_proposal", "lead", "payment", "interview", "partnership",
                 "newsletter", "notification", "other"}
        return result if result in valid else "other"
    except Exception as e:
        logger.warning(f"AI classification failed: {e}")
        return "other"


async def classify_thread(thread: Dict[str, Any]) -> Dict[str, Any]:
    """
    Classify a thread and return:
    {
        type: str,
        importance: "high" | "medium" | "low",
        is_actionable: bool
    }
    """
    subject = thread.get("subject") or ""
    snippet = thread.get("snippet") or ""
    sender  = thread.get("last_message_from") or thread.get("from_email") or ""

    # Step 1: fast keyword check
    thread_type = _keyword_classify(subject, snippet, sender)

    # Step 2: AI fallback
    if not thread_type:
        thread_type = await _ai_classify(subject, snippet)

    # Derive importance & actionability
    high_importance   = {"client_proposal", "payment", "interview", "partnership"}
    medium_importance = {"lead"}
    non_actionable    = {"newsletter", "notification"}

    if thread_type in high_importance:
        importance    = "high"
        is_actionable = True
    elif thread_type in medium_importance:
        importance    = "medium"
        is_actionable = True
    elif thread_type in non_actionable:
        importance    = "low"
        is_actionable = False
    else:
        importance    = "low"
        is_actionable = True  # "other" still might need a reply

    return {
        "type":         thread_type,
        "importance":   importance,
        "is_actionable": is_actionable,
    }


# ─────────────────────────────────────────────
# Priority Scoring
# ─────────────────────────────────────────────

TYPE_SCORES = {
    "payment":         50,
    "client_proposal": 40,
    "interview":       35,
    "lead":            30,
    "partnership":     25,
    "other":           10,
    "newsletter":       0,
    "notification":     0,
}

SILENCE_SCORES = {
    (1, 2):  10,
    (3, 5):  20,
    (6, 999): 30,
}


def calculate_priority(
    thread_type: str,
    days_silent: int,
    last_sender_is_user: bool = False,
) -> Dict[str, Any]:
    """
    Returns:
    {
        score: int (0-100),
        level: "high" | "medium" | "low"
    }
    """
    # Non-actionable types score 0
    if thread_type in ("newsletter", "notification"):
        return {"score": 0, "level": "low"}

    # Base score from type
    score = TYPE_SCORES.get(thread_type, 10)

    # Days-silent bonus
    for (lo, hi), bonus in SILENCE_SCORES.items():
        if lo <= days_silent <= hi:
            score += bonus
            break

    # If user sent last message, they are awaiting a reply — not eligible
    if last_sender_is_user:
        score = max(0, score - 20)

    score = min(score, 100)

    if score >= 60:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"

    return {"score": score, "level": level}
