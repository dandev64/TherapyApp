import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { MessageSquare, LogOut, Edit3, Check } from 'lucide-react'

export default function PatientProfilePage() {
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [therapist, setTherapist] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ full_name: '', condition: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setForm({ full_name: profile.full_name || '', condition: profile.condition || '' })
    loadTherapist()
  }, [profile])

  async function loadTherapist() {
    const { data } = await supabase
      .from('patient_assignments')
      .select('assigned_to, profiles!patient_assignments_assigned_to_fkey(id, full_name, role)')
      .eq('patient_id', profile.id)
      .eq('relationship', 'therapist')
      .limit(1)
      .single()
    if (data?.profiles) setTherapist(data.profiles)
  }

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ full_name: form.full_name, condition: form.condition || null })
      .eq('id', profile.id)
    setSaving(false)
    setEditing(false)
    refreshProfile()
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Profile</h2>

      {/* Profile Card */}
      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center text-primary text-2xl font-bold">
            {profile?.full_name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="space-y-2">
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Full name"
                />
                <Input
                  value={form.condition}
                  onChange={(e) => setForm({ ...form, condition: e.target.value })}
                  placeholder="Condition / diagnosis"
                />
              </div>
            ) : (
              <>
                <p className="text-lg font-bold text-text-primary">{profile?.full_name}</p>
                {profile?.condition && (
                  <p className="text-sm text-text-secondary">{profile.condition}</p>
                )}
                {!profile?.condition && (
                  <p className="text-sm text-text-muted italic">No condition set</p>
                )}
              </>
            )}
          </div>
          {editing ? (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Check size={14} /> {saving ? 'Saving...' : 'Save'}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Edit3 size={14} /> Edit
            </Button>
          )}
        </div>

        {therapist && (
          <div className="border-t border-border-light pt-4">
            <p className="text-xs font-semibold text-text-muted mb-1">Assigned Therapist</p>
            <p className="text-sm font-bold text-text-primary">{therapist.full_name}</p>
          </div>
        )}
      </Card>

      {/* Message Therapist */}
      {therapist && (
        <button
          onClick={() => navigate(`/patient/messages/${therapist.id}`)}
          className="w-full flex items-center gap-3 p-4 bg-surface-card rounded-2xl border border-border-light hover:bg-surface-alt transition-colors cursor-pointer"
        >
          <div className="p-2.5 rounded-xl bg-primary-container text-primary">
            <MessageSquare size={18} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">Message your Therapist</p>
            <p className="text-xs text-text-muted">Send a direct message</p>
          </div>
        </button>
      )}

      {/* Sign Out */}
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
