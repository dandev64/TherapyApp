import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchTherapistPatients } from '../../utils/patients'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { markClientNoteRead } from '../../utils/clientNotes'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { MessageSquare, ChevronDown, ChevronUp, Mail, MailOpen } from 'lucide-react'

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

/**
 * Client Notes tab: per patient, the comments left with completed tasks
 * (task_feedback.note) and the notes written by their caregivers
 * (caregiver_notes), newest first. Unread caregiver notes can be marked read
 * here or from the dashboard's unread list (ClientNotesPage).
 */
export default function TherapistNotesPage() {
  const { profile } = useAuth()
  const { showToast } = useNotifications()
  const [patients, setPatients] = useCachedState('client-notes-patients', [])
  const [notesByPatient, setNotesByPatient] = useCachedState('client-notes-by-patient', {})
  const [loading, setLoading] = useState(() => !hasCache('client-notes-patients'))
  const [expandedPatient, setExpandedPatient] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function loadData() {
    // Step 1: Get therapist's assigned patients
    const { data: assignments, error: assignErr } = await fetchTherapistPatients(profile.id)

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
      setNotesByPatient({})
      setLoading(false)
      return
    }

    // Step 2: Task feedback comments and caregiver notes for all patients
    const [fbRes, cgRes] = await Promise.all([
      supabase
        .from('task_feedback')
        .select('*, task:task_assignments!task_feedback_task_assignment_id_fkey(title, therapy_type, assigned_date)')
        .in('patient_id', patientIds)
        .not('note', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('caregiver_notes')
        .select('*, caregiver:profiles!caregiver_notes_caregiver_id_fkey(full_name)')
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false }),
    ])

    if (fbRes.error || cgRes.error) {
      console.error('Failed to load client notes:', (fbRes.error || cgRes.error).message)
      setError('Failed to load client notes.')
      setLoading(false)
      return
    }

    // Skip empty feedback comments, tag each note with its kind, group by patient
    const notes = [
      ...(fbRes.data || [])
        .filter((fb) => fb.note && fb.note.trim())
        .map((fb) => ({ ...fb, kind: 'feedback' })),
      ...(cgRes.data || []).map((n) => ({ ...n, kind: 'caregiver' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    const grouped = {}
    notes.forEach((n) => {
      if (!grouped[n.patient_id]) grouped[n.patient_id] = []
      grouped[n.patient_id].push(n)
    })

    setNotesByPatient(grouped)
    setError(null)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (profile) loadData() }, [profile])

  function togglePatient(patientId) {
    setExpandedPatient(expandedPatient === patientId ? null : patientId)
  }

  async function markRead(note) {
    setBusyId(note.id)
    const { error: err } = await markClientNoteRead(note)
    setBusyId(null)
    if (err) {
      console.error('Failed to mark note read:', err.message)
      showToast('Could not mark the note as read. Please try again.', 'task_overdue')
      return
    }
    const readAt = new Date().toISOString()
    setNotesByPatient((prev) => ({
      ...prev,
      [note.patient_id]: prev[note.patient_id].map((n) =>
        n.kind === note.kind && n.id === note.id ? { ...n, therapist_read_at: readAt } : n
      ),
    }))
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

  const totalNotes = Object.values(notesByPatient).reduce((sum, arr) => sum + arr.length, 0)
  // Task comments only have a read status once migration-2026-10-feedback-read.sql has run
  const isUnread = (n) => n.therapist_read_at === null

  const readToggle = (n) => isUnread(n) ? (
    <button
      onClick={() => markRead(n)}
      disabled={busyId === n.id}
      title="Mark as read"
      aria-label="Mark as read"
      className="shrink-0 p-2.5 rounded-full text-primary hover:bg-primary-container cursor-pointer disabled:opacity-50"
    >
      <Mail size={18} />
    </button>
  ) : (
    <span className="shrink-0 p-2.5 text-text-muted" title="Read" aria-label="Read">
      <MailOpen size={18} />
    </span>
  )

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
          Notes from your patients and their caregivers
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
              No client notes yet.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {patients.map((patient) => {
            const notes = notesByPatient[patient.id] || []
            if (notes.length === 0) return null
            const isExpanded = expandedPatient === patient.id
            const unread = notes.filter(isUnread).length

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
                          {unread > 0 && <span className="text-primary font-semibold"> · {unread} unread</span>}
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
                    {notes.map((n) => n.kind === 'caregiver' ? (
                      <div
                        key={`cg-${n.id}`}
                        className={`flex items-start gap-3 p-4 rounded-xl ${
                          isUnread(n) ? 'bg-primary-container/20 border border-primary/30' : 'bg-surface-alt'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-text-primary mb-2">
                            {isUnread(n) && <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2 align-middle" aria-hidden="true" />}
                            From {n.caregiver?.full_name || 'caregiver'}
                          </p>
                          <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                            {n.content}
                          </p>
                          <p className="text-xs text-text-muted mt-2">
                            {formatDate(n.created_at)}
                          </p>
                        </div>
                        {readToggle(n)}
                      </div>
                    ) : (
                      <div
                        key={`fb-${n.id}`}
                        className={`flex items-start gap-3 p-4 rounded-xl ${
                          isUnread(n) ? 'bg-primary-container/20 border border-primary/30' : 'bg-surface-alt'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-xs font-semibold text-text-primary">
                              {isUnread(n) && <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2 align-middle" aria-hidden="true" />}
                              Task comment{n.task?.title ? ` · ${n.task.title}` : ''}
                            </span>
                            {n.task?.therapy_type && (
                              <Badge color={n.task.therapy_type}>
                                {n.task.therapy_type}
                              </Badge>
                            )}
                            {n.mood && (
                              <span className="text-sm" title={n.mood}>
                                {moodEmojis[n.mood] || n.mood}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                            {n.note}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <p className="text-xs text-text-muted">
                              {formatDate(n.created_at)}
                            </p>
                            {n.task?.assigned_date && (
                              <p className="text-xs text-text-muted">
                                Task date: {formatAssignedDate(n.task.assigned_date)}
                              </p>
                            )}
                          </div>
                        </div>
                        {readToggle(n)}
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
