import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { fetchTherapistPatients } from '../../utils/patients'
import Card from '../../components/ui/Card'
import { ArrowLeft, FileText, Mail, MailOpen } from 'lucide-react'

const RECENT_LIMIT = 10

const noteDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * Notes written by patients' caregivers ("Client Notes").
 * `recent` = the dashboard drill-down (latest notes + "See All Client Notes");
 * otherwise the full sidebar tab with a patient filter.
 */
export default function ClientNotesPage({ recent = false }) {
  const { profile } = useAuth()
  const { showToast } = useNotifications()
  const navigate = useNavigate()
  const cacheKey = recent ? 'therapist-client-notes-recent' : 'therapist-client-notes'
  const [notes, setNotes] = useCachedState(cacheKey, [])
  const [patients, setPatients] = useCachedState('therapist-client-notes-patients', [])
  const [loading, setLoading] = useState(() => !hasCache(cacheKey))
  const [error, setError] = useState(null)
  const [patientFilter, setPatientFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [busyId, setBusyId] = useState(null)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      const { data: links } = await fetchTherapistPatients(profile.id)
      const ids = links.map((l) => l.patient_id)
      if (!ids.length) {
        if (!cancelled) { setNotes([]); setPatients([]); setLoading(false) }
        return
      }
      let query = supabase
        .from('caregiver_notes')
        .select('*, patient:profiles!caregiver_notes_patient_id_fkey(full_name), caregiver:profiles!caregiver_notes_caregiver_id_fkey(full_name)')
        .in('patient_id', patientFilter ? [patientFilter] : ids)
        .order('created_at', { ascending: false })
      if (recent) query = query.limit(RECENT_LIMIT)
      const { data, error: err } = await query
      if (cancelled) return
      if (err) { setError('Failed to load client notes.'); setLoading(false); return }
      setError(null)
      setPatients(links.map((l) => l.profiles))
      setNotes(data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [profile, patientFilter, recent])
  /* eslint-enable react-hooks/exhaustive-deps */

  async function markRead(note) {
    setBusyId(note.id)
    const { error: err } = await supabase.rpc('mark_client_note_read', { p_note_id: note.id })
    setBusyId(null)
    if (err) {
      console.error('Failed to mark note read:', err.message)
      showToast('Could not mark the note as read. Please try again.', 'task_overdue')
      return
    }
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, therapist_read_at: new Date().toISOString() } : n)))
  }

  const shown = unreadOnly ? notes.filter((n) => !n.therapist_read_at) : notes
  const unread = notes.filter((n) => !n.therapist_read_at).length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        {recent && (
          <button
            onClick={() => navigate('/therapist')}
            aria-label="Back to dashboard"
            className="p-2 -ml-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer text-text-secondary"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Client Notes</h2>
          <p className="text-text-secondary mt-1">
            {recent ? 'Latest notes from caregivers' : 'Notes written by your patients’ caregivers'}
            {unread > 0 && ` · ${unread} unread`}
          </p>
        </div>
        {recent && (
          <Link to="/therapist/client-notes" className="shrink-0 py-2 text-sm font-bold text-primary hover:underline">
            See All Client Notes
          </Link>
        )}
      </div>

      {!recent && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={patientFilter}
            onChange={(e) => setPatientFilter(e.target.value)}
            aria-label="Filter by patient"
            className="px-3 py-2.5 rounded-xl border border-border text-sm bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
          >
            <option value="">All Patients</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary cursor-pointer"
            />
            Unread only
          </label>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <FileText size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{unreadOnly ? 'No unread notes.' : 'No client notes yet.'}</p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((note) => {
            const isRead = !!note.therapist_read_at
            return (
              <li
                key={note.id}
                className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${
                  isRead ? 'bg-surface-card border-border-light' : 'bg-primary-container/20 border-primary/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-primary">
                    {!isRead && <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2 align-middle" aria-hidden="true" />}
                    {note.patient?.full_name || 'Patient'} – {noteDate(note.created_at)}
                  </p>
                  {note.caregiver?.full_name && (
                    <p className="text-xs text-text-muted mt-0.5">From {note.caregiver.full_name}</p>
                  )}
                  <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap break-words">{note.content}</p>
                </div>
                {isRead ? (
                  <span className="shrink-0 p-2.5 text-text-muted" title="Read" aria-label="Read">
                    <MailOpen size={18} />
                  </span>
                ) : (
                  <button
                    onClick={() => markRead(note)}
                    disabled={busyId === note.id}
                    title="Mark as read"
                    aria-label="Mark as read"
                    className="shrink-0 p-2.5 rounded-full text-primary hover:bg-primary-container cursor-pointer disabled:opacity-50"
                  >
                    <Mail size={18} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
