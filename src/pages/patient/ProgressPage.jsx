import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus'
import { calculateStreak, calculateConsistency, toDateStr } from '../../utils/streak'
import Card from '../../components/ui/Card'
import { Flame, Target, CheckCircle, TrendingUp } from 'lucide-react'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ProgressPage() {
  const { profile } = useAuth()
  const [allTasks, setAllTasks] = useCachedState('patient-progress-tasks', [])
  const [loading, setLoading] = useState(() => !hasCache('patient-progress-tasks'))
  const [error, setError] = useState(null)
  const refreshKey = useRefreshOnFocus()

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return

    // 90 days covers the streak lookback and the 30-day consistency window
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    supabase
      .from('task_assignments')
      .select('assigned_date, status, is_rest_day')
      .eq('patient_id', profile.id)
      .gte('assigned_date', toDateStr(ninetyDaysAgo))
      .order('assigned_date', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError('Failed to load progress data. Please try again.')
          setLoading(false)
          return
        }
        setError(null)
        setAllTasks(data || [])
        setLoading(false)
      })
  }, [profile, refreshKey])
  /* eslint-enable react-hooks/exhaustive-deps */

  const streak = calculateStreak(allTasks)
  const { percent: consistency, completed, total } = calculateConsistency(allTasks)

  // This week (last 7 days including today)
  const week = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = toDateStr(d)
    const dayTasks = allTasks.filter((t) => t.assigned_date === dateStr)
    week.push({
      dateStr,
      label: DAY_LABELS[d.getDay()],
      day: d.getDate(),
      total: dayTasks.length,
      done: dayTasks.filter((t) => t.status === 'completed').length,
      isToday: i === 0,
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}
      <div>
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Weekly Progress</h2>
        <p className="text-text-secondary mt-2">Track your therapy journey</p>
      </div>

      {/* Task Completion Stats */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="p-3 rounded-xl bg-warning-bg shrink-0">
              <Flame size={22} className="text-warning" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-3xl font-extrabold text-text-primary font-heading">{streak}</p>
              <p className="text-xs font-medium text-text-muted mt-0.5">Day Streak</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="p-3 rounded-xl bg-success-bg shrink-0">
              <Target size={22} className="text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-3xl font-extrabold text-text-primary font-heading">{consistency}%</p>
              <p className="text-xs font-medium text-text-muted mt-0.5">
                Consistency <span className="whitespace-nowrap">(last 30 days)</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* This week */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={18} className="text-primary" />
          <h3 className="text-lg font-bold text-text-primary">This Week</h3>
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          {week.map((d) => {
            const allDone = d.total > 0 && d.done === d.total
            return (
              <div
                key={d.dateStr}
                className={`flex flex-col items-center gap-1 rounded-2xl py-3 ${
                  d.isToday ? 'bg-primary-container ring-2 ring-primary' : 'bg-surface-alt'
                }`}
              >
                <span className="text-[10px] font-bold text-text-muted uppercase">{d.label}</span>
                <span className="text-sm font-bold text-text-primary">{d.day}</span>
                {d.total === 0 ? (
                  <span className="text-[10px] text-text-muted">—</span>
                ) : allDone ? (
                  <CheckCircle size={16} className="text-success" />
                ) : (
                  <span className="text-[10px] font-bold text-amber-600">{d.done}/{d.total}</span>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-text-muted mt-4">
          {completed} of {total} task{total !== 1 ? 's' : ''} completed in the last 30 days
        </p>
      </Card>
    </div>
  )
}
