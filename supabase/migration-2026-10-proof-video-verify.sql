-- ============================================
-- HabitOT — verify migration-2026-10-proof-video.sql
-- Read-only.
-- ============================================

-- Expect one row: task_assignments.proof_video, jsonb
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'task_assignments'
  AND column_name = 'proof_video';
