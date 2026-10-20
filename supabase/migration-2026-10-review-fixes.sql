-- ============================================
-- HabitOT — fixes from the Oct 20 code review
-- ============================================
-- Paste into the Supabase SQL Editor BEFORE pushing the matching frontend
-- (the app calls mark_messages_read, inbox_conversations and complete_task).
-- Safe to re-run. Each section is labelled with its review finding ID.
-- After running, redeploy the email function:
--   supabase functions deploy send-email-reminders
-- ============================================


-- ============================================
-- H1. Recipients could rewrite any column of a message
-- ============================================
-- The UPDATE policy only checked recipient_id, so a recipient could change
-- content or sender_id. Marking read now goes through an RPC that touches
-- read_at only, and direct UPDATEs are no longer allowed.

CREATE OR REPLACE FUNCTION public.mark_messages_read(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  UPDATE public.messages
  SET read_at = v_now
  WHERE id = ANY(p_ids)
    AND recipient_id = auth.uid()
    AND read_at IS NULL;

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, v_now), seen_at = COALESCE(seen_at, v_now)
  WHERE recipient_id = auth.uid()
    AND type = 'new_message'
    AND reference_id = ANY(p_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_messages_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid[]) TO authenticated;

DROP POLICY IF EXISTS "Mark messages as read" ON public.messages;


-- ============================================
-- H4. Inboxes downloaded every message to find the latest one
-- ============================================
-- One row per conversation partner: the latest message and the unread count.
-- SECURITY INVOKER, so the messages SELECT policy still applies.

CREATE OR REPLACE FUNCTION public.inbox_conversations()
RETURNS TABLE (
  peer_id uuid,
  id uuid,
  sender_id uuid,
  recipient_id uuid,
  content text,
  created_at timestamptz,
  read_at timestamptz,
  unread bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH mine AS (
    SELECT m.*,
      CASE WHEN m.sender_id = auth.uid() THEN m.recipient_id ELSE m.sender_id END AS peer
    FROM public.messages m
    WHERE m.sender_id = auth.uid() OR m.recipient_id = auth.uid()
  ),
  latest AS (
    SELECT DISTINCT ON (peer) * FROM mine ORDER BY peer, created_at DESC
  ),
  unread AS (
    SELECT peer, count(*) AS n
    FROM mine
    WHERE recipient_id = auth.uid() AND read_at IS NULL
    GROUP BY peer
  )
  SELECT l.peer, l.id, l.sender_id, l.recipient_id, l.content, l.created_at, l.read_at,
    COALESCE(u.n, 0)
  FROM latest l
  LEFT JOIN unread u ON u.peer = l.peer;
$$;

REVOKE ALL ON FUNCTION public.inbox_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inbox_conversations() TO authenticated;


-- ============================================
-- H5. Caregivers could no longer see their patient's tasks
-- ============================================
-- migration-2026-10-scheduled-tasks.sql limited linked users to therapists.
-- Caregivers see the same published tasks the patient sees.

DROP POLICY IF EXISTS "Therapists see own task assignments" ON public.task_assignments;
CREATE POLICY "Therapists see own task assignments" ON public.task_assignments
  FOR SELECT TO authenticated
  USING (
    therapist_id = auth.uid()
    OR (patient_id = auth.uid() AND (publish_at IS NULL OR publish_at <= now()))
    OR EXISTS (
      SELECT 1 FROM public.patient_assignments pa
      WHERE pa.patient_id = task_assignments.patient_id
        AND pa.assigned_to = auth.uid()
        AND pa.relationship = 'therapist'
    )
    OR (
      (publish_at IS NULL OR publish_at <= now())
      AND EXISTS (
        SELECT 1 FROM public.patient_assignments pa
        WHERE pa.patient_id = task_assignments.patient_id
          AND pa.assigned_to = auth.uid()
          AND pa.relationship = 'caregiver'
      )
    )
  );


-- ============================================
-- M7. "Completed all tasks" was deduped on the UTC day
-- ============================================
-- It skipped the notification if any task_completed notification was created
-- on the same UTC day, even for a different assigned day. Now it dedupes on
-- the assigned day the notification is about.

CREATE OR REPLACE FUNCTION public.notify_all_tasks_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
  v_completed int;
  v_patient_name text;
BEGIN
  IF NEW.status != 'completed' OR (OLD IS NOT NULL AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.task_assignments
  WHERE patient_id = NEW.patient_id
    AND assigned_date = NEW.assigned_date
    AND is_rest_day = false;

  IF v_total > 0 AND v_total = v_completed AND NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    JOIN public.task_assignments t ON t.id = n.reference_id
    WHERE n.type = 'task_completed'
      AND n.recipient_id = NEW.therapist_id
      AND n.patient_id = NEW.patient_id
      AND t.assigned_date = NEW.assigned_date
  ) THEN
    SELECT full_name INTO v_patient_name
    FROM public.profiles WHERE id = NEW.patient_id;

    INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
    VALUES (
      NEW.therapist_id,
      'task_completed',
      NEW.patient_id,
      NEW.id,
      v_patient_name || ' completed all tasks for ' || NEW.assigned_date
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_all_tasks_completed error: %', SQLERRM;
  RETURN NEW;
END;
$$;


-- ============================================
-- M9. A task's comment could be lost after it was completed
-- ============================================
-- The app completed the task, then inserted the comment separately and only
-- logged a failure. Both now happen in one transaction. SECURITY INVOKER, so
-- RLS and the limit_patient_task_updates trigger still apply.

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
    AND patient_id = auth.uid();

  IF NOT FOUND THEN
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


-- ============================================
-- M11. Anyone could trigger the email digest, and it could send twice
-- ============================================
-- The digest ran for any caller holding the public anon key. The cron job now
-- sends a secret kept in Vault, and the function checks it through
-- get_email_cron_secret() (service role only). A unique index makes the
-- function's "claim before send" step stop duplicate reminders.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'email_cron_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_cron_secret');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_email_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_cron_secret';
$$;

REVOKE ALL ON FUNCTION public.get_email_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_cron_secret() TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS email_log_unique_send
  ON public.email_log (recipient_id, email_type, reference_date);

DO $$
BEGIN
  PERFORM cron.unschedule('patient-daily-email-digest');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'patient-daily-email-digest',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://afzprgdowymgvmxtrqzc.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmenByZ2Rvd3ltZ3ZteHRycXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTk4NDMsImV4cCI6MjA4OTg5NTg0M30.lpxLOf09xwrFGqsz5aB86CX78tFyVq2W3Y3nU-OvaFg',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_cron_secret')
    ),
    body := '{"type": "patient"}'::jsonb
  );
  $$
);


