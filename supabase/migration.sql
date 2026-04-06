-- ============================================
-- HabitOT — Unified Migration
-- Run this in the Supabase SQL Editor AFTER schema.sql
-- ============================================


-- ============================================
-- 1. NEW COLUMNS ON EXISTING TABLES
-- ============================================

-- Patient diagnosis field
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS condition text;

-- Task template repeat scheduling
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS repeat_days text[];
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS end_date date;

-- Rest day flag on task assignments
ALTER TABLE public.task_assignments ADD COLUMN IF NOT EXISTS is_rest_day boolean DEFAULT false;


-- ============================================
-- 2. NEW TABLES
-- ============================================

-- Task feedback (post-task mood + notes from patients)
CREATE TABLE IF NOT EXISTS public.task_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_assignment_id uuid NOT NULL REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mood text NOT NULL CHECK (mood IN ('excited', 'happy', 'calm', 'scared', 'anxious', 'angry', 'tired', 'sad')),
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.task_feedback ENABLE ROW LEVEL SECURITY;

-- Daily remarks (one per patient per day)
CREATE TABLE IF NOT EXISTS public.daily_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(patient_id, date)
);

ALTER TABLE public.daily_remarks ENABLE ROW LEVEL SECURITY;

-- Messages (direct messaging between users)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Notifications (in-app notification feed)
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


-- ============================================
-- 3. TASK ASSIGNMENT ENHANCEMENTS
-- ============================================

-- Proof photo requirement flag
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS requires_proof boolean DEFAULT false;

-- Resource URL for guides/videos
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS resource_url text;

-- Specific time scheduling
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS assigned_time time;

-- Proof photo storage path
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS proof_url text;

-- Relax assigned_time_of_day (no longer required for new-style tasks)
ALTER TABLE public.task_assignments
  DROP CONSTRAINT IF EXISTS task_assignments_assigned_time_of_day_check;

ALTER TABLE public.task_assignments
  ALTER COLUMN assigned_time_of_day DROP NOT NULL;

ALTER TABLE public.task_assignments
  ALTER COLUMN assigned_time_of_day DROP DEFAULT;


-- ============================================
-- 4. STORAGE BUCKET (task-proofs)
-- ============================================

-- Create private bucket for proof photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-proofs', 'task-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Patients can upload proof photos to their own folder
CREATE POLICY "Patients can upload proof photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'task-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Only the photo owner or their assigned therapist/caregiver can view
CREATE POLICY "Owner or therapist can view proof photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'task-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.patient_assignments
        WHERE patient_id = (storage.foldername(name))[1]::uuid
          AND assigned_to = auth.uid()
      )
    )
  );

-- Patients can delete their own proof photos
CREATE POLICY "Users can delete own proof photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'task-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================
-- 5. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_task_feedback_assignment ON public.task_feedback(task_assignment_id);
CREATE INDEX IF NOT EXISTS idx_task_feedback_patient ON public.task_feedback(patient_id);
CREATE INDEX IF NOT EXISTS idx_daily_remarks_patient_date ON public.daily_remarks(patient_id, date);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);


-- ============================================
-- 6. RLS POLICIES (NEW TABLES)
-- ============================================

-- task_feedback
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

-- daily_remarks
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

-- messages
CREATE POLICY "View own messages" ON public.messages FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Mark messages as read" ON public.messages FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

-- notifications
-- (These are created fresh after cleanup in section 7)


-- ============================================
-- 7. NOTIFICATION POLICY CLEANUP & SECURITY HARDENING
-- ============================================

-- Drop all existing notification policies (handles duplicates from prior migrations)
DROP POLICY IF EXISTS "System can insert notifications"          ON public.notifications;
DROP POLICY IF EXISTS "System insert notifications"              ON public.notifications;
DROP POLICY IF EXISTS "Enable read for recipients"               ON public.notifications;
DROP POLICY IF EXISTS "View own notifications"                   ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Update own notifications"                 ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications"       ON public.notifications;
DROP POLICY IF EXISTS "Delete own notifications"                 ON public.notifications;

-- Recreate the correct 4 notification policies
CREATE POLICY "View own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "System insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

-- Fix mutable search_path on all SECURITY DEFINER functions
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.check_overdue_tasks(uuid) SET search_path = '';
ALTER FUNCTION public.notify_all_tasks_completed() SET search_path = '';
ALTER FUNCTION public.notify_task_comment() SET search_path = '';
ALTER FUNCTION public.notify_new_message() SET search_path = '';

