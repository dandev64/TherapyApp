-- ============================================
-- HabitOT — Security fixes from the Oct 2026 review
-- Run in the Supabase SQL Editor. Safe to re-run. Paste the whole file at once.
-- Then run migration-2026-10-security-verify.sql.
--
-- Not included (by decision): therapist signup, therapist visibility of all
-- profiles and the patient-linking policy stay as they are.
--
--   1. Users can't change their own email or role       (H1)
--   2. Patients can only change completion/proof fields  (M1)
--   3. Messages only between linked therapist/patient    (M2)
--   4. Feedback only on the patient's own tasks          (L5)
--   5. Anonymous callers can't run the app's functions   (H2)
--   6. check_overdue_tasks: real caller check, no duplicate alerts (H2)
--   7. One "No tasks for today" per patient per day      (M5)
--   8. Reminder emails can be cancelled: email_log.provider_id (H3)
--   9. Duplicate storage policies removed               (L3)
-- ============================================


-- ============================================
-- 1. PROFILES: email and role are not self-editable
-- ============================================
-- RLS can't restrict columns, so a trigger does. Reminder emails go to
-- profiles.email, and role decides what a user can see. The app never edits
-- either; admin changes from the SQL Editor (role postgres) still work.

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.email IS DISTINCT FROM OLD.email
          OR NEW.role IS DISTINCT FROM OLD.role
          OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'email and role can''t be changed from the app'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;
CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();


-- ============================================
-- 2. TASKS: patients only report progress
-- ============================================
-- The UPDATE policy lets the patient update their own task row (to mark it
-- done and attach proof). This stops them rewriting anything else: title,
-- date, time, therapist, whether proof is required.

CREATE OR REPLACE FUNCTION public.limit_patient_task_updates()
RETURNS trigger AS $$
DECLARE
  allowed text[] := ARRAY['status', 'completed_at', 'proof_url', 'proof_urls'];
BEGIN
  IF current_user = 'authenticated'
     AND auth.uid() = OLD.patient_id
     AND auth.uid() IS DISTINCT FROM OLD.therapist_id
     AND (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Patients can only update the status and proof of a task'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS limit_patient_task_updates ON public.task_assignments;
CREATE TRIGGER limit_patient_task_updates
  BEFORE UPDATE ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.limit_patient_task_updates();


-- ============================================
-- 3. MESSAGES: only between a patient and someone linked to them
-- ============================================

DROP POLICY IF EXISTS "Send messages" ON public.messages;
CREATE POLICY "Send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.patient_assignments pa
      WHERE (pa.patient_id = messages.sender_id AND pa.assigned_to = messages.recipient_id)
         OR (pa.patient_id = messages.recipient_id AND pa.assigned_to = messages.sender_id)
    )
  );


-- ============================================
-- 4. FEEDBACK: only on the patient's own task
-- ============================================

DROP POLICY IF EXISTS "Patients can create feedback" ON public.task_feedback;
CREATE POLICY "Patients can create feedback" ON public.task_feedback
  FOR INSERT WITH CHECK (
    patient_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_feedback.task_assignment_id
        AND ta.patient_id = auth.uid()
    )
  );


-- ============================================
-- 5. FUNCTIONS: not callable without logging in
-- ============================================
-- Postgres grants EXECUTE to everyone by default. The cron-only functions
-- are now callable by nobody but the database itself (pg_cron runs as
-- postgres). Trigger functions don't need EXECUTE to fire.

REVOKE ALL ON FUNCTION public.publish_scheduled_tasks() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_patient_task_reminders() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_overdue_tasks(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_overdue_tasks(uuid) TO authenticated;


-- ============================================
-- 6. check_overdue_tasks: real caller check, no duplicate alerts
-- ============================================
-- `auth.uid() != p_therapist_id` is NULL (so skipped) for a caller who
-- isn't logged in, and the EXCEPTION block also swallowed the error. The
-- advisory lock stops two tabs opening the dashboard at once from inserting
-- the same overdue alert twice.

CREATE OR REPLACE FUNCTION public.check_overdue_tasks(p_therapist_id uuid)
RETURNS void AS $$
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
      AND ta.assigned_date < CURRENT_DATE
      AND ta.status != 'completed'
      AND ta.is_rest_day = false
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.patient_id = ta.patient_id
          AND n.type = 'task_overdue'
          AND n.recipient_id = p_therapist_id
          AND n.created_at::date >= ta.assigned_date
      );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'check_overdue_tasks error: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.check_overdue_tasks(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_overdue_tasks(uuid) TO authenticated;


-- ============================================
-- 7. REST DAYS: one per patient per day
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS task_assignments_one_rest_day
  ON public.task_assignments (patient_id, assigned_date)
  WHERE is_rest_day;


-- ============================================
-- 8. EMAIL LOG: Resend id, so a queued reminder can be cancelled
-- ============================================
-- The send-email-reminders function stores it and calls Resend's cancel
-- endpoint when a task is moved, completed or deleted.

ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS provider_id text;
CREATE INDEX IF NOT EXISTS email_log_email_type_idx ON public.email_log (email_type);


-- ============================================
-- 9. STORAGE: drop duplicate proof-photo policies
-- ============================================
-- Each pair was identical; one of each stays.

DROP POLICY IF EXISTS "Patients can upload proof" ON storage.objects;
DROP POLICY IF EXISTS "Patients can update own proofs" ON storage.objects;

-- ============================================
-- Done. Now run migration-2026-10-security-verify.sql to confirm.
-- ============================================
