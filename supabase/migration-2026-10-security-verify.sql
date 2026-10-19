-- ============================================
-- HabitOT — verify migration-2026-10-security.sql
-- Read-only. Run each query on its own; the SQL Editor only shows the last
-- result set when several run together.
-- ============================================


-- 1. New triggers. Expect two rows:
--    profiles.protect_profile_columns, task_assignments.limit_patient_task_updates
SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE tgname IN ('protect_profile_columns', 'limit_patient_task_updates');


-- 2. Who can run the functions. Expect anon = false on every row;
--    authenticated = true only for check_overdue_tasks.
SELECT proname,
       has_function_privilege('anon', oid, 'execute') AS anon,
       has_function_privilege('authenticated', oid, 'execute') AS authenticated
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('publish_scheduled_tasks', 'generate_patient_task_reminders', 'check_overdue_tasks');


-- 3. Tightened policies. Expect both WITH CHECKs to mention patient_assignments / task_assignments.
SELECT tablename, policyname, with_check
FROM pg_policies
WHERE (tablename = 'messages' AND policyname = 'Send messages')
   OR (tablename = 'task_feedback' AND policyname = 'Patients can create feedback');


-- 4. Rest-day index and email_log.provider_id. Expect two rows.
SELECT 'index' AS kind, indexname AS name FROM pg_indexes WHERE indexname = 'task_assignments_one_rest_day'
UNION ALL
SELECT 'column', column_name FROM information_schema.columns
WHERE table_name = 'email_log' AND column_name = 'provider_id';


-- 5. Storage policies for proof photos. Expect 4 rows: one each for
--    SELECT, INSERT, UPDATE, DELETE.
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd;
