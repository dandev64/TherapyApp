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
