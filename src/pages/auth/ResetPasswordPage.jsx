import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'

/** Where a password reset link lands: the link signs the user in, and they choose a new password here. */
export default function ResetPasswordPage() {
  const { user, loading, finishPasswordRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setError('')
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) {
      setError(err.code === 'same_password' ? 'Choose a password different from your old one.' : err.message)
      return
    }
    finishPasswordRecovery()
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src="/habitot-logo.png" alt="HabitOT" className="w-32 h-32 object-contain mx-auto mb-4 rounded-3xl" />
          <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Set a new password</h1>
          <p className="text-text-secondary mt-2">
            {user ? `For ${user.email}` : 'This reset link is invalid or has expired.'}
          </p>
        </div>

        <div className="bg-surface-card rounded-3xl border border-border-light p-8 shadow-[0_20px_40px_rgba(44,52,54,0.06)]">
          {user ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 rounded-xl bg-danger-bg text-danger text-sm font-semibold">{error}</div>
              )}
              <PasswordInput
                label="New password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
              <PasswordInput
                label="Confirm new password"
                placeholder="Type it again"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
              <Button type="submit" disabled={saving} className="w-full" size="lg">
                {saving ? 'Saving...' : 'Save new password'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-text-secondary text-center">
              Request a new link from the{' '}
              <Link to="/login" className="text-primary font-bold hover:underline">sign-in page</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
