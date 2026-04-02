import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus'
import { calculateStreak } from '../../utils/streak'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import {
  CheckCircle,
  Circle,
  PlayCircle,
  Clock,
  Sun,
  Sunset,
  Moon,
  Trophy,
  Flame,
  AlertTriangle,
  CheckSquare,
  ChevronRight,
} from 'lucide-react'

const timeIcons = {
  morning: Sun,
  afternoon: Sunset,
  evening: Moon,
}

const statusConfig = {
  pending: { icon: Circle, label: 'Start', next: 'in_progress' },
  in_progress: { icon: PlayCircle, label: 'Complete', next: 'completed' },
  completed: { icon: CheckCircle, label: 'Done', next: null },
}

export default function PatientDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useCachedState('patient-tasks', [])
  const [allTasks, setAllTasks] = useCachedState('patient-streak-tasks', [])
  const [loading, setLoading] = useState(() => !hasCache('patient-tasks'))
  const [error, setError] = useState(null)
  const refreshKey = useRefreshOnFocus()

  useEffect(() => {
    if (profile) {
      loadTasks()
      loadStreakData()
    }
  }, [profile, refreshKey])

  async function loadTasks() {
    const today = new Date().toISOString().split('T')[0]
    const { data, error: err } = await supabase
      .from('task_assignments')
      .select('*')
      .eq('patient_id', profile.id)
      .eq('assigned_date', today)
      .order('created_at', { ascending: true })
    if (err) { setError('Failed to load tasks. Please try again.'); setLoading(false); return }
    setError(null)
    setTasks(data || [])
    setLoading(false)
  }

  async function loadStreakData() {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const { data, error: err } = await supabase
      .from('task_assignments')
      .select('assigned_date, status, is_rest_day')
      .eq('patient_id', profile.id)
      .gte('assigned_date', ninetyDaysAgo.toISOString().split('T')[0])
      .order('assigned_date', { ascending: false })
    if (!err) setAllTasks(data || [])
  }

  const streak = calculateStreak(allTasks)

  const total = tasks.filter((t) => !t.is_rest_day).length
  const completed = tasks.filter((t) => !t.is_rest_day && t.status === 'completed').length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const remaining = total - completed
  const progressColor =
    total === 0 ? 'from-primary to-primary-light'
    : progress === 100 ? 'from-green-500 to-emerald-400'
    : progress > 0 ? 'from-amber-500 to-yellow-400'
    : 'from-red-500 to-rose-400'

  function getTimeBucket(task) {
    if (task.assigned_time_of_day) return task.assigned_time_of_day
    if (task.assigned_time) {
      const hour = parseInt(task.assigned_time.split(':')[0])
      if (hour < 12) return 'morning'
      if (hour < 17) return 'afternoon'
      return 'evening'
    }
    return 'morning'
  }

  const grouped = {
    morning: tasks.filter((t) => getTimeBucket(t) === 'morning'),
    afternoon: tasks.filter((t) => getTimeBucket(t) === 'afternoon'),
    evening: tasks.filter((t) => getTimeBucket(t) === 'evening'),
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
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium flex items-center justify-between">
          {error}
          <button onClick={() => { setError(null); loadTasks() }} className="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      )}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">
            Good {getTimeOfDay()}, {profile?.full_name?.split(' ')[0]}
          </h2>
          {streak > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/10 text-warning">
              <Flame size={16} />
              <span className="text-sm font-bold">{streak}</span>
            </span>
          )}
        </div>
        <p className="text-text-secondary mt-2">
          Here are your therapy tasks for today
        </p>
      </div>

      {/* Progress Card */}
      <Card className={`!p-6 ${total > 0 && remaining > 0 ? '!border-red-300 !bg-red-50/30' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-text-secondary">Today&apos;s Progress</p>
            <p className="text-3xl font-bold text-text-primary mt-1">
              {completed}
              <span className="text-lg text-text-muted font-normal"> / {total}</span>
            </p>
          </div>
          {completed === total && total > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-success-bg">
              <Trophy size={20} className="text-success" />
              <span className="text-sm font-bold text-success">All done!</span>
            </div>
          )}
          {total > 0 && remaining > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-red-100">
              <AlertTriangle size={18} className="text-red-500" />
              <span className="text-xs font-bold text-red-600">{remaining} left</span>
            </div>
          )}
        </div>
        <div className="w-full h-3 bg-surface-alt rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r ${progressColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`text-xs mt-2 font-medium ${
          progress === 100 ? 'text-green-600'
          : progress > 0 ? 'text-amber-600'
          : total > 0 ? 'text-red-500'
          : 'text-text-muted'
        }`}>
          {total === 0
            ? 'No tasks today'
            : progress === 100
            ? 'All done!'
            : `${remaining} task${remaining !== 1 ? 's' : ''} remaining`}
        </p>
      </Card>

      {/* Task Groups */}
      {total === 0 ? (
        <Card>
          <div className="text-center py-8">
            <Clock size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              No tasks assigned for today. Check back later!
            </p>
          </div>
        </Card>
      ) : (
        Object.entries(grouped).map(([time, timeTasks]) => {
          if (timeTasks.length === 0) return null
          const TimeIcon = timeIcons[time]
          return (
            <div key={time}>
              <div className="flex items-center gap-2 mb-3">
                <TimeIcon size={16} className="text-text-muted" />
                <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
                  {time}
                </h3>
                <Badge color={time}>{timeTasks.length} tasks</Badge>
              </div>

              <div className="space-y-3">
                {timeTasks.map((task) => {
                  const config = statusConfig[task.status]
                  const StatusIcon = config.icon
                  return (
                    <Card key={task.id} hover className={`${task.status !== 'completed' && !task.is_rest_day ? '!border-red-300 !bg-red-50/30' : ''}`} onClick={() => navigate(`/patient/task/${task.id}`)}>
                      <div className="flex items-center gap-4">
                        <div
                          className={`shrink-0 ${
                            task.status === 'completed'
                              ? 'text-success'
                              : task.status === 'in_progress'
                              ? 'text-primary'
                              : 'text-text-muted'
                          }`}
                        >
                          <StatusIcon size={24} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold ${
                              task.status === 'completed'
                                ? 'text-text-muted line-through'
                                : 'text-text-primary'
                            }`}
                          >
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                              {task.description}
                            </p>
                          )}
                          {(task.assigned_time || task.requires_proof) && (
                            <div className="flex items-center gap-2 mt-1.5">
                              {task.assigned_time && (
                                <span className="text-xs text-text-muted flex items-center gap-1">
                                  <Clock size={11} />
                                  {new Date(`2000-01-01T${task.assigned_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </span>
                              )}
                              {task.requires_proof && (
                                <span className="text-xs text-primary flex items-center gap-1">
                                  <CheckSquare size={11} />
                                  Proof required
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {config.next ? (
                          <Button
                            size="sm"
                            variant={task.status === 'in_progress' ? 'primary' : 'secondary'}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/patient/task/${task.id}`)
                            }}
                          >
                            {config.label}
                          </Button>
                        ) : (
                          <ChevronRight size={16} className="text-text-muted shrink-0" />
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      {/* Activity Timeline */}
      {tasks.some((t) => t.status === 'completed') && (
        <div>
          <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">
            Completed Today
          </h3>
          <Card>
            <div className="space-y-3">
              {tasks
                .filter((t) => t.status === 'completed')
                .map((task, i) => (
                  <div key={task.id} className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      {i < tasks.filter((t) => t.status === 'completed').length - 1 && (
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-px h-6 bg-border-light" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {task.title}
                      </p>
                      <p className="text-xs text-text-muted">
                        Completed at{' '}
                        {task.completed_at
                          ? new Date(task.completed_at).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : '—'}
                      </p>
                    </div>
                    <CheckCircle size={16} className="text-success" />
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}

    </div>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
