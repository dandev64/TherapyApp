import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
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
  const [tasks, setTasks] = useCachedState('patient-tasks', [])
  const [loading, setLoading] = useState(() => !hasCache('patient-tasks'))

  useEffect(() => {
    if (profile) loadTasks()
  }, [profile])

  async function loadTasks() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('task_assignments')
      .select('*, task_templates(title, description, therapy_type, duration_minutes)')
      .eq('patient_id', profile.id)
      .eq('assigned_date', today)
      .order('created_at', { ascending: true })
    setTasks(data || [])
    setLoading(false)
  }

  async function updateStatus(taskId, newStatus) {
    const updates = { status: newStatus }
    if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString()
    }
    await supabase.from('task_assignments').update(updates).eq('id', taskId)
    loadTasks()
  }

  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  const grouped = {
    morning: tasks.filter((t) => t.assigned_time_of_day === 'morning'),
    afternoon: tasks.filter((t) => t.assigned_time_of_day === 'afternoon'),
    evening: tasks.filter((t) => t.assigned_time_of_day === 'evening'),
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
      <div>
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">
          Good {getTimeOfDay()}, {profile?.full_name?.split(' ')[0]}
        </h2>
        <p className="text-text-secondary mt-2">
          Here are your therapy tasks for today
        </p>
      </div>

      {/* Progress Card */}
      <Card className="!p-6">
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
        </div>
        <div className="w-full h-3 bg-surface-alt rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-primary to-primary-light"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-text-muted mt-2">{progress}% complete</p>
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
                    <Card key={task.id}>
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
                            {task.task_templates?.title}
                          </p>
                          {task.task_templates?.description && (
                            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                              {task.task_templates.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge color={task.task_templates?.therapy_type}>
                              {task.task_templates?.therapy_type}
                            </Badge>
                            <span className="text-xs text-text-muted flex items-center gap-1">
                              <Clock size={11} />
                              {task.task_templates?.duration_minutes} min
                            </span>
                          </div>
                        </div>

                        {config.next && (
                          <Button
                            size="sm"
                            variant={task.status === 'in_progress' ? 'primary' : 'secondary'}
                            onClick={() => updateStatus(task.id, config.next)}
                          >
                            {config.label}
                          </Button>
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
                        {task.task_templates?.title}
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
