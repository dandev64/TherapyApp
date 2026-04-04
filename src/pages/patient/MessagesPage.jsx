import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { formatMessageTime, formatMessageDate } from '../../utils/time'
import Button from '../../components/ui/Button'
import { Send, ArrowLeft } from 'lucide-react'

export default function MessagesPage() {
  const { recipientId } = useParams()
  const { profile } = useAuth()
  const { refreshCount } = useNotifications()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [recipient, setRecipient] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!profile || !recipientId) return
    loadRecipient()
    loadMessages()

    // Subscribe to new messages via Realtime
    const channel = supabase
      .channel(`chat-${recipientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const msg = payload.new
          const isForMe = msg.sender_id === recipientId && msg.recipient_id === profile.id
          if (isForMe) {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            )
            markAsRead(msg.id)
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile, recipientId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadRecipient() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', recipientId)
      .single()
    setRecipient(data)
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, created_at, read_at')
      .or(
        `and(sender_id.eq.${profile.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${profile.id})`
      )
      .order('created_at', { ascending: true })

    setMessages(data || [])
    setLoading(false)

    // Mark unread messages as read
    const unread = (data || []).filter(
      (m) => m.recipient_id === profile.id && !m.read_at
    )
    if (unread.length > 0) {
      const ids = unread.map((m) => m.id)
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', ids)
      // Dismiss notifications for these messages
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', profile.id)
        .eq('type', 'new_message')
        .in('reference_id', ids)
      refreshCount()
    }
  }

  async function markAsRead(msgId) {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', msgId)
    // Dismiss any notification created for this message
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', profile.id)
      .eq('type', 'new_message')
      .eq('reference_id', msgId)
    refreshCount()
  }

  async function handleSend() {
    if (!text.trim()) return
    setSending(true)
    const { data } = await supabase
      .from('messages')
      .insert({
        sender_id: profile.id,
        recipient_id: recipientId,
        content: text.trim(),
      })
      .select()
      .single()

    if (data) setMessages((prev) => [...prev, data])
    setText('')
    setSending(false)
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  // Group messages by date
  const grouped = []
  let lastDate = null
  messages.forEach((m) => {
    const d = formatMessageDate(m.created_at)
    if (d !== lastDate) {
      grouped.push({ type: 'date', label: d })
      lastDate = d
    }
    grouped.push({ type: 'message', data: m })
  })

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border-light mb-4">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="text-text-secondary hover:text-primary cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm">
          {recipient?.full_name?.charAt(0)?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-bold text-text-primary">{recipient?.full_name}</p>
          <p className="text-xs text-text-muted capitalize">{recipient?.role}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {grouped.length === 0 && (
          <p className="text-sm text-text-muted text-center py-12">
            No messages yet. Start a conversation!
          </p>
        )}
        {grouped.map((item, i) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${i}`} className="text-center">
                <span className="text-xs text-text-muted bg-surface-alt px-3 py-1 rounded-full">
                  {item.label}
                </span>
              </div>
            )
          }
          const m = item.data
          const isMine = m.sender_id === profile.id
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  isMine
                    ? 'bg-primary text-on-primary rounded-br-md'
                    : 'bg-surface-container text-text-primary rounded-bl-md'
                }`}
              >
                <p>{m.content}</p>
                <p className={`text-[10px] mt-1 ${isMine ? 'text-on-primary/60' : 'text-text-muted'}`}>
                  {formatMessageTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-4 border-t border-border-light">
        <input
          type="text"
          placeholder="Type a message..."
          aria-label="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          className="flex-1 px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card"
        />
        <Button onClick={handleSend} disabled={sending || !text.trim()}>
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}
