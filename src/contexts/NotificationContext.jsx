import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const NotificationContext = createContext({})

// Fallback polling interval, in case Realtime is disconnected
const POLL_MS = 15000

export function NotificationProvider({ children }) {
  const { profile } = useAuth()
  // Badge on the Notifications tab: unseen, non-message notifications
  const [unreadCount, setUnreadCount] = useState(0)
  // Badge on the Messages tab: unread messages
  const [unreadMessages, setUnreadMessages] = useState(0)
  // Bumps whenever a new message arrives, so chat/inbox pages can refetch
  const [messageTick, setMessageTick] = useState(0)
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const toastTimers = useRef({})
  const profileRef = useRef(profile)
  profileRef.current = profile
  // Notifications already handled (toasted), to avoid duplicates from realtime + polling
  const seenIdsRef = useRef(new Set())
  const lastCheckRef = useRef(null)

  async function fetchUnreadCount() {
    const currentProfile = profileRef.current
    if (!currentProfile) return
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', currentProfile.id)
      .is('read_at', null)
      .is('seen_at', null)
      .neq('type', 'new_message')
    if (error) {
      console.error('Failed to fetch unread count:', error)
      return
    }
    setUnreadCount(count || 0)
  }

  async function fetchUnreadMessages() {
    const currentProfile = profileRef.current
    if (!currentProfile) return
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', currentProfile.id)
      .is('read_at', null)
    if (error) {
      console.error('Failed to fetch unread messages:', error)
      return
    }
    setUnreadMessages(count || 0)
  }

  function showToast(message, type, notification) {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type, notification }])
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      delete toastTimers.current[id]
    }, 5000)
    toastTimers.current[id] = timer
  }

  function handleIncoming(n) {
    if (seenIdsRef.current.has(n.id)) return
    seenIdsRef.current.add(n.id)
    const role = profileRef.current?.role
    // No pop-up for a message while the user is already in a chat thread
    const inChat = window.location.pathname.startsWith(`/${role}/messages/`)
    if (!(n.type === 'new_message' && inChat)) showToast(n.content, n.type, n)
    if (n.type === 'new_message') {
      fetchUnreadMessages()
      setMessageTick((t) => t + 1)
    } else {
      fetchUnreadCount()
    }
  }

  // Pick up anything created since the last check (covers Realtime gaps)
  async function pollNew() {
    const currentProfile = profileRef.current
    if (!currentProfile || !lastCheckRef.current) return
    // Overlap by a minute to tolerate client/server clock skew; duplicates are skipped
    const since = new Date(new Date(lastCheckRef.current).getTime() - 60000).toISOString()
    lastCheckRef.current = new Date().toISOString()
    const { data } = await supabase
      .from('notifications')
      .select('id, content, type, patient_id, reference_id, created_at')
      .eq('recipient_id', currentProfile.id)
      .is('read_at', null)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
    ;(data || []).forEach(handleIncoming)
    fetchUnreadMessages()
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile) {
      setUnreadCount(0)
      setUnreadMessages(0)
      return
    }
    lastCheckRef.current = new Date().toISOString()
    fetchUnreadCount()
    fetchUnreadMessages()

    function onFocus() {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount()
        pollNew()
      }
    }
    document.addEventListener('visibilitychange', onFocus)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') pollNew()
    }, POLL_MS)

    // Unique channel names: reusing a name while the old channel is still
    // being removed makes supabase-js throw
    const suffix = Math.random().toString(36).slice(2)
    const channel = supabase
      .channel(`notifications-${profile.id}-${suffix}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => handleIncoming(payload.new)
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => {
          fetchUnreadMessages()
          setMessageTick((t) => t + 1)
        }
      )
      .subscribe()

    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [profile?.id])
  /* eslint-enable react-hooks/exhaustive-deps */

  function dismissToast(id) {
    if (toastTimers.current[id]) {
      clearTimeout(toastTimers.current[id])
      delete toastTimers.current[id]
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const decrementCount = useCallback(() => {
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [])

  const refreshCount = useCallback(() => {
    fetchUnreadCount()
    fetchUnreadMessages()
  }, [])

  // Called when the Notifications tab is opened: clears the red badge
  const markAllSeen = useCallback(async () => {
    const currentProfile = profileRef.current
    if (!currentProfile) return
    setUnreadCount(0)
    const { error } = await supabase
      .from('notifications')
      .update({ seen_at: new Date().toISOString() })
      .eq('recipient_id', currentProfile.id)
      .is('seen_at', null)
    if (error) console.error('Failed to mark notifications seen:', error)
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        unreadMessages,
        messageTick,
        decrementCount,
        refreshCount,
        markAllSeen,
        toasts,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  return useContext(NotificationContext)
}
