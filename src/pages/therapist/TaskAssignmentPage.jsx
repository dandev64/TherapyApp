import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Badge from '../../components/ui/Badge'
import { Plus, CheckSquare, Trash2 } from 'lucide-react'

export default function TaskAssignmentPage() {
  const { profile } = useAuth()
  const [patients, setPatients] = useCachedState('therapist-assign-patients', [])
  const [recentAssignments, setRecentAssignments] = useCachedState('therapist-recent-assignments', [])
  const [pageLoading, setPageLoading] = useState(() => !hasCache('therapist-recent-assignments'))
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    patient_id: '',
    title: '',
    description: '',
    assigned_date: new Date().toISOString().split('T')[0],
    assigned_time: '09:00',
    resource_url: '',
    requires_proof: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  function showSuccess(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  useEffect(() => {
    if (profile) {
      loadPatients()
      loadRecentAssignments()
    }
  }, [profile])

  async function loadPatients() {
    const { data } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')
    const pts = data?.map((a) => a.profiles) || []
    setPatients(pts)
    if (pts.length > 0 && !form.patient_id) {
      setForm((prev) => ({ ...prev, patient_id: pts[0].id }))
    }
  }

  async function loadRecentAssignments() {
    const { data, error: err } = await supabase
      .from('task_assignments')
      .select('id, title, assigned_date, assigned_time, status, requires_proof, patient_id, profiles!task_assignments_patient_id_fkey(full_name)')
      .eq('therapist_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (err) { setError('Failed to load assignments.'); setPageLoading(false); return }
    setError(null)
    setRecentAssignments(data || [])
    setPageLoading(false)
  }

  async function handleAssign(e) {
    e.preventDefault()
    if (!form.patient_id || !form.title || !form.assigned_date || !form.assigned_time) return
    setLoading(true)

    const { error: err } = await supabase.from('task_assignments').insert({
      patient_id: form.patient_id,
      therapist_id: profile.id,
      title: form.title,
      description: form.description || null,
      assigned_date: form.assigned_date,
      assigned_time: form.assigned_time,
      assigned_time_of_day: null,
      template_id: null,
      duration_minutes: null,
      therapy_type: null,
      resource_url: form.resource_url || null,
      requires_proof: form.requires_proof,
      is_rest_day: false,
      details: null,
    })

    setLoading(false)
    if (err) { setError('Failed to assign task.'); return }
    setForm({
      patient_id: form.patient_id,
      title: '',
      description: '',
      assigned_date: new Date().toISOString().split('T')[0],
      assigned_time: '09:00',
      resource_url: '',
      requires_proof: false,
    })
    setShowForm(false)
    showSuccess('Task assigned successfully.')
    loadRecentAssignments()
  }

  async function handleDelete(id) {
    const { error: err } = await supabase.from('task_assignments').delete().eq('id', id)
    if (err) { setError('Failed to delete assignment.'); return }
    loadRecentAssignments()
  }

  function formatTime(timeStr) {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':')
    const date = new Date(2000, 0, 1, parseInt(h), parseInt(m))
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium flex items-center justify-between">
          {error}
          <button onClick={() => { setError(null); loadRecentAssignments() }} className="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
          {successMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Task Assignment</h2>
          <p className="text-text-secondary mt-2">
            Create and assign tasks directly to patients
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> New Task
        </Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleAssign} className="space-y-4">
            {patients.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                You have no patients assigned. Add a patient first.
              </p>
            ) : (
              <>
                <Select
                  label="Patient"
                  value={form.patient_id}
                  onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
                  options={patients.map((p) => ({ value: p.id, label: p.full_name }))}
                />
                <Input
                  label="Title"
                  placeholder="e.g. Practice vowel sounds for 10 minutes"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-text-secondary">Description</label>
                  <textarea
                    className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
                    rows={3}
                    placeholder="Describe the task..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Date"
                    type="date"
                    value={form.assigned_date}
                    onChange={(e) => setForm({ ...form, assigned_date: e.target.value })}
                    required
                  />
                  <Input
                    label="Time"
                    type="time"
                    value={form.assigned_time}
                    onChange={(e) => setForm({ ...form, assigned_time: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-text-secondary">Resources (guides, video links, or instructions)</label>
                  <textarea
                    className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
                    rows={2}
                    placeholder="e.g. https://youtube.com/watch?v=... or describe the resource"
                    value={form.resource_url}
                    onChange={(e) => setForm({ ...form, resource_url: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requires_proof}
                    onChange={(e) => setForm({ ...form, requires_proof: e.target.checked })}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-text-secondary">
                    Require proof of completion
                  </span>
                </label>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Assigning...' : 'Assign Task'}
                </Button>
              </>
            )}
          </form>
        </Card>
      )}

      <div>
        <h3 className="text-lg font-bold text-text-primary mb-4">Recent Assignments</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {recentAssignments.length === 0 ? (
            <Card className="sm:col-span-2">
              <p className="text-sm text-text-muted text-center py-8">
                No assignments yet. Create one to get started.
              </p>
            </Card>
          ) : (
            recentAssignments.map((a) => (
              <Card key={a.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">{a.title}</h4>
                    <p className="text-xs text-text-secondary mt-1">
                      {a.profiles?.full_name}
                    </p>
                  </div>
                  <Badge color={a.status === 'completed' ? 'success' : a.status === 'in_progress' ? 'warning' : 'default'}>
                    {a.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">
                    {new Date(a.assigned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {a.assigned_time && ` at ${formatTime(a.assigned_time)}`}
                  </span>
                  <div className="flex items-center gap-1">
                    {a.requires_proof && (
                      <CheckSquare size={14} className="text-primary" title="Proof required" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(a.id)}
                      title="Delete assignment"
                    >
                      <Trash2 size={14} className="text-danger" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
