import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { Users, FileText, CheckCircle, Clock } from 'lucide-react'

export default function CaregiverDashboard() {
  const { profile } = useAuth()
  const [patients, setPatients] = useCachedState('caregiver-patients', [])
  const [noteCount, setNoteCount] = useCachedState('caregiver-notecount', 0)
  const [loading, setLoading] = useState(() => !hasCache('caregiver-patients'))

  useEffect(() => {
    if (profile) loadData()
  }, [profile])

  async function loadData() {
    const today = new Date().toISOString().split('T')[0]

    const { data: assignments } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'caregiver')

    const patientDetails = await Promise.all(
      (assignments || []).map(async (a) => {
        const { data: tasks } = await supabase
          .from('task_assignments')
          .select('status')
          .eq('patient_id', a.patient_id)
          .eq('assigned_date', today)

        const total = tasks?.length || 0
        const done = tasks?.filter((t) => t.status === 'completed').length || 0
        return { ...a.profiles, totalTasks: total, completedTasks: done }
      })
    )
    setPatients(patientDetails)

    const { count } = await supabase
      .from('caregiver_notes')
      .select('id', { count: 'exact' })
      .eq('caregiver_id', profile.id)
    setNoteCount(count || 0)
    setLoading(false)
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
          Hello, {profile?.full_name?.split(' ')[0]}
        </h2>
        <p className="text-text-secondary mt-2">
          Here&apos;s how your patients are doing today
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary-container text-primary">
              <Users size={22} />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-text-primary font-heading">{patients.length}</p>
              <p className="text-xs font-medium text-text-muted mt-0.5">Patients</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-secondary-container text-secondary">
              <FileText size={22} />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-text-primary font-heading">{noteCount}</p>
              <p className="text-xs font-medium text-text-muted mt-0.5">Notes Submitted</p>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-text-primary">Patient Progress</h3>
          <Link
            to="/caregiver/notes"
            className="text-sm text-primary font-semibold hover:underline"
          >
            Submit a note
          </Link>
        </div>

        <div className="space-y-3">
          {patients.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted text-center py-8">
                No patients assigned to you yet. A therapist will assign you.
              </p>
            </Card>
          ) : (
            patients.map((patient) => {
              const progress =
                patient.totalTasks > 0
                  ? Math.round((patient.completedTasks / patient.totalTasks) * 100)
                  : 0
              return (
                <Card key={patient.id}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm">
                      {patient.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {patient.full_name}
                      </p>
                      <p className="text-xs text-text-muted">{patient.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-secondary">
                      Today&apos;s tasks: {patient.completedTasks}/{patient.totalTasks}
                    </span>
                    <span className="text-xs font-semibold text-text-primary">{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-surface-alt rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {patient.completedTasks === patient.totalTasks && patient.totalTasks > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <CheckCircle size={14} className="text-success" />
                      <span className="text-xs font-medium text-success">All tasks completed</span>
                    </div>
                  )}
                  {patient.totalTasks === 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Clock size={14} className="text-text-muted" />
                      <span className="text-xs text-text-muted">No tasks assigned today</span>
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
