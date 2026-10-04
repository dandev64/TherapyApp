-- ============================================
-- HabitOT — Client edits (Oct 2026)
-- Run this in the Supabase SQL Editor AFTER migration.sql.
-- Safe to re-run.
-- ============================================


-- ============================================
-- 1. NOTIFICATIONS: "seen" state + new types
-- ============================================

-- seen_at = the user opened the Notifications tab (clears the red badge).
-- read_at = the user dismissed the notification (removes it from the list).
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS seen_at timestamptz;

-- Existing read notifications count as seen
UPDATE public.notifications SET seen_at = read_at WHERE seen_at IS NULL AND read_at IS NOT NULL;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'task_completed', 'task_overdue', 'task_comment', 'new_message', 'new_task',
    'task_due_soon', 'new_remark'
  ));

CREATE INDEX IF NOT EXISTS idx_notifications_unseen
  ON public.notifications(recipient_id) WHERE seen_at IS NULL AND read_at IS NULL;


-- ============================================
-- 2. MESSAGES: notify the recipient whoever sends (therapist -> patient too)
-- ============================================

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger AS $$
DECLARE
  v_sender_name text;
  v_sender_role text;
BEGIN
  SELECT full_name, role INTO v_sender_name, v_sender_role
  FROM public.profiles WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  VALUES (
    NEW.recipient_id,
    'new_message',
    -- patient_id is always the patient in the conversation
    CASE WHEN v_sender_role = 'patient' THEN NEW.sender_id ELSE NEW.recipient_id END,
    NEW.id,
    v_sender_name || ' messaged you: ' || LEFT(NEW.content, 100)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_new_message error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ============================================
-- 3. REALTIME: make sure live updates are published
-- ============================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;


-- ============================================
-- 4. THERAPIST REMARKS (therapist -> patient, per day)
-- ============================================

CREATE TABLE IF NOT EXISTS public.therapist_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (therapist_id, patient_id, date)
);

ALTER TABLE public.therapist_remarks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_therapist_remarks_patient_date
  ON public.therapist_remarks(patient_id, date DESC);

DROP POLICY IF EXISTS "View therapist remarks" ON public.therapist_remarks;
CREATE POLICY "View therapist remarks" ON public.therapist_remarks
  FOR SELECT TO authenticated
  USING (therapist_id = auth.uid() OR patient_id = auth.uid());

DROP POLICY IF EXISTS "Therapists create remarks" ON public.therapist_remarks;
CREATE POLICY "Therapists create remarks" ON public.therapist_remarks
  FOR INSERT TO authenticated
  WITH CHECK (
    therapist_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.patient_assignments
      WHERE patient_id = therapist_remarks.patient_id
        AND assigned_to = auth.uid()
        AND relationship = 'therapist'
    )
  );

DROP POLICY IF EXISTS "Therapists update own remarks" ON public.therapist_remarks;
CREATE POLICY "Therapists update own remarks" ON public.therapist_remarks
  FOR UPDATE TO authenticated
  USING (therapist_id = auth.uid());

DROP POLICY IF EXISTS "Therapists delete own remarks" ON public.therapist_remarks;
CREATE POLICY "Therapists delete own remarks" ON public.therapist_remarks
  FOR DELETE TO authenticated
  USING (therapist_id = auth.uid());

-- Notify the patient when a remark is written
CREATE OR REPLACE FUNCTION public.notify_new_remark()
RETURNS trigger AS $$
DECLARE
  v_therapist_name text;
