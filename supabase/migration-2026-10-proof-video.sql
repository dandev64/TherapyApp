-- ============================================
-- HabitOT — Video proof (Oct 2026)
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Proof videos are stored in Cloudflare R2, not Supabase Storage. This column
-- records which R2 object belongs to a task:
--   {"key": "<patient>/<task>-<ms>.webm", "size": 9123456,
--    "uploaded_at": "2026-10-19T03:00:00Z", "duration": 58}
-- Only the proof-video Edge Function writes it, using the service role.
-- R2 deletes the file itself 10 days after upload (bucket lifecycle rule);
-- the app then shows "Video expired".
-- ============================================

ALTER TABLE public.task_assignments ADD COLUMN IF NOT EXISTS proof_video jsonb;

-- ============================================
-- Done. Now run migration-2026-10-proof-video-verify.sql to confirm.
-- ============================================
