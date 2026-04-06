import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { MessageSquare, ChevronDown, ChevronUp, User } from 'lucide-react'

const moodEmojis = {
  excited: '🤩',
  happy: '😊',
  calm: '😌',
  scared: '😨',
  anxious: '😰',
  angry: '😠',
  tired: '😴',
  sad: '😢',
}

export default function TherapistNotesPage() {
  const { profile } = useAuth()
  const [patients, setPatients] = useCachedState('client-notes-patients', [])
  const [feedbackByPatient, setFeedbackByPatient] = useCachedState('client-notes-feedback', {})
  const [loading, setLoading] = useState(() => !hasCache('client-notes-patients'))
  const [expandedPatient, setExpandedPatient] = useState(null)
  const [error, setError] = useState(null)

  async function loadData() {
    // Step 1: Get therapist's assigned patients
    const { data: assignments, error: assignErr } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')

    if (assignErr) {
      console.error('Failed to load patients:', assignErr.message)
      setError('Failed to load patients.')
      setLoading(false)
      return
    }

    const patientList = (assignments || []).map((a) => a.profiles).filter(Boolean)
    const patientIds = patientList.map((p) => p.id)
    setPatients(patientList)

    if (patientIds.length === 0) {
      setFeedbackByPatient({})
      setLoading(false)
      return
    }

    // Step 2: Get task feedback with task details for all patients
    const { data: feedback, error: fbErr } = await supabase
      .from('task_feedback')
      .select('*, task:task_assignments!task_feedback_task_assignment_id_fkey(title, therapy_type, assigned_date)')
      .in('patient_id', patientIds)
      .not('note', 'is', null)
      .order('created_at', { ascending: false })

    if (fbErr) {
      console.error('Failed to load feedback:', fbErr.message)
      setError('Failed to load client notes.')
      setLoading(false)
      return
    }

    // Filter out feedback with empty notes and group by patient_id
    const grouped = {}
    ;(feedback || []).forEach((fb) => {
      if (!fb.note || !fb.note.trim()) return
      if (!grouped[fb.patient_id]) grouped[fb.patient_id] = []
      grouped[fb.patient_id].push(fb)
    })

    setFeedbackByPatient(grouped)
    setError(null)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (profile) loadData() }, [profile])

  function togglePatient(patientId) {
    setExpandedPatient(expandedPatient === patientId ? null : patientId)
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatAssignedDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const totalNotes = Object.values(feedbackByPatient).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium flex items-center justify-between">
          {error}
          <button onClick={() => { setError(null); loadData() }} className="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      )}

      <div>
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Client Notes</h2>
        <p className="text-text-secondary mt-2">
          Review feedback from your patients&apos; completed tasks
        </p>
      </div>

      {patients.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <MessageSquare size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              No patients assigned to you yet.
            </p>
          </div>
        </Card>
      ) : totalNotes === 0 ? (
        <Card>
          <div className="text-center py-8">
            <MessageSquare size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              No task feedback notes from your patients yet.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {patients.map((patient) => {
            const notes = feedbackByPatient[patient.id] || []
            if (notes.length === 0) return null
            const isExpanded = expandedPatient === patient.id

            return (
              <Card key={patient.id}>
                <div
                  className="cursor-pointer"
                  onClick={() => togglePatient(patient.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm">
                        {patient.full_name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {patient.full_name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                        </p>
                      </div>
                    </div>
                    <div className="text-text-muted">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border-light space-y-3">
                    {notes.map((fb) => (
                      <div
                        key={fb.id}
                        className="p-4 rounded-xl bg-surface-alt"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {fb.task?.title && (
                            <span className="text-xs font-semibold text-text-primary">
                              {fb.task.title}
                            </span>
                          )}
                          {fb.task?.therapy_type && (
                            <Badge color={fb.task.therapy_type}>
                              {fb.task.therapy_type}
                            </Badge>
                          )}
                          {fb.mood && (
                            <span className="text-sm" title={fb.mood}>
                              {moodEmojis[fb.mood] || fb.mood}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-text-secondary">
                          {fb.note}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-xs text-text-muted">
                            {formatDate(fb.created_at)}
                          </p>
                          {fb.task?.assigned_date && (
                            <p className="text-xs text-text-muted">
                              Task date: {formatAssignedDate(fb.task.assigned_date)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
