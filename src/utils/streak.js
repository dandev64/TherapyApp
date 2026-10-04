export function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const MS_PER_DAY = 86400000

export function calculateStreak(taskAssignments) {
  const byDate = {}
  taskAssignments.forEach((t) => {
    if (!byDate[t.assigned_date]) byDate[t.assigned_date] = { total: 0, completed: 0 }
    byDate[t.assigned_date].total++
    if (t.status === 'completed') byDate[t.assigned_date].completed++
  })

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Go backwards from yesterday
  const d = new Date(today)
  d.setDate(d.getDate() - 1)

  while (true) {
    const dateStr = toDateStr(d)
    const day = byDate[dateStr]

    if (!day) {
      // No tasks assigned — doesn't break streak, but stop after 90 days
      if ((today - d) / MS_PER_DAY > 90) break
      d.setDate(d.getDate() - 1)
      continue
    }

    if (day.total > 0 && day.completed === day.total) {
      streak++
    } else if (day.total > 0) {
      break // Incomplete day breaks streak
    }

    d.setDate(d.getDate() - 1)
  }

  // Include today if all tasks are done
  const todayStr = toDateStr(today)
  const todayData = byDate[todayStr]
  if (todayData && todayData.total > 0 && todayData.completed === todayData.total) {
    streak++
  }

  return streak
}

export function getTodayProgress(taskAssignments) {
  const todayStr = toDateStr(new Date())
  const todayTasks = taskAssignments.filter(
    (t) => t.assigned_date === todayStr
  )
  const total = todayTasks.length
  const completed = todayTasks.filter((t) => t.status === 'completed').length
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

export const CONSISTENCY_WINDOW_DAYS = 30

/** First date (YYYY-MM-DD) of the rolling consistency window, e.g. Mar 18 when today is Apr 18. */
export function consistencyWindowStart() {
  const d = new Date()
  d.setDate(d.getDate() - CONSISTENCY_WINDOW_DAYS)
  return toDateStr(d)
}

/**
 * Consistency over the last 30 days up to and including today.
 * Future-dated tasks are ignored. `missed` = past days' tasks never completed.
 */
export function calculateConsistency(taskAssignments) {
  const start = consistencyWindowStart()
  const today = toDateStr(new Date())
  const inWindow = taskAssignments.filter(
    (t) => t.assigned_date >= start && t.assigned_date <= today && !t.is_rest_day
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
