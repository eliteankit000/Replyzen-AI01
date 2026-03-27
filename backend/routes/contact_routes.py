"""
Contact Routes - Contact form submission handling
==================================================
Handles contact form submissions and sends emails via Brevo.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from services.email_service import send_contact_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contact", tags=["contact"])


# ═══════════════════════════════════════════════════════════════
# Request Models
# ═══════════════════════════════════════════════════════════════

class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Contact name")
    email: EmailStr = Field(..., description="Contact email address")
    message: str = Field(..., min_length=10, max_length=5000, description="Message content")


# ═══════════════════════════════════════════════════════════════
# POST /api/contact/send - Send contact form submission
# ═══════════════════════════════════════════════════════════════

@router.post("/send", summary="Send contact form submission")
async def send_contact_message(data: ContactRequest):
    """
    Send a contact form submission email to hello@replyzenai.com.
    
    Request body:
    - name: Contact's name (1-100 characters)
    - email: Contact's email address (valid email format)
    - message: Message content (10-5000 characters)
    
    Returns:
    - success: True if email sent successfully
    - message: Success message
    """
    try:
        # Validate input (Pydantic already does basic validation)
        if not data.name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name cannot be empty"
            )
        
        if not data.message.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message cannot be empty"
            )
        
        # Send email via Brevo
        success = send_contact_email(
            name=data.name.strip(),
            email=data.email,
            message=data.message.strip()
        )
        
        if not success:
            logger.error(f"Failed to send contact email from {data.email}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send email. Please try again later or email us directly at hello@replyzenai.com"
            )
        
        logger.info(f"Contact form submitted successfully by {data.name} ({data.email})")
        
        return {
            "success": True,
            "message": "Message sent successfully! We'll get back to you within 24 hours."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Contact form error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your request. Please try again later."
        )


# ═══════════════════════════════════════════════════════════════
# GET /api/contact/info - Get contact information
# ═══════════════════════════════════════════════════════════════

@router.get("/info", summary="Get contact information")
async def get_contact_info():
    """
    Get Replyzen AI contact information.
    
    Returns contact details for display purposes.
    """
    return {
        "email": "hello@replyzenai.com",
        "support_email": "hello@replyzenai.com",
        "response_time": "Within 24 hours",
        "availability": "Monday - Friday, 9 AM - 6 PM EST"
    }
