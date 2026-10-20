import { supabase } from '../lib/supabase'

/*
 * "Client Notes" are two kinds of note about a patient:
 *   - caregiver: caregiver_notes, written from the caregiver's Notes page
 *   - feedback:  task_feedback.note, the comment left when a task is submitted
 * Both carry therapist_read_at, so either can be unread.
 */

const CAREGIVER_FIELDS = 'id, patient_id, content, created_at, therapist_read_at, patient:profiles!caregiver_notes_patient_id_fkey(full_name), caregiver:profiles!caregiver_notes_caregiver_id_fkey(full_name)'
const FEEDBACK_FIELDS = 'id, patient_id, note, mood, created_at, therapist_read_at, patient:profiles!task_feedback_patient_id_fkey(full_name), task:task_assignments!task_feedback_task_assignment_id_fkey(title)'

/** Unread notes of both kinds for these patients, newest first. */
export async function fetchUnreadClientNotes(patientIds) {
  if (!patientIds.length) return { data: [], error: null }
  const [cg, fb] = await Promise.all([
    supabase
      .from('caregiver_notes')
      .select(CAREGIVER_FIELDS)
      .in('patient_id', patientIds)
      .is('therapist_read_at', null),
    supabase
      .from('task_feedback')
      .select(FEEDBACK_FIELDS)
      .in('patient_id', patientIds)
      .not('note', 'is', null)
      .is('therapist_read_at', null),
  ])
  if (cg.error || fb.error) return { data: null, error: cg.error || fb.error }

  const notes = [
    ...(cg.data || []).map((n) => ({ ...n, kind: 'caregiver' })),
    ...(fb.data || [])
      .filter((n) => n.note.trim())
      .map((n) => ({ ...n, kind: 'feedback', content: n.note })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return { data: notes, error: null }
}

/** Number of unread notes of both kinds, counted on the server; null if it couldn't be counted. */
export async function countUnreadClientNotes(patientIds) {
  if (!patientIds.length) return 0
  const [cg, fb] = await Promise.all([
    supabase
      .from('caregiver_notes')
      .select('id', { count: 'exact', head: true })
      .in('patient_id', patientIds)
      .is('therapist_read_at', null),
    supabase
      .from('task_feedback')
      .select('id', { count: 'exact', head: true })
      .in('patient_id', patientIds)
      .not('note', 'is', null)
      .is('therapist_read_at', null),
  ])
  if (cg.error || fb.error) {
    console.error('Failed to count unread client notes:', (cg.error || fb.error).message)
    return null
  }
  return (cg.count || 0) + (fb.count || 0)
}

/** Marks one note read; only the patient's therapist can. */
export function markClientNoteRead(note) {
  return note.kind === 'feedback'
    ? supabase.rpc('mark_task_feedback_read', { p_feedback_id: note.id })
    : supabase.rpc('mark_client_note_read', { p_note_id: note.id })
}

/** One line saying where a note came from. */
export function clientNoteSource(note) {
  if (note.kind === 'feedback') return `Task comment${note.task?.title ? ` · ${note.task.title}` : ''}`
  return `From ${note.caregiver?.full_name || 'caregiver'}`
}
