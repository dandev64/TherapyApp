-- ============================================
-- Migration: Convert Task Templates to Direct Task Assignment
-- ============================================

-- 1. Add requires_proof boolean
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS requires_proof boolean DEFAULT false;

-- 2. Add resource_url for guides/videos/descriptions
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS resource_url text;

-- 3. Add assigned_time for specific time scheduling
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS assigned_time time;

-- 4. Relax assigned_time_of_day (no longer required for new tasks)
ALTER TABLE public.task_assignments
  DROP CONSTRAINT IF EXISTS task_assignments_assigned_time_of_day_check;

ALTER TABLE public.task_assignments
  ALTER COLUMN assigned_time_of_day DROP NOT NULL;

ALTER TABLE public.task_assignments
  ALTER COLUMN assigned_time_of_day DROP DEFAULT;

-- 5. Add proof_url to store uploaded proof photo URL
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS proof_url text;

-- 6. Create storage bucket for proof photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-proofs', 'task-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage policies for task-proofs bucket
-- Patients can upload proof photos
CREATE POLICY "Patients can upload proof photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'task-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Authenticated users can view proof photos
CREATE POLICY "Authenticated users can view proof photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'task-proofs');

-- Patients can delete their own proof photos
CREATE POLICY "Users can delete own proof photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'task-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
