-- ============================================
-- HabitOT — complete_task says whether it completed the task
-- ============================================
-- A repeated call on an already-completed task changes nothing (see
-- migration-2026-10-complete-task-once.sql), but it reported plain success,
-- so the app couldn't tell the patient their second submission was not saved.
-- It now returns 'completed' or 'already_completed'.
--
-- Paste into the Supabase SQL Editor BEFORE pushing the matching frontend.
-- Safe to re-run. The return type changes, so the old function is dropped first.
-- ============================================

DROP FUNCTION IF EXISTS public.complete_task(uuid, text[], text, text);

CREATE FUNCTION public.complete_task(
  p_task_id uuid,
  p_proof_urls text[] DEFAULT NULL,
  p_mood text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS text
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
    -- Already completed (another device, or a repeated submit): nothing saved
    IF EXISTS (
      SELECT 1 FROM public.task_assignments
      WHERE id = p_task_id AND patient_id = auth.uid() AND status = 'completed'
    ) THEN
      RETURN 'already_completed';
    END IF;
    RAISE EXCEPTION 'Task not found' USING ERRCODE = '42501';
  END IF;

  IF p_mood IS NOT NULL THEN
    INSERT INTO public.task_feedback (task_assignment_id, patient_id, mood, note)
    VALUES (p_task_id, auth.uid(), p_mood, NULLIF(btrim(p_note), ''));
  END IF;
  RETURN 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task(uuid, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid, text[], text, text) TO authenticated;
