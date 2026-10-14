-- ============================================
-- HabitOT — verify migration-2026-10-disk-io.sql applied cleanly
-- Read-only. Run each query on its own; the SQL Editor shows only the
-- last result set when several are run together.
-- ============================================


-- 1. Scheduled jobs.
-- Expect exactly these four, and NO 'patient-task-reminder':
--   patient-daily-email-digest   0 23 * * *   (7 AM Manila)
--   publish-scheduled-tasks      */5 * * * *
--   patient-inapp-reminders      */5 * * * *
--   cleanup-email-log            0 0 * * *
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobname;


-- 2. Email opt-in. opted_in should equal total_profiles.
SELECT count(*) FILTER (WHERE email_notifications_enabled) AS opted_in,
       count(*)                                           AS total_profiles
FROM public.profiles;


-- 3. Column default is now true.
SELECT column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
  AND column_name  = 'email_notifications_enabled';


-- 4. pg_net backlog drained. Both should be 0, or near it.
SELECT (SELECT count(*) FROM net.http_request_queue) AS queued,
       (SELECT count(*) FROM net._http_response)     AS stored_responses;


-- ============================================
-- Run this one the morning AFTER the first 7 AM digest
-- ============================================

-- 5. Did the digest fire, and did it queue emails?
--    email_log should gain one row per task reminder scheduled that day.
SELECT reference_date, count(*) AS emails_scheduled
FROM public.email_log
WHERE reference_date >= (now() AT TIME ZONE 'Asia/Manila')::date - 2
GROUP BY reference_date
ORDER BY reference_date DESC;

-- 6. Confirm the daily job ran without error.
SELECT status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'patient-daily-email-digest')
ORDER BY start_time DESC
LIMIT 5;

-- 7. Disk IO re-check. net._http_response should no longer dominate.
--    Compare against the baseline: 1,818,782 blocks written.
SELECT schemaname, relname,
       heap_blks_read + heap_blks_hit AS blocks_touched
FROM pg_statio_user_tables
WHERE schemaname IN ('net', 'public')
ORDER BY blocks_touched DESC
LIMIT 10;
