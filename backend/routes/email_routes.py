import uuid
import os
import logging
import email.utils as _eu  # ✅ moved out of the hot loop

from datetime import datetime, timezone, timedelta
from typing import Optional

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
    user["silence_delay_days"] = settings_row.silence_delay_days if settings_row else 3

    return user


# ─────────────────────────────────────────────────────────────
# ✅ REPLACED: single-query batch recovery (was N*2 queries)
#
# Old approach: for each thread → SELECT is_recovered → SELECT
#   latest followup → UPDATE  (2 DB round-trips × N threads)
#
# New approach: one UPDATE ... FROM subquery covering ALL threads
#   for this user at once.  Zero per-thread round-trips.
# ─────────────────────────────────────────────────────────────

async def batch_mark_recovered(user_id: str, db: AsyncSession) -> int:
    """
    Detect and mark all recovered threads for a user in a single query.

    A thread is 'recovered' when:
      1. The contact (not the user) sent the most recent message
      2. A follow-up was previously sent for this thread
      3. The contact's reply arrived AFTER our follow-up was sent
      4. The thread isn't already marked is_recovered = true
    """
    try:
        result = await db.execute(
            text("""
            UPDATE email_threads et
            SET
                is_recovered = TRUE,
                recovered_at = :now,
                updated_at   = :now
            FROM (
                -- Latest sent follow-up per thread
                SELECT DISTINCT ON (fs.thread_id)
                    fs.thread_id,
                    fs.sent_at AS followup_sent_at
                FROM followup_suggestions fs
                WHERE fs.user_id = :uid
                  AND fs.status  = 'sent'
                  AND fs.sent_at IS NOT NULL
                ORDER BY fs.thread_id, fs.sent_at DESC
            ) latest_followup
            WHERE et.id                  = latest_followup.thread_id
              AND et.user_id             = :uid
              AND et.is_recovered        = FALSE
              AND et.last_sender_is_user = FALSE
              AND et.last_message_at     > latest_followup.followup_sent_at
            """),
            {"uid": user_id, "now": datetime.utcnow()},
        )
        count = result.rowcount
        if count:
            logger.info(f"✅ Batch-recovered {count} thread(s) for user {user_id}")
        return count
    except Exception as e:
        # Non-critical — never crash the sync
        logger.warning(f"Batch recovery failed for user {user_id}: {e}")
        return 0


# ─────────────────────────────────────────────────────────────
# Gmail OAuth — IDENTICAL TO ORIGINAL
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
# ✅ OPTIMISED SYNC
#
# Changes vs original:
#  1. Top-level try/except → surfaces the REAL error to the client
#     instead of a generic "Sync failed"
#  2. Bulk upsert via PostgreSQL unnest() — all threads for one
#     account are written in a SINGLE round-trip instead of N
#  3. Recovery detection replaced with batch_mark_recovered() —
#     one UPDATE query total instead of 2×N per-thread queries
#  4. max_results bumped to 100 (was 50)
#  5. email.utils import moved to module top (was inside the loop)
# ─────────────────────────────────────────────────────────────

