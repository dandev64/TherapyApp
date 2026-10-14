-- ============================================
-- HabitOT — Disk IO fix (Oct 2026)
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Diagnosis (from `supabase inspect db`, 204 days of stats):
--   net._http_response  1,818,782 blocks written  -- 99.8% of all write IO
--   public.* combined          ~50 blocks written
--
-- Top queries by execution time:
--   45.0%  DELETE FROM net._http_response       (pg_net TTL cleanup worker)
--   23.5%  SELECT net.http_post(...)            18,363 calls
--   17.0%  SELECT publish_scheduled_tasks()     14,207 calls
--    3.4%  SELECT generate_patient_task_reminders()
--
-- ~70% of all database work was the pg_net machinery driven by the
-- 'patient-task-reminder' cron firing every 15 minutes. The application tables
-- are fine: 136 kB total, cache hit rate 1.00, no bloat. This is a scheduling
-- problem, not a query problem, so there are no new indexes here.
--
-- The fix keeps email reminders working. Instead of Postgres waking up 96 times
-- a day to ask "is anything due soon", it wakes once at 7 AM and hands Resend
-- every send for the day with a scheduled_at timestamp. Resend does the waiting.
--
-- REQUIRES the matching Edge Function deploy:
--   supabase functions deploy send-email-reminders
-- ============================================


-- ============================================
-- 1. STOP THE 15-MINUTE POLLING CRON
-- ============================================

DO $$
BEGIN
  PERFORM cron.unschedule('patient-task-reminder');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'patient-task-reminder was not scheduled';
END;
$$;


-- ============================================
-- 2. CLEAR THE pg_net BACKLOG
-- ============================================
-- Responses are an ephemeral cache with a 6-hour TTL, so dropping them loses
-- nothing. With the producer stopped these stay near-empty and the cleanup
-- worker (the 45% query above) goes idle.
--
-- Wrapped because the SQL Editor runs this whole file in one transaction: if
-- the net schema is not truncatable by this role, we still want the cron
-- changes above and below to commit. Left alone the TTL clears it in 6 hours.

DO $$
BEGIN
  TRUNCATE net._http_response;
  TRUNCATE net.http_request_queue;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not truncate pg_net tables (%). The 6-hour TTL will clear them.', SQLERRM;
END;
$$;


-- ============================================
-- 3. DAILY DIGEST AT 7 AM MANILA
-- ============================================
-- 23:00 UTC = 07:00 UTC+8. One pg_net call a day instead of 96.

DO $$
BEGIN
  PERFORM cron.unschedule('patient-daily-email-digest');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'patient-daily-email-digest',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://afzprgdowymgvmxtrqzc.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmenByZ2Rvd3ltZ3ZteHRycXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTk4NDMsImV4cCI6MjA4OTg5NTg0M30.lpxLOf09xwrFGqsz5aB86CX78tFyVq2W3Y3nU-OvaFg'
    ),
    body := '{"type": "patient"}'::jsonb
  );
  $$
);


-- ============================================
-- 4. EMAIL REMINDERS ON BY DEFAULT
-- ============================================
-- The column defaulted to false and nothing in the app ever wrote it, so no
-- patient was ever opted in -- which is why 18,363 cron runs produced 21 rows
-- in email_log. New accounts now start enabled, and existing ones are switched
-- on.

ALTER TABLE public.profiles
  ALTER COLUMN email_notifications_enabled SET DEFAULT true;

UPDATE public.profiles
  SET email_notifications_enabled = true
  WHERE email_notifications_enabled IS DISTINCT FROM true;


-- ============================================
-- 5. SLOW THE PUBLISH JOB TO EVERY 5 MINUTES
-- ============================================
-- 17% of execution time across 14,207 runs. Scheduled tasks will post up to
-- 5 minutes after their set time. Drop this section if minute-level precision
-- matters for scheduled task posting.

SELECT cron.schedule(
  'publish-scheduled-tasks',
  '*/5 * * * *',
  $$ SELECT public.publish_scheduled_tasks(); $$
);


-- ============================================
-- Done. Now run migration-2026-10-disk-io-verify.sql to confirm.
-- (Separate file because the SQL Editor only shows the last result set.)
-- ============================================
