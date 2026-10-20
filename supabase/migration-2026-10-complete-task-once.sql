-- ============================================
-- HabitOT — complete_task is safe to repeat
-- ============================================
-- If the response to a submit is lost, the app (or the patient tapping Submit
-- again) can call complete_task for a task that already completed. That used
-- to overwrite its proof and insert a second comment (a duplicate unread
-- client note). Now a second call changes nothing.
-- Paste into the Supabase SQL Editor. Safe to re-run.
-- ============================================

CREATE OR REPLACE FUNCTION public.complete_task(
  p_task_id uuid,
  p_proof_urls text[] DEFAULT NULL,
  p_mood text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.task_assignments
  SET status = 'completed',
      completed_at = now(),
      proof_url = p_proof_urls[1],
      proof_urls = NULLIF(p_proof_urls, '{}')
  WHERE id = p_task_id
    AND patient_id = auth.uid()
    AND status <> 'completed';

  IF NOT FOUND THEN
    -- Already completed (a repeated submit): nothing more to do
    IF EXISTS (
      SELECT 1 FROM public.task_assignments
      WHERE id = p_task_id AND patient_id = auth.uid() AND status = 'completed'
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501';
  END IF;

  IF p_mood IS NOT NULL THEN
    INSERT INTO public.task_feedback (task_assignment_id, patient_id, mood, note)
    VALUES (p_task_id, auth.uid(), p_mood, NULLIF(btrim(p_note), ''));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task(uuid, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid, text[], text, text) TO authenticated;
