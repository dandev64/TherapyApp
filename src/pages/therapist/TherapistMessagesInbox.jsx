import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatTime } from '../../utils/time'
import Card from '../../components/ui/Card'
import { Search } from 'lucide-react'

export default function TherapistMessagesInbox() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (profile) loadConversations()
  }, [profile])

  async function loadConversations() {
    // Get all assigned patients
    const { data: assignments } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')

    if (!assignments || assignments.length === 0) {
      setConversations([])
      setLoading(false)
      return
    }

    const patientIds = assignments.map((a) => a.patient_id)

    // Get latest message for each conversation
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, created_at, read_at')
      .or(
        `and(sender_id.eq.${profile.id},recipient_id.in.(${patientIds.join(',')})),and(sender_id.in.(${patientIds.join(',')}),recipient_id.eq.${profile.id})`
      )
      .order('created_at', { ascending: false })

    // Group by patient and get latest + unread count
    const byPatient = {}
    ;(msgs || []).forEach((m) => {
      const pid = m.sender_id === profile.id ? m.recipient_id : m.sender_id
      if (!byPatient[pid]) byPatient[pid] = { latest: m, unread: 0 }
      if (m.recipient_id === profile.id && !m.read_at) byPatient[pid].unread++
    })

    const convos = assignments.map((a) => ({
      patient: a.profiles,
      latest: byPatient[a.patient_id]?.latest || null,
      unread: byPatient[a.patient_id]?.unread || 0,
    }))

    // Sort: unread first, then by latest message time
    convos.sort((a, b) => {
      if (a.unread > 0 && b.unread === 0) return -1
      if (b.unread > 0 && a.unread === 0) return 1
      const aTime = a.latest?.created_at || ''
      const bTime = b.latest?.created_at || ''
      return bTime.localeCompare(aTime)
    })

    setConversations(convos)
    setLoading(false)
  }

  const filtered = conversations.filter((c) =>
    c.patient?.full_name?.toLowerCase().includes(search.toLowerCase())
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

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted text-center py-8">
              {conversations.length === 0
                ? 'No patients assigned yet. Add patients to start messaging.'
                : 'No conversations match your search.'}
            </p>
          </Card>
        ) : (
          filtered.map((convo) => (
            <button
              key={convo.patient.id}
              onClick={() => navigate(`/therapist/messages/${convo.patient.id}`)}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-card border border-border-light hover:border-primary/30 hover:shadow-sm transition-all duration-200 cursor-pointer text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {convo.patient.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm truncate ${convo.unread > 0 ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}>
                    {convo.patient.full_name}
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
