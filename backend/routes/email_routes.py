from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from database import get_db
from auth import get_current_user
from services.gmail_service import (
    get_auth_url, exchange_code_for_tokens,
    encrypt_tokens, get_user_email, fetch_threads, GMAIL_CLIENT_ID,
)
from services.thread_filter_service import (
    should_show_reply, get_thread_status,
    filter_threads_for_reply, is_automated_sender,
    is_automated_subject, is_real_opportunity,
)
from plan_permissions import check_account_limit
import uuid, os, logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emails", tags=["emails"])

FRONTEND_URL       = os.environ.get("FRONTEND_URL", "http://localhost:3000")
GMAIL_REDIRECT_URI = os.environ.get(
    "GMAIL_REDIRECT_URI",
    "https://replyzen-ai01-production.up.railway.app/api/emails/gmail/callback",
)


class ConnectGmailRequest(BaseModel):
    email: str


class DismissThreadRequest(BaseModel):
    thread_id: str


# ─────────────────────────────────────────────────────────────
# Helpers — ALL IDENTICAL TO ORIGINAL
# ─────────────────────────────────────────────────────────────

async def verify_user_exists(user_id: str, db: AsyncSession):
    result = await db.execute(
        text("SELECT id FROM users WHERE id = :uid"), {"uid": user_id}
    )
    if not result.fetchone():
        raise HTTPException(
            status_code=404,
            detail=f"User {user_id} not found. Please re-login and try again.",
        )


async def get_user_settings(user_id: str, db: AsyncSession) -> dict:
    result = await db.execute(
        text("SELECT ignore_newsletters, ignore_notifications FROM user_settings WHERE user_id = :uid"),
        {"uid": user_id},
    )
    row = result.fetchone()
    return dict(row._mapping) if row else {"ignore_newsletters": True, "ignore_notifications": True}


async def get_user_email_address(user_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        text("SELECT email FROM users WHERE id = :uid"), {"uid": user_id}
    )
    row = result.fetchone()
    return row[0] if row else ""


async def get_full_user(user_id: str, db: AsyncSession) -> dict:
    user_result = await db.execute(
        text("""
        SELECT id, email,
               COALESCE(follow_up_scope, 'sent_only')   AS follow_up_scope,
               COALESCE(allowed_contacts, '{}')          AS allowed_contacts,
               COALESCE(allowed_domains, '{}')           AS allowed_domains,
               COALESCE(blocked_senders, '{}')           AS blocked_senders
        FROM users WHERE id = :uid
        """),
        {"uid": user_id},
    )
    user_row = user_result.fetchone()
    user = dict(user_row._mapping) if user_row else {}

    settings_result = await db.execute(
        text("""
        SELECT COALESCE(silence_delay_days, 3) AS silence_delay_days
        FROM user_settings WHERE user_id = :uid
        """),
        {"uid": user_id},
    )
    settings_row = settings_result.fetchone()
    if settings_row:
        user["silence_delay_days"] = settings_row.silence_delay_days
    else:
        user["silence_delay_days"] = 3

    return user


# ─────────────────────────────────────────────────────────────
# ✅ NEW HELPER: mark a thread as recovered
#
# Called inside sync when we detect:
#   - The contact sent the last message (last_sender_is_user = False)
#   - A follow-up was previously sent for this thread
#   - The contact's message arrived AFTER the follow-up was sent
#   - The thread isn't already marked recovered
#
# This is intentionally a separate async function so the sync
# loop stays readable and the logic is easy to test/extend.
# ─────────────────────────────────────────────────────────────

