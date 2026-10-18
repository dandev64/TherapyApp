export function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function calculateStreak(taskAssignments) {
  const byDate = {}
  taskAssignments.forEach((t) => {
    if (t.is_rest_day) return
    if (!byDate[t.assigned_date]) byDate[t.assigned_date] = { total: 0, completed: 0 }
    byDate[t.assigned_date].total++
    if (t.status === 'completed') byDate[t.assigned_date].completed++
  })
  const dates = Object.keys(byDate)
  if (!dates.length) return 0
  const earliest = dates.reduce((a, b) => (a < b ? a : b))

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Go backwards from yesterday; days without tasks don't break the streak
  const d = new Date(today)
  d.setDate(d.getDate() - 1)
  while (toDateStr(d) >= earliest) {
    const day = byDate[toDateStr(d)]
    if (day) {
      if (day.completed === day.total) streak++
      else break
    }
    d.setDate(d.getDate() - 1)
  }

  // Include today if all tasks are done
  const todayData = byDate[toDateStr(today)]
  if (todayData && todayData.completed === todayData.total) streak++

  return streak
}

export function getTodayProgress(taskAssignments) {
  const todayStr = toDateStr(new Date())
  const todayTasks = taskAssignments.filter((t) => t.assigned_date === todayStr && !t.is_rest_day)
  const total = todayTasks.length
  const completed = todayTasks.filter((t) => t.status === 'completed').length
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** Every YYYY-MM-DD from `from` to `to` inclusive. */
export function datesBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * Date range for a reporting period.
 * period: 'week' (Sunday-Saturday) | 'month' | 'all'
 * offset: 0 = current, -1 = previous, ...
 * firstDate: earliest data date, used as the start of 'all'.
 */
export function getRange(period, offset = 0, firstDate = null) {
  const now = new Date()
  if (period === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + offset * 7)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { from: toDateStr(start), to: toDateStr(end), label: `${fmt(start)} – ${fmt(end)}` }
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return {
      from: toDateStr(start),
      to: toDateStr(end),
      label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }
  const today = toDateStr(now)
  return { from: firstDate || today, to: today, label: 'Entire history' }
}

/** Earliest assigned_date in a task list, or null. */
export function firstTaskDate(taskAssignments) {
  let first = null
  for (const t of taskAssignments) {
    if (!first || t.assigned_date < first) first = t.assigned_date
  }
  return first
}

/**
 * Consistency = completed / assigned, for tasks dated within `range` and up to
 * today. Without a range it covers the whole history (overall consistency).
 * `missed` = tasks on past days that were never completed.
 */
export function calculateConsistency(taskAssignments, range = null) {
  const today = toDateStr(new Date())
  const to = range && range.to < today ? range.to : today
  const from = range?.from || null
  const inWindow = taskAssignments.filter(
    (t) => !t.is_rest_day && t.assigned_date <= to && (!from || t.assigned_date >= from)
  )
  const completed = inWindow.filter((t) => t.status === 'completed').length
  const missed = inWindow.filter((t) => t.assigned_date < today && t.status !== 'completed').length
  const total = inWindow.length
  return {
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    completed,
    missed,
    total,
  }
}

/** Per-day completion % for each date in a range (future days have no bar). */
export function dailyCompletion(taskAssignments, range) {
  const byDate = {}
  taskAssignments.forEach((t) => {
    if (t.is_rest_day || t.assigned_date < range.from || t.assigned_date > range.to) return
    if (!byDate[t.assigned_date]) byDate[t.assigned_date] = { total: 0, completed: 0 }
    byDate[t.assigned_date].total++
    if (t.status === 'completed') byDate[t.assigned_date].completed++
  })
  return datesBetween(range.from, range.to).map((date) => {
    const e = byDate[date]
    return {
      date,
      total: e?.total || 0,
      completed: e?.completed || 0,
      percent: e && e.total > 0 ? Math.round((e.completed / e.total) * 100) : 0,
    }
  })
}
