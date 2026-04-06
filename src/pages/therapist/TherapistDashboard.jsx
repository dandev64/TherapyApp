import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { calculateStreak, toDateStr } from '../../utils/streak'
import PatientMoodChart, { MOOD_CONFIG } from '../../components/therapist/PatientMoodChart'
import Card from '../../components/ui/Card'
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Users, ClipboardCheck, Target, FileText, Heart, AlertTriangle, Flame, TrendingUp } from 'lucide-react'
import { getTimeOfDay } from '../../utils/time'

export default function TherapistDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useCachedState('therapist-dash-stats', { patients: 0, todayTasks: 0, completedToday: 0, avgConsistency: 0, notes: 0 })
  const [topMood, setTopMood] = useCachedState('therapist-dash-top-mood', null)
  const [enrichedPatients, setEnrichedPatients] = useCachedState('therapist-dash-enriched', [])
  const [dailyCompletion, setDailyCompletion] = useCachedState('therapist-dash-daily', [])
  const [moodFeedback, setMoodFeedback] = useCachedState('therapist-dash-mood-fb', [])
  const [patientsWithoutTasks, setPatientsWithoutTasks] = useState([])
  const [loading, setLoading] = useState(() => !hasCache('therapist-dash-stats'))
  const [error, setError] = useState(null)

  async function loadDashboard(cancelled = false) {
    const today = toDateStr(new Date())
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
    const fourteenDaysAgoStr = toDateStr(fourteenDaysAgo)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const ninetyDaysAgoStr = toDateStr(ninetyDaysAgo)

    const results = await Promise.all([
      supabase
        .from('patient_assignments')
        .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email, condition)')
        .eq('assigned_to', profile.id)
        .eq('relationship', 'therapist'),
      supabase
        .from('task_assignments')
        .select('status')
        .eq('therapist_id', profile.id)
        .eq('assigned_date', today),
      supabase
        .from('caregiver_notes')
        .select('id', { count: 'exact' })
        .in(
          'patient_id',
          (await supabase
            .from('patient_assignments')
            .select('patient_id')
            .eq('assigned_to', profile.id)
            .eq('relationship', 'therapist')
          ).data?.map((a) => a.patient_id) || []
        ),
    ])

    const [assignmentsRes, tasksRes, notesRes] = results
    if (assignmentsRes.error || tasksRes.error) {
      setError('Failed to load dashboard data. Please try again.')
      setLoading(false)
      return
    }
    setError(null)

    const patients = assignmentsRes.data || []
    const tasks = tasksRes.data || []
    const completedToday = tasks.filter((t) => t.status === 'completed').length

    const patientIds = patients.map((p) => p.patient_id)

    // Batch-fetch today's tasks and all tasks for all patients (2 queries instead of 2*N)
    const [todayBatchRes, allBatchRes] = await Promise.all([
      supabase
        .from('task_assignments')
        .select('patient_id, status')
        .eq('therapist_id', profile.id)
        .in('patient_id', patientIds)
        .eq('assigned_date', today),
      supabase
        .from('task_assignments')
        .select('patient_id, assigned_date, status')
        .eq('therapist_id', profile.id)
        .in('patient_id', patientIds)
        .gte('assigned_date', ninetyDaysAgoStr)
        .order('assigned_date', { ascending: false }),
    ])

    const todayByPatient = {}
    ;(todayBatchRes.data || []).forEach((t) => {
      if (!todayByPatient[t.patient_id]) todayByPatient[t.patient_id] = []
      todayByPatient[t.patient_id].push(t)
    })
    const allByPatient = {}
    ;(allBatchRes.data || []).forEach((t) => {
      if (!allByPatient[t.patient_id]) allByPatient[t.patient_id] = []
      allByPatient[t.patient_id].push(t)
    })

    const patientDetails = patients.map((p) => {
      const todayTasks = todayByPatient[p.patient_id] || []
      const allTasks = allByPatient[p.patient_id] || []
      const totalCompleted = allTasks.filter((t) => t.status === 'completed').length
      const consistency = allTasks.length > 0 ? Math.round((totalCompleted / allTasks.length) * 100) : 0

      return {
        ...p.profiles,
        totalToday: todayTasks.length,
        completedToday: todayTasks.filter((t) => t.status === 'completed').length,
        streak: calculateStreak(allTasks),
        consistency,
      }
    })

    if (cancelled) return

    setEnrichedPatients(patientDetails)
    setPatientsWithoutTasks(patientDetails.filter((p) => p.totalToday === 0))

    // 14-day completion chart data
    if (patientIds.length > 0) {
      const { data: recentTasks } = await supabase
        .from('task_assignments')
        .select('assigned_date, status')
        .eq('therapist_id', profile.id)
        .in('patient_id', patientIds)
        .gte('assigned_date', fourteenDaysAgoStr)
        .lte('assigned_date', today)

      if (cancelled) return

      const byDate = {}
      ;(recentTasks || []).forEach((t) => {
        if (!byDate[t.assigned_date]) byDate[t.assigned_date] = { total: 0, completed: 0 }
        byDate[t.assigned_date].total++
        if (t.status === 'completed') byDate[t.assigned_date].completed++
      })

      const chartData = []
      for (let i = 13; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = toDateStr(d)
        const entry = byDate[dateStr]
        chartData.push({
          date: dateStr,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          percent: entry && entry.total > 0 ? Math.round((entry.completed / entry.total) * 100) : 0,
          total: entry?.total || 0,
          completed: entry?.completed || 0,
        })
      }
      setDailyCompletion(chartData)
    }

    // Mood feedback for chart
    if (patientIds.length > 0) {
      const { data: fbData } = await supabase
        .from('task_feedback')
        .select('mood, created_at')
        .in('patient_id', patientIds)
        .gte('created_at', weekAgo.toISOString())

      if (cancelled) return

      setMoodFeedback(fbData || [])

      if (fbData && fbData.length > 0) {
        const moodCounts = {}
        fbData.forEach((f) => { moodCounts[f.mood] = (moodCounts[f.mood] || 0) + 1 })
        let best = null, bestCount = 0
        Object.entries(moodCounts).forEach(([mood, count]) => {
          if (count > bestCount) { best = mood; bestCount = count }
        })
        setTopMood(best)
      }
    }

    const avgConsistency = patientDetails.length > 0
      ? Math.round(patientDetails.reduce((sum, p) => sum + p.consistency, 0) / patientDetails.length)
      : 0

    setStats({
      patients: patients.length,
      todayTasks: tasks.length,
      completedToday,
      avgConsistency,
      notes: notesRes.count || 0,
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
    { label: 'Patients', value: stats.patients, icon: Users, bgColor: 'bg-primary-container', color: 'text-primary' },
    { label: "Today's Tasks", value: `${stats.completedToday}/${stats.todayTasks}`, icon: ClipboardCheck, bgColor: 'bg-secondary-container', color: 'text-secondary' },
    { label: 'Avg Consistency', value: `${stats.avgConsistency}%`, icon: Target, bgColor: 'bg-success-bg', color: 'text-success' },
    { label: 'Caregiver Notes', value: stats.notes, icon: FileText, bgColor: 'bg-tertiary-container', color: 'text-tertiary' },
  ], [stats])

  const topMoodInfo = topMood ? MOOD_CONFIG[topMood] : null

  function getBarColor(percent) {
    if (percent >= 80) return '#22c55e'
    if (percent >= 50) return '#f59e0b'
    if (percent > 0) return '#ef4444'
    return '#e5e7eb'
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
          <button onClick={() => { setError(null); loadDashboard() }} className="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      )}
      <header>
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
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-red-100 shrink-0">
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
              className="shrink-0 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
            >
              View Patients
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {/* eslint-disable-next-line no-unused-vars */}
        {statCards.map(({ label, value, icon: Icon, bgColor, color }) => (
          <Card key={label}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${bgColor} ${color}`}>
                <Icon size={22} />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-text-primary font-heading">{value}</p>
                <p className="text-xs font-medium text-text-muted mt-0.5">{label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 14-Day Completion Chart */}
        <Card className="!p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp size={18} className="text-primary" />
            <h3 className="text-lg font-bold text-text-primary">Task Completion</h3>
            <span className="text-xs text-text-muted">(last 14 days)</span>
          </div>
          {dailyCompletion.some((d) => d.total > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyCompletion} barCategoryGap="15%">
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#757c7e' }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#757c7e' }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value, name, { payload }) => [`${payload.completed}/${payload.total} tasks (${value}%)`, 'Completion']}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                  {dailyCompletion.map((entry, i) => (
                    <Cell key={i} fill={getBarColor(entry.percent)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-muted text-center py-12">
              No task data yet.
            </p>
          )}
        </Card>

        {/* Mood Overview */}
        <Card className="!p-6">
          <PatientMoodChart feedback={moodFeedback} title="Patient Moods" subtitle="(last 7 days)" />
        </Card>
      </div>

      {/* Patient Summary Table */}
      {enrichedPatients.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-text-primary">Patient Overview</h3>
            <Link
              to="/therapist/patients"
              className="text-sm text-primary font-bold hover:underline"
            >
              View all
            </Link>
          </div>
          <Card className="!p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-bold text-text-muted uppercase tracking-wider px-5 py-3">Patient</th>
                  <th className="text-center text-xs font-bold text-text-muted uppercase tracking-wider px-3 py-3">Today</th>
                  <th className="text-center text-xs font-bold text-text-muted uppercase tracking-wider px-3 py-3">Streak</th>
                  <th className="text-center text-xs font-bold text-text-muted uppercase tracking-wider px-3 py-3">Consistency</th>
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
                      <td className="px-5 py-3.5">
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
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3.5">
                        {patient.streak > 0 ? (
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-500">
                            <Flame size={14} />
                            {patient.streak}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">0</span>
                        )}
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
