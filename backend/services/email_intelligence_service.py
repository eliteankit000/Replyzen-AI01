"""
Email Intelligence Service
===========================
AI-powered email analysis for priority scoring, categorization, and insights.

This service analyzes emails and provides:
- Summary (brief description)
- Category (Client | Lead | Payment | Support | Partnership | Marketing | Personal | Spam)
- Opportunity Type (Client | Partnership | Risk | None)
- Priority Score (1-100)
- Urgency Score (1-10)
- Priority Label (HOT | WARM | LOW)
- Needs Follow-up (boolean)
- Follow-up Suggested (text)

COMPLIANCE: This is READ-ONLY analysis - no emails are sent.
"""

import os
import json
import logging
from typing import Dict, Optional, List
from datetime import datetime, timezone

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Initialize OpenAI client
api_key = os.environ.get("OPENAI_API_KEY", "")
client = AsyncOpenAI(api_key=api_key) if api_key else None

# Category definitions
CATEGORIES = [
    "Client",
    "Lead", 
    "Payment",
    "Support",
    "Partnership",
    "Marketing",
    "Personal",
    "Spam"
]

# Opportunity types
OPPORTUNITY_TYPES = ["Client", "Partnership", "Risk", "None"]

# Priority labels
PRIORITY_LABELS = ["HOT", "WARM", "LOW"]


async def analyze_email(
    subject: str,
    snippet: str,
    sender: str,
    full_body: Optional[str] = None,
    thread_messages: Optional[List[Dict]] = None,
) -> Dict:
    """
    Analyze a single email and return intelligence data.
    
    Args:
        subject: Email subject line
        snippet: Brief snippet of email content
        sender: Sender email/name
        full_body: Optional full email body
        thread_messages: Optional list of messages in thread
        
    Returns:
        Dict with all intelligence fields
    """
    if not client:
        logger.warning("[EmailIntel] OpenAI not configured, using fallback analysis")
        return _fallback_analysis(subject, snippet, sender)
    
    try:
        # Build context
        content = full_body or snippet
        thread_context = ""
        if thread_messages:
            recent = thread_messages[-3:]
            thread_context = "\n".join([
                f"- {m.get('from', 'Unknown')}: {m.get('snippet', '')[:100]}"
                for m in recent
            ])
        
        system_prompt = """You are an AI email intelligence analyst. Analyze the email and provide structured intelligence data.

Return a JSON object with EXACTLY these fields:
{
    "summary": "Brief 1-2 sentence summary of the email",
    "category": "One of: Client, Lead, Payment, Support, Partnership, Marketing, Personal, Spam",
    "opportunity_type": "One of: Client, Partnership, Risk, None",
    "priority_score": 1-100 integer (100 = highest priority),
    "urgency_score": 1-10 integer (10 = most urgent),
    "priority_label": "HOT (>80), WARM (50-80), or LOW (<50)",
    "needs_followup": true/false,
    "followup_suggested": "Suggested follow-up action or empty string"
}

Priority scoring guidelines:
- 80-100 (HOT): Urgent client requests, payment issues, time-sensitive opportunities
- 50-79 (WARM): Important leads, partnership inquiries, support requests
- 1-49 (LOW): Marketing emails, newsletters, general inquiries

Category guidelines:
- Client: Existing customer communications
- Lead: Potential new business inquiries
- Payment: Invoices, receipts, payment requests
- Support: Help requests, bug reports, questions
- Partnership: Collaboration proposals, business partnerships
- Marketing: Promotions, newsletters, announcements
- Personal: Non-business related
- Spam: Unwanted/suspicious emails

Return ONLY valid JSON, no markdown or explanation."""

        user_prompt = f"""Analyze this email:

Subject: {subject}
From: {sender}
Content: {content[:1000]}
{f'Thread context:{thread_context}' if thread_context else ''}

Return the JSON analysis."""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=500,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Validate and normalize result
        return _validate_result(result)
        
    except Exception as e:
        logger.error(f"[EmailIntel] Analysis failed: {e}", exc_info=True)
        return _fallback_analysis(subject, snippet, sender)


async def analyze_emails_batch(emails: List[Dict]) -> List[Dict]:
    """
    Analyze multiple emails in batch for efficiency.
    
    Args:
        emails: List of dicts with subject, snippet, sender fields
        
    Returns:
        List of intelligence results
    """
    results = []
    for email in emails:
        result = await analyze_email(
            subject=email.get("subject", ""),
            snippet=email.get("snippet", ""),
            sender=email.get("sender", email.get("last_message_from", "")),
            full_body=email.get("body"),
        )
        results.append(result)
    return results


