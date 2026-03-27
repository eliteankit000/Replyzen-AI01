/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPLYZEN AI - COMPLETE DATABASE SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file contains the complete database schema for all features:
 * - Core user management
 * - Email thread tracking
 * - Smart Reply Mode
 * - Inbox Preview System  
 * - Google OAuth Permission Tracking
 * - Contact Form (no DB needed - uses Brevo API)
 * 
 * Database: PostgreSQL (Production) / SQLite (Development)
 * Compatible with both databases
 * ═══════════════════════════════════════════════════════════════════════════
 */


-- ═══════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. USERS TABLE (Core authentication & profiles)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                      TEXT PRIMARY KEY,           -- UUID as TEXT
    email                   TEXT,
    password_hash           TEXT,
    full_name               TEXT,
    plan                    TEXT DEFAULT 'free',        -- free, pro, business
    auth_provider           TEXT,                       -- email, google
    google_id               TEXT,
    avatar_url              TEXT,                       -- Google profile picture
    
    -- NEW: Google OAuth Consent Tracking (Feature 1)
    user_consent            INTEGER DEFAULT 0,          -- 0 = not given, 1 = given
    consent_accepted_at     TIMESTAMP,                  -- When consent was given
    
    -- Timestamps
    created_at              TIMESTAMP NOT NULL,
    updated_at              TIMESTAMP,
    
    -- Indexes for common queries
    CONSTRAINT users_email_unique UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);


