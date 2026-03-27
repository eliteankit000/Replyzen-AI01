-- ═══════════════════════════════════════════════════════════════════════════
-- REPLYZEN AI - PRODUCTION DATABASE MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this in your Supabase SQL Editor
-- Go to: https://app.supabase.com/project/_/sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_connected INTEGER DEFAULT 0;

-- Update existing users to mark them as onboarded (they logged in with old flow)
UPDATE users SET is_onboarded = 1 WHERE is_onboarded IS NULL OR is_onboarded = 0;

-- Mark users with active email accounts as gmail_connected
UPDATE users 
SET gmail_connected = 1 
WHERE id IN (
  SELECT DISTINCT user_id 
  FROM email_accounts 
  WHERE is_active = 1
);

-- Verify columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('is_onboarded', 'gmail_connected');

-- Expected output:
-- is_onboarded    | integer | 0
-- gmail_connected | integer | 0

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- ═══════════════════════════════════════════════════════════════════════════

-- Check your users table structure
SELECT id, email, is_onboarded, gmail_connected 
FROM users 
LIMIT 5;

-- ✅ If you see is_onboarded and gmail_connected columns, you're good to go!
