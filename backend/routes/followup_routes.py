from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from services.openai_service import generate_followup_draft
from services.thread_filter_service import should_show_reply
from plan_permissions import check_followup_limit, check_tone_allowed
import uuid
from datetime import datetime, timezone
from typing import Optional
import logging
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/followups", tags=["followups"])

# Thread processing locks to prevent duplicate generation
_processing_locks = {}


class GenerateRequest(BaseModel):
    thread_id: str
    tone: str = "professional"
    force_regenerate: bool = False  # Allow manual regeneration


class UpdateDraftRequest(BaseModel):
    draft: str


async def get_user_email_address(user_id: str, db: AsyncSession) -> str:
    """Get the user's primary email address."""
    result = await db.execute(
        text("SELECT email FROM users WHERE id = :uid"),
        {"uid": user_id}
    )
    row = result.fetchone()
    return row[0] if row else ""


async def get_user_settings(user_id: str, db: AsyncSession) -> dict:
    """Get user settings for thread filtering."""
    result = await db.execute(
        text("SELECT ignore_newsletters, ignore_notifications FROM user_settings WHERE user_id = :uid"),
        {"uid": user_id}
    )
    row = result.fetchone()
    if row:
        return dict(row._mapping)
    return {"ignore_newsletters": True, "ignore_notifications": True}


@router.post("/generate")
async def generate_followup(
    req: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]
    thread_id = req.thread_id

    # Check for processing lock to prevent duplicate generation
    lock_key = f"{user_id}:{thread_id}"
    if lock_key in _processing_locks:
        raise HTTPException(
            status_code=429,
            detail="Reply generation already in progress for this thread."
        )
    
    try:
        _processing_locks[lock_key] = True

        # Check followup limit
        limit_check = await check_followup_limit(user_id, db)
        if not limit_check["allowed"]:
            raise HTTPException(
                status_code=403,
                detail=f"You have reached your monthly follow-up limit ({limit_check['limit']})."
            )

        plan = limit_check["plan"]
        if not check_tone_allowed(plan, req.tone):
            raise HTTPException(
                status_code=403,
                detail=f"Tone '{req.tone}' not available on your plan."
            )

        # Get thread details
        result = await db.execute(
            text("""
            SELECT * FROM email_threads 
            WHERE id=:id AND user_id=:uid
            """),
            {"id": thread_id, "uid": user_id},
        )
        thread = result.fetchone()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        thread = dict(thread._mapping)

        # Check if reply should be generated (unless force regenerate)
        if not req.force_regenerate:
            user_email = await get_user_email_address(user_id, db)
            user_settings = await get_user_settings(user_id, db)
            reply_info = should_show_reply(thread, user_email, user_settings)
            
            if not reply_info["show_reply"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot generate reply: {reply_info['reason']}"
                )

        # Check for existing pending followup (unless force regenerate)
        if not req.force_regenerate:
            result = await db.execute(
                text("""
                SELECT * FROM followup_suggestions
                WHERE thread_id=:tid AND user_id=:uid AND status='pending'
                """),
                {"tid": thread_id, "uid": user_id},
            )
            existing = result.fetchone()
            if existing:
                # Return existing followup instead of creating duplicate
                existing_dict = dict(existing._mapping)
                return {
                    "id": existing_dict["id"],
                    "thread_id": thread_id,
                    "ai_draft": existing_dict.get("generated_text", ""),
                    "tone": existing_dict.get("tone", "professional"),
                    "status": "pending",
                    "message": "Existing draft returned (already generated)"
                }

        # If force regenerate, delete existing pending followup
        if req.force_regenerate:
            await db.execute(
                text("""
                DELETE FROM followup_suggestions
                WHERE thread_id=:tid AND user_id=:uid AND status='pending'
                """),
                {"tid": thread_id, "uid": user_id}
            )

        # Generate AI draft
        try:
            draft = await generate_followup_draft(
                subject=thread.get("subject", ""),
                snippet=thread.get("snippet", ""),
                days_silent=thread.get("days_silent", 1),
                tone=req.tone,
            )
        except Exception as e:
            logger.error(f"AI generation failed: {e}")
            draft = f"Hi,\n\nFollowing up regarding \"{thread.get('subject','our discussion')}\".\n\nBest regards"

        followup_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        # Insert new followup
        await db.execute(
            text("""
            INSERT INTO followup_suggestions
            (id, thread_id, user_id, generated_text, tone, priority, status, generated_at)
            VALUES
            (:id, :thread_id, :user_id, :draft, :tone, :priority, 'pending', :generated_at)
            """),
            {
                "id": followup_id,
                "thread_id": thread_id,
                "user_id": user_id,
                "draft": draft,
                "tone": req.tone,
                "priority": "normal",
                "generated_at": now,
            },
        )

        # Mark thread as reply_generated
        await db.execute(
            text("""
            UPDATE email_threads
            SET reply_generated = true, updated_at = :updated
            WHERE id = :tid AND user_id = :uid
            """),
            {"tid": thread_id, "uid": user_id, "updated": now}
        )

        # Track usage
        today = now.date()
        await db.execute(
            text("""
            INSERT INTO usage_tracking (user_id, date, followups_generated, followups_sent, emails_scanned)
            VALUES (:uid, :date, 1, 0, 0)
            ON CONFLICT (user_id, date)
            DO UPDATE SET followups_generated = usage_tracking.followups_generated + 1
            """),
            {"uid": user_id, "date": today},
        )

        await db.commit()

        return {
            "id": followup_id,
            "thread_id": thread_id,
            "ai_draft": draft,
            "tone": req.tone,
            "status": "pending",
        }
    
    finally:
        # Release lock
        if lock_key in _processing_locks:
            del _processing_locks[lock_key]


