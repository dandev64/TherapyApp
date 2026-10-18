import { supabase } from '../lib/supabase'
import { toDateStr } from './streak'

/** Resource links are stored newline-separated in task_assignments.resource_url. */
export function joinLinks(links) {
  const clean = links.map((l) => l.trim()).filter(Boolean)
  return clean.length ? clean.join('\n') : null
}

/**
 * Inserts one task per date. Tasks due later today get their reminder email
 * queued now, because the 7 AM digest has already run; later dates are picked
 * up by that day's digest.
 */
export async function createTasksForDates({ fields, dates, publishAt }) {
  const rows = dates.map((assigned_date) => ({
    ...fields,
    assigned_date,
    ...(publishAt ? { publish_at: publishAt } : {}),
  }))
  const { data, error } = await supabase
    .from('task_assignments')
    .insert(rows)
    .select('id, assigned_date')
  if (error) return { error }

  const today = toDateStr(new Date())
  const now = new Date()
  for (const task of data || []) {
    const due = new Date(`${task.assigned_date}T${fields.assigned_time}:00`)
    if (!publishAt && task.assigned_date === today && due > now) {
      supabase.functions.invoke('send-email-reminders', {
        body: {
          type: 'task_reminder_immediate',
          patient_id: fields.patient_id,
          task_id: task.id,
          title: fields.title,
          assigned_date: task.assigned_date,
          assigned_time: fields.assigned_time,
        },
      }).catch((err) => console.error('Email function error:', err))
    }
  }
  return { error: null, count: rows.length }
}