-- ───────────────────────────────────────────────────────────────────────────
-- 2. PROFILES TABLE (Extended user information)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    email                   TEXT,
    display_name            TEXT,
    created_at              TIMESTAMP,
    
    CONSTRAINT profiles_user_unique UNIQUE(user_id),
    CONSTRAINT fk_profiles_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- USER SETTINGS & PREFERENCES
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 3. USER_SETTINGS TABLE (General application settings)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT UNIQUE NOT NULL,
    
    -- Auto-send settings
    auto_send               INTEGER DEFAULT 0,          -- 0 = disabled, 1 = enabled
    send_window_start       TEXT DEFAULT '09:00',
    send_window_end         TEXT DEFAULT '18:00',
    daily_send_limit        INTEGER DEFAULT 20,
    timezone                TEXT DEFAULT 'UTC',
    
    -- Thread filtering
    silence_delay_days      INTEGER DEFAULT 3,
    ignore_newsletters      INTEGER DEFAULT 1,
    ignore_notifications    INTEGER DEFAULT 1,
    
    -- Notifications
    daily_digest            INTEGER DEFAULT 1,
    weekly_report           INTEGER DEFAULT 1,
    
    -- Follow-up scope
    follow_up_scope         TEXT DEFAULT 'sent_only',   -- sent_only, all, custom
    allowed_contacts        TEXT,                       -- JSON array
    allowed_domains         TEXT,                       -- JSON array
    blocked_senders         TEXT,                       -- JSON array
    
    -- Timestamps
    created_at              TIMESTAMP,
    updated_at              TIMESTAMP,
    
    CONSTRAINT fk_user_settings_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 4. SMART_REPLY_SETTINGS TABLE (Feature 2: Smart Reply Mode)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smart_reply_settings (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT UNIQUE NOT NULL,
    
    -- Smart Reply Mode Configuration
    enabled                 INTEGER DEFAULT 0,          -- 0 = disabled, 1 = enabled
    smart_reply_mode        TEXT DEFAULT 'manual',      -- manual, auto
    confidence_threshold    INTEGER DEFAULT 80,         -- 0-100
    daily_limit             INTEGER DEFAULT 20,         -- Max replies per day
    delay_seconds           INTEGER DEFAULT 120,        -- Delay before sending (queue time)
    allowed_categories      TEXT DEFAULT '["faq","inquiry"]',  -- JSON array
    confirmed_first_use     INTEGER DEFAULT 0,          -- User confirmed understanding
    
    -- Timestamps
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_smart_reply_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_smart_reply_user_id ON smart_reply_settings(user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- EMAIL MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 5. EMAIL_ACCOUNTS TABLE (Gmail OAuth tokens)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_accounts (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    email_address           TEXT,
    access_token            TEXT,                       -- Encrypted
    refresh_token           TEXT,                       -- Encrypted
    token_expiry            TIMESTAMP,
    is_active               INTEGER DEFAULT 1,
    
    -- Timestamps
    created_at              TIMESTAMP,
    updated_at              TIMESTAMP,
    
    CONSTRAINT fk_email_accounts_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email_address);


-- ───────────────────────────────────────────────────────────────────────────
-- 6. EMAIL_THREADS TABLE (Gmail thread tracking)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_threads (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    thread_id               TEXT,                       -- Gmail thread ID
    subject                 TEXT,
    snippet                 TEXT,
    last_message_from       TEXT,
    last_message_at         TIMESTAMP,
    
    -- Thread state flags
    is_dismissed            INTEGER DEFAULT 0,
    replied_by_user         INTEGER DEFAULT 0,
    last_sender_is_user     INTEGER DEFAULT 0,
    reply_generated         INTEGER DEFAULT 0,
    is_automated            INTEGER DEFAULT 0,          -- Newsletter/notification detection
    is_filtered             INTEGER DEFAULT 0,
    is_actionable           INTEGER DEFAULT 1,
    
    -- Thread metadata
    type                    TEXT,                       -- client_proposal, lead, payment, etc.
    importance              TEXT,
    priority_score          INTEGER DEFAULT 0,
    priority_level          TEXT DEFAULT 'low',
    days_silent             INTEGER DEFAULT 0,
    
    -- Follow-up tracking
    last_followup_sent_at   TIMESTAMP,
    
    -- Timestamps
    created_at              TIMESTAMP,
    updated_at              TIMESTAMP,
    
    CONSTRAINT fk_email_threads_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_threads_user_id ON email_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_thread_id ON email_threads(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_is_dismissed ON email_threads(is_dismissed);
CREATE INDEX IF NOT EXISTS idx_email_threads_replied ON email_threads(replied_by_user);
CREATE INDEX IF NOT EXISTS idx_email_threads_automated ON email_threads(is_automated);


-- ═══════════════════════════════════════════════════════════════════════════
-- AI REPLY GENERATION & QUEUE
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 7. FOLLOWUP_SUGGESTIONS TABLE (AI-generated follow-ups)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_suggestions (
    id                      TEXT PRIMARY KEY,
    thread_id               TEXT NOT NULL,
    user_id                 TEXT NOT NULL,
    
    -- AI-generated content
    generated_text          TEXT,
    tone                    TEXT DEFAULT 'professional',
    priority                TEXT DEFAULT 'normal',
    status                  TEXT DEFAULT 'pending',     -- pending, sent, dismissed
    auto_sent               INTEGER DEFAULT 0,
    
    -- AI metadata
    confidence_score        INTEGER,                    -- 0-100
    category                TEXT,                       -- faq, inquiry, follow_up, etc.
    
    -- Timestamps
    generated_at            TIMESTAMP,
    sent_at                 TIMESTAMP,
    updated_at              TIMESTAMP,
    
    CONSTRAINT fk_followup_thread FOREIGN KEY(thread_id) REFERENCES email_threads(id) ON DELETE CASCADE,
    CONSTRAINT fk_followup_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_followup_thread_id ON followup_suggestions(thread_id);
CREATE INDEX IF NOT EXISTS idx_followup_user_id ON followup_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_followup_status ON followup_suggestions(status);


-- ───────────────────────────────────────────────────────────────────────────
-- 8. EMAIL_QUEUE TABLE (Feature 2: Smart Reply Mode queue)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_queue (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    followup_id             TEXT,
    to_email                TEXT,
    subject                 TEXT,
    body                    TEXT,
    
    -- Queue status
    status                  TEXT DEFAULT 'queued',      -- queued, sent, cancelled, failed
    scheduled_at            TIMESTAMP,                  -- When to send
    cancelled               INTEGER DEFAULT 0,
    cancelled_at            TIMESTAMP,
    sent_at                 TIMESTAMP,
    error_message           TEXT,
    
    -- Timestamps
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_email_queue_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_queue_user_id ON email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_at);


-- ═══════════════════════════════════════════════════════════════════════════
-- FEATURE 3: INBOX PREVIEW SYSTEM (Google-reviewer-friendly)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 9. INBOX_MESSAGES TABLE (AI reply suggestions for inbox preview)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_messages (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    thread_id               TEXT,                       -- Link to email_threads
    
    -- Message & Reply
    message                 TEXT,                       -- Original message snippet
    reply                   TEXT,                       -- AI-generated reply
    
    -- Status & Configuration
    status                  TEXT DEFAULT 'pending',     -- pending, sent, discarded
    platform                TEXT DEFAULT 'gmail',
    tone                    TEXT DEFAULT 'professional',
    
    -- Timestamps
    sent_at                 TIMESTAMP,                  -- When reply was sent
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_inbox_messages_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_id ON inbox_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_id ON inbox_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_status ON inbox_messages(status);


-- ───────────────────────────────────────────────────────────────────────────
-- 10. SMART_REPLY_LOGS TABLE (Feature 2 & 3: Reply tracking)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smart_reply_logs (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    thread_id               TEXT,
    
    -- Message & Reply
    message_snippet         TEXT,                       -- First 200 chars of message
    generated_reply         TEXT,                       -- AI-generated reply
    
    -- Configuration
    platform                TEXT DEFAULT 'gmail',
    tone                    TEXT DEFAULT 'professional',
    status                  TEXT DEFAULT 'pending',     -- pending, sent, failed
    
    -- Timestamps
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_smart_reply_logs_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_smart_reply_logs_user_id ON smart_reply_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_reply_logs_thread_id ON smart_reply_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_smart_reply_logs_status ON smart_reply_logs(status);
CREATE INDEX IF NOT EXISTS idx_smart_reply_logs_created_at ON smart_reply_logs(created_at);


-- ═══════════════════════════════════════════════════════════════════════════
-- FEATURE 1: GOOGLE OAUTH PERMISSION TRACKING (Compliance & Audit)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 11. PERMISSION_LOGS TABLE (Audit trail for Google verification)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission_logs (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    
    -- Action details
    action                  TEXT NOT NULL,              -- consent_given, gmail_read, reply_sent, etc.
    resource                TEXT,                       -- inbox, gmail, etc.
    platform                TEXT,                       -- gmail, instagram, etc.
    details                 TEXT,                       -- Additional context
    
    -- Timestamps
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_permission_logs_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_permission_logs_user_id ON permission_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_logs_action ON permission_logs(action);
CREATE INDEX IF NOT EXISTS idx_permission_logs_created_at ON permission_logs(created_at);


-- ═══════════════════════════════════════════════════════════════════════════
-- TRACKING & ANALYTICS
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 12. USAGE_TRACKING TABLE (Daily usage metrics)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_tracking (
    user_id                 TEXT NOT NULL,
    date                    DATE NOT NULL,
    
    -- Metrics
    followups_generated     INTEGER DEFAULT 0,
    followups_sent          INTEGER DEFAULT 0,
    emails_scanned          INTEGER DEFAULT 0,
    
    PRIMARY KEY (user_id, date),
    CONSTRAINT fk_usage_tracking_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_date ON usage_tracking(date);


-- ───────────────────────────────────────────────────────────────────────────
-- 13. AUTO_SEND_LOGS TABLE (Auto-send event tracking)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_send_logs (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    followup_id             TEXT,
    
    -- Status
    status                  TEXT,                       -- success, failed
    error                   TEXT,
    
    -- Timestamps
    sent_at                 TIMESTAMP,
    
    CONSTRAINT fk_auto_send_logs_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auto_send_logs_user_id ON auto_send_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_send_logs_sent_at ON auto_send_logs(sent_at);


-- ───────────────────────────────────────────────────────────────────────────
-- 14. FOLLOWUP_LOGS TABLE (Follow-up generation tracking)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_logs (
    id                      TEXT PRIMARY KEY,
    thread_id               TEXT,
    user_id                 TEXT NOT NULL,
    
    -- Status & Reason
    status                  TEXT,                       -- generated, sent, failed
    reason                  TEXT,                       -- Why action was taken
    
    -- Timestamps
    created_at              TIMESTAMP,
    
    CONSTRAINT fk_followup_logs_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_followup_logs_user_id ON followup_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_followup_logs_thread_id ON followup_logs(thread_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- SYSTEM TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 15. CRON_LOCKS TABLE (Prevent duplicate cron job execution)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_locks (
    name                    TEXT PRIMARY KEY,           -- Job name
    locked_at               TIMESTAMP,
    locked_by               TEXT                        -- Worker ID
);


-- ═══════════════════════════════════════════════════════════════════════════
-- POSTGRESQL-SPECIFIC INDEXES (Uncomment if using PostgreSQL)
-- ═══════════════════════════════════════════════════════════════════════════

/*
-- Full-text search indexes for messages/replies
CREATE INDEX IF NOT EXISTS idx_email_threads_subject_gin 
    ON email_threads USING GIN(to_tsvector('english', subject));

CREATE INDEX IF NOT EXISTS idx_email_threads_snippet_gin 
    ON email_threads USING GIN(to_tsvector('english', snippet));

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_threads_user_status 
    ON email_threads(user_id, is_dismissed, replied_by_user);

CREATE INDEX IF NOT EXISTS idx_followups_user_status 
    ON followup_suggestions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_queue_user_scheduled 
    ON email_queue(user_id, status, scheduled_at);
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- SUMMARY OF TABLES
-- ═══════════════════════════════════════════════════════════════════════════

/*
TOTAL TABLES: 15

CORE TABLES (2):
  1. users                      - User accounts & authentication
  2. profiles                   - Extended user profiles

SETTINGS TABLES (2):
  3. user_settings              - General app settings
  4. smart_reply_settings       - Smart Reply Mode configuration

EMAIL MANAGEMENT (2):
  5. email_accounts             - Gmail OAuth tokens
  6. email_threads              - Email thread tracking

AI & QUEUE (3):
  7. followup_suggestions       - AI-generated follow-ups
  8. email_queue                - Smart Reply Mode queue
  9. inbox_messages             - Inbox Preview suggestions

LOGGING & TRACKING (4):
  10. smart_reply_logs          - Smart Reply activity log
  11. permission_logs           - Google OAuth audit trail
  12. usage_tracking            - Daily usage metrics
  13. auto_send_logs            - Auto-send event log
  14. followup_logs             - Follow-up generation log

SYSTEM (1):
  15. cron_locks                - Cron job coordination


KEY FEATURES BY TABLE:

Feature 1 (Google OAuth Permission Awareness):
  - users.user_consent, users.consent_accepted_at
  - permission_logs (audit trail)

Feature 2 (Smart Reply Mode):
  - smart_reply_settings (configuration)
  - email_queue (queue management)
  - smart_reply_logs (activity tracking)

Feature 3 (Inbox Preview System):
  - inbox_messages (AI suggestions)
  - smart_reply_logs (shared with Feature 2)

Feature 4 (Contact Form):
  - No database tables (uses Brevo API directly)


STORAGE REQUIREMENTS (Estimated):

Development (SQLite):
  - Initial: ~5MB
  - Per user: ~2MB (includes threads, logs)
  - 100 users: ~200MB

Production (PostgreSQL):
  - Initial: ~10MB
  - Per user: ~3MB (with indexes)
  - 1000 users: ~3GB
  - 10000 users: ~30GB
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