-- notify_patient_new_task may exist in live DB but not in schema files
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.notify_patient_new_task() SET search_path = ''''';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'notify_patient_new_task does not exist, skipping';
END;
$$;


-- ============================================
-- 8. RLS TIGHTENING
-- ============================================

-- Helper: returns the role of the current user without triggering RLS on profiles
-- (querying profiles from within a profiles policy causes infinite recursion)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Profiles: therapists see all, patients/caregivers see only themselves + connected users
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by connected users"     ON public.profiles;

CREATE POLICY "Profiles are viewable by connected users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.current_user_role() = 'therapist'
    OR EXISTS (
      SELECT 1 FROM public.patient_assignments
      WHERE (patient_id = profiles.id AND assigned_to = auth.uid())
         OR (assigned_to = profiles.id AND patient_id = auth.uid())
    )
  );

-- patient_assignments: therapists can only INSERT/DELETE their own assignments
DROP POLICY IF EXISTS "Therapists can create assignments" ON public.patient_assignments;

CREATE POLICY "Therapists can create assignments"
  ON public.patient_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_to = auth.uid()
    AND public.current_user_role() = 'therapist'
  );

DROP POLICY IF EXISTS "Therapists can delete assignments" ON public.patient_assignments;

CREATE POLICY "Therapists can delete assignments"
  ON public.patient_assignments FOR DELETE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    AND public.current_user_role() = 'therapist'
  );


-- ============================================
-- 9. NOTIFICATION TRIGGERS & FUNCTIONS
-- ============================================

-- Trigger: task_feedback INSERT -> notify therapist (task_comment)
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

DROP TRIGGER IF EXISTS on_task_feedback_created ON public.task_feedback;
CREATE TRIGGER on_task_feedback_created
  AFTER INSERT ON public.task_feedback
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_comment();


-- Trigger: message INSERT -> notify recipient if sender is patient (new_message)
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

DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();


-- Trigger: all tasks completed for a patient+date -> notify therapist (task_completed)
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

DROP TRIGGER IF EXISTS on_task_status_updated ON public.task_assignments;
CREATE TRIGGER on_task_status_updated
  AFTER UPDATE OF status ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_all_tasks_completed();


-- RPC: check for overdue tasks and generate notifications (called from therapist frontend)
CREATE OR REPLACE FUNCTION public.check_overdue_tasks(p_therapist_id uuid)
RETURNS void AS $$
BEGIN
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


-- ============================================
-- 10. EMAIL NOTIFICATIONS (COMMENTED OUT)
-- ============================================
-- To activate: see supabase/functions/send-email-reminders/index.ts
-- 1. Enable pg_cron and pg_net extensions in Supabase Dashboard
-- 2. Deploy the Edge Function
-- 3. Uncomment below and update YOUR_PROJECT_REF / YOUR_ANON_KEY

-- Email opt-in column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT false;

-- Email log table (prevents duplicate sends per day)
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_lookup
  ON public.email_log(recipient_id, email_type, reference_date);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email log"
  ON public.email_log FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- pg_cron: therapist reminder every day at 8:00 AM UTC
SELECT cron.schedule(
  'therapist-morning-reminder',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://afzprgdowymgvmxtrqzc.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmenByZ2Rvd3ltZ3ZteHRycXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTk4NDMsImV4cCI6MjA4OTg5NTg0M30.lpxLOf09xwrFGqsz5aB86CX78tFyVq2W3Y3nU-OvaFg'
    ),
    body := '{"type": "therapist"}'::jsonb
  );
  $$
);

-- pg_cron: patient reminder every 15 minutes
SELECT cron.schedule(
  'patient-task-reminder',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://afzprgdowymgvmxtrqzc.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmenByZ2Rvd3ltZ3ZteHRycXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTk4NDMsImV4cCI6MjA4OTg5NTg0M30.lpxLOf09xwrFGqsz5aB86CX78tFyVq2W3Y3nU-OvaFg''
    ),
    body := '{"type": "patient"}'::jsonb
  );
  $$
);

-- pg_cron: clean up email logs older than 30 days (daily at midnight)
SELECT cron.schedule(
  'cleanup-email-log',
  '0 0 * * *',
  $$
  DELETE FROM public.email_log WHERE sent_at < now() - interval '30 days';
  $$
);
