"""
db_init.py — Database initialization and migrations
=====================================================
Creates tables needed for new features on startup.
Uses IF NOT EXISTS to be safe for both SQLite (dev) and PostgreSQL (prod).
"""

import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def init_database(db):
    """
    Run on startup to ensure all required tables/columns exist.
    Safe to run multiple times (idempotent).
    """
    logger.info("[DB Init] Running database initialization...")

    # ── Users table (core) ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT,
            password_hash TEXT,
            full_name TEXT,
            plan TEXT DEFAULT 'free',
            auth_provider TEXT,
            google_id TEXT,
            avatar_url TEXT,
            user_consent INTEGER DEFAULT 0,
            consent_accepted_at TIMESTAMP,
            is_onboarded INTEGER DEFAULT 0,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """))

    # ── Profiles table ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            email TEXT,
            display_name TEXT,
            created_at TIMESTAMP,
            UNIQUE(user_id)
        )
    """))

    # ── User settings ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS user_settings (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE,
            auto_send INTEGER DEFAULT 0,
            send_window_start TEXT DEFAULT '09:00',
            send_window_end TEXT DEFAULT '18:00',
            daily_send_limit INTEGER DEFAULT 20,
            timezone TEXT DEFAULT 'UTC',
            silence_delay_days INTEGER DEFAULT 3,
            ignore_newsletters INTEGER DEFAULT 1,
            ignore_notifications INTEGER DEFAULT 1,
            daily_digest INTEGER DEFAULT 1,
            weekly_report INTEGER DEFAULT 1,
            follow_up_scope TEXT DEFAULT 'sent_only',
            allowed_contacts TEXT,
            allowed_domains TEXT,
            blocked_senders TEXT,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """))

    # ── Email accounts ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS email_accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            email_address TEXT,
            access_token TEXT,
            refresh_token TEXT,
            token_expiry TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """))

    # ── Email threads ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS email_threads (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            thread_id TEXT,
            subject TEXT,
            snippet TEXT,
            last_message_from TEXT,
            last_message_at TIMESTAMP,
            is_dismissed INTEGER DEFAULT 0,
            replied_by_user INTEGER DEFAULT 0,
            last_sender_is_user INTEGER DEFAULT 0,
            reply_generated INTEGER DEFAULT 0,
            is_automated INTEGER DEFAULT 0,
            is_filtered INTEGER DEFAULT 0,
            is_actionable INTEGER DEFAULT 1,
            type TEXT,
            importance TEXT,
            priority_score INTEGER DEFAULT 0,
            priority_level TEXT DEFAULT 'low',
            days_silent INTEGER DEFAULT 0,
            last_followup_sent_at TIMESTAMP,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """))

    # ── Followup suggestions ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS followup_suggestions (
            id TEXT PRIMARY KEY,
            thread_id TEXT,
            user_id TEXT,
            generated_text TEXT,
            tone TEXT DEFAULT 'professional',
            priority TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'pending',
            auto_sent INTEGER DEFAULT 0,
            confidence_score INTEGER,
            category TEXT,
            generated_at TIMESTAMP,
            sent_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """))

    # ── Smart Reply Settings ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS smart_reply_settings (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE,
            enabled INTEGER DEFAULT 0,
            smart_reply_mode TEXT DEFAULT 'manual',
            confidence_threshold INTEGER DEFAULT 80,
            daily_limit INTEGER DEFAULT 20,
            delay_seconds INTEGER DEFAULT 120,
            allowed_categories TEXT DEFAULT '["faq","inquiry"]',
            confirmed_first_use INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    # ── Email queue ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS email_queue (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            followup_id TEXT,
            to_email TEXT,
            subject TEXT,
            body TEXT,
            status TEXT DEFAULT 'queued',
            scheduled_at TIMESTAMP,
            cancelled INTEGER DEFAULT 0,
            cancelled_at TIMESTAMP,
            sent_at TIMESTAMP,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    # ── Usage tracking ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS usage_tracking (
            user_id TEXT,
            date DATE,
            followups_generated INTEGER DEFAULT 0,
            followups_sent INTEGER DEFAULT 0,
            emails_scanned INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, date)
        )
    """))

    # ── Auto send logs ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS auto_send_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            followup_id TEXT,
            status TEXT,
            error TEXT,
            sent_at TIMESTAMP
        )
    """))

    # ── Cron locks ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS cron_locks (
            name TEXT PRIMARY KEY,
            locked_at TIMESTAMP,
            locked_by TEXT
        )
    """))

    # ── Followup logs ──
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS followup_logs (
            id TEXT PRIMARY KEY,
            thread_id TEXT,
            user_id TEXT,
            status TEXT,
            reason TEXT,
            created_at TIMESTAMP
        )
    """))

    # ─── NEW: Permission logs (audit trail for Google verification) ───
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS permission_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            resource TEXT,
            platform TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    # ─── NEW: Smart Reply logs (message + reply tracking) ───
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS smart_reply_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            thread_id TEXT,
            message_snippet TEXT,
            generated_reply TEXT,
            platform TEXT DEFAULT 'gmail',
            tone TEXT DEFAULT 'professional',
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    # ─── NEW: Inbox messages (Google-reviewer-friendly inbox preview) ───
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS inbox_messages (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            thread_id TEXT,
            message TEXT,
            reply TEXT,
            status TEXT DEFAULT 'pending',
            platform TEXT DEFAULT 'gmail',
            tone TEXT DEFAULT 'professional',
            sent_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))

    await db.commit()

    # ── Try to add new columns to existing tables (safe for both SQLite and PG) ──
    await _safe_add_column(db, "users", "user_consent", "INTEGER DEFAULT 0")
    await _safe_add_column(db, "users", "consent_accepted_at", "TIMESTAMP")
    await _safe_add_column(db, "users", "is_onboarded", "INTEGER DEFAULT 0")
    await _safe_add_column(db, "smart_reply_settings", "smart_reply_mode", "TEXT DEFAULT 'manual'")

    await db.commit()
    logger.info("[DB Init] Database initialization complete")


async def _safe_add_column(db, table: str, column: str, col_type: str):
    """Safely add a column to a table if it doesn't exist."""
    try:
        # Check if column exists by querying it
        await db.execute(text(f"SELECT {column} FROM {table} LIMIT 0"))
    except Exception:
        try:
            await db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            logger.info(f"[DB Init] Added column {column} to {table}")
            await db.commit()
        except Exception as e:
            logger.warning(f"[DB Init] Could not add column {column} to {table}: {e}")
            await db.rollback()
