import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Profile failed to load — likely trigger didn't create it
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-surface-card rounded-2xl border border-border-light p-8 max-w-md text-center">
          <p className="text-lg font-semibold text-text-primary mb-2">Profile not found</p>
          <p className="text-sm text-text-secondary mb-4">
            Your profile couldn&apos;t be loaded. This usually means the database trigger
            didn&apos;t run. Check that you ran the full schema.sql in Supabase.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  return children
}