BEGIN
  SELECT full_name INTO v_therapist_name FROM public.profiles WHERE id = NEW.therapist_id;

  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  VALUES (
    NEW.patient_id,
    'new_remark',
    NEW.patient_id,
    NEW.id,
    v_therapist_name || ' left a remark for ' || to_char(NEW.date, 'Mon DD') || ': ' || LEFT(NEW.content, 100)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_new_remark error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_therapist_remark_created ON public.therapist_remarks;
CREATE TRIGGER on_therapist_remark_created
  AFTER INSERT ON public.therapist_remarks
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_remark();


-- ============================================
-- 5. TASKS: multiple proof photos
-- ============================================

ALTER TABLE public.task_assignments ADD COLUMN IF NOT EXISTS proof_urls text[];

-- Backfill from the single-photo column
UPDATE public.task_assignments
  SET proof_urls = ARRAY[proof_url]
  WHERE proof_url IS NOT NULL AND proof_urls IS NULL;

-- Patients replace photos when editing a submission (upload uses upsert)
DROP POLICY IF EXISTS "Patients can update own proof photos" ON storage.objects;
CREATE POLICY "Patients can update own proof photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'task-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Patients can edit their own feedback (used when editing a submission)
DROP POLICY IF EXISTS "Patients can update own feedback" ON public.task_feedback;
CREATE POLICY "Patients can update own feedback" ON public.task_feedback
  FOR UPDATE TO authenticated
  USING (patient_id = auth.uid());


-- ============================================
-- 6. NEW TASK NOTIFICATION -> carry the task id so clicking opens it
-- ============================================

CREATE OR REPLACE FUNCTION public.notify_patient_new_task()
RETURNS trigger AS $$
DECLARE
  v_therapist_name text;
BEGIN
  SELECT full_name INTO v_therapist_name FROM public.profiles WHERE id = NEW.therapist_id;

  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  VALUES (
    NEW.patient_id,
    'new_task',
    NEW.patient_id,
    NEW.id,
    v_therapist_name || ' assigned you a new task for ' || to_char(NEW.assigned_date, 'Mon DD') || ': ' || COALESCE(NEW.title, 'Task')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_patient_new_task error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Replace whatever new-task trigger exists in the live DB with this one
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tgname FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.task_assignments'::regclass
      AND p.proname = 'notify_patient_new_task'
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.task_assignments', r.tgname);
  END LOOP;
END;
$$;

CREATE TRIGGER on_task_assigned_notify_patient
  AFTER INSERT ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_patient_new_task();


-- ============================================
-- 7. PATIENT REMINDERS (in-app): due in 1 hour + overdue today
-- ============================================

-- Called by pg_cron every 5 minutes. Times are stored as local (UTC+8).
CREATE OR REPLACE FUNCTION public.generate_patient_task_reminders()
RETURNS void AS $$
DECLARE
  v_now timestamp := (now() AT TIME ZONE 'Asia/Manila');
BEGIN
  -- Due within the next hour, not completed, not yet reminded
  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  SELECT ta.patient_id, 'task_due_soon', ta.patient_id, ta.id,
    'Reminder: "' || COALESCE(ta.title, 'Task') || '" is due at ' || to_char(ta.assigned_date + ta.assigned_time, 'FMHH12:MI AM')
  FROM public.task_assignments ta
  WHERE ta.assigned_date = v_now::date
    AND ta.assigned_time IS NOT NULL
    AND ta.status <> 'completed'
    AND COALESCE(ta.is_rest_day, false) = false
    AND (ta.assigned_date + ta.assigned_time) > v_now
    AND (ta.assigned_date + ta.assigned_time) <= v_now + interval '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.reference_id = ta.id AND n.type = 'task_due_soon'
    );

  -- Past due today, not completed, not yet reminded
  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  SELECT ta.patient_id, 'task_overdue', ta.patient_id, ta.id,
    '"' || COALESCE(ta.title, 'Task') || '" was due at ' || to_char(ta.assigned_date + ta.assigned_time, 'FMHH12:MI AM') || ' and is not done yet'
  FROM public.task_assignments ta
  WHERE ta.assigned_date = v_now::date
    AND ta.assigned_time IS NOT NULL
    AND ta.status <> 'completed'
    AND COALESCE(ta.is_rest_day, false) = false
    AND (ta.assigned_date + ta.assigned_time) <= v_now
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.reference_id = ta.id AND n.type = 'task_overdue' AND n.recipient_id = ta.patient_id
    );
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'generate_patient_task_reminders error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Requires the pg_cron extension (Dashboard -> Database -> Extensions)
DO $$
BEGIN
  PERFORM cron.unschedule('patient-inapp-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'patient-inapp-reminders',
  '*/5 * * * *',
  $$ SELECT public.generate_patient_task_reminders(); $$
);
