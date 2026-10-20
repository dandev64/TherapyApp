-- ============================================
-- HabitOT — Task comments count as unread Client Notes (Oct 2026)
-- Run in the Supabase SQL Editor BEFORE pushing the matching app code.
-- Safe to re-run. Paste the whole file at once.
--
-- The comment a patient/caregiver writes when submitting a task
-- (task_feedback.note) is shown under Client Notes. Until now it had no read
-- status, so it never appeared in "Unread Client Notes".
-- ============================================

ALTER TABLE public.task_feedback ADD COLUMN IF NOT EXISTS therapist_read_at timestamptz;

-- Comments submitted before this change count as read, so therapists aren't
-- handed the whole history as "unread". Only the first run backfills.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.task_feedback WHERE therapist_read_at IS NOT NULL) THEN
    UPDATE public.task_feedback SET therapist_read_at = now() WHERE therapist_read_at IS NULL;
  END IF;
END $$;

-- RLS can't limit an UPDATE to one column, so marking read goes through this
-- function: it only sets therapist_read_at, and only for the patient's therapist.
-- Same shape as mark_client_note_read (migration-2026-10-revisions-2.sql).
CREATE OR REPLACE FUNCTION public.mark_task_feedback_read(p_feedback_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.task_feedback tf
  SET therapist_read_at = now()
  WHERE tf.id = p_feedback_id
    AND tf.therapist_read_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.patient_assignments pa
      WHERE pa.patient_id = tf.patient_id
        AND pa.assigned_to = auth.uid()
        AND pa.relationship = 'therapist'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.mark_task_feedback_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_task_feedback_read(uuid) TO authenticated;

-- ============================================
-- ============================================
