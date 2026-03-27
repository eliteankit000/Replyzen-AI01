import os
from openai import AsyncOpenAI
import logging
from typing import Optional

logger = logging.getLogger(__name__)

api_key = os.environ.get("OPENAI_API_KEY", "")
client = AsyncOpenAI(api_key=api_key) if api_key else None


async def generate_followup_draft(
    subject: str,
    snippet: str,
    days_silent: int,
    tone: str = "professional",
    conversation_type: Optional[str] = None,
    last_messages: Optional[list] = None,
) -> str:
    if not client:
        raise Exception("OpenAI API key not configured")

    # Build context from conversation type
    type_context = ""
    if conversation_type and conversation_type not in ("other", "notification", "newsletter"):
        type_map = {
            "client_proposal": "This is a client proposal or quote thread.",
            "payment":         "This is a payment or invoice thread.",
            "interview":       "This is a job interview or HR thread.",
            "lead":            "This is a sales lead or inquiry thread.",
            "partnership":     "This is a partnership or collaboration thread.",
        }
        type_context = type_map.get(conversation_type, "")

    # Build last messages context
    messages_context = ""
    if last_messages:
        recent = last_messages[-3:]  # last 3 messages max
        messages_context = "\n".join(
            [f"- {m.get('from','')}: {m.get('snippet','')}" for m in recent]
        )
        messages_context = f"\nRecent messages:\n{messages_context}"

    system_prompt = """You are an expert email follow-up writer. Generate a brief, natural, human-like follow-up email body.

Rules:
- 3 to 5 lines maximum
- Non-generic — reference actual context
- Polite but direct
- Match the requested tone exactly
- Goal: get a reply
- Do NOT include subject line or sign-off name
- Start with a greeting like 'Hi' or 'Hello'
- End with a professional closing"""

    user_prompt = f"""Generate a follow-up email:

Subject: {subject}
Last message snippet: {snippet}
Days since last reply: {days_silent}
Tone: {tone}
{type_context}
{messages_context}

Write only the email body. Be specific, human, and concise."""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        max_tokens=200,
        temperature=0.7,
    )

    return response.choices[0].message.content.strip()


async def classify_thread_with_ai(subject: str, snippet: str) -> str:
    """Standalone AI classification used as fallback in classification_service."""
    if not client:
        return "other"
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Classify the email thread with ONE label only:\n"
                        "client_proposal, lead, payment, interview, partnership, "
                        "newsletter, notification, other"
                    ),
                },
                {"role": "user", "content": f"Subject: {subject}\nSnippet: {snippet}"},
            ],
            max_tokens=10,
            temperature=0,
        )
        return response.choices[0].message.content.strip().lower()
    except Exception as e:
        logger.warning(f"AI classification failed: {e}")
        return "other"


async def generate_ai_reply(
    message: str,
    tone: str = "professional",
    context: str = "",
) -> str:
    """
    Generate AI reply for inbox messages.
    Used by inbox_service for generating reply suggestions.
    """
    if not client:
        raise Exception("OpenAI API key not configured")

    tone_map = {
        "professional": "professional and polite",
        "friendly": "friendly and warm",
        "casual": "casual and conversational",
        "formal": "formal and business-like",
    }
    tone_desc = tone_map.get(tone, "professional")

    system_prompt = f"""You are an expert email reply writer. Generate a brief, helpful, and {tone_desc} reply.

Rules:
- 3 to 5 lines maximum
- Address the message directly
- Be helpful and clear
- Match the {tone_desc} tone exactly
- Do NOT include subject line
- Start with a greeting (Hi/Hello)
- End with a professional closing"""

    user_prompt = f"""Generate a reply to this message:

Message: {message}
Tone: {tone}
{context}

Write only the email body. Be specific, helpful, and concise."""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        max_tokens=200,
        temperature=0.7,
    )

    return response.choices[0].message.content.strip()
