-- ============================================
-- HabitOT — verify migration-2026-10-feedback-read.sql
-- Read-only. Run each query on its own.
-- ============================================

-- 1. Expect one row: task_feedback.therapist_read_at
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'task_feedback' AND column_name = 'therapist_read_at';


-- 2. Expect anon = false, authenticated = true
SELECT proname,
       has_function_privilege('anon', oid, 'execute') AS anon,
       has_function_privilege('authenticated', oid, 'execute') AS authenticated
FROM pg_proc
WHERE proname = 'mark_task_feedback_read';


-- 3. Existing comments were marked read. Expect unread = 0 right after the migration.
SELECT count(*) FILTER (WHERE therapist_read_at IS NULL AND btrim(coalesce(note, '')) <> '') AS unread,
       count(*) AS total
FROM public.task_feedback;
