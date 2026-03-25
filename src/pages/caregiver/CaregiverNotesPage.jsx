import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import {
  Plus,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

export default function CaregiverNotesPage() {
  const { profile } = useAuth()
  const [notes, setNotes] = useCachedState('caregiver-notes', [])
  const [patients, setPatients] = useCachedState('caregiver-note-patients', [])
  const [pageLoading, setPageLoading] = useState(() => !hasCache('caregiver-notes'))
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ patient_id: '', content: '' })
  const [loading, setLoading] = useState(false)
  const [expandedNote, setExpandedNote] = useState(null)
  const [replies, setReplies] = useState({})
  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)

  useEffect(() => {
    if (profile) {
      Promise.all([loadNotes(), loadPatients()]).then(() => setPageLoading(false))
    }
  }, [profile])

  async function loadPatients() {
    const { data } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'caregiver')
    setPatients(data?.map((a) => a.profiles) || [])
  }

  async function loadNotes() {
    const { data } = await supabase
      .from('caregiver_notes')
      .select('*, patient:profiles!caregiver_notes_patient_id_fkey(full_name)')
      .eq('caregiver_id', profile.id)
      .order('created_at', { ascending: false })
    setNotes(data || [])
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.content.trim() || !form.patient_id) return
    setLoading(true)
    await supabase.from('caregiver_notes').insert({
      caregiver_id: profile.id,
      patient_id: form.patient_id,
      content: form.content.trim(),
    })
    setLoading(false)
    setForm({ patient_id: patients[0]?.id || '', content: '' })
    setShowCreate(false)
    loadNotes()
  }

  async function loadReplies(noteId) {
    const { data } = await supabase
      .from('note_replies')
      .select('*, profiles!note_replies_author_id_fkey(full_name, role)')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true })
    setReplies((prev) => ({ ...prev, [noteId]: data || [] }))
  }

  async function toggleExpand(noteId) {
    if (expandedNote === noteId) {
      setExpandedNote(null)
    } else {
      setExpandedNote(noteId)
      if (!replies[noteId]) {
        await loadReplies(noteId)
      }
    }
  }

  async function handleReply(noteId) {
    if (!replyText.trim()) return
    setReplyLoading(true)
    await supabase.from('note_replies').insert({
      note_id: noteId,
      author_id: profile.id,
      content: replyText.trim(),
    })
    setReplyText('')
    setReplyLoading(false)
    await loadReplies(noteId)
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

  if (pageLoading) {
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
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">My Notes</h2>
          <p className="text-text-secondary mt-2">
            Share observations about your patient&apos;s behavior and progress
          </p>
        </div>
        <Button onClick={() => {
          setForm({ patient_id: patients[0]?.id || '', content: '' })
          setShowCreate(true)
        }}>
          <Plus size={16} /> New Note
        </Button>
      </div>

      <div className="space-y-4">
        {notes.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <MessageSquare size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-muted">
                No notes yet. Share how your patient is doing at home.
              </p>
            </div>
          </Card>
        ) : (
          notes.map((note) => (
            <Card key={note.id}>
              <div
                className="cursor-pointer"
                onClick={() => toggleExpand(note.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-text-muted">
                        About {note.patient?.full_name}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary">
                      {note.content}
                    </p>
                    <p className="text-xs text-text-muted mt-2">
                      {formatDate(note.created_at)}
                    </p>
                  </div>
                  <div className="ml-3 mt-1 text-text-muted">
                    {expandedNote === note.id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </div>
              </div>

              {expandedNote === note.id && (
                <div className="mt-4 pt-4 border-t border-border-light">
                  <div className="space-y-3 mb-4">
                    {(replies[note.id] || []).map((reply) => (
                      <div
                        key={reply.id}
                        className={`p-3 rounded-xl text-sm ${
                          reply.profiles?.role === 'therapist'
                            ? 'bg-primary/5 ml-6'
                            : 'bg-surface mr-6'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-text-primary text-xs">
                            {reply.profiles?.full_name}
                          </span>
                          <Badge color={reply.profiles?.role}>
                            {reply.profiles?.role}
                          </Badge>
                        </div>
                        <p className="text-text-secondary">{reply.content}</p>
                        <p className="text-xs text-text-muted mt-1">
                          {formatDate(reply.created_at)}
                        </p>
                      </div>
                    ))}
                    {(replies[note.id] || []).length === 0 && (
                      <p className="text-xs text-text-muted text-center py-2">
                        No replies yet. Your therapist will respond soon.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Write a reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleReply(note.id)
                        }
                      }}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleReply(note.id)}
                      disabled={replyLoading || !replyText.trim()}
                    >
                      <Send size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Create Note Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Note"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {patients.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No patients assigned to you yet. A therapist must assign you first.
            </p>
          ) : (
            <>
              <Select
                label="Patient"
                value={form.patient_id}
                onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
                options={patients.map((p) => ({ value: p.id, label: p.full_name }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-secondary">
                  Note
                </label>
                <textarea
                  className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
                  rows={5}
                  placeholder="Describe what you've observed — behavior, mood, appetite, sleep, progress with exercises..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Submitting...' : 'Submit Note'}
              </Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  )
}