async def generate_reply_suggestions(
    subject: str,
    snippet: str,
    sender: str,
    context: Optional[str] = None,
) -> Dict:
    """
    Generate 3 reply suggestions with different tones.
    
    Returns:
        Dict with professional, friendly, and concise replies
    """
    if not client:
        return _fallback_replies(subject, snippet)
    
    try:
        system_prompt = """You are an expert email reply writer. Generate 3 different reply options for the given email.

Return a JSON object with EXACTLY this structure:
{
    "professional": "A formal, business-appropriate reply (3-5 sentences)",
    "friendly": "A warm, personable reply maintaining professionalism (3-5 sentences)",
    "concise": "A brief, to-the-point reply (1-2 sentences)"
}

Guidelines:
- Address the sender's question/request directly
- Be helpful and actionable
- Do NOT include subject lines
- Start with appropriate greeting (Hi/Hello)
- End with professional closing
- Keep replies natural and human-like

Return ONLY valid JSON, no markdown."""

        user_prompt = f"""Generate 3 reply options for this email:

Subject: {subject}
From: {sender}
Content: {snippet}
{f'Additional context: {context}' if context else ''}

Return the JSON with all 3 reply options."""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=800,
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        
        result = json.loads(response.choices[0].message.content)
        
        return {
            "professional": result.get("professional", ""),
            "friendly": result.get("friendly", ""),
            "concise": result.get("concise", ""),
        }
        
    except Exception as e:
        logger.error(f"[EmailIntel] Reply generation failed: {e}", exc_info=True)
        return _fallback_replies(subject, snippet)


async def generate_subject_suggestions(
    topic: str,
    email_type: str,
    tone: str = "professional",
) -> List[str]:
    """
    Generate 3 subject line suggestions for composing new emails.
    
    Args:
        topic: What the email is about
        email_type: Type of email (Outreach, Follow-up, Proposal, Support, General)
        tone: Desired tone (professional, friendly, formal, concise)
        
    Returns:
        List of 3 subject line suggestions
    """
    if not client:
        return [f"Re: {topic}", f"Following up: {topic}", f"Quick question about {topic}"]
    
    try:
        system_prompt = """You are an expert email subject line writer. Generate 3 compelling subject line options.

Return a JSON array with exactly 3 subject lines:
["Subject 1", "Subject 2", "Subject 3"]

Guidelines:
- Keep subject lines under 60 characters
- Be clear and specific
- Avoid spam triggers (FREE, URGENT, etc.)
- Match the requested tone
- Make each option distinct

Return ONLY a JSON array, no explanation."""

        user_prompt = f"""Generate 3 subject lines for:

Topic: {topic}
Email Type: {email_type}
Tone: {tone}

Return the JSON array."""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=200,
            temperature=0.8,
        )
        
        content = response.choices[0].message.content.strip()
        # Handle potential markdown wrapping
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        
        result = json.loads(content)
        return result[:3] if isinstance(result, list) else [topic]
        
    except Exception as e:
        logger.error(f"[EmailIntel] Subject generation failed: {e}", exc_info=True)
        return [f"Re: {topic}", f"Following up: {topic}", f"Quick question about {topic}"]


async def generate_email_from_topic(
    recipient: str,
    topic: str,
    email_type: str,
    tone: str = "professional",
    additional_context: Optional[str] = None,
) -> Dict:
    """
    Generate a complete email from topic/goal.
    
    Args:
        recipient: Recipient email or name
        topic: What the email is about
        email_type: Type (Outreach, Follow-up, Proposal, Support, General)
        tone: Desired tone
        additional_context: Optional extra context
        
    Returns:
        Dict with subject and body
    """
    if not client:
        return {
            "subject": f"Re: {topic}",
            "body": f"Hello,\n\nI wanted to reach out regarding {topic}.\n\nBest regards"
        }
    
    try:
        tone_desc = {
            "professional": "professional and polite",
            "friendly": "friendly and warm",
            "formal": "formal and business-like",
            "concise": "brief and to-the-point"
        }.get(tone, "professional")
        
        system_prompt = f"""You are an expert email writer. Generate a complete email based on the user's requirements.

Return a JSON object with:
{{
    "subject": "A clear, compelling subject line under 60 chars",
    "body": "The complete email body"
}}

Guidelines:
- Write in a {tone_desc} tone
- Be clear and actionable
- Include appropriate greeting and closing
- Keep it concise (3-5 paragraphs max)
- Address the recipient's needs
- Match the email type appropriately

Return ONLY valid JSON, no markdown."""

        user_prompt = f"""Write an email:

To: {recipient}
Topic/Goal: {topic}
Email Type: {email_type}
Tone: {tone}
{f'Additional Context: {additional_context}' if additional_context else ''}

Return the JSON with subject and body."""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=800,
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        
        return json.loads(response.choices[0].message.content)
        
    except Exception as e:
        logger.error(f"[EmailIntel] Email generation failed: {e}", exc_info=True)
        return {
            "subject": f"Re: {topic}",
            "body": f"Hello,\n\nI wanted to reach out regarding {topic}.\n\nBest regards"
        }


