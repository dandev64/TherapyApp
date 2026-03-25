import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { Heart } from 'lucide-react'

export default function LoginPage() {
  const { user, profile, signIn } = useAuth()
  const navigate = useNavigate()

  // Already logged in — redirect to dashboard
  if (user && profile) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: err } = await signIn({ email, password })
    setLoading(false)

    if (err) {
      setError(err.message)
      return
    }

    const role = data.user?.user_metadata?.role || 'patient'
    navigate(`/${role}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center mx-auto mb-5">
            <Heart size={30} className="text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Welcome back</h1>
          <p className="text-text-secondary mt-2">
            Sign in to Simple Therapy
          </p>
        </div>

        <div className="bg-surface-card rounded-3xl border border-border-light p-8 shadow-[0_20px_40px_rgba(44,52,54,0.06)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-danger-bg text-danger text-sm font-semibold">
                {error}
              </div>
            )}

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
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-text-secondary mt-6">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-primary font-bold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
