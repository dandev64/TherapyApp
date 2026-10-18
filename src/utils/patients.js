import { supabase } from '../lib/supabase'

const PROFILE_FIELDS = 'profiles!patient_assignments_patient_id_fkey(id, full_name, email, condition)'

/**
 * The therapist's patient links, each with its `profiles` row.
 * Archived patients are left out unless `includeArchived` is set.
 * Selects `*` so this keeps working before the archived_at column exists.
 */
export async function fetchTherapistPatients(therapistId, { includeArchived = false } = {}) {
  const { data, error } = await supabase
    .from('patient_assignments')
    .select(`*, ${PROFILE_FIELDS}`)
    .eq('assigned_to', therapistId)
    .eq('relationship', 'therapist')
  if (error) return { data: [], error }
  const rows = (data || []).filter((a) => a.profiles && (includeArchived || !a.archived_at))
  return { data: rows, error: null }
}
