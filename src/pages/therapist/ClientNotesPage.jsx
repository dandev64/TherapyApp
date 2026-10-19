import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import { fetchTherapistPatients } from '../../utils/patients'
import Card from '../../components/ui/Card'
import { ArrowLeft, FileText, Mail } from 'lucide-react'

const CACHE_KEY = 'therapist-client-notes-unread'

const noteDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * Dashboard drill-down: caregiver notes the therapist hasn't read yet.
 * Marking one read removes it here; every note, read or not, is on the
 * Client Notes tab (TherapistNotesPage).
 */
export default function ClientNotesPage() {
  const { profile } = useAuth()
  const { showToast } = useNotifications()
  const navigate = useNavigate()
  const [notes, setNotes] = useCachedState(CACHE_KEY, [])
  const [loading, setLoading] = useState(() => !hasCache(CACHE_KEY))
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      const { data: links } = await fetchTherapistPatients(profile.id)
      const ids = links.map((l) => l.patient_id)
      if (!ids.length) {
        if (!cancelled) { setNotes([]); setLoading(false) }
        return
      }
      const { data, error: err } = await supabase
        .from('caregiver_notes')
        .select('*, patient:profiles!caregiver_notes_patient_id_fkey(full_name), caregiver:profiles!caregiver_notes_caregiver_id_fkey(full_name)')
        .in('patient_id', ids)
        .is('therapist_read_at', null)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (err) { setError('Failed to load client notes.'); setLoading(false); return }
      setError(null)
      setNotes(data || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [profile])
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
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/therapist')}
          aria-label="Back to dashboard"
          className="p-2 -ml-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer text-text-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Client Notes</h2>
          <p className="text-text-secondary mt-1">
            Unread notes from caregivers{notes.length > 0 && ` · ${notes.length} unread`}
          </p>
        </div>
        <Link to="/therapist/notes" className="shrink-0 py-2 text-sm font-bold text-primary hover:underline">
          See All Client Notes
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <FileText size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">No unread client notes.</p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex items-start gap-4 rounded-2xl border px-5 py-4 bg-primary-container/20 border-primary/30"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2 align-middle" aria-hidden="true" />
                  {note.patient?.full_name || 'Patient'} – {noteDate(note.created_at)}
                </p>
                {note.caregiver?.full_name && (
                  <p className="text-xs text-text-muted mt-0.5">From {note.caregiver.full_name}</p>
                )}
                <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap break-words">{note.content}</p>
              </div>
              <button
                onClick={() => markRead(note)}
                disabled={busyId === note.id}
                title="Mark as read"
                aria-label="Mark as read"
                className="shrink-0 p-2.5 rounded-full text-primary hover:bg-primary-container cursor-pointer disabled:opacity-50"
              >
                <Mail size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
