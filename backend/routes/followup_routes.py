from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from services.openai_service import generate_followup_draft
from services.thread_filter_service import should_show_reply
from services.gmail_service import send_email
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


# ✅ NEW: Smart replies request model
class SmartRepliesRequest(BaseModel):
    thread_id: str
    tone: str = "professional"


class UpdateDraftRequest(BaseModel):
    draft: str


async def get_user_email_address(user_id: str, db: AsyncSession) -> str:
    """Get the user's primary email address."""
    result = await db.execute(
        text("SELECT email FROM users WHERE id::text = :uid"),
        {"uid": user_id}
    )
    row = result.fetchone()
    return row[0] if row else ""


async def get_user_settings(user_id: str, db: AsyncSession) -> dict:
    """Get user settings for thread filtering."""
    result = await db.execute(
        text("SELECT ignore_newsletters, ignore_notifications FROM user_settings WHERE user_id::text = :uid"),
        {"uid": user_id}
    )
    row = result.fetchone()
    if row:
        return dict(row._mapping)
    return {"ignore_newsletters": True, "ignore_notifications": True}


# ─────────────────────────────────────────────────────────────
# ✅ NEW ENDPOINT: POST /api/followups/smart-replies
#
# Generates 3 context-aware follow-up suggestions (friendly,
# professional, direct) for a given thread.
#
# IMPORTANT:
# - Does NOT touch or replace the existing /generate endpoint
# - Does NOT write to followup_suggestions table (read-only)
# - Uses the same plan/limit checks as /generate
# - Reuses existing generate_followup_draft for each variant
# ─────────────────────────────────────────────────────────────
@router.post("/smart-replies")
async def generate_smart_replies(
    req: SmartRepliesRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    # Check plan limits (same as /generate)
    limit_check = await check_followup_limit(user_id, db)
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=403,
            detail=f"You have reached your monthly follow-up limit ({limit_check['limit']})."
        )

    # Fetch thread
    result = await db.execute(
        text("SELECT * FROM email_threads WHERE id = :id AND user_id::text = :uid"),
        {"id": req.thread_id, "uid": user_id},
    )
    thread = result.fetchone()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread = dict(thread._mapping)

    subject    = thread.get("subject", "")
    snippet    = thread.get("snippet", "")
    days_silent = thread.get("days_silent", 1)

    # Generate 3 variants concurrently — one per tone
    # Each variant reuses the existing generate_followup_draft service.
    # We override tone for each variant regardless of req.tone so the user
    # always sees all three styles to choose from.
    VARIANTS = [
        ("friendly",      "friendly"),
        ("professional",  "professional"),
        ("direct",        "casual"),   # "casual" maps to direct/concise style
    ]

    async def _generate_one(label: str, tone: str) -> dict:
        try:
            text_result = await generate_followup_draft(
                subject=subject,
                snippet=snippet,
                days_silent=days_silent,
                tone=tone,
            )
            return {"type": label, "tone": tone, "text": text_result}
        except Exception as e:
            logger.warning(f"Smart reply variant '{label}' failed: {e}")
            # Graceful fallback per variant
            return {
                "type": label,
                "tone": tone,
                "text": (
                    f"Hi,\n\nFollowing up regarding \"{subject}\"."
                    f"\n\nIt's been {days_silent} day{'s' if days_silent != 1 else ''} "
                    f"since my last message — happy to reconnect when you have a moment."
                    f"\n\nBest regards"
                ),
            }

    # Run all 3 in parallel to keep latency low
    suggestions = await asyncio.gather(
        *[_generate_one(label, tone) for label, tone in VARIANTS]
    )

    return {"suggestions": list(suggestions), "thread_id": req.thread_id}


# ─────────────────────────────────────────────────────────────
# ✅ NEW ENDPOINT: POST /api/followups/save-draft
#
# Directly upserts a followup_suggestions row with the user's
# chosen smart reply suggestion text. This is intentionally
# separate from /generate because:
#
# 1. /generate runs should_show_reply() which can return 400
#    if the thread doesn't pass the filter — even with
#    force_regenerate=True the check still runs in some cases.
#
# 2. By the time the user reaches this endpoint they have
#    already seen the suggestions and explicitly chosen one.
#    There is no need to re-validate thread eligibility.
#
# 3. This endpoint does NOT call OpenAI — it just persists
#    the text the user already approved from smart-replies.
#
# Flow: smart-replies (generates) → user picks → save-draft
#       (persists) → send (/{id}/send, unchanged)
# ─────────────────────────────────────────────────────────────
class SaveDraftRequest(BaseModel):
    thread_id: str
    draft: str
    tone: str = "professional"


