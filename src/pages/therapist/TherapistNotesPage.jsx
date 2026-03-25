import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { MessageSquare, Send, ChevronDown, ChevronUp } from 'lucide-react'

export default function TherapistNotesPage() {
  const { profile } = useAuth()
  const [notes, setNotes] = useCachedState('therapist-notes', [])
  const [loading, setLoading] = useState(() => !hasCache('therapist-notes'))
  const [expandedNote, setExpandedNote] = useState(null)
  const [replies, setReplies] = useState({})
  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)

  useEffect(() => {
    if (profile) loadNotes()
  }, [profile])

  async function loadNotes() {
    // Get patient IDs assigned to this therapist
    const { data: assignments } = await supabase
      .from('patient_assignments')
      .select('patient_id')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')

    const patientIds = assignments?.map((a) => a.patient_id) || []
    if (patientIds.length === 0) {
      setNotes([])
      return
    }

    const { data } = await supabase
      .from('caregiver_notes')
      .select('*, profiles!caregiver_notes_caregiver_id_fkey(full_name), patient:profiles!caregiver_notes_patient_id_fkey(full_name)')
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false })

    setNotes(data || [])
    setLoading(false)
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
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Caregiver Notes</h2>
        <p className="text-text-secondary mt-2">
          Review and respond to notes from caregivers
        </p>
      </div>

      <div className="space-y-4">
        {notes.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <MessageSquare size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-muted">
                No caregiver notes yet.
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
                      <span className="text-sm font-semibold text-text-primary">
                        {note.profiles?.full_name}
                      </span>
                      <Badge color="caregiver">caregiver</Badge>
                      <span className="text-xs text-text-muted">
                        about {note.patient?.full_name}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary line-clamp-2">
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
                        No replies yet.
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
    </div>
  )
}
