import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { calculateStreak, calculateConsistency, getRange, toDateStr } from '../../utils/streak'
import { fetchTherapistPatients } from '../../utils/patients'
import { MOOD_CONFIG } from '../../components/therapist/PatientMoodChart'
import Card from '../../components/ui/Card'
import { Users, ClipboardCheck, Target, FileText, Heart, AlertTriangle, Flame, ChevronRight } from 'lucide-react'
import { getTimeOfDay, formatLongDate } from '../../utils/time'

export default function TherapistDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useCachedState('therapist-dash-stats', { patients: 0, todayTasks: 0, completedToday: 0, avgConsistency: 0, notes: 0 })
  const [topMood, setTopMood] = useCachedState('therapist-dash-top-mood', null)
  const [enrichedPatients, setEnrichedPatients] = useCachedState('therapist-dash-enriched', [])
  const [patientsWithoutTasks, setPatientsWithoutTasks] = useState([])
  const [loading, setLoading] = useState(() => !hasCache('therapist-dash-stats'))
  const [error, setError] = useState(null)

  async function loadDashboard(cancelled = false) {
    const today = toDateStr(new Date())
    const week = getRange('week')

    const { data: patients, error: patientsErr } = await fetchTherapistPatients(profile.id)
    if (patientsErr) {
      setError('Failed to load dashboard data. Please try again.')
      setLoading(false)
      return
    }
    const patientIds = patients.map((p) => p.patient_id)

    // Whole history for this therapist's tasks: consistency is measured over
    // the full course of therapy, missed/assigned counts over the current week.
    const [tasksRes, notesRes, moodRes] = await Promise.all([
      patientIds.length
        ? supabase
          .from('task_assignments')
          .select('patient_id, assigned_date, status, is_rest_day')
          .eq('therapist_id', profile.id)
          .in('patient_id', patientIds)
        : Promise.resolve({ data: [] }),
      patientIds.length
        ? supabase.from('caregiver_notes').select('*').in('patient_id', patientIds)
        : Promise.resolve({ data: [] }),
      patientIds.length
        ? supabase
          .from('task_feedback')
          .select('mood')
          .in('patient_id', patientIds)
          .gte('created_at', new Date(`${week.from}T00:00:00`).toISOString())
        : Promise.resolve({ data: [] }),
    ])

    if (cancelled) return
    if (tasksRes.error) {
      setError('Failed to load dashboard data. Please try again.')
      setLoading(false)
      return
    }
    setError(null)

    const allTasks = tasksRes.data || []
    const byPatient = {}
    allTasks.forEach((t) => {
      if (!byPatient[t.patient_id]) byPatient[t.patient_id] = []
      byPatient[t.patient_id].push(t)
    })

    const patientDetails = patients.map((p) => {
      const tasks = byPatient[p.patient_id] || []
      const todayRows = tasks.filter((t) => t.assigned_date === today)
      const todayTasks = todayRows.filter((t) => !t.is_rest_day)
      return {
        ...p.profiles,
        totalToday: todayTasks.length,
        completedToday: todayTasks.filter((t) => t.status === 'completed').length,
        restDayToday: todayRows.some((t) => t.is_rest_day),
        streak: calculateStreak(tasks),
        consistency: calculateConsistency(tasks).percent,
        hasTasks: calculateConsistency(tasks).total > 0,
        missed: calculateConsistency(tasks, week).missed,
      }
    })

    setEnrichedPatients(patientDetails)
    setPatientsWithoutTasks(patientDetails.filter((p) => p.totalToday === 0 && !p.restDayToday))

    const moods = moodRes.data || []
    if (moods.length) {
      const counts = {}
      moods.forEach((f) => { counts[f.mood] = (counts[f.mood] || 0) + 1 })
      setTopMood(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
    } else {
      setTopMood(null)
    }

    const withTasks = patientDetails.filter((p) => p.hasTasks)
    setStats({
      patients: patients.length,
      todayTasks: patientDetails.reduce((s, p) => s + p.totalToday, 0),
      completedToday: patientDetails.reduce((s, p) => s + p.completedToday, 0),
      // Same definition as the Consistency page: patients who have had tasks
      avgConsistency: withTasks.length
        ? Math.round(withTasks.reduce((sum, p) => sum + p.consistency, 0) / withTasks.length)
        : 0,
      notes: (notesRes.data || []).filter((n) => !n.therapist_read_at).length,
    })

    setLoading(false)
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    loadDashboard(cancelled)
    return () => { cancelled = true }
  }, [profile])
  /* eslint-enable react-hooks/exhaustive-deps */

  const statCards = useMemo(() => [
    { label: 'Patients', value: stats.patients, icon: Users, bgColor: 'bg-primary-container', color: 'text-primary', to: '/therapist/patients' },
    { label: "Today's Tasks", value: `${stats.completedToday}/${stats.todayTasks}`, icon: ClipboardCheck, bgColor: 'bg-secondary-container', color: 'text-secondary', to: '/therapist/today' },
    { label: 'Avg Consistency', value: `${stats.avgConsistency}%`, icon: Target, bgColor: 'bg-success-bg', color: 'text-success', to: '/therapist/consistency' },
    { label: 'Unread Client Notes', value: stats.notes, icon: FileText, bgColor: 'bg-tertiary-container', color: 'text-tertiary', to: '/therapist/client-notes/recent' },
  ], [stats])

  const topMoodInfo = topMood ? MOOD_CONFIG[topMood] : null

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
          <button onClick={() => { setError(null); loadDashboard() }} className="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      )}
      <header>
        <p className="text-sm font-semibold text-primary">{formatLongDate()}</p>
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">
          Good {getTimeOfDay()}, {profile?.full_name?.split(' ')[0]}
        </h2>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-text-secondary">
            Here&apos;s an overview of your therapy practice today
          </p>
          {topMoodInfo && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-container/50 text-xs font-semibold text-text-secondary">
              <Heart size={11} className="text-primary" />
              {topMoodInfo.emoji} {topMood} this week
            </span>
          )}
        </div>
      </header>

      {patientsWithoutTasks.length > 0 && (
        <Card className="!p-5 !border-2 !border-red-200 !bg-red-50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="hidden sm:block p-2.5 rounded-xl bg-red-100 shrink-0">
              <AlertTriangle size={22} className="text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700">
                {patientsWithoutTasks.length === enrichedPatients.length
                  ? 'No tasks assigned today'
                  : `${patientsWithoutTasks.length} patient${patientsWithoutTasks.length !== 1 ? 's' : ''} without tasks today`}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {patientsWithoutTasks.map((p) => p.full_name).join(', ')} {patientsWithoutTasks.length === 1 ? "doesn't" : "don't"} have any tasks scheduled for today.
              </p>
            </div>
            <Link
              to="/therapist/patients"
              className="shrink-0 text-center px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
            >
              View Patients
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* eslint-disable-next-line no-unused-vars */}
        {statCards.map(({ label, value, icon: Icon, bgColor, color, to }) => (
          <Link key={label} to={to} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Card className="h-full transition-all group-hover:shadow-md group-hover:border-primary/30">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`p-3 rounded-xl shrink-0 ${bgColor} ${color}`}>
                  <Icon size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl sm:text-3xl font-extrabold text-text-primary font-heading">{value}</p>
                  <p className="text-xs font-medium text-text-muted mt-0.5">{label}</p>
                </div>
                <ChevronRight size={16} className="hidden sm:block text-text-muted group-hover:text-primary shrink-0" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Patient Summary Table */}
      {enrichedPatients.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-text-primary">Patient Overview</h3>
            <Link
              to="/therapist/patients"
              className="py-2 text-sm text-primary font-bold hover:underline"
            >
              View all
            </Link>
          </div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-bold text-text-muted uppercase tracking-wider px-4 sm:px-5 py-3">Patient</th>
                  <th className="text-center text-xs font-bold text-text-muted uppercase tracking-wider px-3 py-3">Today</th>
                  <th className="hidden sm:table-cell text-center text-xs font-bold text-text-muted uppercase tracking-wider px-3 py-3">Streak</th>
                  <th className="hidden sm:table-cell text-center text-xs font-bold text-text-muted uppercase tracking-wider px-3 py-3" title="This week (Sun–Sat)">Missed (week)</th>
                  <th className="text-center text-xs font-bold text-text-muted uppercase tracking-wider px-3 py-3" title="Whole course of therapy">Consistency</th>
                </tr>
              </thead>
              <tbody>
                {enrichedPatients.map((patient) => {
                  const allDone = patient.totalToday > 0 && patient.completedToday === patient.totalToday
                  return (
                    <tr
                      key={patient.id}
                      onClick={() => navigate(`/therapist/patients/${patient.id}`)}
                      className="border-b border-border/50 last:border-0 hover:bg-primary-container/10 transition-colors cursor-pointer"
                    >
                      <td className="px-4 sm:px-5 py-3.5">
                        <p className="text-sm font-semibold text-text-primary">{patient.full_name}</p>
                        {patient.condition && (
                          <p className="text-xs text-text-muted mt-0.5">{patient.condition}</p>
                        )}
                      </td>
                      <td className="text-center px-3 py-3.5">
                        {patient.totalToday > 0 ? (
                          <span className={`text-sm font-bold ${allDone ? 'text-green-600' : 'text-amber-600'}`}>
                            {patient.completedToday}/{patient.totalToday}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">{patient.restDayToday ? 'Rest day' : '—'}</span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell text-center px-3 py-3.5">
                        {patient.streak > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-500">
                            <Flame size={14} />
                            {patient.streak}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">0</span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell text-center px-3 py-3.5">
                        <span className={`text-sm font-bold ${patient.missed > 0 ? 'text-red-500' : 'text-text-muted'}`}>
                          {patient.missed || 0}
                        </span>
                      </td>
                      <td className="text-center px-3 py-3.5">
                        <span className={`text-sm font-bold ${
                          patient.consistency >= 80 ? 'text-green-600'
                          : patient.consistency >= 50 ? 'text-amber-600'
                          : 'text-red-500'
                        }`}>
                          {patient.consistency}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  )
}
