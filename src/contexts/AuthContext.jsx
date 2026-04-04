import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearDataCache } from '../hooks/useCachedState'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const currentUserIdRef = useRef(null)

  // Listen to auth state changes (keep callback synchronous — no await)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null
      currentUserIdRef.current = sessionUser?.id ?? null
      setUser(sessionUser)
      if (!sessionUser) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const newUser = session?.user ?? null
        const newId = newUser?.id ?? null
        const changed = newId !== currentUserIdRef.current
        currentUserIdRef.current = newId
        setUser(newUser)
        if (!newUser) {
          setProfile(null)
          setLoading(false)
        } else if (changed) {
          // Only show loading when user actually changes (real sign-in)
          setLoading(true)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Fetch profile reactively when user id changes
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!user) return
    let cancelled = false

    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Profile fetch error:', error)
          setProfile(null)
          setLoading(false)
          return
        }
        setProfile(data)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [user?.id])
  /* eslint-enable react-hooks/exhaustive-deps */

  async function signUp({ email, password, fullName, role }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
      },
    })
    return { data, error }
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  async function refreshProfile() {
    if (!user) return
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (error) {
      console.error('Profile refresh error:', error)
      return
    }
    if (data) setProfile(data)
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearDataCache()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
