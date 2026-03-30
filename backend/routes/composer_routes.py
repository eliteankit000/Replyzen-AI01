"""
Email Composer Routes
======================
Backend routes for the AI-powered email composer.

Features:
- Generate email from topic/goal
- Subject line suggestions
- File-based email generation (PDF/Image)
- Email quality scoring
- Template management

COMPLIANCE: All sending is user-initiated via Gmail compose URL.
No automated sending.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from services.email_intelligence_service import (
    generate_email_from_topic,
    generate_subject_suggestions,
    analyze_email_quality,
)
from services.file_processing_service import (
    extract_text_from_file,
    validate_file,
    get_available_processors,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/composer", tags=["composer"])


# ═══════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════

class GenerateEmailRequest(BaseModel):
    recipient: str
    topic: str
    email_type: str = "General"  # Outreach, Follow-up, Proposal, Support, General
    tone: str = "professional"  # professional, friendly, formal, concise
    additional_context: Optional[str] = None


class SubjectSuggestionsRequest(BaseModel):
    topic: str
    email_type: str = "General"
    tone: str = "professional"


class QualityCheckRequest(BaseModel):
    body: str


class SaveTemplateRequest(BaseModel):
    name: str
    subject: str
    body: str
    email_type: str = "general"
    tone: str = "professional"


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    email_type: Optional[str] = None
    tone: Optional[str] = None


# ═══════════════════════════════════════════════════════════════
# POST /api/composer/generate - Generate email from topic
# ═══════════════════════════════════════════════════════════════

@router.post("/generate", summary="Generate AI email from topic/goal")
async def generate_email(
    payload: GenerateEmailRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a complete email from topic/goal.
    
    Returns subject and body for user review and editing.
    Email is NOT sent - user must use Gmail compose URL.
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        result = await generate_email_from_topic(
            recipient=payload.recipient,
            topic=payload.topic,
            email_type=payload.email_type,
            tone=payload.tone,
            additional_context=payload.additional_context,
        )
        
        # Log action for audit trail
        await _log_composer_action(
            db, user_id, "email_generated",
            f"Generated {payload.email_type} email about: {payload.topic[:50]}..."
        )
        
        return {
            "success": True,
            "data": {
                "subject": result.get("subject", ""),
                "body": result.get("body", ""),
                "tone": payload.tone,
                "email_type": payload.email_type,
            },
            "message": "Email generated. Review and edit before sending via Gmail.",
        }
        
    except Exception as e:
        logger.error(f"[Composer] Email generation failed for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate email: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/composer/subjects - Generate subject line suggestions
# ═══════════════════════════════════════════════════════════════

@router.post("/subjects", summary="Generate subject line suggestions")
async def get_subject_suggestions(
    payload: SubjectSuggestionsRequest,
    current_user=Depends(get_current_user),
):
    """
    Generate 3 subject line suggestions for a given topic.
    """
    try:
        suggestions = await generate_subject_suggestions(
            topic=payload.topic,
            email_type=payload.email_type,
            tone=payload.tone,
        )
        
        return {
            "success": True,
            "data": {
                "suggestions": suggestions,
            },
        }
        
    except Exception as e:
        logger.error(f"[Composer] Subject generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate subjects: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/composer/quality - Check email quality
# ═══════════════════════════════════════════════════════════════

@router.post("/quality", summary="Analyze email quality")
async def check_quality(
    payload: QualityCheckRequest,
    current_user=Depends(get_current_user),
):
    """
    Analyze the quality of an email draft.
    Returns scores for clarity, tone, and professionalism.
    """
    try:
        result = await analyze_email_quality(payload.body)
        
        return {
            "success": True,
            "data": result,
        }
        
    except Exception as e:
        logger.error(f"[Composer] Quality check failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check quality: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# POST /api/composer/from-file - Generate email from uploaded file
# ═══════════════════════════════════════════════════════════════

@router.post("/from-file", summary="Generate email from PDF/image content")
async def generate_from_file(
    file: UploadFile = File(...),
    recipient: str = Form(""),
    email_type: str = Form("General"),
    tone: str = Form("professional"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Extract text from uploaded PDF/image and generate email.
    
    Supported formats: PDF, PNG, JPG, JPEG, GIF, BMP, TIFF, WEBP
    Max file size: 10MB
    """
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Read file content
        file_content = await file.read()
        filename = file.filename or "unknown"
        
        # Validate file
        is_valid, error_msg = validate_file(file_content, filename)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg,
            )
        
        # Extract text
        extraction_result = await extract_text_from_file(
            file_content=file_content,
            filename=filename,
            mime_type=file.content_type,
        )
        
        if not extraction_result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=extraction_result.get("error", "Failed to extract text from file"),
            )
        
        extracted_text = extraction_result.get("extracted_text", "")
        
        if not extracted_text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No text could be extracted from the file",
            )
        
        # Generate email from extracted content
        email_result = await generate_email_from_topic(
            recipient=recipient,
            topic=extracted_text[:2000],  # Limit context
            email_type=email_type,
            tone=tone,
            additional_context=f"This email is based on content from an uploaded {extraction_result.get('file_type', 'file')}.",
        )
        
        # Log action
        await _log_composer_action(
            db, user_id, "email_from_file",
            f"Generated email from {filename} ({extraction_result.get('file_type')})"
        )
        
        return {
            "success": True,
            "data": {
                "subject": email_result.get("subject", ""),
                "body": email_result.get("body", ""),
                "tone": tone,
                "email_type": email_type,
                "extracted_text_preview": extracted_text[:500],
                "file_type": extraction_result.get("file_type"),
            },
            "message": "Email generated from file. Review and edit before sending.",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Composer] File processing failed for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process file: {str(e)}",
        )


