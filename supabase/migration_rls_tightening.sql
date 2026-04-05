-- ============================================
-- RLS Tightening Migration
-- Fixes overly permissive policies on patient_assignments and profiles
-- ============================================

-- 1. Tighten patient_assignments INSERT policy
-- Only allow therapists to create assignments for patients they already have a relationship with,
-- OR allow their first assignment (bootstrapping).
DROP POLICY IF EXISTS "Therapists can create assignments" ON public.patient_assignments;

CREATE POLICY "Therapists can create assignments"
  ON public.patient_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_to = auth.uid()
    AND exists (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'therapist'
    )
  );


-- 2. Tighten patient_assignments DELETE policy
-- Only allow therapists to delete their own assignments (not other therapists' assignments)
DROP POLICY IF EXISTS "Therapists can delete assignments" ON public.patient_assignments;

CREATE POLICY "Therapists can delete assignments"
  ON public.patient_assignments FOR DELETE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    AND exists (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'therapist'
    )
  );


-- 3. Scope profiles SELECT policy
-- Users can only see: their own profile, profiles of users they are connected to via patient_assignments
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Profiles are viewable by connected users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR exists (
      SELECT 1 FROM public.patient_assignments
      WHERE (patient_id = profiles.id AND assigned_to = auth.uid())
         OR (assigned_to = profiles.id AND patient_id = auth.uid())
         OR (patient_id = auth.uid() AND assigned_to = profiles.id)
    )
  );
