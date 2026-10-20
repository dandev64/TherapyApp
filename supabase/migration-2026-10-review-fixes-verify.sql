-- Run after migration-2026-10-review-fixes.sql. Every row should say "ok".
SELECT 'H1 messages UPDATE policy dropped' AS check,
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND cmd = 'UPDATE') THEN 'ok' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'H1/H4/M9/M11 functions exist',
  CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname IN ('mark_messages_read', 'inbox_conversations', 'complete_task', 'get_email_cron_secret')) = 4 THEN 'ok' ELSE 'MISSING' END
UNION ALL
SELECT 'H5 caregivers in task SELECT policy',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_assignments' AND cmd = 'SELECT' AND qual LIKE '%caregiver%') THEN 'ok' ELSE 'MISSING' END
UNION ALL
SELECT 'M7 dedupe by assigned day',
  CASE WHEN pg_get_functiondef('public.notify_all_tasks_completed'::regproc) NOT LIKE '%CURRENT_DATE%' THEN 'ok' ELSE 'MISSING' END
UNION ALL
SELECT 'M11 cron sends secret',
  CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'patient-daily-email-digest' AND command LIKE '%x-cron-secret%') THEN 'ok' ELSE 'MISSING' END
UNION ALL
SELECT 'M11 + L1 indexes',
  CASE WHEN (SELECT count(*) FROM pg_indexes WHERE indexname IN ('email_log_unique_send', 'idx_task_assignments_assigned_date', 'idx_notifications_reference')) = 3 THEN 'ok' ELSE 'MISSING' END
UNION ALL
SELECT 'L2 overdue check uses Manila date',
  CASE WHEN pg_get_functiondef('public.check_overdue_tasks'::regproc) LIKE '%Asia/Manila%' THEN 'ok' ELSE 'MISSING' END;
