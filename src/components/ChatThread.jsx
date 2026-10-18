import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { formatMessageTime, formatMessageDate } from '../utils/time'
import Button from './ui/Button'
import { Send, ArrowLeft, Search, X, ArrowDown } from 'lucide-react'

const MESSAGE_PAGE_SIZE = 50
// Fallback refresh while a chat is open, in case Realtime is disconnected
const POLL_MS = 5000
const MESSAGE_FIELDS = 'id, sender_id, recipient_id, content, created_at, read_at'
const SEARCH_LIMIT = 50

/** Escapes LIKE wildcards so the search is literal text. */
function likePattern(term) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** Wraps case-insensitive matches of `term` in <mark>. */
function Highlight({ text, term }) {
  if (!term) return text
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${safe})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase()
      ? <mark key={i} className="bg-amber-200 text-inherit rounded px-0.5">{part}</mark>
      : part
  )
}

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
  // Message search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const [jumped, setJumped] = useState(false)
  const skipAutoScrollRef = useRef(false)
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
    if (skipAutoScrollRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Search the whole conversation (debounced)
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const term = searchTerm.trim()
    if (!searchOpen || term.length < 2) { setSearchResults(null); return }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_FIELDS)
        .or(conversationFilter)
        .ilike('content', likePattern(term))
        .order('created_at', { ascending: false })
        .limit(SEARCH_LIMIT)
      if (cancelled) return
      if (error) console.error('Message search failed:', error.message)
      setSearchResults(data || [])
      setSearching(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [searchTerm, searchOpen, otherId])
  /* eslint-enable react-hooks/exhaustive-deps */

  function closeSearch() {
    setSearchOpen(false)
    setSearchTerm('')
    setSearchResults(null)
  }

  // Load the conversation around a search hit and scroll to it
  async function jumpTo(message) {
    const [olderRes, newerRes] = await Promise.all([
      supabase
        .from('messages')
        .select(MESSAGE_FIELDS)
        .or(conversationFilter)
        .lt('created_at', message.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE / 2),
      supabase
        .from('messages')
        .select(MESSAGE_FIELDS)
        .or(conversationFilter)
        .gte('created_at', message.created_at)
        .order('created_at', { ascending: true })
        .limit(MESSAGE_PAGE_SIZE),
    ])
    const older = (olderRes.data || []).reverse()
    skipAutoScrollRef.current = true
    setMessages([...older, ...(newerRes.data || [])])
    setHasOlderMessages(older.length === MESSAGE_PAGE_SIZE / 2)
    setJumped(true)
    setHighlightId(message.id)
    closeSearch()
    setTimeout(() => {
      document.getElementById(`msg-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  async function backToLatest() {
    setJumped(false)
    setHighlightId(null)
    skipAutoScrollRef.current = false
    await loadInitial()
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary truncate">{other?.full_name}</p>
          <p className="text-xs text-text-muted capitalize">{other?.role}</p>
        </div>
        <button
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          aria-label={searchOpen ? 'Close search' : 'Search messages'}
          aria-expanded={searchOpen}
          className={`p-2.5 rounded-full cursor-pointer transition-colors ${searchOpen ? 'bg-primary-container text-primary' : 'text-text-secondary hover:bg-surface-alt hover:text-primary'}`}
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>
      </div>

      {searchOpen && (
        <div className="relative mb-3">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch() }}
            placeholder={`Search in conversation with ${other?.full_name || 'contact'}`}
            aria-label="Search messages"
            maxLength={100}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary caret-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card"
          />
        </div>
      )}

      {searchOpen && searchTerm.trim().length >= 2 && (
        <div className="flex-1 overflow-y-auto pb-4">
          {searching && !searchResults ? (
            <p className="text-sm text-text-muted text-center py-8">Searching...</p>
          ) : searchResults?.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No messages match &ldquo;{searchTerm.trim()}&rdquo;.</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-text-muted mb-2">
                {searchResults?.length === SEARCH_LIMIT ? `Showing the latest ${SEARCH_LIMIT} matches` : `${searchResults?.length || 0} match${searchResults?.length === 1 ? '' : 'es'}`}
              </p>
              <ul className="space-y-2">
                {(searchResults || []).map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => jumpTo(m)}
                      className="w-full text-left rounded-xl border border-border-light bg-surface-card px-4 py-3 hover:border-primary/30 hover:bg-primary-container/10 cursor-pointer"
                    >
                      <p className="text-xs text-text-muted">
                        {m.sender_id === profile.id ? 'You' : other?.full_name} · {formatMessageDate(m.created_at)}, {formatMessageTime(m.created_at)}
                      </p>
                      <p className="text-sm text-text-primary mt-1 line-clamp-2 break-words">
                        <Highlight text={m.content} term={searchTerm.trim()} />
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Messages — caret-transparent keeps the text cursor out of the bubbles */}
      <div className={`relative flex-1 overflow-y-auto space-y-3 pb-4 caret-transparent ${searchOpen && searchTerm.trim().length >= 2 ? 'hidden' : ''}`}>
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
            <div key={m.id} id={`msg-${m.id}`} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm break-words ${
                  isMine
                    ? 'bg-primary text-on-primary rounded-br-md'
                    : 'bg-surface-container text-text-primary rounded-bl-md'
                } ${highlightId === m.id ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
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
        {jumped && (
          <div className="sticky bottom-0 flex justify-center pointer-events-none">
            <button
              onClick={backToLatest}
              className="pointer-events-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-card border border-border shadow-md text-xs font-semibold text-primary cursor-pointer"
            >
              <ArrowDown size={14} /> Back to latest
            </button>
          </div>
        )}
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
