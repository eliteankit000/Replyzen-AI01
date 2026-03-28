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
