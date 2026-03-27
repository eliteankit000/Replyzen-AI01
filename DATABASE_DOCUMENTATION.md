# REPLYZEN AI - DATABASE ENTITY RELATIONSHIP DOCUMENTATION

## 📊 DATABASE OVERVIEW

**Total Tables:** 15  
**Database Types:** PostgreSQL (Production) / SQLite (Development)  
**Primary Key Type:** UUID stored as TEXT

---

## 🗂️ TABLE CATEGORIES

### 1. CORE TABLES (2)
- `users` - User accounts & authentication
- `profiles` - Extended user information

### 2. SETTINGS TABLES (2)
- `user_settings` - General application settings
- `smart_reply_settings` - Smart Reply Mode configuration

### 3. EMAIL MANAGEMENT (2)
- `email_accounts` - Gmail OAuth tokens
- `email_threads` - Email thread tracking & metadata

### 4. AI & QUEUE (3)
- `followup_suggestions` - AI-generated follow-up drafts
- `email_queue` - Smart Reply Mode sending queue
- `inbox_messages` - Inbox Preview AI suggestions

### 5. LOGGING & TRACKING (4)
- `smart_reply_logs` - Smart Reply activity log
- `permission_logs` - Google OAuth audit trail (compliance)
- `usage_tracking` - Daily usage metrics per user
- `auto_send_logs` - Auto-send event tracking
- `followup_logs` - Follow-up generation tracking

### 6. SYSTEM (1)
- `cron_locks` - Cron job coordination & locking

---

## 🔗 ENTITY RELATIONSHIPS

```
┌─────────────────────────────────────────────────────────────────┐
│                           USERS (Core)                          │
│  • Authentication & Profile                                     │
│  • Google OAuth Consent                                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ (1:1)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                         PROFILES                                │
│  • Extended user information                                    │
└─────────────────────────────────────────────────────────────────┘

                  USERS (1) ──────→ (Many) RELATIONSHIPS
                            │
        ┌───────────────────┼───────────────────┬──────────────────┐
        │                   │                   │                  │
        ↓                   ↓                   ↓                  ↓
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
│user_settings │  │smart_reply_      │  │email_        │  │permission_   │
│              │  │settings          │  │accounts      │  │logs          │
│              │  │                  │  │              │  │              │
│(1:1)         │  │(1:1)             │  │(1:Many)      │  │(1:Many)      │
└──────────────┘  └──────────────────┘  └──────────────┘  └──────────────┘

                            USERS
                            │
        ┌───────────────────┼───────────────────┬──────────────────┐
        │                   │                   │                  │
        ↓                   ↓                   ↓                  ↓
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐
│email_threads │  │inbox_messages    │  │email_queue   │  │usage_        │
│              │  │                  │  │              │  │tracking      │
│(1:Many)      │  │(1:Many)          │  │(1:Many)      │  │(1:Many)      │
└──────┬───────┘  └──────────────────┘  └──────────────┘  └──────────────┘
       │
       │ (1:Many)
       ↓
┌──────────────────┐
│followup_         │
│suggestions       │
│                  │
│(1:Many)          │
└──────────────────┘

```

---

## 📋 DETAILED TABLE RELATIONSHIPS

### PRIMARY RELATIONSHIPS

#### **users → profiles** (1:1)
- **Foreign Key:** `profiles.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Extended user profile information

#### **users → user_settings** (1:1)
- **Foreign Key:** `user_settings.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** General app configuration per user

#### **users → smart_reply_settings** (1:1)
- **Foreign Key:** `smart_reply_settings.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Smart Reply Mode configuration

#### **users → email_accounts** (1:Many)
- **Foreign Key:** `email_accounts.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Multiple Gmail accounts per user

#### **users → email_threads** (1:Many)
- **Foreign Key:** `email_threads.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Track email conversations

#### **email_threads → followup_suggestions** (1:Many)
- **Foreign Key:** `followup_suggestions.thread_id` → `email_threads.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** AI-generated follow-ups for each thread

#### **users → inbox_messages** (1:Many)
- **Foreign Key:** `inbox_messages.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Inbox Preview AI suggestions

#### **users → email_queue** (1:Many)
- **Foreign Key:** `email_queue.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Smart Reply Mode queue items

---

### LOGGING & TRACKING RELATIONSHIPS

#### **users → permission_logs** (1:Many)
- **Foreign Key:** `permission_logs.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Google OAuth compliance audit trail

#### **users → smart_reply_logs** (1:Many)
- **Foreign Key:** `smart_reply_logs.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Smart Reply activity tracking

#### **users → usage_tracking** (1:Many)
- **Foreign Key:** Composite key `(user_id, date)`
- **Cascade:** DELETE CASCADE
- **Purpose:** Daily usage metrics

