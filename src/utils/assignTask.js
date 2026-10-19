import { supabase } from '../lib/supabase'
import { toDateStr } from './streak'

/** Resource links are stored newline-separated in task_assignments.resource_url. */
export function joinLinks(links) {
  const clean = links.map((l) => l.trim()).filter(Boolean)
  return clean.length ? clean.join('\n') : null
}

/**
 * Re-queues (or cancels) a task's reminder email after it's created, edited,
 * completed or deleted. The Edge Function reads everything from the task and
 * only schedules an email for tasks due later today; other days are covered
 * by that day's 7 AM digest. Fire-and-forget: a failure only affects email.
 */
export function syncTaskReminder(taskId) {
  supabase.functions
    .invoke('send-email-reminders', { body: { type: 'sync_task_reminder', task_id: taskId } })
    .catch((err) => console.error('Email function error:', err))
}

/** Inserts one task per date, then queues reminders for any due later today. */
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
  for (const task of data || []) {
    if (task.assigned_date === today) syncTaskReminder(task.id)
  }
  return { error: null, count: rows.length }
}
