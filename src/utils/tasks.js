/** True if the task is scheduled to be posted to the patient later. */
export function isScheduled(task, now = new Date()) {
  return !!task?.publish_at && new Date(task.publish_at) > now
}

/** Tasks the patient should see right now (RLS also enforces this). */
export function postedOnly(tasks) {
  const now = new Date()
  return (tasks || []).filter((t) => !isScheduled(t, now))
}

/** "Oct 5, 7:00 AM" */
export function formatPublishAt(publishAt) {
  return new Date(publishAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Value for <input type="datetime-local"> from a Date, in local time. */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Default scheduled post time: tomorrow at 7:00 AM. */
export function defaultPublishValue() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(7, 0, 0, 0)
  return toLocalInputValue(d)
}

/** Past-due task that was never completed (the "Incomplete" filter). */
export function isIncomplete(task, todayStr) {
  return !task.is_rest_day && task.status !== 'completed' && task.assigned_date < todayStr
}

/**
 * Calendar day colour: 'done' when every task is completed, 'incomplete' when a
 * task on today or a past day is still open, otherwise 'none'. Future days stay
 * neutral because their tasks can't be late yet.
 */
export function dayStatus({ total, completed, dateStr, todayStr }) {
  if (!total) return 'none'
  if (completed === total) return 'done'
  return dateStr <= todayStr ? 'incomplete' : 'none'
}

export const DAY_STATUS_CLASS = {
  done: 'bg-success/20 border border-success/70',
  incomplete: 'bg-danger/15 border border-danger/70',
  none: 'bg-surface-container-lowest border border-transparent',
}

/** Resource links of a task, one per line of resource_url. */
export function getResourceLinks(task) {
  return (task?.resource_url || '').split('\n').map((l) => l.trim()).filter(Boolean)
}

/** The "No tasks for today" marker row for a patient/day. */
export const REST_DAY_TITLE = 'No tasks for today'