#### **users → auto_send_logs** (1:Many)
- **Foreign Key:** `auto_send_logs.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Auto-send event tracking

#### **users → followup_logs** (1:Many)
- **Foreign Key:** `followup_logs.user_id` → `users.id`
- **Cascade:** DELETE CASCADE
- **Purpose:** Follow-up generation tracking

---

## 🔐 KEY FIELDS BY FEATURE

### FEATURE 1: Google OAuth Permission Awareness

**Tables Modified:**
- `users` table:
  - `user_consent` (INTEGER) - 0 = not given, 1 = given
  - `consent_accepted_at` (TIMESTAMP) - When consent was given

**New Table:**
- `permission_logs`:
  - Tracks all permission-related actions
  - Used for Google OAuth verification compliance
  - Actions: consent_given, gmail_read, reply_sent, etc.

**Purpose:**
- Audit trail for Google verification
- User consent tracking
- Compliance with Google OAuth policies

---

### FEATURE 2: Smart Reply Mode

**New Table:**
- `smart_reply_settings`:
  - `enabled` - Smart Reply on/off
  - `smart_reply_mode` - manual or auto
  - `confidence_threshold` - Minimum confidence for auto-send
  - `daily_limit` - Max replies per day
  - `delay_seconds` - Queue delay before sending
  - `allowed_categories` - Which message types to reply to

**Modified Table:**
- `email_queue`:
  - Stores queued emails with scheduled send time
  - Status tracking (queued, sent, cancelled, failed)

**New Logging Table:**
- `smart_reply_logs`:
  - Tracks all AI reply generations
  - Status tracking for debugging
  - Links to threads for full context

**Purpose:**
- User-controlled AI reply automation
- Both manual approval and auto-send modes
- Rate limiting and daily limits
- Safety features and audit logging

---

### FEATURE 3: Inbox Preview System

**New Tables:**
- `inbox_messages`:
  - Stores AI-generated reply suggestions
  - Links to email threads
  - Tracks approval and sending status

**Shared Tables:**
- `smart_reply_logs` (shared with Feature 2)
- `permission_logs` (shared with Feature 1)

**Purpose:**
- Google-reviewer-friendly inbox preview
- Manual approval required for all sends
- Clear audit trail
- Read-only message access

---

### FEATURE 4: Contact Form (Brevo Integration)

**Database Tables:** NONE

**Purpose:**
- Contact form submissions sent directly via Brevo API
- No database storage needed
- Emails sent to: hello@replyzenai.com
- Professional HTML email templates

---

## 📊 INDEX STRATEGY

### PRIMARY INDEXES (Auto-created on PRIMARY KEY)
- All tables have PRIMARY KEY on `id` field

### FOREIGN KEY INDEXES
```sql
-- User relationships
idx_profiles_user_id
idx_user_settings_user_id
idx_smart_reply_user_id
idx_email_accounts_user_id
idx_email_threads_user_id

-- Thread relationships
idx_followup_thread_id
idx_inbox_messages_thread_id

-- Status & filtering
idx_email_threads_is_dismissed
idx_email_threads_replied
idx_email_threads_automated
idx_followup_status
idx_email_queue_status

-- Time-based queries
idx_email_queue_scheduled
idx_permission_logs_created_at
idx_smart_reply_logs_created_at
idx_auto_send_logs_sent_at
```

### COMPOSITE INDEXES (For common queries)
```sql
-- User + status combinations
CREATE INDEX idx_threads_user_status 
  ON email_threads(user_id, is_dismissed, replied_by_user);

CREATE INDEX idx_followups_user_status 
  ON followup_suggestions(user_id, status);

CREATE INDEX idx_queue_user_scheduled 
  ON email_queue(user_id, status, scheduled_at);
```

---

## 💾 STORAGE ESTIMATES

### Development (SQLite)
- **Initial:** ~5MB
- **Per User:** ~2MB (includes threads, logs)
- **100 Users:** ~200MB
- **1000 Users:** ~2GB

### Production (PostgreSQL)
- **Initial:** ~10MB (with indexes)
- **Per User:** ~3MB (includes all data + indexes)
- **1000 Users:** ~3GB
- **10,000 Users:** ~30GB
- **100,000 Users:** ~300GB

### Growth Factors
- Email threads: Most significant growth
- Logs: Moderate growth (pruning recommended)
- Settings: Minimal growth (per user)

---

## 🔄 DATA LIFECYCLE

### AUTOMATIC CLEANUP RECOMMENDATIONS

```sql
-- Delete old permission logs (keep 90 days)
DELETE FROM permission_logs 
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete old smart reply logs (keep 30 days)
DELETE FROM smart_reply_logs 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Delete sent/cancelled queue items (keep 7 days)
DELETE FROM email_queue 
WHERE status IN ('sent', 'cancelled') 
  AND created_at < NOW() - INTERVAL '7 days';

-- Delete old auto send logs (keep 30 days)
DELETE FROM auto_send_logs 
WHERE sent_at < NOW() - INTERVAL '30 days';

-- Archive old email threads (> 1 year, dismissed)
DELETE FROM email_threads 
WHERE is_dismissed = 1 
  AND updated_at < NOW() - INTERVAL '1 year';
```

---

## 🔍 COMMON QUERIES

### Get User's Active Threads Needing Reply
```sql
SELECT * FROM email_threads
WHERE user_id = ? 
  AND is_dismissed = 0
  AND replied_by_user = 0
  AND is_automated = 0
ORDER BY last_message_at DESC;
```

### Get Smart Reply Queue Items
```sql
SELECT * FROM email_queue
WHERE user_id = ?
  AND status = 'queued'
  AND scheduled_at <= NOW()
ORDER BY scheduled_at ASC;
```

### Get User's Daily Smart Reply Count
```sql
SELECT COUNT(*) FROM smart_reply_logs
WHERE user_id = ?
  AND status = 'sent'
  AND created_at >= CURRENT_DATE;
```

### Permission Audit Trail
```sql
SELECT * FROM permission_logs
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 100;
```

---

## 🚀 DEPLOYMENT NOTES

### PostgreSQL (Production)
```sql
-- Use UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Recommended settings
ALTER DATABASE replyzen_ai SET timezone TO 'UTC';
```

### SQLite (Development)
```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;
```

---

## ✅ VERIFICATION CHECKLIST

- [ ] All foreign key constraints defined
- [ ] All indexes created
- [ ] Cascade deletes configured
- [ ] Default values set
- [ ] Timestamps using UTC
- [ ] Text fields sized appropriately
- [ ] Unique constraints on critical fields
- [ ] Composite keys for tracking tables

---

## 📞 SUPPORT

For database schema questions:
- Email: hello@replyzenai.com
- Documentation: /app/DATABASE_SCHEMA.sql
