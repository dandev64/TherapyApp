import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { toDateStr } from '../../utils/streak'
import { fetchTherapistPatients } from '../../utils/patients'
import { formatExpected, formatLongDate } from '../../utils/time'
import { isScheduled } from '../../utils/tasks'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { ArrowLeft, ChevronRight, ClipboardCheck } from 'lucide-react'

/** Every task due today across the therapist's active patients. Reached from the dashboard card. */
export default function TodayTasksPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useCachedState('therapist-today-tasks', [])
  const [loading, setLoading] = useState(() => !hasCache('therapist-today-tasks'))
  const [error, setError] = useState(null)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      const { data: patients } = await fetchTherapistPatients(profile.id)
      const ids = patients.map((p) => p.patient_id)
      if (!ids.length) { if (!cancelled) { setTasks([]); setLoading(false) } return }
      const { data, error: err } = await supabase
        .from('task_assignments')
        .select('*, patient:profiles!task_assignments_patient_id_fkey(full_name)')
        .eq('therapist_id', profile.id)
        .in('patient_id', ids)
        .eq('assigned_date', toDateStr(new Date()))
        .order('assigned_time', { ascending: true })
      if (cancelled) return
      if (err) { setError('Failed to load today’s tasks.'); setLoading(false); return }
      setError(null)
      setTasks((data || []).filter((t) => !t.is_rest_day))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [profile])
  /* eslint-enable react-hooks/exhaustive-deps */

  const done = tasks.filter((t) => t.status === 'completed').length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/therapist')}
          aria-label="Back to dashboard"
          className="p-2 -ml-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer text-text-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Today&apos;s Tasks</h2>
          <p className="text-text-secondary mt-1">
            {formatLongDate()}{tasks.length > 0 ? ` · ${done} of ${tasks.length} completed` : ''}
          </p>
        </div>
        <Link to="/therapist/assignments" className="shrink-0 py-2 text-sm font-bold text-primary hover:underline">
          See All Tasks
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <ClipboardCheck size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">No tasks are due today.</p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                to={`/therapist/assignments?task=${task.id}`}
                className="flex items-center gap-4 rounded-2xl bg-surface-card border border-border-light px-5 py-4 hover:border-primary/30 hover:shadow-md transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-primary truncate">
                    {task.patient?.full_name || 'Patient'} – {task.title}
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    {task.assigned_time ? formatExpected(task.assigned_time) : 'No time set'}
                    {isScheduled(task) && ' · not posted yet'}
                    {task.requires_proof && ' · photo proof required'}
                  </p>
                  {task.description && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-1">{task.description}</p>
                  )}
                </div>
                <Badge color={task.status}>{task.status.replace('_', ' ')}</Badge>
                <ChevronRight size={16} className="text-text-muted shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