@router.get("")
async def list_followups(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = """
        SELECT 
            fs.*,
            et.subject as original_subject,
            et.last_message_from as recipient,
            et.snippet
        FROM followup_suggestions fs
        LEFT JOIN email_threads et ON et.id = fs.thread_id
        WHERE fs.user_id=:uid
    """
    params = {"uid": current_user["user_id"], "limit": limit, "offset": offset}

    if status:
        query += " AND fs.status=:status"
        params["status"] = status

    query += " ORDER BY fs.generated_at DESC LIMIT :limit OFFSET :offset"

    result = await db.execute(text(query), params)
    followups = [dict(r._mapping) for r in result]

    # Map generated_text to ai_draft for frontend compatibility
    for f in followups:
        f["ai_draft"] = f.get("generated_text", "")
        f["recipient_name"] = f.get("recipient", "")

    count_result = await db.execute(
        text("SELECT COUNT(*) FROM followup_suggestions WHERE user_id=:uid"),
        {"uid": current_user["user_id"]},
    )
    total = count_result.scalar()

    return {"followups": followups, "total": total}


@router.put("/{followup_id}")
async def update_followup(
    followup_id: str,
    req: UpdateDraftRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
        UPDATE followup_suggestions
        SET generated_text=:draft, updated_at=:updated
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {
            "draft": req.draft,
            "id": followup_id,
            "uid": current_user["user_id"],
            "updated": datetime.now(timezone.utc),
        },
    )
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    return {"message": "Draft updated"}


@router.post("/{followup_id}/send")
async def send_followup(
    followup_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    # Get followup details first
    result = await db.execute(
        text("""
        SELECT thread_id FROM followup_suggestions
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {"id": followup_id, "uid": current_user["user_id"]}
    )
    followup = result.fetchone()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    
    thread_id = followup[0]

    # Update followup status
    result = await db.execute(
        text("""
        UPDATE followup_suggestions
        SET status='sent', sent_at=:sent
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {"id": followup_id, "uid": current_user["user_id"], "sent": now},
    )
    
    # Mark thread as user replied
    await db.execute(
        text("""
        UPDATE email_threads
        SET replied_by_user = true, last_sender_is_user = true, updated_at = :updated
        WHERE id = :tid AND user_id = :uid
        """),
        {"tid": thread_id, "uid": current_user["user_id"], "updated": now}
    )

    # Update usage tracking
    today = now.date()
    await db.execute(
        text("""
        INSERT INTO usage_tracking (user_id, date, followups_generated, followups_sent, emails_scanned)
        VALUES (:uid, :date, 0, 1, 0)
        ON CONFLICT (user_id, date)
        DO UPDATE SET followups_sent = usage_tracking.followups_sent + 1
        """),
        {"uid": current_user["user_id"], "date": today},
    )

    await db.commit()

    return {"message": "Follow-up sent"}


@router.post("/{followup_id}/dismiss")
async def dismiss_followup(
    followup_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get thread_id before dismissing
    result = await db.execute(
        text("""
        SELECT thread_id FROM followup_suggestions
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {"id": followup_id, "uid": current_user["user_id"]}
    )
    followup = result.fetchone()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    
    thread_id = followup[0]
    now = datetime.now(timezone.utc)

    # Update followup status
    result = await db.execute(
        text("""
        UPDATE followup_suggestions
        SET status='dismissed'
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {"id": followup_id, "uid": current_user["user_id"]},
    )

    # Reset reply_generated on thread so user can regenerate if needed
    await db.execute(
        text("""
        UPDATE email_threads
        SET reply_generated = false, updated_at = :updated
        WHERE id = :tid AND user_id = :uid
        """),
        {"tid": thread_id, "uid": current_user["user_id"], "updated": now}
    )

    await db.commit()

    return {"message": "Follow-up dismissed"}


@router.post("/{followup_id}/regenerate")
async def regenerate_followup(
    followup_id: str,
    tone: str = "professional",
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate an existing followup with a new draft."""
    user_id = current_user["user_id"]

    # Get the existing followup
    result = await db.execute(
        text("""
        SELECT fs.*, et.subject, et.snippet
        FROM followup_suggestions fs
        JOIN email_threads et ON et.id = fs.thread_id
        WHERE fs.id=:id AND fs.user_id=:uid
        """),
        {"id": followup_id, "uid": user_id}
    )
    followup = result.fetchone()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    
    followup_dict = dict(followup._mapping)
    
    if followup_dict["status"] != "pending":
        raise HTTPException(status_code=400, detail="Can only regenerate pending follow-ups")

    # Check limit and tone
    limit_check = await check_followup_limit(user_id, db)
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=f"You have reached your monthly follow-up limit ({limit_check['limit']})."
        )

    plan = limit_check["plan"]
    if not check_tone_allowed(plan, tone):
        raise HTTPException(
            status_code=403,
            detail=f"Tone '{tone}' not available on your plan."
        )

    # Generate new draft
    try:
        draft = await generate_followup_draft(
            subject=followup_dict.get("subject", ""),
            snippet=followup_dict.get("snippet", ""),
            days_silent=1,
            tone=tone,
        )
    except Exception as e:
        logger.error(f"AI regeneration failed: {e}")
        draft = f"Hi,\n\nFollowing up regarding \"{followup_dict.get('subject','our discussion')}\".\n\nBest regards"

    now = datetime.now(timezone.utc)

    # Update the followup
    await db.execute(
        text("""
        UPDATE followup_suggestions
        SET generated_text=:draft, tone=:tone, generated_at=:generated, updated_at=:updated
        WHERE id=:id AND user_id=:uid
        """),
        {
            "draft": draft,
            "tone": tone,
            "generated": now,
            "updated": now,
            "id": followup_id,
            "uid": user_id,
        }
    )

    # Update usage
    today = now.date()
    await db.execute(
        text("""
        INSERT INTO usage_tracking (user_id, date, followups_generated, followups_sent, emails_scanned)
        VALUES (:uid, :date, 1, 0, 0)
        ON CONFLICT (user_id, date)
        DO UPDATE SET followups_generated = usage_tracking.followups_generated + 1
        """),
        {"uid": user_id, "date": today},
    )

    await db.commit()

    return {
        "id": followup_id,
        "ai_draft": draft,
        "tone": tone,
        "status": "pending",
        "message": "Draft regenerated"
    }
