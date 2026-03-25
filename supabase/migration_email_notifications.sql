-- =============================================================================
-- HabitOT — Email Notification Infrastructure
-- =============================================================================
--
-- This migration adds the database tables and scheduling needed for
-- email reminders. CURRENTLY COMMENTED OUT.
--
-- How to activate:
--   1. Enable the pg_cron and pg_net extensions in Supabase Dashboard
--      (Database → Extensions → search "pg_cron" and "pg_net" → Enable)
--   2. Deploy the Edge Function first (see send-email-reminders/index.ts)
--   3. Uncomment and run this SQL in the Supabase SQL Editor
--   4. Update YOUR_PROJECT_REF and YOUR_ANON_KEY below
-- =============================================================================

/*

-- 1. Add email opt-in column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT false;

-- 2. Email log table — prevents duplicate sends per day
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_lookup
  ON public.email_log(recipient_id, email_type, reference_date);

-- RLS: only the system (service role) inserts; users can view their own log
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email log"
  ON public.email_log FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- 3. pg_cron schedules
--    These call the Edge Function on a schedule via pg_net.
--    Replace YOUR_PROJECT_REF and YOUR_ANON_KEY with your actual values.

-- Therapist reminder: every day at 8:00 AM UTC
SELECT cron.schedule(
  'therapist-morning-reminder',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body := '{"type": "therapist"}'::jsonb
  );
  $$
);

-- Patient reminder: every hour from 12pm-9pm UTC
SELECT cron.schedule(
  'patient-task-reminder',
  '0 12-21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body := '{"type": "patient"}'::jsonb
  );
  $$
);

-- 4. Clean up old email logs (older than 30 days) — runs daily at midnight
SELECT cron.schedule(
  'cleanup-email-log',
  '0 0 * * *',
  $$
  DELETE FROM public.email_log WHERE sent_at < now() - interval '30 days';
  $$
);

*/