-- ============================================
-- L1. The 5-minute cron jobs scanned whole tables
-- ============================================
-- generate_patient_task_reminders filters on assigned_date and checks
-- notifications by reference_id; neither had an index that leads with it.

CREATE INDEX IF NOT EXISTS idx_task_assignments_assigned_date
  ON public.task_assignments (assigned_date);
CREATE INDEX IF NOT EXISTS idx_notifications_reference
  ON public.notifications (reference_id, type);


-- ============================================
-- L2. Overdue alerts used the UTC date (8 hours late in Manila)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_overdue_tasks(p_therapist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_therapist_id THEN
    RAISE EXCEPTION 'Unauthorized: can only check your own patients'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('check_overdue_tasks:' || p_therapist_id::text));

  BEGIN
    INSERT INTO public.notifications (recipient_id, type, patient_id, content)
    SELECT DISTINCT
      p_therapist_id,
      'task_overdue',
      ta.patient_id,
      p.full_name || ' has not completed their ' || ta.assigned_date || ' tasks'
    FROM public.task_assignments ta
    JOIN public.profiles p ON p.id = ta.patient_id
    WHERE ta.therapist_id = p_therapist_id
      AND ta.assigned_date < v_today
      AND ta.status != 'completed'
      AND ta.is_rest_day = false
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.patient_id = ta.patient_id
          AND n.type = 'task_overdue'
          AND n.recipient_id = p_therapist_id
          AND (n.created_at AT TIME ZONE 'Asia/Manila')::date >= ta.assigned_date
      );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'check_overdue_tasks error: %', SQLERRM;
  END;
END;
$$;
