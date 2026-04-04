import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus'
import { calculateStreak } from '../../utils/streak'
import Card from '../../components/ui/Card'
import { Flame, Target, Calendar, BarChart3 } from 'lucide-react'

const MOOD_CONFIG = {
  excited: { emoji: '🤩', color: '#f59e0b' },
  happy: { emoji: '😊', color: '#22c55e' },
  calm: { emoji: '😌', color: '#3b82f6' },
  scared: { emoji: '😨', color: '#8b5cf6' },
  anxious: { emoji: '😰', color: '#f97316' },
  angry: { emoji: '😠', color: '#ef4444' },
  tired: { emoji: '😴', color: '#6b7280' },
  sad: { emoji: '😢', color: '#1e40af' },
}

export default function ProgressPage() {
  const { profile } = useAuth()
  const [allTasks, setAllTasks] = useCachedState('patient-progress-tasks', [])
  const [feedback, setFeedback] = useCachedState('patient-progress-feedback', [])
  const [remarks, setRemarks] = useCachedState('patient-progress-remarks', [])
  const [loading, setLoading] = useState(() => !hasCache('patient-progress-tasks'))
  const [error, setError] = useState(null)
  const refreshKey = useRefreshOnFocus()

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    Promise.all([
      // All task assignments ever (for streak + consistency)
      supabase
        .from('task_assignments')
        .select('assigned_date, status')
        .eq('patient_id', profile.id)
        .order('assigned_date', { ascending: false }),
      // Feedback from last 30 days
      supabase
        .from('task_feedback')
        .select('mood, created_at')
        .eq('patient_id', profile.id)
        .gte('created_at', thirtyDaysAgo.toISOString()),
      // Daily remarks
      supabase
        .from('daily_remarks')
        .select('date, content')
        .eq('patient_id', profile.id)
        .order('date', { ascending: false })
        .limit(30),
    ]).then(([tasksRes, feedbackRes, remarksRes]) => {
      if (tasksRes.error || feedbackRes.error || remarksRes.error) {
        setError('Failed to load progress data. Please try again.')
        setLoading(false)
        return
      }
      setError(null)
      setAllTasks(tasksRes.data || [])
      setFeedback(feedbackRes.data || [])
      setRemarks(remarksRes.data || [])
      setLoading(false)
    }).catch(() => {
      setError('Failed to load progress data. Please try again.')
      setLoading(false)
    })
  }, [profile, refreshKey])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Streak calculation
  const streak = calculateStreak(allTasks)

  // Consistency calculation
  const totalCompleted = allTasks.filter((t) => t.status === 'completed').length
  const totalAssigned = allTasks.length
  const consistency = totalAssigned > 0 ? ((totalCompleted / totalAssigned) * 100).toFixed(1) : '0.0'

  // Mood frequency chart data
  const moodCounts = {}
  Object.keys(MOOD_CONFIG).forEach((m) => { moodCounts[m] = 0 })
  feedback.forEach((f) => {
    if (moodCounts[f.mood] !== undefined) moodCounts[f.mood]++
  })
  const moodData = Object.entries(MOOD_CONFIG).map(([key, { emoji, color }]) => ({
    mood: key,
    emoji,
    color,
    count: moodCounts[key],
  }))

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
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">My Progress</h2>
        <p className="text-text-secondary mt-2">Track your therapy journey</p>
      </div>

      {/* Task Completion Stats */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-warning-bg">
              <Flame size={22} className="text-warning" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-text-primary font-heading">{streak}</p>
              <p className="text-xs font-medium text-text-muted mt-0.5">Day Streak</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-success-bg">
              <Target size={22} className="text-success" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-text-primary font-heading">{consistency}%</p>
              <p className="text-xs font-medium text-text-muted mt-0.5">Consistency</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Mood Summary Chart */}
      <Card>
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 size={18} className="text-primary" />
          <h3 className="text-lg font-bold text-text-primary">Mood Summary</h3>
          <span className="text-xs text-text-muted">(last 30 days)</span>
        </div>
        {feedback.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">
            No mood data yet. Complete tasks and share how you feel!
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={moodData} barCategoryGap="20%">
              <XAxis
                dataKey="emoji"
                tick={{ fontSize: 18 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                formatter={(value, name, { payload }) => [value, payload.mood]}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {moodData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Therapy Session Remarks */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={18} className="text-primary" />
          <h3 className="text-lg font-bold text-text-primary">Therapy Session Remarks</h3>
        </div>
        <div className="space-y-3">
          {remarks.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted text-center py-6">
                No session remarks yet. Write remarks on your schedule days!
              </p>
            </Card>
          ) : (
            remarks.map((r) => (
              <Card key={r.date}>
                <p className="text-xs font-semibold text-text-muted mb-1">
                  {new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm text-text-primary">{r.content}</p>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
