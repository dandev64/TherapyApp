import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, recoveryLinkOpened } from '../lib/supabase'
import { clearDataCache } from '../hooks/useCachedState'

const AuthContext = createContext({})

// Survives a reload of the tab, so refreshing the reset page doesn't skip it
const RECOVERY_KEY = 'habitot-password-recovery'
function readRecoveryFlag() {
  try { return sessionStorage.getItem(RECOVERY_KEY) === '1' } catch { return false }
}
function writeRecoveryFlag(on) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1')
    else sessionStorage.removeItem(RECOVERY_KEY)
  } catch { /* storage unavailable: the flag lasts until reload */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)
  // Signed in from a password reset link: the user must set a new password
  const [passwordRecovery, setPasswordRecoveryState] = useState(() => {
    if (recoveryLinkOpened) writeRecoveryFlag(true)
    return recoveryLinkOpened || readRecoveryFlag()
  })
  function setPasswordRecovery(on) {
    writeRecoveryFlag(on)
    setPasswordRecoveryState(on)
  }
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
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
        if (event === 'SIGNED_OUT') setPasswordRecovery(false)
        const newUser = session?.user ?? null
        const newId = newUser?.id ?? null
        const changed = newId !== currentUserIdRef.current
        currentUserIdRef.current = newId
        // Pages cache data under fixed keys: never show one user's data to the
        // next, however the switch happened (sign-out, expiry, another tab)
        if (changed) clearDataCache()
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

  // A reset link that didn't sign anyone in (expired, or the exchange failed)
  // leaves nothing to reset: drop the flag so the tab isn't held on that page
  useEffect(() => {
    if (!loading && !user && passwordRecovery) setPasswordRecovery(false)
  }, [loading, user, passwordRecovery])

  // Fetch profile reactively when user id changes
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!user) return
    let cancelled = false

    setProfileError(null)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Profile fetch error:', error)
          setProfileError(error.message)
          setProfile(null)
          setLoading(false)
          return
        }
        setProfile(data)
        setProfileError(null)
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
      value={{
        user, profile, loading, profileError, signUp, signIn, signOut, refreshProfile,
        passwordRecovery, finishPasswordRecovery: () => setPasswordRecovery(false),
      }}
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
