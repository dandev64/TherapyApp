-- ============================================
-- HabitOT — Scheduled task posting (Oct 2026)
-- A therapist can create a task now and have it appear on the patient's
-- dashboard at a later time (like a scheduled email).
-- Run in the Supabase SQL Editor AFTER migration-2026-10-client-edits.sql.
-- Safe to re-run.
-- ============================================

-- NULL = posted immediately. Otherwise the patient can't see the task until this time.
ALTER TABLE public.task_assignments ADD COLUMN IF NOT EXISTS publish_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_task_assignments_publish_at
  ON public.task_assignments(publish_at) WHERE publish_at IS NOT NULL;


-- ============================================
-- 1. Patients only see posted tasks
-- ============================================

DROP POLICY IF EXISTS "Therapists see own task assignments" ON public.task_assignments;
CREATE POLICY "Therapists see own task assignments"
  ON public.task_assignments FOR SELECT
  TO authenticated
  USING (
    therapist_id = auth.uid()
    OR (patient_id = auth.uid() AND (publish_at IS NULL OR publish_at <= now()))
    OR EXISTS (
      SELECT 1 FROM public.patient_assignments
      WHERE patient_id = task_assignments.patient_id
        AND assigned_to = auth.uid()
        AND relationship = 'therapist'
    )
  );


-- ============================================
-- 2. "New task" notification: now, or when the task is posted
-- ============================================

CREATE OR REPLACE FUNCTION public.notify_patient_new_task()
RETURNS trigger AS $$
DECLARE
  v_therapist_name text;
BEGIN
  -- Scheduled for later: publish_scheduled_tasks() notifies at post time
  IF NEW.publish_at IS NOT NULL AND NEW.publish_at > now() THEN
    RETURN NEW;
  END IF;

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

-- Sends the "new task" notification for scheduled tasks whose post time has arrived
CREATE OR REPLACE FUNCTION public.publish_scheduled_tasks()
RETURNS void AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  SELECT ta.patient_id, 'new_task', ta.patient_id, ta.id,
    p.full_name || ' assigned you a new task for ' || to_char(ta.assigned_date, 'Mon DD') || ': ' || COALESCE(ta.title, 'Task')
  FROM public.task_assignments ta
  JOIN public.profiles p ON p.id = ta.therapist_id
  WHERE ta.publish_at IS NOT NULL
    AND ta.publish_at <= now()
    AND ta.publish_at > now() - interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.reference_id = ta.id AND n.type = 'new_task'
    );
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'publish_scheduled_tasks error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DO $$
BEGIN
  PERFORM cron.unschedule('publish-scheduled-tasks');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'publish-scheduled-tasks',
  '* * * * *',
  $$ SELECT public.publish_scheduled_tasks(); $$
);


-- ============================================
-- 3. No reminders for tasks that aren't posted yet
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_patient_task_reminders()
RETURNS void AS $$
DECLARE
  v_now timestamp := (now() AT TIME ZONE 'Asia/Manila');
BEGIN
  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  SELECT ta.patient_id, 'task_due_soon', ta.patient_id, ta.id,
    'Reminder: "' || COALESCE(ta.title, 'Task') || '" is due at ' || to_char(ta.assigned_date + ta.assigned_time, 'FMHH12:MI AM')
  FROM public.task_assignments ta
  WHERE ta.assigned_date = v_now::date
    AND ta.assigned_time IS NOT NULL
    AND ta.status <> 'completed'
    AND COALESCE(ta.is_rest_day, false) = false
    AND (ta.publish_at IS NULL OR ta.publish_at <= now())
    AND (ta.assigned_date + ta.assigned_time) > v_now
    AND (ta.assigned_date + ta.assigned_time) <= v_now + interval '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.reference_id = ta.id AND n.type = 'task_due_soon'
    );

  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  SELECT ta.patient_id, 'task_overdue', ta.patient_id, ta.id,
    '"' || COALESCE(ta.title, 'Task') || '" was due at ' || to_char(ta.assigned_date + ta.assigned_time, 'FMHH12:MI AM') || ' and is not done yet'
  FROM public.task_assignments ta
  WHERE ta.assigned_date = v_now::date
    AND ta.assigned_time IS NOT NULL
    AND ta.status <> 'completed'
    AND COALESCE(ta.is_rest_day, false) = false
    AND (ta.publish_at IS NULL OR ta.publish_at <= now())
    AND (ta.assigned_date + ta.assigned_time) <= v_now
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.reference_id = ta.id AND n.type = 'task_overdue' AND n.recipient_id = ta.patient_id
    );
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'generate_patient_task_reminders error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