async def maybe_mark_recovered(
    thread_db_id: str,
    user_id: str,
    is_last_sender_user: bool,
    last_message_at: Optional[datetime],
    db: AsyncSession,
) -> None:
    """
    Check if a thread qualifies as 'recovered' and update it if so.
    A thread is recovered when:
      1. The contact (not us) sent the most recent message
      2. We previously sent a follow-up for this thread
      3. The contact's message arrived after our follow-up was sent
      4. The thread isn't already marked is_recovered = true
    """
    # Skip if last sender was us — no recovery to detect
    if is_last_sender_user:
        return

    # Skip if we don't know when the last message arrived
    if not last_message_at:
        return

    try:
        # Check if already recovered — avoid redundant writes
        already = await db.execute(
            text("""
            SELECT is_recovered FROM email_threads
            WHERE id = :tid AND user_id = :uid
            """),
            {"tid": thread_db_id, "uid": user_id},
        )
        row = already.fetchone()
        if not row or row[0]:  # already True or thread missing
            return

        # Find the most recent sent follow-up for this thread
        followup_result = await db.execute(
            text("""
            SELECT sent_at FROM followup_suggestions
            WHERE thread_id = :tid
              AND user_id   = :uid
              AND status    = 'sent'
              AND sent_at   IS NOT NULL
            ORDER BY sent_at DESC
            LIMIT 1
            """),
            {"tid": thread_db_id, "uid": user_id},
        )
        followup_row = followup_result.fetchone()
        if not followup_row:
            return  # no sent follow-up → not a recovery

        followup_sent_at = followup_row[0]

        # Normalise to naive UTC for comparison
        def to_naive_utc(dt):
            if dt is None:
                return None
            if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt

        naive_last_msg  = to_naive_utc(last_message_at)
        naive_followup  = to_naive_utc(followup_sent_at)

        if naive_last_msg is None or naive_followup is None:
            return

        # Only recover if the contact replied AFTER our follow-up
        if naive_last_msg <= naive_followup:
            return

        # Mark thread as recovered
        now = datetime.utcnow()
        await db.execute(
            text("""
            UPDATE email_threads
            SET is_recovered    = TRUE,
                recovered_at    = :recovered_at,
                updated_at      = :updated
            WHERE id = :tid AND user_id = :uid
            """),
            {
                "tid":          thread_db_id,
                "uid":          user_id,
                "recovered_at": now,
                "updated":      now,
            },
        )
        logger.info(f"✅ Thread {thread_db_id} marked as recovered for user {user_id}")

    except Exception as e:
        # Non-critical — log and continue, never crash the sync
        logger.warning(f"Recovery detection failed for thread {thread_db_id}: {e}")


# ─────────────────────────────────────────────────────────────
# Gmail OAuth — ALL IDENTICAL TO ORIGINAL
# ─────────────────────────────────────────────────────────────

@router.get("/gmail/auth-url")
async def get_gmail_auth_url(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]
    account_check = await check_account_limit(user_id, db)
    if not account_check["allowed"]:
        raise HTTPException(status_code=403, detail="Email account limit reached")
    if not GMAIL_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Gmail OAuth not configured")
    auth_url = get_auth_url(state=user_id, redirect_uri=GMAIL_REDIRECT_URI)
    return {"auth_url": auth_url}


@router.get("/gmail/callback")
async def gmail_oauth_callback_get(
    request: Request,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    user_id = state
    await verify_user_exists(user_id, db)

    tokens      = exchange_code_for_tokens(code, GMAIL_REDIRECT_URI)
    encrypted   = encrypt_tokens(tokens)
    gmail_email = get_user_email(encrypted)

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email_address=:email"),
        {"uid": user_id, "email": gmail_email},
    )
    existing = result.fetchone()

    if existing:
        await db.execute(
            text("""
            UPDATE email_accounts
            SET access_token=:access, refresh_token=:refresh,
                token_expiry=:expiry, updated_at=:updated
            WHERE id=:id
            """),
            {
                "access":  encrypted["access_token"],
                "refresh": encrypted["refresh_token"],
                "expiry":  encrypted.get("token_expiry"),
                "updated": datetime.now(timezone.utc),
                "id":      existing[0],
            },
        )
    else:
        await db.execute(
            text("""
            INSERT INTO email_accounts
            (id, user_id, email_address, provider, is_active,
             access_token, refresh_token, token_expiry, created_at)
            VALUES (:id, :uid, :email, 'gmail', true,
                    :access, :refresh, :expiry, :connected)
            """),
            {
                "id":        str(uuid.uuid4()),
                "uid":       user_id,
                "email":     gmail_email,
                "access":    encrypted["access_token"],
                "refresh":   encrypted["refresh_token"],
                "expiry":    encrypted.get("token_expiry"),
                "connected": datetime.now(timezone.utc),
            },
        )

    await db.commit()
    return RedirectResponse(f"{FRONTEND_URL}/settings?gmail=connected")


