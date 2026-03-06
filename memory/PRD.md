# Replyzen AI - Product Requirements Document

## Original Problem Statement
Build Replyzen AI - an AI-powered Gmail follow-up automation platform that detects silent conversations and generates intelligent follow-up emails. SaaS platform with Landing, Auth, Dashboard, Follow-up Queue, Analytics, Billing, Settings.

## Architecture
- **Backend**: FastAPI (port 8001) + MongoDB
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **AI**: OpenAI GPT-4o (direct API)
- **Payments**: Razorpay (India) + Paddle (International)
- **Gmail**: MOCKED with realistic demo data
- **Auth**: JWT with bcrypt password hashing
- **Theme**: Orange primary (#EA580C), DM Sans font

## User Personas
1. **Sales Professionals** - Need follow-up automation for deal pipeline
2. **Freelancers/Consultants** - Track client communications
3. **Recruiters** - Follow up with candidates
4. **Business Development** - Partnership outreach tracking

## Core Requirements
- Detect silent email threads (configurable 1-10 day threshold)
- AI-generated follow-up drafts (professional/friendly/casual tones)
- One-click send via Gmail API
- Subscription billing (Free/Pro/Business plans)
- Analytics dashboard with performance metrics

## What's Been Implemented (2026-03-06)
### Phase 1: Auth & Infrastructure
- JWT authentication (register/login)
- User profiles with plan management
- MongoDB database with all collections

### Phase 2: Email System
- Gmail connection flow (MOCKED with realistic data)
- Email thread tracking and sync
- Silence detection engine (configurable threshold)

### Phase 3: AI Follow-ups
- OpenAI GPT-4o integration (REAL, working)
- Follow-up draft generation with tone control
- Draft edit, send, dismiss workflow

### Phase 4: Billing
- Razorpay integration (REAL) with subscription creation
- Paddle integration (REAL) with checkout flow
- Free/Pro ($19/mo)/Business ($49/mo) plans
- Webhook handlers for both providers

### Phase 5: Frontend
- Landing page (hero, features, pricing, CTA)
- Login/Signup with tab navigation
- Dashboard with stats + silent threads + pending drafts
- Follow-up Queue with tabs (silent/pending/sent/dismissed)
- Analytics with area charts + top contacts
- Billing with plan cards + checkout buttons
- Settings (profile, email accounts, silence rules, notifications, auto-send)

### Iteration 2: Plan Enforcement & UI Polish (2026-03-06)
- **Central plan permissions**: Backend plan_permissions.py with all plan limits
- **Updated pricing**: Free (30/mo), Pro (2500/mo), Business (unlimited)
- **Backend validation**: All routes check plan limits before executing
  - Followup generation: checks monthly quota + tone permissions
  - Email accounts: checks max account limit
  - Auto-send: checks plan allows it
  - Analytics charts: Pro-only access
- **Frontend plan gating**: 
  - Usage bars on Follow-up Queue and Billing
  - Locked tones in dropdown for Free users
  - Analytics paywall for non-Pro users
  - Auto-send upgrade prompt for Free users
  - Account limit warnings in Settings
- **Sidebar redesign**: 
  - Expand/collapse with smooth transition
  - Tooltips on collapsed icons
  - Mobile hamburger menu with slide-out drawer
  - Lock icon on gated features
  - User plan label

### Iteration 3: Branding & Payment Fixes (2026-03-06)
- **Rebranding completed:**
  - Removed "Made with Emergent" badge via JavaScript
  - Updated page title to "Replyzen AI"
  - Sidebar shows "Replyzen AI" logo
  - All Emergent references removed
- **Sidebar fixes:**
  - Fixed height to viewport (h-screen, position: fixed)
  - Collapse/expand toggle works correctly (260px/68px)
  - Mobile responsive with hamburger menu
- **Payment integration fixes:**
  - Razorpay SDK loaded and checkout flow functional
  - Paddle SDK loaded and checkout flow functional
  - Better error messages for invalid plan IDs
  - Frontend .env fixed (was missing newline)
- **NOTE:** Payments require valid Razorpay plan IDs and Paddle price IDs from user's accounts

## Prioritized Backlog
### P0 (Critical)
- [x] Auth system
- [x] Email thread detection
- [x] AI follow-up generation
- [x] Core dashboard
- [x] Rebranding to Replyzen AI
- [x] Sidebar UI fixes

### P1 (Important)
- [ ] Real Gmail OAuth integration (replace mocks)
- [ ] Auto-send automation with cron
- [ ] Brevo email notifications (daily digest, weekly report)
- [ ] Configure valid Razorpay plan IDs
- [ ] Configure valid Paddle price IDs and seller ID

### P2 (Nice to Have)
- [ ] Team collaboration features
- [ ] Advanced analytics (response rate tracking over time)
- [ ] Bulk follow-up generation
- [ ] Custom AI prompt templates
- [ ] Domain exclusion rules enforcement

## Next Tasks
1. Configure valid Razorpay plan IDs in backend/.env
2. Configure valid Paddle price IDs and PADDLE_SELLER_ID in backend/.env
3. Replace mock Gmail data with real Gmail OAuth flow
4. Implement auto-send cron job system
5. Add Brevo email notifications (daily digest)

## Payment Configuration Required
For payments to work, add these to `/app/backend/.env`:

**Razorpay (create plans in Razorpay Dashboard):**
```
RAZORPAY_PLAN_PRO_MONTHLY=plan_xxx
RAZORPAY_PLAN_PRO_YEARLY=plan_xxx
RAZORPAY_PLAN_BUSINESS_MONTHLY=plan_xxx
RAZORPAY_PLAN_BUSINESS_YEARLY=plan_xxx
```

**Paddle (get IDs from Paddle Dashboard):**
```
PADDLE_SELLER_ID=your_seller_id
PADDLE_PRICE_PRO_MONTHLY=pri_xxx
PADDLE_PRICE_PRO_YEARLY=pri_xxx
PADDLE_PRICE_BUSINESS_MONTHLY=pri_xxx
PADDLE_PRICE_BUSINESS_YEARLY=pri_xxx
```
