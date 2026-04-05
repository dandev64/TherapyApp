import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { UserPlus, Search, Calendar, ChevronRight, Camera, MessageSquare } from 'lucide-react'

const MOOD_EMOJI = {
  excited: '🤩', happy: '😊', calm: '😌', scared: '😨',
  anxious: '😰', angry: '😠', tired: '😴', sad: '😢',
}

export default function PatientsPage() {
  const { profile } = useAuth()
  const [patients, setPatients] = useCachedState('therapist-patients', [])
  const [loading, setLoading] = useState(() => !hasCache('therapist-patients'))
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [patientEmail, setPatientEmail] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [patientHistory, setPatientHistory] = useState([])
  const [proofUrls, setProofUrls] = useState({})
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  function showSuccess(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  async function loadPatients() {
    const today = new Date().toISOString().split('T')[0]
    const { data: assignments, error: err } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')
    if (err) { setError('Failed to load patients.'); setLoading(false); return }
    setError(null)

    const patientIds = (assignments || []).map((a) => a.patient_id)
    const { data: allTodayTasks } = patientIds.length > 0
      ? await supabase
          .from('task_assignments')
          .select('patient_id, status')
          .in('patient_id', patientIds)
          .eq('assigned_date', today)
      : { data: [] }

    const tasksByPatient = {}
    ;(allTodayTasks || []).forEach((t) => {
      if (!tasksByPatient[t.patient_id]) tasksByPatient[t.patient_id] = []
      tasksByPatient[t.patient_id].push(t)
    })

    const patientDetails = (assignments || []).map((a) => {
      const tasks = tasksByPatient[a.patient_id] || []
      return { ...a.profiles, totalTasks: tasks.length, completedTasks: tasks.filter((t) => t.status === 'completed').length }
    })
    setPatients(patientDetails)
    setLoading(false)
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

  async function viewHistory(patient) {
    setSelectedPatient(patient)
    setPatientHistory([])
    const [tasksRes, feedbackRes] = await Promise.all([
      supabase
        .from('task_assignments')
        .select('id, title, description, assigned_date, assigned_time, status, resource_url, requires_proof, proof_url')
        .eq('patient_id', patient.id)
        .order('assigned_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('task_feedback')
        .select('task_assignment_id, mood, note')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    const fbMap = {}
    ;(feedbackRes.data || []).forEach((fb) => {
      if (!fbMap[fb.task_assignment_id]) fbMap[fb.task_assignment_id] = fb
    })
    setPatientHistory((tasksRes.data || []).map((t) => ({ ...t, feedback: fbMap[t.id] || null })))

    // Generate signed URLs for proof photos
    const tasksWithProof = (tasksRes.data || []).filter((t) => t.proof_url)
    const urls = {}
    await Promise.all(
    tasksWithProof.map(async (t) => {
      try {
        if (!t.proof_url) return
        if (t.proof_url.startsWith('http')) {
          urls[t.id] = t.proof_url
          return
        }

        const { data, error } = await supabase.storage
          .from('task-proofs')
          .createSignedUrl(t.proof_url, 3600)

        if (data?.signedUrl) {
          urls[t.id] = data.signedUrl
        } else {
          console.error('Signed URL failed, trying public URL:', error)

          const { data: pubData } = supabase.storage
            .from('task-proofs')
            .getPublicUrl(t.proof_url)

          if (pubData?.publicUrl) {
            urls[t.id] = pubData.publicUrl
          }
        }
      } catch (err) {
        console.error('Error generating signed URL:', err)
      }
    })
  )

    setProofUrls(urls)
    console.log('Proof URLs generated:', urls)
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

      <div className="space-y-4">
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
            <Card
              key={patient.id}
              hover
              onClick={() => viewHistory(patient)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold">
                    {patient.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {patient.full_name}
                    </p>
                    <p className="text-xs text-text-muted">{patient.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-text-primary">
                      {patient.completedTasks}/{patient.totalTasks}
                    </p>
                    <p className="text-xs text-text-muted">today</p>
                  </div>
                  <ChevronRight size={16} className="text-text-muted" />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Patient Modal */}
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

      {/* Patient History Modal */}
      <Modal
        isOpen={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
        title={`${selectedPatient?.full_name} — Task History`}
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {patientHistory.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No task history yet.
            </p>
          ) : (
            patientHistory.map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-xl bg-surface space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Calendar size={12} />
                        {task.assigned_date}
                        {task.assigned_time && (
                          <> · {new Date(`2000-01-01T${task.assigned_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>
                        )}
                      </span>
                    </div>
                  </div>
                  <Badge color={task.status}>{task.status.replace('_', ' ')}</Badge>
                </div>

                {task.description && (
                  <p className="text-xs text-text-secondary">{task.description}</p>
                )}
                {task.resource_url && (
                  <p className="text-xs text-text-muted italic">Resources: {task.resource_url}</p>
                )}

                {/* Patient inputs */}
                {task.status === 'completed' && (task.feedback || task.proof_url) && (
                  <div className="border-t border-border pt-2 space-y-1.5">
                    {task.feedback && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{MOOD_EMOJI[task.feedback.mood] || ''}</span>
                        <span className="text-xs text-text-secondary capitalize">{task.feedback.mood}</span>
                      </div>
                    )}
                    {task.feedback?.note && (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare size={12} className="text-text-muted mt-0.5 shrink-0" />
                        <p className="text-xs text-text-secondary">{task.feedback.note}</p>
                      </div>
                    )}
                    {task.proof_url && proofUrls[task.id] && (
                      <img
                        src={proofUrls[task.id]}
                        alt="Proof of completion"
                        className="w-full rounded-xl object-cover max-h-48 mt-1"
                        loading="lazy"
                      />
                    )}
                    {task.proof_url && !proofUrls[task.id] && (
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Camera size={12} />
                        Loading proof photo...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  )
}
