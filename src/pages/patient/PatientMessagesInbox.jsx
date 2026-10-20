import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { formatTime } from '../../utils/time'
import Card from '../../components/ui/Card'
import { Search } from 'lucide-react'

export default function PatientMessagesInbox() {
  const { profile } = useAuth()
  const { messageTick } = useNotifications()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function loadConversations() {
      // Get all assigned therapists
      const { data: assignments, error: aErr } = await supabase
        .from('patient_assignments')
        .select('assigned_to, profiles!patient_assignments_assigned_to_fkey(id, full_name, email)')
        .eq('patient_id', profile.id)
        .eq('relationship', 'therapist')

      if (aErr) {
        if (!cancelled) { setError('Failed to load conversations.'); setLoading(false) }
        return
      }
      if (!assignments || assignments.length === 0) {
        if (!cancelled) { setConversations([]); setLoading(false) }
        return
      }

      // One row per conversation: the latest message and the unread count
      const { data: rows, error: mErr } = await supabase.rpc('inbox_conversations')
      if (mErr) {
        if (!cancelled) { setError('Failed to load conversations.'); setLoading(false) }
        return
      }
      const byPeer = {}
      ;(rows || []).forEach((r) => {
        byPeer[r.peer_id] = { latest: r, unread: Number(r.unread) }
      })

      const convos = assignments.map((a) => ({
        therapist: a.profiles,
        latest: byPeer[a.assigned_to]?.latest || null,
        unread: byPeer[a.assigned_to]?.unread || 0,
      }))

      // Sort: unread first, then by latest message time
      convos.sort((a, b) => {
        if (a.unread > 0 && b.unread === 0) return -1
        if (b.unread > 0 && a.unread === 0) return 1
        const aTime = a.latest?.created_at || ''
        const bTime = b.latest?.created_at || ''
        return bTime.localeCompare(aTime)
      })

      if (cancelled) return
      setError(null)
      setConversations(convos)
      setLoading(false)
    }

    loadConversations()
    return () => { cancelled = true }
    // Reload when a new message arrives (messageTick)
  }, [profile, messageTick])

  const filtered = conversations.filter((c) =>
    c.therapist?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Messages</h2>
        <p className="text-text-secondary mt-2">
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">{error}</div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search therapists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card"
        />
      </div>

      <div className="space-y-2">
        {error ? null : filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted text-center py-8">
              {conversations.length === 0
                ? 'No therapists assigned yet.'
                : 'No conversations match your search.'}
            </p>
          </Card>
        ) : (
          filtered.map((convo) => (
            <button
              key={convo.therapist.id}
              onClick={() => navigate(`/patient/messages/${convo.therapist.id}`)}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-card border border-border-light hover:border-primary/30 hover:shadow-sm transition-all duration-200 cursor-pointer text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {convo.therapist.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm truncate ${convo.unread > 0 ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}>
                    {convo.therapist.full_name}
                  </p>
                  {convo.latest && (
                    <span className="text-[11px] text-text-muted shrink-0">
                      {formatTime(convo.latest.created_at)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className={`text-xs truncate ${convo.unread > 0 ? 'text-text-primary font-medium' : 'text-text-muted'}`}>
                    {convo.latest
                      ? `${convo.latest.sender_id === profile.id ? 'You: ' : ''}${convo.latest.content}`
                      : 'No messages yet'}
                  </p>
                  {convo.unread > 0 && (
                    <span className="bg-primary text-on-primary text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shrink-0">
                      {convo.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