async def analyze_email_quality(body: str) -> Dict:
    """
    Analyze the quality of an email draft.
    
    Returns:
        Dict with clarity, tone, and professionalism scores (1-10)
    """
    if not client:
        return {"clarity": 7, "tone": 7, "professionalism": 7, "overall": 7, "suggestions": []}
    
    try:
        system_prompt = """Analyze the email quality and return scores.

Return a JSON object:
{
    "clarity": 1-10 score for clarity,
    "tone": 1-10 score for appropriate tone,
    "professionalism": 1-10 score for professionalism,
    "overall": 1-10 overall score,
    "suggestions": ["Improvement suggestion 1", "Suggestion 2"]
}

Return ONLY valid JSON."""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Analyze this email:\n\n{body}"},
            ],
            max_tokens=300,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        
        return json.loads(response.choices[0].message.content)
        
    except Exception as e:
        logger.error(f"[EmailIntel] Quality analysis failed: {e}")
        return {"clarity": 7, "tone": 7, "professionalism": 7, "overall": 7, "suggestions": []}


def _validate_result(result: Dict) -> Dict:
    """Validate and normalize analysis result."""
    # Ensure priority_score is in range
    priority_score = max(1, min(100, int(result.get("priority_score", 50))))
    
    # Ensure urgency_score is in range
    urgency_score = max(1, min(10, int(result.get("urgency_score", 5))))
    
    # Determine priority label based on score
    if priority_score > 80:
        priority_label = "HOT"
    elif priority_score >= 50:
        priority_label = "WARM"
    else:
        priority_label = "LOW"
    
    # Validate category
    category = result.get("category", "Personal")
    if category not in CATEGORIES:
        category = "Personal"
    
    # Validate opportunity type
    opportunity_type = result.get("opportunity_type", "None")
    if opportunity_type not in OPPORTUNITY_TYPES:
        opportunity_type = "None"
    
    return {
        "summary": result.get("summary", "")[:500],
        "category": category,
        "opportunity_type": opportunity_type,
        "priority_score": priority_score,
        "urgency_score": urgency_score,
        "priority_label": priority_label,
        "needs_followup": bool(result.get("needs_followup", False)),
        "followup_suggested": result.get("followup_suggested", "")[:500],
    }


def _fallback_analysis(subject: str, snippet: str, sender: str) -> Dict:
    """Provide fallback analysis when AI is unavailable."""
    subject_lower = subject.lower()
    snippet_lower = snippet.lower()
    
    # Simple keyword-based categorization
    category = "Personal"
    priority_score = 30
    
    # Payment keywords
    if any(w in subject_lower or w in snippet_lower for w in ["invoice", "payment", "receipt", "billing"]):
        category = "Payment"
        priority_score = 70
    # Support keywords
    elif any(w in subject_lower or w in snippet_lower for w in ["help", "support", "issue", "problem", "bug"]):
        category = "Support"
        priority_score = 65
    # Lead keywords
    elif any(w in subject_lower or w in snippet_lower for w in ["interested", "inquiry", "quote", "pricing"]):
        category = "Lead"
        priority_score = 75
    # Partnership keywords
    elif any(w in subject_lower or w in snippet_lower for w in ["partnership", "collaboration", "proposal"]):
        category = "Partnership"
        priority_score = 60
    # Marketing keywords
    elif any(w in subject_lower or w in snippet_lower for w in ["newsletter", "unsubscribe", "promotion", "sale"]):
        category = "Marketing"
        priority_score = 20
    # Spam indicators
    elif any(w in subject_lower for w in ["free", "winner", "congratulations", "urgent!!!"]):
        category = "Spam"
        priority_score = 5
    
    # Determine priority label
    if priority_score > 80:
        priority_label = "HOT"
    elif priority_score >= 50:
        priority_label = "WARM"
    else:
        priority_label = "LOW"
    
    return {
        "summary": snippet[:200] if snippet else subject,
        "category": category,
        "opportunity_type": "Client" if category in ["Lead", "Client"] else "None",
        "priority_score": priority_score,
        "urgency_score": priority_score // 10,
        "priority_label": priority_label,
        "needs_followup": category in ["Lead", "Support", "Client"],
        "followup_suggested": "",
    }


def _fallback_replies(subject: str, snippet: str) -> Dict:
    """Provide fallback replies when AI is unavailable."""
    return {
        "professional": f"Hello,\n\nThank you for your email regarding '{subject}'. I've reviewed your message and will get back to you shortly with a detailed response.\n\nBest regards",
        "friendly": f"Hi there!\n\nThanks for reaching out about '{subject}'! I appreciate you taking the time to write. Let me look into this and I'll get back to you soon.\n\nCheers",
        "concise": "Hi,\n\nThanks for your email. I'll review and respond shortly.\n\nBest",
    }
