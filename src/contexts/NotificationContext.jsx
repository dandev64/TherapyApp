import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const NotificationContext = createContext({})

export function NotificationProvider({ children }) {
  const { profile } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const toastTimers = useRef({})
  const profileRef = useRef(profile)
  profileRef.current = profile

  async function fetchUnreadCount() {
    const currentProfile = profileRef.current
    if (!currentProfile) return
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', currentProfile.id)
      .is('read_at', null)
    if (!error) setUnreadCount(count || 0)
  }

  // Fetch initial unread count + re-fetch on tab focus
  useEffect(() => {
    if (!profile) {
      setUnreadCount(0)
      return
    }
    fetchUnreadCount()

    function onFocus() {
      if (document.visibilityState === 'visible') fetchUnreadCount()
    }
    document.addEventListener('visibilitychange', onFocus)

    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [profile?.id])

  // Subscribe to real-time notification inserts (works when Realtime is enabled in Supabase)
  useEffect(() => {
    if (!profile) return

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          setUnreadCount((c) => c + 1)
          showToast(payload.new.content, payload.new.type, payload.new)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile?.id])

  function showToast(message, type, notification) {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type, notification }])
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      delete toastTimers.current[id]
    }, 5000)
    toastTimers.current[id] = timer
  }

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
  }, [])

  return (
    <NotificationContext.Provider
      value={{ unreadCount, decrementCount, refreshCount, toasts, dismissToast }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
