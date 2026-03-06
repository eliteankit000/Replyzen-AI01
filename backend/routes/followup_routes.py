from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import db
from auth import get_current_user
from services.openai_service import generate_followup_draft
from plan_permissions import check_followup_limit, get_user_plan, check_tone_allowed
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
async def generate_followup(req: GenerateRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    # Plan limit check: followup quota
    limit_check = await check_followup_limit(user_id)
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=f"You have reached your monthly follow-up limit ({limit_check['limit']}). Upgrade your plan to continue."
        )

    # Plan limit check: tone
    plan = limit_check["plan"]
    if not check_tone_allowed(plan, req.tone):
        raise HTTPException(
            status_code=403,
            detail=f"The '{req.tone}' tone is not available on your current plan. Upgrade to Pro or Business to unlock advanced tones."
        )

    thread = await db.email_threads.find_one(
        {"id": req.thread_id, "user_id": user_id}, {"_id": 0}
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Check for existing pending followup
    existing = await db.followup_suggestions.find_one(
        {"thread_id": req.thread_id, "user_id": user_id, "status": "pending"},
        {"_id": 0}
    )
    if existing:
        return existing

    try:
        draft = await generate_followup_draft(
            subject=thread.get("subject", ""),
            snippet=thread.get("snippet", ""),
            days_silent=thread.get("days_silent", 1),
            tone=req.tone
        )
    except Exception as e:
        logger.error(f"AI generation failed: {e}")
        draft = f"Hi,\n\nI wanted to follow up on our conversation about \"{thread.get('subject', 'our discussion')}\".\n\nLooking forward to hearing from you.\n\nBest regards"

    followup_id = str(uuid.uuid4())
    followup = {
        "id": followup_id,
        "thread_id": req.thread_id,
        "user_id": user_id,
        "original_subject": thread.get("subject", ""),
        "original_snippet": thread.get("snippet", ""),
        "recipient": next((p for p in thread.get("participants", []) if p != current_user.get("email", "")), ""),
        "recipient_name": thread.get("participant_names", [""])[0] if thread.get("participant_names") else "",
        "ai_draft": draft,
        "tone": req.tone,
        "days_silent": thread.get("days_silent", 0),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_at": None,
    }
    await db.followup_suggestions.insert_one(followup)

    # Track usage
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.usage_tracking.update_one(
        {"user_id": user_id, "date": today},
        {"$inc": {"followups_generated": 1}, "$setOnInsert": {"followups_sent": 0, "emails_scanned": 0}},
        upsert=True
    )

    result = {k: v for k, v in followup.items() if k != "_id"}
    return result


@router.get("")
async def list_followups(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["user_id"]}
    if status:
        query["status"] = status

    followups = await db.followup_suggestions.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)

    total = await db.followup_suggestions.count_documents(query)
    return {"followups": followups, "total": total}


@router.put("/{followup_id}")
async def update_followup(followup_id: str, req: UpdateDraftRequest, current_user: dict = Depends(get_current_user)):
    result = await db.followup_suggestions.update_one(
        {"id": followup_id, "user_id": current_user["user_id"], "status": "pending"},
        {"$set": {"ai_draft": req.draft, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found or already sent")
    return {"message": "Draft updated"}


@router.post("/{followup_id}/send")
async def send_followup(followup_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    followup = await db.followup_suggestions.find_one(
        {"id": followup_id, "user_id": user_id, "status": "pending"}, {"_id": 0}
    )
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found or already processed")

    # Mark as sent (in real implementation, this would send via Gmail API)
    now = datetime.now(timezone.utc).isoformat()
    await db.followup_suggestions.update_one(
        {"id": followup_id},
        {"$set": {"status": "sent", "sent_at": now}}
    )

    # Update thread status
    await db.email_threads.update_one(
        {"id": followup["thread_id"]},
        {"$set": {"is_silent": False, "last_sender": "user", "updated_at": now}}
    )

    # Track usage
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.usage_tracking.update_one(
        {"user_id": user_id, "date": today},
        {"$inc": {"followups_sent": 1}},
        upsert=True
    )

    return {"message": "Follow-up sent successfully"}


@router.post("/{followup_id}/dismiss")
async def dismiss_followup(followup_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.followup_suggestions.update_one(
        {"id": followup_id, "user_id": current_user["user_id"], "status": "pending"},
        {"$set": {"status": "dismissed", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found or already processed")
    return {"message": "Follow-up dismissed"}
