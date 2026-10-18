-- ============================================
-- HabitOT — Client revisions round 2 (Oct 2026)
-- Run in the Supabase SQL Editor AFTER migration-2026-10-disk-io.sql.
-- Safe to re-run. Paste the whole file at once.
--
-- The app keeps working before this runs; these features switch on after:
--   * Client Notes "Mark as read"            (section 1)
--   * Archive / unarchive patients           (section 2)
--   * Notifications can no longer be deleted (section 3)
--   * No "new task" alert for rest days      (section 4)
-- ============================================


-- ============================================
-- 1. CLIENT NOTES: therapist read status
-- ============================================
-- caregiver_notes are what the app now calls "Client Notes".

ALTER TABLE public.caregiver_notes ADD COLUMN IF NOT EXISTS therapist_read_at timestamptz;

-- RLS can't limit an UPDATE to one column, so marking read goes through this
-- function: it only sets therapist_read_at, and only for the patient's therapist.
CREATE OR REPLACE FUNCTION public.mark_client_note_read(p_note_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.caregiver_notes cn
  SET therapist_read_at = now()
  WHERE cn.id = p_note_id
    AND cn.therapist_read_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.patient_assignments pa
      WHERE pa.patient_id = cn.patient_id
        AND pa.assigned_to = auth.uid()
        AND pa.relationship = 'therapist'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.mark_client_note_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_client_note_read(uuid) TO authenticated;


-- ============================================
-- 2. ARCHIVE PATIENTS
-- ============================================
-- Archiving is per therapist-patient link: it hides the patient from that
-- therapist's dashboard, lists, calendar and consistency figures. Nothing is
-- deleted, and the message history stays available.

ALTER TABLE public.patient_assignments ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- A function rather than an UPDATE policy, so a therapist can only flip
-- archived_at on their own link and can't rewrite patient_id or relationship.
CREATE OR REPLACE FUNCTION public.set_patient_archived(p_patient_id uuid, p_archived boolean)
RETURNS void AS $$
BEGIN
  UPDATE public.patient_assignments
  SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
  WHERE patient_id = p_patient_id
    AND assigned_to = auth.uid()
    AND relationship = 'therapist';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient is not assigned to you';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.set_patient_archived(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_patient_archived(uuid, boolean) TO authenticated;


-- ============================================
-- 3. NOTIFICATIONS CAN'T BE DELETED
-- ============================================
-- The app replaced the "X" with Archive (which sets read_at). Dropping the
-- DELETE policy makes that a rule, not just a missing button.

DROP POLICY IF EXISTS "Delete own notifications" ON public.notifications;


-- ============================================
-- 4. "NO TASKS FOR TODAY" SENDS NO "NEW TASK" ALERT
-- ============================================
-- A rest day is stored as a task_assignments row with is_rest_day = true.
-- Same function as migration-2026-10-scheduled-tasks.sql, plus the rest-day guard.

CREATE OR REPLACE FUNCTION public.notify_patient_new_task()
RETURNS trigger AS $$
DECLARE
  v_therapist_name text;
BEGIN
  IF COALESCE(NEW.is_rest_day, false) THEN
    RETURN NEW;
  END IF;

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

-- ============================================
-- Done. Now run migration-2026-10-revisions-2-verify.sql to confirm.
-- ============================================
