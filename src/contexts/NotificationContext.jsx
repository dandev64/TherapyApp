import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const NotificationContext = createContext({})

export function NotificationProvider({ children }) {
  const { profile } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)

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
      .channel('global-notifications')
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

  async function fetchUnreadCount() {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .is('read_at', null)
    setUnreadCount(count || 0)
  }

  function showToast(message, type, notification) {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type, notification }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const decrementCount = useCallback(() => {
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [])

  const refreshCount = useCallback(() => {
    if (profile) fetchUnreadCount()
  }, [profile?.id])

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
