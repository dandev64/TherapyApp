-- ============================================
-- Simple Therapy — Migration V2
-- Run this in the Supabase SQL Editor AFTER the initial schema
-- ============================================

-- ============================================
-- 1. New columns on existing tables
-- ============================================

-- profiles.condition (patient diagnosis)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS condition text;

-- task_templates: repeat scheduling fields
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS repeat_days text[];
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS end_date date;

-- task_assignments: rest day flag
ALTER TABLE public.task_assignments ADD COLUMN IF NOT EXISTS is_rest_day boolean DEFAULT false;


-- ============================================
-- 2. New tables
-- ============================================

-- task_feedback (post-task mood + notes from patients)
CREATE TABLE IF NOT EXISTS public.task_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_assignment_id uuid NOT NULL REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mood text NOT NULL CHECK (mood IN ('excited', 'happy', 'calm', 'scared', 'anxious', 'angry', 'tired', 'sad')),
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.task_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View task feedback" ON public.task_feedback FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patient_assignments
      WHERE patient_id = task_feedback.patient_id
        AND assigned_to = auth.uid()
        AND relationship = 'therapist'
    )
  );

CREATE POLICY "Patients can create feedback" ON public.task_feedback FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());


-- daily_remarks (one per patient per day)
CREATE TABLE IF NOT EXISTS public.daily_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(patient_id, date)
);

ALTER TABLE public.daily_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View daily remarks" ON public.daily_remarks FOR SELECT TO authenticated
  USING (
    patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patient_assignments
      WHERE patient_id = daily_remarks.patient_id
        AND assigned_to = auth.uid()
        AND relationship = 'therapist'
    )
  );

CREATE POLICY "Patients can create remarks" ON public.daily_remarks FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can update own remarks" ON public.daily_remarks FOR UPDATE TO authenticated
  USING (patient_id = auth.uid());


-- messages (direct messaging between users)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own messages" ON public.messages FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Mark messages as read" ON public.messages FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());


-- notifications (therapist notification feed)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('task_completed', 'task_overdue', 'task_comment', 'new_message')),
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference_id uuid,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

-- Only security definer functions (triggers) can insert notifications
CREATE POLICY "System insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (false);


-- ============================================
-- 3. Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_task_feedback_assignment ON public.task_feedback(task_assignment_id);
CREATE INDEX IF NOT EXISTS idx_task_feedback_patient ON public.task_feedback(patient_id);
CREATE INDEX IF NOT EXISTS idx_daily_remarks_patient_date ON public.daily_remarks(patient_id, date);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);


-- ============================================
-- 4. Notification triggers
-- ============================================

-- Trigger: When task_feedback is inserted, notify therapist (task_comment)
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger AS $$
DECLARE
  v_therapist_id uuid;
  v_patient_name text;
  v_task_date date;
BEGIN
  SELECT ta.therapist_id, ta.assigned_date INTO v_therapist_id, v_task_date
  FROM public.task_assignments ta
  WHERE ta.id = NEW.task_assignment_id;

  SELECT full_name INTO v_patient_name
  FROM public.profiles WHERE id = NEW.patient_id;

  INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
  VALUES (
    v_therapist_id,
    'task_comment',
    NEW.patient_id,
    NEW.task_assignment_id,
    v_patient_name || ' commented on ' || v_task_date || ' task: ' || COALESCE(LEFT(NEW.note, 100), NEW.mood)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_task_comment error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE TRIGGER on_task_feedback_created
  AFTER INSERT ON public.task_feedback
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_comment();


-- Trigger: When a patient sends a message, notify recipient (new_message)
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger AS $$
DECLARE
  v_sender_name text;
  v_sender_role text;
BEGIN
  SELECT full_name, role INTO v_sender_name, v_sender_role
  FROM public.profiles WHERE id = NEW.sender_id;

  IF v_sender_role = 'patient' THEN
    INSERT INTO public.notifications (recipient_id, type, patient_id, reference_id, content)
    VALUES (
      NEW.recipient_id,
      'new_message',
      NEW.sender_id,
      NEW.id,
      v_sender_name || ' messaged you: ' || LEFT(NEW.content, 100)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_new_message error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();


-- Trigger: When all tasks for a patient+date are completed, notify therapist (task_completed)
CREATE OR REPLACE FUNCTION public.notify_all_tasks_completed()
RETURNS trigger AS $$
DECLARE
  v_total int;
  v_completed int;
  v_patient_name text;
  v_existing int;
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

  IF v_total > 0 AND v_total = v_completed THEN
    SELECT COUNT(*) INTO v_existing
    FROM public.notifications
    WHERE patient_id = NEW.patient_id
      AND type = 'task_completed'
      AND created_at::date = CURRENT_DATE
      AND recipient_id = NEW.therapist_id;

    IF v_existing = 0 THEN
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
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_all_tasks_completed error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE TRIGGER on_task_status_updated
  AFTER UPDATE OF status ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_all_tasks_completed();


-- Function: Check for overdue tasks and generate notifications (called from frontend)
CREATE OR REPLACE FUNCTION public.check_overdue_tasks(p_therapist_id uuid)
RETURNS void AS $$
BEGIN
  -- Only allow therapists to check their own overdue tasks
  IF auth.uid() != p_therapist_id THEN
    RAISE EXCEPTION 'Unauthorized: can only check your own patients';
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