@router.post("/sync")
async def sync_emails(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    try:
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

            # ── Fetch from Gmail ──────────────────────────────────────────
            try:
                threads = fetch_threads(db_tokens, max_results=100)  # ↑ was 50
            except Exception as e:
                err_msg = f"Failed to fetch from {account_email}: {e}"
                errors.append(err_msg)
                logger.error(f"Gmail API failed for account {account_id}: {e}")
                continue

            if not threads:
                continue

            # ── Build batch rows (pure Python, no DB) ────────────────────
            now  = datetime.utcnow()
            rows = []

            for thread in threads:
                # Parse last-message date
                lmd = thread.get("last_message_date")
                if lmd:
                    try:
                        parsed          = _eu.parsedate_to_datetime(lmd)
                        last_message_at = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                    except Exception:
                        last_message_at = now
                else:
                    last_message_at = None

                # ── Parse display names from RFC 5322 headers ───────────────
                # Gmail returns "John Doe <john@example.com>" in From/To headers.
                # _parse_display() extracts the human name so the UI shows
                # "John Doe" instead of a raw email address.
                def _parse_display(header: str) -> str:
                    h = (header or "").strip()
                    if "<" in h:
                        name = h[:h.index("<")].strip().strip('"')
                        if name:
                            return name
                        # no display name → return just the address part
                        return h[h.index("<")+1 : h.index(">")].strip()
                    return h

                raw_from     = thread.get("from_email", "") or ""
                raw_to       = thread.get("to_email",   "") or ""   # recipient header
                subject      = thread.get("subject",    "") or ""

                from_display = _parse_display(raw_from)   # "John Doe"
                to_display   = _parse_display(raw_to)     # "Jane Smith" / account email
                from_email   = raw_from                   # full header kept for identity checks
                last_from    = from_email.lower()

                is_automated      = is_automated_sender(from_email) or is_automated_subject(subject)
                is_last_from_user = (
                    account_email.lower() in last_from
                    or (bool(user_email) and user_email.lower() in last_from)
                )

                thread_dict = {
                    **thread,
                    "last_message_from":   from_email,
                    "last_sender_is_user": is_last_from_user,
                    "replied_by_user":     False,
                    "is_dismissed":        False,
                    "days_silent": (
                        (now - last_message_at).days if last_message_at else 0
                    ),
                }
                opp_result    = is_real_opportunity(thread_dict, user)
                is_opp        = opp_result["allowed"]
                filter_reason = opp_result["reason"] if not is_opp else None

                rows.append({
                    "id":             str(uuid.uuid4()),
                    "account_id":     account_id,
                    "tid":            thread["gmail_thread_id"],
                    "subject":        subject,
                    "last_at":        last_message_at,
                    # ✅ Store parsed display name, not raw RFC 5322 header
                    "from_email":     from_display or raw_from,
                    "to_email":       to_display   or raw_to,
                    "is_auto":        is_automated,
                    "is_user_sender": is_last_from_user,
                    "snippet":        thread.get("snippet") or "",
                    "msg_count":      thread.get("message_count") or 1,
                    "is_opp":         is_opp,
                    "is_filtered":    not is_opp,
                    "filter_reason":  filter_reason,
                })

            # ── Single bulk upsert for ALL threads in this account ────────
            #
            # PostgreSQL unnest() expands parallel arrays into rows so the
            # entire batch lands in ONE round-trip.  Previously this was
            # one await db.execute(...) per thread — 50× more DB traffic.
            #
            # ✅ FIX: Use CAST(:param AS type[]) instead of :param::type[]
            # asyncpg's SQLAlchemy dialect chokes on `::` immediately after
            # a named parameter — it fails to substitute some params and
            # leaves them as raw `:name` literals, causing a syntax error.
            # CAST(...) is semantically identical and avoids the conflict.
            upsert_result = await db.execute(
                text("""
                INSERT INTO email_threads (
                    id, user_id, account_id, thread_id, subject,
                    last_message_at, last_message_from, created_at,
                    is_silent, needs_followup, is_dismissed, reply_generated,
                    is_automated, last_sender_is_user, snippet, message_count,
                    is_opportunity, is_filtered, filter_reason
                )
                SELECT
                    unnest(CAST(:ids          AS uuid[])),
                    :uid,
                    unnest(CAST(:account_ids  AS uuid[])),
                    unnest(CAST(:tids         AS text[])),
                    unnest(CAST(:subjects     AS text[])),
                    unnest(CAST(:last_ats     AS timestamp[])),
                    unnest(CAST(:from_emails  AS text[])),
                    :created_at,
                    false, false, false, false,
                    unnest(CAST(:is_autos        AS boolean[])),
                    unnest(CAST(:is_user_senders AS boolean[])),
                    unnest(CAST(:snippets        AS text[])),
                    unnest(CAST(:msg_counts      AS integer[])),
                    unnest(CAST(:is_opps         AS boolean[])),
                    unnest(CAST(:is_filtereds    AS boolean[])),
                    unnest(CAST(:filter_reasons  AS text[]))
                ON CONFLICT (user_id, thread_id) DO UPDATE SET
                    subject             = EXCLUDED.subject,
                    last_message_at     = EXCLUDED.last_message_at,
                    last_message_from   = EXCLUDED.last_message_from,
                    is_automated        = EXCLUDED.is_automated,
                    last_sender_is_user = EXCLUDED.last_sender_is_user,
                    snippet             = EXCLUDED.snippet,
                    message_count       = EXCLUDED.message_count,
                    updated_at          = :updated_at,
                    is_opportunity      = EXCLUDED.is_opportunity,
                    is_filtered         = EXCLUDED.is_filtered,
                    filter_reason       = EXCLUDED.filter_reason
                RETURNING id, (xmax = 0) AS inserted, is_opportunity
                """),
                {
                    "uid":             user_id,
                    "created_at":      now,
                    "updated_at":      now,
                    "ids":             [r["id"]             for r in rows],
                    "account_ids":     [r["account_id"]     for r in rows],
                    "tids":            [r["tid"]            for r in rows],
                    "subjects":        [r["subject"]        for r in rows],
                    "last_ats":        [r["last_at"]        for r in rows],
                    "from_emails":     [r["from_email"]     for r in rows],
                    "is_autos":        [r["is_auto"]        for r in rows],
                    "is_user_senders": [r["is_user_sender"] for r in rows],
                    "snippets":        [r["snippet"]        for r in rows],
                    "msg_counts":      [r["msg_count"]      for r in rows],
                    "is_opps":         [r["is_opp"]         for r in rows],
                    "is_filtereds":    [r["is_filtered"]    for r in rows],
                    "filter_reasons":  [r["filter_reason"]  for r in rows],
                },
            )

            # Count newly inserted opportunity threads
            for upsert_row in upsert_result.fetchall():
                was_inserted = upsert_row[1]   # (xmax = 0) → True when INSERTed
                is_opp_row   = upsert_row[2]   # is_opportunity
                if was_inserted and is_opp_row:
                    total_synced += 1

            await db.commit()

        # ── Batch recovery detection — ONE query, replaces N*2 queries ───
        await batch_mark_recovered(user_id, db)
        await db.commit()

        response: dict = {"message": "Sync complete", "new_threads": total_synced}
        if errors:
            response["warnings"] = errors
        return response

    except HTTPException:
        raise  # let FastAPI handle 404 / 403 etc. as-is

    except Exception as exc:
        # ✅ Surface the REAL error so "Sync failed" stops being a mystery
        logger.exception(f"Sync failed for user {user_id}: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {exc}",
        )


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