# ═══════════════════════════════════════════════════════════════
# GET /api/composer/processors - Check available file processors
# ═══════════════════════════════════════════════════════════════

@router.get("/processors", summary="Check available file processors")
async def check_processors(current_user=Depends(get_current_user)):
    """
    Check which file processing capabilities are available.
    """
    processors = get_available_processors()
    
    return {
        "success": True,
        "data": processors,
    }


# ═══════════════════════════════════════════════════════════════
# Template Management
# ═══════════════════════════════════════════════════════════════

@router.get("/templates", summary="Get user's email templates")
async def list_templates(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all saved email templates for the user."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        result = await db.execute(
            text("""
                SELECT id, name, subject, body, email_type, tone, created_at, updated_at
                FROM email_templates
                WHERE user_id = :user_id
                ORDER BY updated_at DESC
            """),
            {"user_id": user_id}
        )
        
        templates = []
        for row in result.fetchall():
            template = dict(row._mapping)
            # Format timestamps
            for field in ["created_at", "updated_at"]:
                if template.get(field) and hasattr(template[field], "isoformat"):
                    template[field] = template[field].isoformat()
            templates.append(template)
        
        return {
            "success": True,
            "data": {
                "templates": templates,
                "count": len(templates),
            },
        }
        
    except Exception as e:
        logger.error(f"[Composer] Failed to list templates for {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load templates",
        )


@router.post("/templates", summary="Save email as template")
async def save_template(
    payload: SaveTemplateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save an email as a reusable template."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        template_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        await db.execute(
            text("""
                INSERT INTO email_templates
                (id, user_id, name, subject, body, email_type, tone, created_at, updated_at)
                VALUES
                (:id, :user_id, :name, :subject, :body, :email_type, :tone, :created_at, :updated_at)
            """),
            {
                "id": template_id,
                "user_id": user_id,
                "name": payload.name,
                "subject": payload.subject,
                "body": payload.body,
                "email_type": payload.email_type,
                "tone": payload.tone,
                "created_at": now,
                "updated_at": now,
            }
        )
        await db.commit()
        
        return {
            "success": True,
            "data": {
                "id": template_id,
                "name": payload.name,
            },
            "message": "Template saved successfully",
        }
        
    except Exception as e:
        logger.error(f"[Composer] Failed to save template for {user_id}: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save template",
        )


@router.get("/templates/{template_id}", summary="Get a specific template")
async def get_template(
    template_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific template by ID."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        result = await db.execute(
            text("""
                SELECT id, name, subject, body, email_type, tone, created_at, updated_at
                FROM email_templates
                WHERE id = :id AND user_id = :user_id
            """),
            {"id": template_id, "user_id": user_id}
        )
        
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        
        template = dict(row._mapping)
        for field in ["created_at", "updated_at"]:
            if template.get(field) and hasattr(template[field], "isoformat"):
                template[field] = template[field].isoformat()
        
        return {
            "success": True,
            "data": template,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Composer] Failed to get template: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load template",
        )


@router.put("/templates/{template_id}", summary="Update a template")
async def update_template(
    template_id: str,
    payload: UpdateTemplateRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing template."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        # Check template exists
        result = await db.execute(
            text("SELECT id FROM email_templates WHERE id = :id AND user_id = :user_id"),
            {"id": template_id, "user_id": user_id}
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Build update query
        updates = []
        params = {"id": template_id, "user_id": user_id, "updated_at": datetime.now(timezone.utc)}
        
        if payload.name is not None:
            updates.append("name = :name")
            params["name"] = payload.name
        if payload.subject is not None:
            updates.append("subject = :subject")
            params["subject"] = payload.subject
        if payload.body is not None:
            updates.append("body = :body")
            params["body"] = payload.body
        if payload.email_type is not None:
            updates.append("email_type = :email_type")
            params["email_type"] = payload.email_type
        if payload.tone is not None:
            updates.append("tone = :tone")
            params["tone"] = payload.tone
        
        updates.append("updated_at = :updated_at")
        
        await db.execute(
            text(f"""
                UPDATE email_templates
                SET {', '.join(updates)}
                WHERE id = :id AND user_id = :user_id
            """),
            params
        )
        await db.commit()
        
        return {
            "success": True,
            "message": "Template updated successfully",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Composer] Failed to update template: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update template",
        )


@router.delete("/templates/{template_id}", summary="Delete a template")
async def delete_template(
    template_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a template."""
    user_id = current_user.get("user_id", "") if isinstance(current_user, dict) else getattr(current_user, "id", "")
    
    try:
        result = await db.execute(
            text("DELETE FROM email_templates WHERE id = :id AND user_id = :user_id RETURNING id"),
            {"id": template_id, "user_id": user_id}
        )
        
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Template not found")
        
        await db.commit()
        
        return {
            "success": True,
            "message": "Template deleted successfully",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Composer] Failed to delete template: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete template",
        )


# ═══════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════

async def _log_composer_action(
    db: AsyncSession,
    user_id: str,
    action: str,
    details: str = None,
):
    """Log composer actions for audit trail."""
    try:
        await db.execute(
            text("""
                INSERT INTO permission_logs
                (id, user_id, action, resource, platform, details, created_at)
                VALUES (:id, :user_id, :action, 'composer', 'email', :details, :created_at)
            """),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "action": action,
                "details": details,
                "created_at": datetime.now(timezone.utc),
            }
        )
        await db.commit()
    except Exception as e:
        logger.warning(f"[Composer] Failed to log action: {e}")
        await db.rollback()
