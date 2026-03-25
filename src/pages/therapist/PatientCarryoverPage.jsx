import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { calculateStreak } from '../../utils/streak'
import PatientCard from '../../components/therapist/PatientCard'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Card from '../../components/ui/Card'
import { UserPlus, Search, Trash2 } from 'lucide-react'

export default function PatientCarryoverPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients] = useCachedState('therapist-carryover-patients', [])
  const [loading, setLoading] = useState(() => !hasCache('therapist-carryover-patients'))
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [patientEmail, setPatientEmail] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [removePatient, setRemovePatient] = useState(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  useEffect(() => {
    if (profile) loadPatients()
  }, [profile])

  async function loadPatients() {
    const today = new Date().toISOString().split('T')[0]
    const startOfWeek = new Date()
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(endOfWeek.getDate() + 6)
    const weekStart = startOfWeek.toISOString().split('T')[0]
    const weekEnd = endOfWeek.toISOString().split('T')[0]

    const { data: assignments } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email, condition)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')

    const patientDetails = await Promise.all(
      (assignments || []).map(async (a) => {
        const [todayRes, allRes, weekRes] = await Promise.all([
          supabase
            .from('task_assignments')
            .select('status, is_rest_day')
            .eq('patient_id', a.patient_id)
            .eq('therapist_id', profile.id)
            .eq('assigned_date', today),
          supabase
            .from('task_assignments')
            .select('assigned_date, status, is_rest_day')
            .eq('patient_id', a.patient_id)
            .eq('therapist_id', profile.id)
            .order('assigned_date', { ascending: false })
            .limit(500),
          supabase
            .from('task_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('patient_id', a.patient_id)
            .eq('therapist_id', profile.id)
            .gte('assigned_date', weekStart)
            .lte('assigned_date', weekEnd)
            .eq('is_rest_day', false),
        ])

        const todayTasks = (todayRes.data || []).filter((t) => !t.is_rest_day)
        const allTasks = allRes.data || []
        const realAll = allTasks.filter((t) => !t.is_rest_day)
        const totalCompleted = realAll.filter((t) => t.status === 'completed').length
        const consistency = realAll.length > 0 ? Math.round((totalCompleted / realAll.length) * 100) : 0

        return {
          ...a.profiles,
          totalToday: todayTasks.length,
          completedToday: todayTasks.filter((t) => t.status === 'completed').length,
          streak: calculateStreak(allTasks),
          consistency,
          hasTasksThisWeek: (weekRes.count || 0) > 0,
        }
      })
    )

    setPatients(patientDetails)
    setLoading(false)
  }

  async function handleAddPatient(e) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)

    const { data: patientProfile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('email', patientEmail.trim())
      .single()

    if (!patientProfile) {
      setAddError('No user found with that email.')
      setAddLoading(false)
      return
    }
    if (patientProfile.role !== 'patient') {
      setAddError('That user is not registered as a patient.')
      setAddLoading(false)
      return
    }

    const { error } = await supabase.from('patient_assignments').insert({
      patient_id: patientProfile.id,
      assigned_to: profile.id,
      relationship: 'therapist',
    })

    setAddLoading(false)
    if (error) {
      setAddError(error.code === '23505' ? 'This patient is already assigned to you.' : error.message)
      return
    }

    setPatientEmail('')
    setShowAddModal(false)
    loadPatients()
  }

  async function handleRemovePatient() {
    setRemoveLoading(true)
    await supabase
      .from('patient_assignments')
      .delete()
      .eq('patient_id', removePatient.id)
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')
    setRemoveLoading(false)
    setRemovePatient(null)
    loadPatients()
  }

  const filtered = patients.filter((p) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Patients</h2>
          <p className="text-text-secondary mt-2">
            {patients.length} patient{patients.length !== 1 ? 's' : ''} assigned
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus size={16} /> Add Patient
        </Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search patients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted text-center py-8">
              {patients.length === 0
                ? 'No patients yet. Add your first patient to get started.'
                : 'No patients match your search.'}
            </p>
          </Card>
        ) : (
          filtered.map((patient) => (
            <div key={patient.id} className="flex items-center gap-2">
              <div className="flex-1">
                <PatientCard
                  patient={patient}
                  onClick={() => navigate(`/therapist/patients/${patient.id}`)}
                />
              </div>
              <button
                onClick={() => setRemovePatient(patient)}
                className="p-2.5 rounded-xl text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                title="Remove patient"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <Modal
        isOpen={!!removePatient}
        onClose={() => setRemovePatient(null)}
        title="Remove Patient"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-primary">
            Are you sure you want to remove <span className="font-bold">{removePatient?.full_name}</span>?
          </p>
          <p className="text-xs text-text-muted">
            This will unassign them from your practice. Their task history will not be deleted.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setRemovePatient(null)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleRemovePatient} disabled={removeLoading}>
              {removeLoading ? 'Removing...' : 'Remove Patient'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setAddError('') }}
        title="Add Patient"
      >
        <form onSubmit={handleAddPatient} className="space-y-4">
          {addError && (
            <div className="p-3 rounded-xl bg-danger-bg text-danger text-sm font-medium">
              {addError}
            </div>
          )}
          <Input
            label="Patient Email"
            type="email"
            placeholder="patient@example.com"
            value={patientEmail}
            onChange={(e) => setPatientEmail(e.target.value)}
            required
          />
          <p className="text-xs text-text-muted">
            The patient must already have a HabitOT account.
          </p>
          <Button type="submit" disabled={addLoading} className="w-full">
            {addLoading ? 'Adding...' : 'Add Patient'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
