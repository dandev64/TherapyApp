import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import { Heart } from 'lucide-react'

const roleOptions = [
  { value: 'patient', label: 'Patient' },
  { value: 'caregiver', label: 'Caregiver' },
  { value: 'therapist', label: 'Therapist' },
]

export default function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('patient')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: err } = await signUp({ email, password, fullName, role })
    setLoading(false)

    if (err) {
      setError(err.message)
      return
    }

    navigate(`/${role}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center mx-auto mb-5">
            <Heart size={30} className="text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Create your account</h1>
          <p className="text-text-secondary mt-2">
            Join Simple Therapy
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-border-light p-8 shadow-[0_20px_40px_rgba(44,52,54,0.06)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-danger-bg text-danger text-sm font-semibold">
                {error}
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
