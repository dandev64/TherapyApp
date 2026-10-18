import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { calculateStreak, calculateConsistency, toDateStr, getRange } from '../../utils/streak'
import { fetchTherapistPatients } from '../../utils/patients'
import { markRestDay, clearRestDay } from '../../utils/restDay'
import PatientCard from '../../components/therapist/PatientCard'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Card from '../../components/ui/Card'
import { UserPlus, Search, Trash2, Archive, ArchiveRestore } from 'lucide-react'

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
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [view, setView] = useState('active')
  const [busyId, setBusyId] = useState(null)

  function showSuccess(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  async function loadPatients() {
    const today = toDateStr(new Date())
    const week = getRange('week')

    const { data: assignments, error: err } = await fetchTherapistPatients(profile.id, { includeArchived: true })
    if (err) { setError('Failed to load patients.'); setLoading(false); return }
    setError(null)

    const patientIds = assignments.map((a) => a.patient_id)
    if (patientIds.length === 0) { setPatients([]); setLoading(false); return }

    const { data: tasks } = await supabase
      .from('task_assignments')
      .select('patient_id, assigned_date, status, is_rest_day')
      .eq('therapist_id', profile.id)
      .in('patient_id', patientIds)

    const byPatient = {}
    ;(tasks || []).forEach((t) => {
      if (!byPatient[t.patient_id]) byPatient[t.patient_id] = []
      byPatient[t.patient_id].push(t)
    })

    // Consistency over the whole course of therapy, missed tasks this week only
    const patientDetails = assignments.map((a) => {
      const all = byPatient[a.patient_id] || []
      const todayRows = all.filter((t) => t.assigned_date === today)
      const todayTasks = todayRows.filter((t) => !t.is_rest_day)
      return {
        ...a.profiles,
        archived: !!a.archived_at,
        totalToday: todayTasks.length,
        completedToday: todayTasks.filter((t) => t.status === 'completed').length,
        restDayToday: todayRows.some((t) => t.is_rest_day),
        streak: calculateStreak(all),
        consistency: calculateConsistency(all).percent,
        missed: calculateConsistency(all, week).missed,
      }
    })

    setPatients(patientDetails)
    setLoading(false)
  }

  async function handleRestDay(patient, on) {
    setBusyId(patient.id)
    const args = { therapistId: profile.id, patientId: patient.id, date: toDateStr(new Date()) }
    const { error: err } = on ? await markRestDay(args) : await clearRestDay(args)
    setBusyId(null)
    if (err) { setError('Failed to update today for this patient.'); return }
    showSuccess(on ? `Marked "No tasks for today" for ${patient.full_name}.` : 'Rest day removed.')
    loadPatients()
  }

  async function handleArchive(patient, archive) {
    setBusyId(patient.id)
    const { error: err } = await supabase.rpc('set_patient_archived', {
      p_patient_id: patient.id,
      p_archived: archive,
    })
    setBusyId(null)
    if (err) {
      console.error('Archive failed:', err.message)
      setError(archive ? 'Failed to archive patient.' : 'Failed to restore patient.')
      return
    }
    showSuccess(archive ? `${patient.full_name} archived.` : `${patient.full_name} restored to active patients.`)
    loadPatients()
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (profile) loadPatients() }, [profile])

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
    showSuccess('Patient added successfully.')
    loadPatients()
  }

  async function handleRemovePatient() {
    setRemoveLoading(true)
    const { error: err } = await supabase
      .from('patient_assignments')
      .delete()
      .eq('patient_id', removePatient.id)
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')
    setRemoveLoading(false)
    if (err) { setError('Failed to remove patient.'); return }
    setRemovePatient(null)
    showSuccess('Patient removed.')
    loadPatients()
  }

  const activeCount = patients.filter((p) => !p.archived).length
  const archivedCount = patients.length - activeCount
  const filtered = patients.filter((p) =>
    (view === 'archived' ? p.archived : !p.archived)
    && p.full_name?.toLowerCase().includes(search.toLowerCase())
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
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium flex items-center justify-between">
          {error}
          <button onClick={() => { setError(null); loadPatients() }} className="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
          {successMsg}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Patients</h2>
          <p className="text-text-secondary mt-2">
            {activeCount} active patient{activeCount !== 1 ? 's' : ''}{archivedCount > 0 ? ` · ${archivedCount} archived` : ''}
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus size={16} /> Add Patient
        </Button>
      </div>

      <div className="inline-flex p-1 rounded-xl bg-surface-container" role="tablist">
        {[['active', `Active (${activeCount})`], ['archived', `Archived (${archivedCount})`]].map(([key, text]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              view === key ? 'bg-surface-card text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {text}
          </button>
        ))}
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
              {search
                ? 'No patients match your search.'
                : view === 'archived'
                  ? 'No archived patients.'
                  : 'No active patients. Add a patient to get started.'}
            </p>
          </Card>
        ) : (
          filtered.map((patient) => (
            <div key={patient.id} className="flex items-center gap-1 sm:gap-2">
              <div className="flex-1 min-w-0">
                <PatientCard
                  patient={patient}
                  onClick={() => navigate(`/therapist/patients/${patient.id}`)}
                  onRestDay={patient.archived ? null : (on) => handleRestDay(patient, on)}
                  restDayBusy={busyId === patient.id}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                <button
                  onClick={() => handleArchive(patient, !patient.archived)}
                  disabled={busyId === patient.id}
                  className="p-2.5 rounded-xl text-text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-50"
                  title={patient.archived ? 'Unarchive patient' : 'Archive patient'}
                  aria-label={patient.archived ? `Unarchive ${patient.full_name}` : `Archive ${patient.full_name}`}
                >
                  {patient.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
                <button
                  onClick={() => setRemovePatient(patient)}
                  className="p-2.5 rounded-xl text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                  title="Remove patient"
                  aria-label={`Remove ${patient.full_name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
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
