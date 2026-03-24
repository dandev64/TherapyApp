import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { Users, Settings, Info, LogOut, Edit3, Check } from 'lucide-react'

export default function TherapistProfilePage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [patientCount, setPatientCount] = useState(0)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setName(profile.full_name || '')
    loadPatientCount()
  }, [profile])

  async function loadPatientCount() {
    const { count } = await supabase
      .from('patient_assignments')
      .select('id', { count: 'exact' })
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')
    setPatientCount(count || 0)
  }

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ full_name: name })
      .eq('id', profile.id)
    setSaving(false)
    setEditing(false)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Profile</h2>

      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center text-primary text-2xl font-bold">
            {profile?.full_name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
              Occupational Therapist
            </p>
            {editing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            ) : (
              <p className="text-lg font-bold text-text-primary">{profile?.full_name}</p>
            )}
          </div>
          {editing ? (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Check size={14} /> {saving ? '...' : 'Save'}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Edit3 size={14} /> Edit
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 p-4 bg-surface-alt rounded-2xl">
          <Users size={18} className="text-primary" />
          <div>
            <p className="text-2xl font-extrabold text-text-primary">{patientCount}</p>
            <p className="text-xs text-text-muted">Assigned Patients</p>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <button
          onClick={() => {}}
          className="w-full flex items-center gap-3 p-4 bg-surface-card rounded-2xl border border-border-light hover:bg-surface-alt transition-colors cursor-pointer"
        >
          <Settings size={18} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">App Settings</span>
        </button>
        <button
          onClick={() => {}}
          className="w-full flex items-center gap-3 p-4 bg-surface-card rounded-2xl border border-border-light hover:bg-surface-alt transition-colors cursor-pointer"
        >
          <Info size={18} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">About the App</span>
        </button>
      </div>

      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 p-4 bg-danger-bg rounded-2xl text-danger font-semibold text-sm hover:bg-danger/10 transition-colors cursor-pointer"
      >
        <LogOut size={16} />
        Log Out
      </button>
    </div>
  )
}
