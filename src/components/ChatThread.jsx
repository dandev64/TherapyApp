import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { formatMessageTime, formatMessageDate } from '../utils/time'
import Button from './ui/Button'
import { Send, ArrowLeft } from 'lucide-react'

const MESSAGE_PAGE_SIZE = 50
// Fallback refresh while a chat is open, in case Realtime is disconnected
const POLL_MS = 5000
const MESSAGE_FIELDS = 'id, sender_id, recipient_id, content, created_at, read_at'

/** One-to-one conversation between the current user and `otherId`. Used by both portals. */
export default function ChatThread({ otherId }) {
  const { profile } = useAuth()
  const { refreshCount, showToast, messageTick } = useNotifications()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [other, setOther] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const conversationFilter = profile
    ? `and(sender_id.eq.${profile.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${profile.id})`
    : ''

  function mergeMessages(incoming) {
    if (!incoming.length) return
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id))
      const added = incoming.filter((m) => !ids.has(m.id))
      if (!added.length) return prev
      return [...prev, ...added].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }

  async function markRead(list) {
    const unread = list.filter((m) => m.recipient_id === profile.id && !m.read_at)
    if (!unread.length) return
    const ids = unread.map((m) => m.id)
    const now = new Date().toISOString()
    await supabase.from('messages').update({ read_at: now }).in('id', ids)
    await supabase
      .from('notifications')
      .update({ read_at: now, seen_at: now })
      .eq('recipient_id', profile.id)
      .eq('type', 'new_message')
      .in('reference_id', ids)
    refreshCount()
  }

  async function loadInitial() {
    const [otherRes, msgRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role').eq('id', otherId).single(),
      supabase
        .from('messages')
        .select(MESSAGE_FIELDS)
        .or(conversationFilter)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE),
    ])
    if (otherRes.error) console.error('Failed to load contact:', otherRes.error.message)
    if (msgRes.error) console.error('Failed to load messages:', msgRes.error.message)
    setOther(otherRes.data)
    const data = msgRes.data || []
    setMessages([...data].reverse())
    setHasOlderMessages(data.length === MESSAGE_PAGE_SIZE)
    setLoading(false)
    markRead(data)
  }

  // Fetch anything newer than what is on screen
  async function loadNewer() {
    const list = messagesRef.current
    const newest = list[list.length - 1]
    let query = supabase
      .from('messages')
      .select(MESSAGE_FIELDS)
      .or(conversationFilter)
      .order('created_at', { ascending: true })
      .limit(MESSAGE_PAGE_SIZE)
    if (newest) query = query.gt('created_at', newest.created_at)
    const { data } = await query
    if (data?.length) {
      mergeMessages(data)
      markRead(data)
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile || !otherId) return
    setLoading(true)
    setMessages([])
    loadInitial()

    const channel = supabase
      .channel(`chat-${otherId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${profile.id}` },
        (payload) => {
          const msg = payload.new
          if (msg.sender_id !== otherId) return
          mergeMessages([msg])
          markRead([msg])
        }
      )
      .subscribe()

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadNewer()
    }, POLL_MS)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [profile?.id, otherId])

  // The global listener saw a new message for us: pull it in
  useEffect(() => {
    if (!loading && messageTick > 0) loadNewer()
  }, [messageTick])
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function loadOlderMessages() {
    if (!messages.length || loadingOlder) return
    setLoadingOlder(true)
    const oldest = messages[0]
    const { data } = await supabase
      .from('messages')
      .select(MESSAGE_FIELDS)
      .or(conversationFilter)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE)
    const sorted = (data || []).reverse()
    setMessages((prev) => [...sorted, ...prev])
    setHasOlderMessages((data || []).length === MESSAGE_PAGE_SIZE)
    setLoadingOlder(false)
  }

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: profile.id, recipient_id: otherId, content: text.trim() })
      .select()
      .single()

    setSending(false)
    if (error) {
      console.error('Failed to send message:', error.message)
      showToast('Failed to send message. Please try again.', 'task_overdue')
      return
    }
    if (data) mergeMessages([data])
    setText('')
    inputRef.current?.focus()
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
    <div className="flex flex-col h-[calc(100dvh-6rem)] lg:h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border-light mb-4">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="p-2 -ml-2 text-text-secondary hover:text-primary cursor-pointer">
          <ArrowLeft size={20} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-primary font-bold text-sm">
          {other?.full_name?.charAt(0)?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-bold text-text-primary">{other?.full_name}</p>
          <p className="text-xs text-text-muted capitalize">{other?.role}</p>
        </div>
      </div>

      {/* Messages — caret-transparent keeps the text cursor out of the bubbles */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4 caret-transparent">
        {hasOlderMessages && (
          <div className="text-center py-2">
            <button
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer disabled:opacity-50"
            >
              {loadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
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
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm break-words ${
                  isMine
                    ? 'bg-primary text-on-primary rounded-br-md'
                    : 'bg-surface-container text-text-primary rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
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
      <div className="flex gap-2 pt-3 pb-[env(safe-area-inset-bottom)] border-t border-border-light">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          aria-label="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          className="flex-1 px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary caret-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card"
        />
        <Button onClick={handleSend} disabled={sending || !text.trim()}>
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}
