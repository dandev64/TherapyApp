import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { calculateStreak } from '../../utils/streak'
import { MOOD_CONFIG } from '../../components/therapist/PatientMoodChart'
import Card from '../../components/ui/Card'
import PatientCard from '../../components/therapist/PatientCard'
import { Users, ClipboardCheck, Target, FileText, Heart } from 'lucide-react'

export default function TherapistDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useCachedState('therapist-dash-stats', { patients: 0, todayTasks: 0, completedToday: 0, avgConsistency: 0, notes: 0 })
  const [enrichedPatients, setEnrichedPatients] = useCachedState('therapist-dash-enriched', [])
  const [topMood, setTopMood] = useCachedState('therapist-dash-top-mood', null)
  const [loading, setLoading] = useState(() => !hasCache('therapist-dash-stats'))

  useEffect(() => {
    if (!profile) return
    loadDashboard()
  }, [profile])

  async function loadDashboard() {
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const [assignmentsRes, tasksRes, notesRes] = await Promise.all([
      supabase
        .from('patient_assignments')
        .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email, condition)')
        .eq('assigned_to', profile.id)
        .eq('relationship', 'therapist'),
      supabase
        .from('task_assignments')
        .select('*')
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

    const patients = assignmentsRes.data || []
    const tasks = tasksRes.data || []
    const completedToday = tasks.filter((t) => t.status === 'completed').length

    // Enrich patients with streak, consistency, today's tasks
    const patientIds = patients.map((p) => p.patient_id)

    const patientDetails = await Promise.all(
      patients.slice(0, 5).map(async (p) => {
        const [todayRes, allRes] = await Promise.all([
          supabase
            .from('task_assignments')
            .select('status, is_rest_day')
            .eq('patient_id', p.patient_id)
            .eq('assigned_date', today),
          supabase
            .from('task_assignments')
            .select('assigned_date, status, is_rest_day')
            .eq('patient_id', p.patient_id)
            .order('assigned_date', { ascending: false })
            .limit(500),
        ])

        const todayTasks = (todayRes.data || []).filter((t) => !t.is_rest_day)
        const allTasks = allRes.data || []
        const realAll = allTasks.filter((t) => !t.is_rest_day)
        const totalCompleted = realAll.filter((t) => t.status === 'completed').length
        const consistency = realAll.length > 0 ? Math.round((totalCompleted / realAll.length) * 100) : 0

        return {
          ...p.profiles,
          totalToday: todayTasks.length,
          completedToday: todayTasks.filter((t) => t.status === 'completed').length,
          streak: calculateStreak(allTasks),
          consistency,
        }
      })
    )

    setEnrichedPatients(patientDetails)

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

    // Weekly top mood
    if (patientIds.length > 0) {
      const { data: fbData } = await supabase
        .from('task_feedback')
        .select('mood')
        .in('patient_id', patientIds)
        .gte('created_at', weekAgo.toISOString())

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

    setLoading(false)
  }

  const statCards = [
    { label: 'Patients', value: stats.patients, icon: Users, bgColor: 'bg-primary-container', color: 'text-primary' },
    { label: "Today's Tasks", value: `${stats.completedToday}/${stats.todayTasks}`, icon: ClipboardCheck, bgColor: 'bg-secondary-container', color: 'text-secondary' },
    { label: 'Avg Consistency', value: `${stats.avgConsistency}%`, icon: Target, bgColor: 'bg-success-bg', color: 'text-success' },
    { label: 'Caregiver Notes', value: stats.notes, icon: FileText, bgColor: 'bg-tertiary-container', color: 'text-tertiary' },
  ]

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
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

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-text-primary">Patient Progress</h3>
          <Link
            to="/therapist/patients"
            className="text-sm text-primary font-bold hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="space-y-3">
          {enrichedPatients.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted text-center py-6">
                No patients assigned yet. Go to{' '}
                <Link to="/therapist/patients" className="text-primary font-bold hover:underline">
                  Patients
                </Link>{' '}
                to add your first patient.
              </p>
            </Card>
          ) : (
            enrichedPatients.map((patient) => (
              <PatientCard
                key={patient.id}
                patient={patient}
                onClick={() => navigate(`/therapist/patients/${patient.id}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