@router.post("/gmail/callback")
async def gmail_oauth_callback_post(
    code: str,
    state: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]
    if state != user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    await verify_user_exists(user_id, db)
    tokens      = exchange_code_for_tokens(code, GMAIL_REDIRECT_URI)
    encrypted   = encrypt_tokens(tokens)
    gmail_email = get_user_email(encrypted)

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email_address=:email"),
        {"uid": user_id, "email": gmail_email},
    )
    existing = result.fetchone()

    if existing:
        await db.execute(
            text("""
            UPDATE email_accounts
            SET access_token=:access, refresh_token=:refresh,
                token_expiry=:expiry, updated_at=:updated
            WHERE id=:id
            """),
            {
                "access":  encrypted["access_token"],
                "refresh": encrypted["refresh_token"],
                "expiry":  encrypted.get("token_expiry"),
                "updated": datetime.now(timezone.utc),
                "id":      existing[0],
            },
        )
        await db.commit()
        return {"message": "Gmail reconnected"}

    await db.execute(
        text("""
        INSERT INTO email_accounts
        (id, user_id, email_address, provider, is_active,
         access_token, refresh_token, token_expiry, created_at)
        VALUES (:id, :uid, :email, 'gmail', true,
                :access, :refresh, :expiry, :connected)
        """),
        {
            "id":        str(uuid.uuid4()),
            "uid":       user_id,
            "email":     gmail_email,
            "access":    encrypted["access_token"],
            "refresh":   encrypted["refresh_token"],
            "expiry":    encrypted.get("token_expiry"),
            "connected": datetime.now(timezone.utc),
        },
    )
    await db.commit()
    return {"message": "Gmail connected"}


# ─────────────────────────────────────────────────────────────
# Accounts — IDENTICAL TO ORIGINAL
# ─────────────────────────────────────────────────────────────

