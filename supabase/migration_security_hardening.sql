-- ============================================
-- Security Hardening Migration
-- Fixes Supabase Advisor warnings + cleans up
-- duplicate/conflicting policies on notifications
-- ============================================

-- ============================================
-- 1. Fix mutable search_path on SECURITY DEFINER functions
-- Without SET search_path, these functions use the role's default
-- search_path, which can be exploited if a malicious user creates
-- objects in the public schema that shadow system tables.
-- ============================================

ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.check_overdue_tasks(uuid) SET search_path = '';
ALTER FUNCTION public.notify_all_tasks_completed() SET search_path = '';
ALTER FUNCTION public.notify_task_comment() SET search_path = '';
ALTER FUNCTION public.notify_new_message() SET search_path = '';

-- notify_patient_new_task exists in live DB but not in local SQL files.
-- This will silently skip if the function doesn't exist.
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.notify_patient_new_task() SET search_path = ''''';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'notify_patient_new_task does not exist, skipping';
END;
$$;


-- ============================================
-- 2. Clean up notifications policies
-- Live DB has 7 policies (duplicates + wrong roles).
-- Drop ALL existing policies, then recreate the correct 4.
-- ============================================

-- Drop all existing notification policies
DROP POLICY IF EXISTS "System can insert notifications"          ON public.notifications;
DROP POLICY IF EXISTS "System insert notifications"              ON public.notifications;
DROP POLICY IF EXISTS "Enable read for recipients"               ON public.notifications;
DROP POLICY IF EXISTS "View own notifications"                   ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Update own notifications"                 ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications"       ON public.notifications;

-- SELECT: recipients can view their own notifications
CREATE POLICY "View own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- INSERT: blocked for users — only SECURITY DEFINER triggers can insert (they bypass RLS)
CREATE POLICY "System insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- UPDATE: recipients can mark as read
CREATE POLICY "Update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

-- DELETE: recipients can delete their own notifications
CREATE POLICY "Delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());


-- ============================================
-- 3. Leaked Password Protection
-- This cannot be set via SQL. Enable it in the Supabase Dashboard:
-- Authentication > Settings > Password Security > Enable Leaked Password Protection
-- ============================================
