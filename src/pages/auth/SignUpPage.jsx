import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'

const roleOptions = [
  { value: 'patient', label: 'Patient' },
  { value: 'caregiver', label: 'Caregiver' },
  { value: 'therapist', label: 'Therapist' },
]

export default function SignUpPage() {
  const { user, profile, profileError, signUp } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [checkEmail, setCheckEmail] = useState('')
  const [role, setRole] = useState('patient')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Already logged in — redirect to dashboard
  if (user && profile) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) { setError('Full name is required.'); return }
    if (!email.trim()) { setError('Email is required.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

    setLoading(true)

    const { data, error: err } = await signUp({ email, password, fullName, role })
    setLoading(false)

    if (err) {
      // Clicking "Create Account" again hits Supabase's email rate limit;
      // the first confirmation email was already sent.
      if (err.status === 429 || /rate limit|security purposes|only request this/i.test(err.message)) {
        setCheckEmail(email.trim())
        return
      }
      setError(err.message)
      return
    }
    // With email confirmation on, there is no session until the link is clicked
    if (!data?.session) {
      setCheckEmail(email.trim())
      return
    }
    // Otherwise AuthContext picks up the new user and redirects via the check above
  }

  if (checkEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="w-full max-w-md text-center">
          <img src="/habitot-logo.png" alt="HabitOT" className="w-52 h-52 object-contain mx-auto mb-4 rounded-3xl" />
          <div className="bg-surface-card rounded-3xl border border-border-light p-8 shadow-[0_20px_40px_rgba(44,52,54,0.06)]">
            <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">Check your email</h1>
            <p className="text-text-secondary mt-3 text-sm leading-relaxed">
              We sent a HabitOT confirmation link to <span className="font-bold text-text-primary">{checkEmail}</span>.
              Click the link in that email to confirm your account, then sign in.
            </p>
            <p className="text-xs text-text-muted mt-4">
              Can&apos;t find it? Check your spam folder. It may take a minute to arrive.
            </p>
            <Link to="/login" className="inline-block mt-6 text-primary font-bold hover:underline text-sm">
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src="/habitot-logo.png" alt="HabitOT" className="w-52 h-52 object-contain mx-auto mb-4 rounded-3xl" />
          <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Create your account</h1>
          <p className="text-text-secondary mt-2">
            Join HabitOT
          </p>
        </div>

        <div className="bg-surface-card rounded-3xl border border-border-light p-8 shadow-[0_20px_40px_rgba(44,52,54,0.06)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            {(error || profileError) && (
              <div className="p-4 rounded-xl bg-danger-bg text-danger text-sm font-semibold">
                {error || `Unable to load your profile: ${profileError}`}
              </div>
            )}

            <Input
              label="Full Name"
              type="text"
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <PasswordInput
              label="Password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              required
            />
            <PasswordInput
              label="Confirm Password"
              placeholder="Type your password again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              error={confirmPassword && confirmPassword !== password ? 'Passwords do not match.' : ''}
              required
            />
            <Select
              label="I am a..."
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={roleOptions}
            />

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-bold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
