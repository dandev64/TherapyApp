import { supabase } from '../lib/supabase'
import { REST_DAY_TITLE } from './tasks'

/**
 * "No tasks for today" is stored as a task_assignments row with
 * is_rest_day = true and no time, so streaks, consistency and reminders
 * (which all skip rest days) need no special casing.
 */
export async function markRestDay({ therapistId, patientId, date }) {
  const res = await supabase.from('task_assignments').insert({
    patient_id: patientId,
    therapist_id: therapistId,
    assigned_date: date,
    title: REST_DAY_TITLE,
    is_rest_day: true,
    status: 'completed',
  })
  // One rest day per patient per day (unique index): already marked is fine
  return res.error?.code === '23505' ? { ...res, error: null } : res
}

export async function clearRestDay({ therapistId, patientId, date }) {
  return supabase
    .from('task_assignments')
    .delete()
    .eq('patient_id', patientId)
    .eq('therapist_id', therapistId)
    .eq('assigned_date', date)
    .eq('is_rest_day', true)
}
