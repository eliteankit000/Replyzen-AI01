
# Replyzen AI — Replit Project

## Overview
Full-stack AI email reply assistant.
- **Frontend**: React + CRACO (port 3000)
- **Backend**: Python FastAPI + uvicorn (port 8000)
- **Database**: Supabase (PostgreSQL)
- **Auth**: JWT (custom) + Google OAuth

## Workflows
- `Start application` → `cd frontend && npm start`
- `Backend API` → `cd backend && uvicorn server:app --host 0.0.0.0 --port 8000 --reload`

## Architecture
frontend/          React app (CRACO)
backend/
  server.py        FastAPI app entry point
  auth.py          JWT authentication middleware
  database.py      Async SQLAlchemy engine (Supabase)
  models.py        SQLAlchemy models
  plan_permissions.py  Plan limit checks
  routes/          API route handlers
  services/        Business logic
    gmail_service.py       Gmail OAuth + send
    inbox_service.py       Inbox management
    smart_reply_service.py Smart reply settings + queue
    autosend_cron.py       Auto-send cron job
    openai_service.py      AI reply generation

## Key Environment Variables
| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_DB_URL` | Direct PostgreSQL connection URL |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI API key |
| `ENCRYPTION_KEY` | Fernet key for OAuth token encryption |
| `GMAIL_CLIENT_ID` | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | **Must be set** — backend OAuth callback URL |
| `FRONTEND_URL` | Frontend base URL for redirects |

## Critical Type Casting Rules (Supabase)
Supabase stores primary keys as UUID. All parameterized WHERE comparisons need explicit casts:
- `users.id` → `WHERE id::text = :user_id`
- `email_accounts.user_id` → `WHERE user_id::text = :uid`
- `email_threads.user_id` → `WHERE user_id::text = :uid`
- `followup_suggestions.user_id` → `WHERE user_id::text = :uid`
- `is_active`, `is_dismissed`, etc. (INTEGER columns in Supabase but BOOLEAN in schema) → `column::boolean = true/false`
- `smart_reply_settings.allowed_categories` → TEXT JSON string → use `json.dumps()`/`json.loads()`
- `smart_reply_settings.enabled`, `confirmed_first_use` → INTEGER (0/1) → convert to bool in Python

## Known Configuration Requirements
- `GMAIL_REDIRECT_URI` must be set to the backend's public OAuth callback URL
  (e.g., `https://<backend-domain>/api/emails/gmail/callback` for Replit, or the deployment URL)
  AND this URI must be registered in Google Cloud Console as an authorized redirect URI.
- `FRONTEND_URL` must be set to the frontend's public URL for auth redirects.

## Known Non-Breaking Warnings
- Missing Razorpay/Paddle keys (payment providers not configured)
- `user_consent`/`consent_accepted_at` columns already exist (harmless migration log)
- Supabase BEFORE DELETE trigger on `email_accounts` — workaround: `session_replication_role = replica` + soft-delete fallback
=======
# Replyzen AI

## Overview
Replyzen AI is an AI-powered Gmail follow-up automation platform that detects "silent" email conversations and generates intelligent, tone-specific follow-up drafts using AI.

## Architecture
- **Backend**: Python FastAPI (port 8000) in `backend/`
- **Frontend**: React + Tailwind/Shadcn UI (port 5000) in `frontend/`
- **Database**: Replit PostgreSQL (via `DATABASE_URL` env var)
- **AI**: OpenAI GPT-4o for follow-up generation

## Workflows
- `Backend API`: Runs `python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload` from `backend/`
- `Start application`: Runs `npm start` from `frontend/` (uses craco, port 5000)

## Key Files
- `backend/server.py` - FastAPI app entry point
- `backend/database.py` - SQLAlchemy async DB setup (supports Supabase or Replit Postgres)
- `backend/auth.py` - JWT-based authentication
- `backend/routes/` - API route handlers
- `backend/services/` - Business logic, AI integration, cron jobs
- `frontend/src/lib/api.js` - Axios API client (uses `REACT_APP_REPLIT_DEV_DOMAIN` env var)
- `frontend/src/lib/auth-context.js` - React auth context

## Environment Variables
### Required (set as Replit secrets)
- `DATABASE_URL` - Replit PostgreSQL URL (auto-set by Replit)
- `JWT_SECRET` - JWT signing secret
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` - Google OAuth credentials
- `ENCRYPTION_KEY` - Token encryption key

### Optional
- `SUPABASE_DB_URL` - Supabase PostgreSQL URL (overrides DATABASE_URL if set)
- `REACT_APP_BACKEND_URL` - Override backend URL for frontend
- `REACT_APP_REPLIT_DEV_DOMAIN` - Auto-set for Replit dev domain routing
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` - Razorpay payment keys
- `PADDLE_API_KEY` - Paddle payment keys
- `BREVO_API_KEY` - Brevo email service

## Database
Uses Replit's built-in PostgreSQL (`DATABASE_URL`). Tables are auto-created on startup by `backend/services/db_init.py`.

## Features
- Silent email thread detection (1-10 day thresholds)
- AI follow-up draft generation (Professional/Friendly/Casual tones)
- Gmail OAuth integration
- Subscription plans (Free/Pro/Business) via Razorpay and Paddle
- Analytics dashboard
- Auto-send cron job
