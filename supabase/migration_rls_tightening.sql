-- ============================================
-- RLS Tightening Migration
-- Run this in the Supabase SQL Editor
-- ============================================


-- ======== PROFILES ========
-- Therapists can view all profiles (needed to search/add patients).
-- Patients and caregivers can only see themselves + connected users.

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by connected users"     ON public.profiles;

CREATE POLICY "Profiles are viewable by connected users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles AS me
      WHERE me.id = auth.uid() AND me.role = 'therapist'
    )
    OR EXISTS (
      SELECT 1 FROM public.patient_assignments
      WHERE (patient_id = profiles.id AND assigned_to = auth.uid())
         OR (assigned_to = profiles.id AND patient_id = auth.uid())
    )
  );


-- ======== PATIENT ASSIGNMENTS ========
-- INSERT: therapists can only create assignments where assigned_to = themselves
DROP POLICY IF EXISTS "Therapists can create assignments" ON public.patient_assignments;

CREATE POLICY "Therapists can create assignments"
  ON public.patient_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'therapist'
    )
  );

-- DELETE: therapists can only delete their own assignments
DROP POLICY IF EXISTS "Therapists can delete assignments" ON public.patient_assignments;

CREATE POLICY "Therapists can delete assignments"
  ON public.patient_assignments FOR DELETE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'therapist'
    )
  );
