function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

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
    const dateStr = toLocalDateStr(d)
    const day = byDate[dateStr]

    if (!day) {
      // No tasks assigned — doesn't break streak, but stop after 90 days
      if ((today - d) / 86400000 > 90) break
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
  const todayStr = toLocalDateStr(today)
  const todayData = byDate[todayStr]
  if (todayData && todayData.total > 0 && todayData.completed === todayData.total) {
    streak++
  }

  return streak
}

export function getTodayProgress(taskAssignments) {
  const todayStr = toLocalDateStr(new Date())
  const todayTasks = taskAssignments.filter(
    (t) => t.assigned_date === todayStr
  )
  const total = todayTasks.length
  const completed = todayTasks.filter((t) => t.status === 'completed').length
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 }
}