@router.get("/accounts")
async def list_accounts(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
        SELECT id, email_address, provider, is_active, created_at
        FROM email_accounts WHERE user_id=:uid
        """),
        {"uid": current_user["user_id"]},
    )
    return [dict(row._mapping) for row in result]


# ─────────────────────────────────────────────────────────────
# Sync — ORIGINAL LOGIC + recovery hook added in UPDATE branch
# ─────────────────────────────────────────────────────────────

@router.post("/sync")
async def sync_emails(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id    = current_user["user_id"]
    user_email = await get_user_email_address(user_id, db)
    user       = await get_full_user(user_id, db)

    result = await db.execute(
        text("""
        SELECT id, email_address, access_token, refresh_token, token_expiry
        FROM email_accounts WHERE user_id=:uid AND is_active=true
        """),
        {"uid": user_id},
    )
    accounts = result.fetchall()
    if not accounts:
        raise HTTPException(
            status_code=404,
            detail="No connected email accounts found. Please connect Gmail first.",
        )

    total_synced = 0
    errors       = []

    for account in accounts:
        account_dict  = dict(account._mapping)
        account_id    = account_dict["id"]
        account_email = account_dict.get("email_address", "")

        db_tokens = {
            "access_token":  account_dict["access_token"],
            "refresh_token": account_dict["refresh_token"],
            "token_expiry":  account_dict["token_expiry"],
        }

        try:
            threads = fetch_threads(db_tokens, max_results=50)
        except Exception as e:
            errors.append(f"Failed to fetch from {account_email}")
            logger.error(f"Gmail API failed for {account_id}: {e}")
            continue

        for thread in threads:
            existing = await db.execute(
                text("SELECT id FROM email_threads WHERE thread_id=:tid AND user_id=:uid"),
                {"tid": thread["gmail_thread_id"], "uid": user_id},
            )
            existing_row = existing.fetchone()

            last_message_at = None
            if thread.get("last_message_date"):
                try:
                    import email.utils as eu
                    parsed = eu.parsedate_to_datetime(thread["last_message_date"])
                    last_message_at = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                except Exception:
                    last_message_at = datetime.utcnow()

            from_email     = thread.get("from_email", "")
            subject        = thread.get("subject", "")
            is_automated   = is_automated_sender(from_email) or is_automated_subject(subject)
            last_from      = thread.get("from_email", "").lower()
            is_last_from_user = (
                account_email.lower() in last_from or
                (user_email.lower() in last_from if user_email else False)
            )

            # Run opportunity filter at sync time — UNCHANGED
            thread_dict = {
                **thread,
                "last_message_from":   from_email,
                "last_sender_is_user": is_last_from_user,
                "replied_by_user":     False,
                "is_dismissed":        False,
                "days_silent": (
                    (datetime.utcnow() - last_message_at).days
                    if last_message_at else 0
                ),
            }
            opp_result    = is_real_opportunity(thread_dict, user)
            is_opp        = opp_result["allowed"]
            is_filtered   = not is_opp
            filter_reason = opp_result["reason"] if not is_opp else None

            if existing_row:
                # ── EXISTING THREAD UPDATE — original SQL unchanged ──
                await db.execute(
                    text("""
                    UPDATE email_threads
                    SET subject=:subject, last_message_at=:last_at,
                        last_message_from=:from_email, is_automated=:is_auto,
                        last_sender_is_user=:is_user_sender, snippet=:snippet,
                        message_count=:msg_count, updated_at=:updated,
                        is_opportunity=:is_opp, is_filtered=:is_filtered,
                        filter_reason=:filter_reason
                    WHERE thread_id=:tid AND user_id=:uid
                    """),
                    {
                        "subject":        thread["subject"],
                        "last_at":        last_message_at,
                        "from_email":     from_email,
                        "is_auto":        is_automated,
                        "is_user_sender": is_last_from_user,
                        "snippet":        thread.get("snippet", ""),
                        "msg_count":      thread.get("message_count", 1),
                        "updated":        datetime.utcnow(),
                        "is_opp":         is_opp,
                        "is_filtered":    is_filtered,
                        "filter_reason":  filter_reason,
                        "tid":            thread["gmail_thread_id"],
                        "uid":            user_id,
                    },
                )

                # ✅ NEW: recovery detection — non-blocking, safe
                # Runs only on existing threads (new threads can't be recovered
                # on first sync since no follow-up has been sent yet).
                thread_db_id = str(existing_row[0])
                await maybe_mark_recovered(
                    thread_db_id    = thread_db_id,
                    user_id         = user_id,
                    is_last_sender_user = is_last_from_user,
                    last_message_at = last_message_at,
                    db              = db,
                )

            else:
                # ── NEW THREAD INSERT — identical to original ──
                await db.execute(
                    text("""
                    INSERT INTO email_threads
                    (id, user_id, account_id, thread_id, subject,
                     last_message_at, last_message_from, created_at,
                     is_silent, needs_followup, is_dismissed, reply_generated,
                     is_automated, last_sender_is_user, snippet, message_count,
                     is_opportunity, is_filtered, filter_reason)
                    VALUES
                    (:id, :uid, :account_id, :tid, :subject,
                     :last_at, :from_email, :created,
                     false, false, false, false,
                     :is_auto, :is_user_sender, :snippet, :msg_count,
                     :is_opp, :is_filtered, :filter_reason)
                    """),
                    {
                        "id":           str(uuid.uuid4()),
                        "uid":          user_id,
                        "account_id":   account_id,
                        "tid":          thread["gmail_thread_id"],
                        "subject":      thread["subject"],
                        "last_at":      last_message_at,
                        "from_email":   from_email,
                        "created":      datetime.utcnow(),
                        "is_auto":      is_automated,
                        "is_user_sender": is_last_from_user,
                        "snippet":      thread.get("snippet", ""),
                        "msg_count":    thread.get("message_count", 1),
                        "is_opp":       is_opp,
                        "is_filtered":  is_filtered,
                        "filter_reason": filter_reason,
                    },
                )
                if is_opp:
                    total_synced += 1

        await db.commit()

    response = {"message": "Sync complete", "new_threads": total_synced}
    if errors:
        response["warnings"] = errors
    return response


# ─────────────────────────────────────────────────────────────
# ALL ROUTES BELOW — BYTE-FOR-BYTE IDENTICAL TO ORIGINAL
# ─────────────────────────────────────────────────────────────

@router.get("/threads/silent")
async def get_silent_threads(
    days: int = 3,
    limit: int = 50,
    show_filtered: bool = False,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id       = current_user["user_id"]
    user_email    = await get_user_email_address(user_id, db)
    user_settings = await get_user_settings(user_id, db)
    user          = await get_full_user(user_id, db)
    cutoff        = datetime.utcnow() - timedelta(days=days)

    if show_filtered:
        where_clause = "et.user_id = :uid AND et.last_message_at < :cutoff"
    else:
        where_clause = """
            et.user_id = :uid
            AND et.last_message_at < :cutoff
            AND et.is_dismissed = false
            AND (et.is_opportunity = true)
            AND (et.is_filtered = false OR et.is_filtered IS NULL)
            AND (et.replied_by_user = false OR et.replied_by_user IS NULL)
        """

    result = await db.execute(
        text(f"""
        SELECT
            et.id, et.thread_id, et.subject, et.last_message_from,
            et.last_message_at, et.priority, et.is_silent, et.is_dismissed,
            et.reply_generated, et.is_automated, et.last_sender_is_user,
            et.snippet, et.type, et.importance, et.priority_level,
            et.priority_score, et.is_opportunity, et.is_filtered,
            et.filter_reason,
            EXTRACT(DAY FROM (NOW() - et.last_message_at))::int AS days_silent,
            COALESCE(fs.status, 'none') AS followup_status
        FROM email_threads et
        LEFT JOIN followup_suggestions fs
          ON fs.thread_id = et.id AND fs.user_id = et.user_id
        WHERE {where_clause}
        ORDER BY
            et.priority_score DESC NULLS LAST,
            et.last_message_at ASC
        LIMIT :limit
        """),
        {"uid": user_id, "cutoff": cutoff, "limit": limit},
    )

    threads = []
    for row in result:
        row_dict = dict(row._mapping)

        opp = is_real_opportunity(row_dict, user)
        row_dict["opportunity_context"] = opp.get("context", "")
        row_dict["show_reply"]          = opp["allowed"]
        row_dict["reply_reason"]        = opp["reason"]
        row_dict["thread_status"]       = "needs_reply" if opp["allowed"] else opp["reason"]
        row_dict["participant_names"]   = [row_dict.get("last_message_from", "")]

        threads.append(row_dict)

    return {"threads": threads}


@router.get("/threads")
async def list_threads(
    limit: int = 50,
    offset: int = 0,
    filter_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id       = current_user["user_id"]
    user_email    = await get_user_email_address(user_id, db)
    user_settings = await get_user_settings(user_id, db)

    base_query = """
        SELECT et.*,
               EXTRACT(DAY FROM (NOW() - et.last_message_at))::int AS days_silent,
               COALESCE(fs.status, 'none') AS followup_status
        FROM email_threads et
        LEFT JOIN followup_suggestions fs
          ON fs.thread_id = et.id AND fs.user_id = et.user_id
        WHERE et.user_id=:uid
    """
    params = {"uid": user_id, "limit": limit, "offset": offset}

    if filter_type == "needs_reply":
        base_query += " AND et.is_dismissed = false AND et.reply_generated = false AND (et.last_sender_is_user = false OR et.last_sender_is_user IS NULL)"
    elif filter_type == "replied":
        base_query += " AND (et.reply_generated = true OR fs.status = 'sent')"
    elif filter_type == "awaiting_response":
        base_query += " AND et.last_sender_is_user = true AND et.is_dismissed = false"
    elif filter_type == "dismissed":
        base_query += " AND et.is_dismissed = true"

    base_query += " ORDER BY et.last_message_at DESC LIMIT :limit OFFSET :offset"

    result = await db.execute(text(base_query), params)

    threads = []
    for row in result:
        row_dict   = dict(row._mapping)
        reply_info = should_show_reply(row_dict, user_email, user_settings)
        row_dict["show_reply"]    = reply_info["show_reply"]
        row_dict["reply_reason"]  = reply_info["reason"]
        row_dict["thread_status"] = reply_info["status"]
        threads.append(row_dict)

    return {"threads": threads}


@router.post("/threads/{thread_id}/dismiss")
async def dismiss_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]
    result = await db.execute(
        text("""
        UPDATE email_threads
        SET is_dismissed = true, is_opportunity = false,
            is_filtered = true, filter_reason = 'dismissed',
            updated_at = :updated
        WHERE id = :tid AND user_id = :uid
        """),
        {"tid": thread_id, "uid": user_id, "updated": datetime.utcnow()},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"message": "Thread dismissed", "thread_id": thread_id}


@router.post("/threads/{thread_id}/undismiss")
async def undismiss_thread(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]
    result = await db.execute(
        text("""
        UPDATE email_threads
        SET is_dismissed = false, updated_at = :updated
        WHERE id = :tid AND user_id = :uid
        """),
        {"tid": thread_id, "uid": user_id, "updated": datetime.utcnow()},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"message": "Thread restored", "thread_id": thread_id}


@router.get("/threads/{thread_id}/reply-status")
async def get_thread_reply_status(
    thread_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id       = current_user["user_id"]
    user_email    = await get_user_email_address(user_id, db)
    user_settings = await get_user_settings(user_id, db)

    result = await db.execute(
        text("""
        SELECT et.*,
               COALESCE(fs.status, 'none') AS followup_status
        FROM email_threads et
        LEFT JOIN followup_suggestions fs
          ON fs.thread_id = et.id AND fs.user_id = et.user_id
        WHERE et.id = :tid AND et.user_id = :uid
        """),
        {"tid": thread_id, "uid": user_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread     = dict(row._mapping)
    reply_info = should_show_reply(thread, user_email, user_settings)

    return {
        "thread_id":  thread_id,
        "show_reply": reply_info["show_reply"],
        "reason":     reply_info["reason"],
        "status":     reply_info["status"],
    }


@router.post("/connect-gmail")
async def connect_gmail_demo(
    req: ConnectGmailRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]
    account_check = await check_account_limit(user_id, db)
    if not account_check["allowed"]:
        raise HTTPException(status_code=403, detail="Email account limit reached")

    result = await db.execute(
        text("SELECT id FROM email_accounts WHERE user_id=:uid AND email_address=:email"),
        {"uid": user_id, "email": req.email},
    )
    if result.fetchone():
        raise HTTPException(status_code=400, detail="Account already connected")

    account_id = str(uuid.uuid4())
    await db.execute(
        text("""
        INSERT INTO email_accounts
        (id, user_id, email_address, provider, is_active, created_at)
        VALUES (:id, :uid, :email, 'gmail', true, :connected)
        """),
        {
            "id":        account_id,
            "uid":       user_id,
            "email":     req.email,
            "connected": datetime.now(timezone.utc),
        },
    )
    await db.commit()
    return {"message": "Demo Gmail connected", "account_id": account_id}
