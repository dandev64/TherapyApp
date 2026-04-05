import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Input from '../../components/ui/Input'
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

    setLoading(true)

    const { error: err } = await signUp({ email, password, fullName, role })
    setLoading(false)

    if (err) {
      setError(err.message)
      return
    }
    // AuthContext will pick up the new user and redirect via the check below
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src="/habitot-icon.png" alt="HabitOT" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-5" />
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
            <Input
              label="Password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
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