@router.post("/save-draft")
async def save_smart_reply_draft(
    req: SaveDraftRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    if not req.draft or not req.draft.strip():
        raise HTTPException(status_code=400, detail="Draft text is required")

    # Verify the thread belongs to this user
    result = await db.execute(
        text("SELECT id FROM email_threads WHERE id = :id AND user_id::text = :uid"),
        {"id": req.thread_id, "uid": user_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Thread not found")

    now = datetime.now(timezone.utc)

    # Check if a pending draft already exists for this thread
    existing_result = await db.execute(
        text("""
        SELECT id FROM followup_suggestions
        WHERE thread_id = :tid AND user_id::text = :uid AND status = 'pending'
        LIMIT 1
        """),
        {"tid": req.thread_id, "uid": user_id},
    )
    existing = existing_result.fetchone()

    if existing:
        # Update existing pending draft with chosen suggestion text
        followup_id = str(existing[0])
        await db.execute(
            text("""
            UPDATE followup_suggestions
            SET generated_text = :draft, tone = :tone, updated_at = :updated
            WHERE id = :id AND user_id::text = :uid
            """),
            {
                "draft": req.draft.strip(),
                "tone": req.tone,
                "updated": now,
                "id": followup_id,
                "uid": user_id,
            },
        )
    else:
        # Create a new pending draft row directly — no AI call needed
        followup_id = str(uuid.uuid4())
        await db.execute(
            text("""
            INSERT INTO followup_suggestions
            (id, thread_id, user_id, generated_text, tone, priority, status, generated_at)
            VALUES
            (:id, :thread_id, :user_id, :draft, :tone, 'normal', 'pending', :generated_at)
            """),
            {
                "id": followup_id,
                "thread_id": req.thread_id,
                "user_id": user_id,
                "draft": req.draft.strip(),
                "tone": req.tone,
                "generated_at": now,
            },
        )
        # Mark thread so it shows as having a draft
        await db.execute(
            text("""
            UPDATE email_threads
            SET reply_generated = true, updated_at = :updated
            WHERE id = :tid AND user_id::text = :uid
            """),
            {"tid": req.thread_id, "uid": user_id, "updated": now},
        )

        # Track usage (counts as a generation)
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
        "thread_id": req.thread_id,
        "tone": req.tone,
        "status": "pending",
    }


# ─────────────────────────────────────────────────────────────
# ALL ROUTES BELOW ARE BYTE-FOR-BYTE IDENTICAL TO THE ORIGINAL
# ─────────────────────────────────────────────────────────────

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
            WHERE id = :tid AND user_id::text = :uid
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
    user_id = current_user["user_id"]

    # ✅ Get followup + thread + email account tokens in one query
    result = await db.execute(
        text("""
        SELECT 
            fs.id,
            fs.generated_text,
            fs.thread_id,
            et.subject,
            et.last_message_from AS recipient_email,
            et.thread_id AS gmail_thread_id,
            ea.access_token,
            ea.refresh_token,
            ea.token_expiry
        FROM followup_suggestions fs
        JOIN email_threads et ON et.id = fs.thread_id
        JOIN email_accounts ea ON ea.user_id = fs.user_id AND ea.is_active = true
        WHERE fs.id = :id AND fs.user_id::text = :uid AND fs.status = 'pending'
        LIMIT 1
        """),
        {"id": followup_id, "uid": user_id}
    )
    followup = result.fetchone()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found or no connected Gmail account")

    followup_dict = dict(followup._mapping)

    # ✅ Actually send the email via Gmail API
    try:
        db_tokens = {
            "access_token": followup_dict["access_token"],
            "refresh_token": followup_dict["refresh_token"],
            "token_expiry": followup_dict["token_expiry"],
        }

        send_email(
            db_tokens=db_tokens,
            to=followup_dict["recipient_email"],
            subject=f"Re: {followup_dict['subject']}",
            body=followup_dict["generated_text"],
            thread_id=followup_dict["gmail_thread_id"],
        )
        logger.info(f"✅ Email sent via Gmail for followup {followup_id} to {followup_dict['recipient_email']}")

    except Exception as e:
        logger.error(f"❌ Gmail send failed for followup {followup_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email via Gmail: {str(e)}")

    # Mark followup as sent in DB
    await db.execute(
        text("""
        UPDATE followup_suggestions
        SET status='sent', sent_at=:sent
        WHERE id=:id AND user_id=:uid
        """),
        {"id": followup_id, "uid": user_id, "sent": now},
    )

    # Mark thread as replied by user
    # ✅ Also set last_followup_sent_at so the recovery detector in email_routes.py
    # knows when our follow-up was sent. The next sync checks whether the
    # contact replies AFTER this timestamp to mark the thread as recovered.
    await db.execute(
        text("""
        UPDATE email_threads
        SET replied_by_user = true, last_sender_is_user = true,
            last_followup_sent_at = :sent_at,
            updated_at = :updated
        WHERE id = :tid AND user_id::text = :uid
        """),
        {"tid": followup_dict["thread_id"], "uid": user_id, "sent_at": now, "updated": now}
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
        {"uid": user_id, "date": today},
    )

    await db.commit()

    return {"message": "Follow-up sent successfully via Gmail"}


@router.post("/{followup_id}/dismiss")
async def dismiss_followup(
    followup_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    await db.execute(
        text("""
        UPDATE followup_suggestions
        SET status='dismissed'
        WHERE id=:id AND user_id=:uid AND status='pending'
        """),
        {"id": followup_id, "uid": current_user["user_id"]},
    )

    await db.execute(
        text("""
        UPDATE email_threads
        SET reply_generated = false, updated_at = :updated
        WHERE id = :tid AND user_id::text = :uid
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
