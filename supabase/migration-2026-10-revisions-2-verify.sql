-- ============================================
-- HabitOT — verify migration-2026-10-revisions-2.sql
-- Read-only. Run each query on its own; the SQL Editor only shows the last
-- result set when several run together.
-- ============================================


-- 1. New columns. Expect two rows:
--    caregiver_notes.therapist_read_at, patient_assignments.archived_at
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'caregiver_notes' AND column_name = 'therapist_read_at')
    OR (table_name = 'patient_assignments' AND column_name = 'archived_at'));


-- 2. New functions. Expect mark_client_note_read and set_patient_archived.
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('mark_client_note_read', 'set_patient_archived');


-- 3. Notification policies. Expect SELECT, INSERT, UPDATE -- and NO DELETE.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
ORDER BY cmd;


-- 4. Rest-day guard is in the trigger function. Expect true.
SELECT position('is_rest_day' IN prosrc) > 0 AS skips_rest_days
FROM pg_proc
WHERE proname = 'notify_patient_new_task';
