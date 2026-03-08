from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from services.openai_service import generate_followup_draft
from plan_permissions import check_followup_limit, check_tone_allowed
import uuid
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/followups", tags=["followups"])


class GenerateRequest(BaseModel):
    thread_id: str
    tone: str = "professional"


class UpdateDraftRequest(BaseModel):
    draft: str


@router.post("/generate")
async def generate_followup(
    req: GenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    # Plan quota check
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

    # Get thread
    result = await db.execute(
        text("SELECT * FROM email_threads WHERE id=:id AND user_id=:uid"),
        {"id": req.thread_id, "uid": user_id},
    )

    thread = result.fetchone()

    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread = dict(thread._mapping)

    # Check existing pending followup
    result = await db.execute(
        text("""
        SELECT * FROM followup_suggestions
        WHERE thread_id=:tid AND user_id=:uid AND status='pending'
        """),
        {"tid": req.thread_id, "uid": user_id},
    )

    existing = result.fetchone()

    if existing:
        return dict(existing._mapping)

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

    recipient = ""
    participants = thread.get("participants", [])
    if participants:
        recipient = participants[0]

    now = datetime.now(timezone.utc)

    await db.execute(
        text("""
        INSERT INTO followup_suggestions
        (id,thread_id,user_id,original_subject,original_snippet,recipient,
        recipient_name,ai_draft,tone,days_silent,status,created_at)
        VALUES
        (:id,:thread_id,:user_id,:subject,:snippet,:recipient,
        :recipient_name,:draft,:tone,:days_silent,'pending',:created)
        """),
        {
            "id": followup_id,
            "thread_id": req.thread_id,
            "user_id": user_id,
            "subject": thread.get("subject"),
            "snippet": thread.get("snippet"),
            "recipient": recipient,
            "recipient_name": "",
            "draft": draft,
            "tone": req.tone,
            "days_silent": thread.get("days_silent", 0),
            "created": now,
        },
    )

    # Usage tracking
    today = now.date()

    await db.execute(
        text("""
        INSERT INTO usage_tracking (user_id,date,followups_generated,followups_sent,emails_scanned)
        VALUES (:uid,:date,1,0,0)
        ON CONFLICT (user_id,date)
        DO UPDATE SET followups_generated = usage_tracking.followups_generated + 1
        """),
        {"uid": user_id, "date": today},
    )

    await db.commit()

    return {
        "id": followup_id,
        "thread_id": req.thread_id,
        "ai_draft": draft,
        "status": "pending",
    }


@router.get("")
async def list_followups(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):

    query = """
    SELECT * FROM followup_suggestions
    WHERE user_id=:uid
    """

    params = {"uid": current_user["user_id"], "limit": limit, "offset": offset}

    if status:
        query += " AND status=:status"
        params["status"] = status

    query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"

    result = await db.execute(text(query), params)

    followups = [dict(r._mapping) for r in result]

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
        SET ai_draft=:draft, updated_at=:updated
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {
            "draft": req.draft,
            "updated": datetime.now(timezone.utc),
            "id": followup_id,
            "uid": current_user["user_id"],
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

    result = await db.execute(
        text("""
        UPDATE followup_suggestions
        SET status='sent', sent_at=:sent
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {"id": followup_id, "uid": current_user["user_id"], "sent": now},
    )

    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    return {"message": "Follow-up sent"}
