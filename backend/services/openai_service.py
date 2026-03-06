import os
from openai import AsyncOpenAI
import logging

logger = logging.getLogger(__name__)

api_key = os.environ.get("OPENAI_API_KEY", "")
client = AsyncOpenAI(api_key=api_key) if api_key else None


async def generate_followup_draft(subject: str, snippet: str, days_silent: int, tone: str = "professional") -> str:
    if not client:
        raise Exception("OpenAI API key not configured")

    system_prompt = """You are an expert email follow-up writer for professionals. Generate a brief, natural follow-up email body.

Rules:
- Keep it under 100 words
- Be polite and context-aware
- Match the requested tone exactly
- Don't be pushy or aggressive
- Reference the original conversation naturally
- Don't include subject line, greeting prefix like 'Subject:', or sign-off name
- Start with a greeting like 'Hi' or 'Hello'
- End with a professional closing like 'Best regards' or 'Looking forward to hearing from you'"""

    user_prompt = f"""Generate a follow-up email with these details:

Subject of original thread: {subject}
Last message snippet: {snippet}
Days since last reply: {days_silent}
Desired tone: {tone}

Write only the email body."""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=200,
        temperature=0.7
    )

    return response.choices[0].message.content.strip()
