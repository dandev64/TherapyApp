import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Card from '../../components/ui/Card'
import { Users, ClipboardCheck, FileText, TrendingUp } from 'lucide-react'

export default function TherapistDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ patients: 0, todayTasks: 0, completedToday: 0, notes: 0 })
  const [recentPatients, setRecentPatients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    loadDashboard()
  }, [profile])

  async function loadDashboard() {
    const today = new Date().toISOString().split('T')[0]

    const [assignmentsRes, tasksRes, notesRes] = await Promise.all([
      supabase
        .from('patient_assignments')
        .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email)')
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

    setStats({
      patients: patients.length,
      todayTasks: tasks.length,
      completedToday,
      notes: notesRes.count || 0,
    })

    const patientDetails = await Promise.all(
      patients.slice(0, 5).map(async (p) => {
        const { data: patientTasks } = await supabase
          .from('task_assignments')
          .select('status')
          .eq('patient_id', p.patient_id)
          .eq('assigned_date', today)

        const total = patientTasks?.length || 0
        const done = patientTasks?.filter((t) => t.status === 'completed').length || 0
        return {
          ...p.profiles,
          totalTasks: total,
          completedTasks: done,
        }
      })
    )
    setRecentPatients(patientDetails)
    setLoading(false)
  }

  const statCards = [
    { label: 'Patients', value: stats.patients, icon: Users, bgColor: 'bg-primary-container', color: 'text-primary' },
    { label: "Today's Tasks", value: stats.todayTasks, icon: ClipboardCheck, bgColor: 'bg-secondary-container', color: 'text-secondary' },
    { label: 'Completed Today', value: stats.completedToday, icon: TrendingUp, bgColor: 'bg-success-bg', color: 'text-success' },
    { label: 'Caregiver Notes', value: stats.notes, icon: FileText, bgColor: 'bg-tertiary-container', color: 'text-tertiary' },
  ]

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
        <p className="text-text-secondary mt-2">
          Here&apos;s an overview of your therapy practice today
        </p>
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
        <div className="space-y-4">
          {recentPatients.length === 0 ? (
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
            recentPatients.map((patient) => (
              <Card key={patient.id} hover>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm">
                      {patient.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">
                        {patient.full_name}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">{patient.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-text-primary">
                      {patient.completedTasks}/{patient.totalTasks}
                    </p>
                    <p className="text-xs text-text-muted">tasks done</p>
                    {patient.totalTasks > 0 && (
                      <div className="w-24 h-2 bg-surface-alt rounded-full mt-2">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{
                            width: `${(patient.completedTasks / patient.totalTasks) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
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
