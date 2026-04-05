import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { Plus, CheckSquare, Trash2, MessageSquare, Clock, Camera } from 'lucide-react'

const MOOD_EMOJI = {
  excited: '🤩', happy: '😊', calm: '😌', scared: '😨',
  anxious: '😰', angry: '😠', tired: '😴', sad: '😢',
}

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
  const [selectedTask, setSelectedTask] = useState(null)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPatient, setFilterPatient] = useState('')

  function showSuccess(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

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
      .select('id, title, description, assigned_date, assigned_time, status, requires_proof, proof_url, resource_url, patient_id, profiles!task_assignments_patient_id_fkey(full_name)')
      .eq('therapist_id', profile.id)
      .order('assigned_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) { setError('Failed to load assignments.'); setPageLoading(false); return }
    setError(null)

    const taskIds = (data || []).filter((t) => t.status === 'completed').map((t) => t.id)
    let fbMap = {}
    if (taskIds.length > 0) {
      const { data: fbData } = await supabase
        .from('task_feedback')
        .select('task_assignment_id, mood, note')
        .in('task_assignment_id', taskIds)
      ;(fbData || []).forEach((fb) => {
        fbMap[fb.task_assignment_id] = fb
      })
    }

    setRecentAssignments((data || []).map((t) => ({ ...t, feedback: fbMap[t.id] || null })))
    setPageLoading(false)
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (profile) {
      loadPatients()
      loadRecentAssignments()
    }
  }, [profile])
  /* eslint-enable react-hooks/exhaustive-deps */

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
      resource_url: form.resource_url || null,
      requires_proof: form.requires_proof,
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

  const filteredAssignments = useMemo(() => {
    return recentAssignments.filter((a) => {
      if (filterDate && a.assigned_date !== filterDate) return false
      if (filterStatus && a.status !== filterStatus) return false
      if (filterPatient && a.patient_id !== filterPatient) return false
      return true
    })
  }, [recentAssignments, filterDate, filterStatus, filterPatient])

  const groupedByDate = useMemo(() => {
    const groups = {}
    filteredAssignments.forEach((a) => {
      if (!groups[a.assigned_date]) groups[a.assigned_date] = []
      groups[a.assigned_date].push(a)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredAssignments])

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
                    maxLength={2000}
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
                    maxLength={2000}
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

      <Card className="!p-0 overflow-hidden">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-surface-alt/50">
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={filterPatient}
            onChange={(e) => setFilterPatient(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm bg-surface-card text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
          >
            <option value="">All Patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt/30">
              <th className="text-left px-4 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider">Task</th>
              <th className="text-left px-4 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider hidden sm:table-cell">Patient</th>
              <th className="text-left px-4 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider hidden md:table-cell">Time</th>
              <th className="text-left px-4 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider hidden md:table-cell">Proof</th>
              <th className="text-left px-4 py-2.5 text-xs font-bold text-text-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredAssignments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                  {recentAssignments.length === 0 ? 'No assignments yet. Create one to get started.' : 'No assignments match the selected filters.'}
                </td>
              </tr>
            ) : (
              groupedByDate.map(([, tasks]) => (
                tasks.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-primary-container/10 transition-colors"
                    onClick={() => setSelectedTask(a)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-primary">{a.title}</p>
                      <p className="text-xs text-text-muted sm:hidden">{a.profiles?.full_name}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary hidden sm:table-cell">{a.profiles?.full_name}</td>
                    <td className="px-4 py-3 text-text-secondary hidden md:table-cell">{formatTime(a.assigned_time)}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {a.requires_proof && (
                        <Camera size={14} className={a.proof_url ? 'text-success' : 'text-text-muted'} title={a.proof_url ? 'Proof submitted' : 'Proof required'} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={a.status}>{a.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {a.status !== 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(a.id) }}
                          title="Delete assignment"
                        >
                          <Trash2 size={14} className="text-danger" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Task Detail Modal */}
      <Modal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.title}
      >
        {selectedTask && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge color={selectedTask.status}>{selectedTask.status.replace('_', ' ')}</Badge>
              {selectedTask.requires_proof && (
                <span className="flex items-center gap-1 text-xs text-primary font-medium">
                  <CheckSquare size={12} /> Proof required
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span>{selectedTask.profiles?.full_name}</span>
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {new Date(selectedTask.assigned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {selectedTask.assigned_time && ` at ${formatTime(selectedTask.assigned_time)}`}
              </span>
            </div>

            {selectedTask.description && (
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-text-primary">{selectedTask.description}</p>
              </div>
            )}

            {selectedTask.resource_url && (
              <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Resources</p>
                <p className="text-sm text-text-secondary break-all">{selectedTask.resource_url}</p>
              </div>
            )}

            {/* Patient completion data */}
            {selectedTask.status === 'completed' && (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Patient Response</p>

                {selectedTask.feedback ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{MOOD_EMOJI[selectedTask.feedback.mood] || ''}</span>
                      <span className="text-sm font-semibold text-text-primary capitalize">{selectedTask.feedback.mood}</span>
                    </div>
                    {selectedTask.feedback.note && (
                      <div className="flex items-start gap-2">
                        <MessageSquare size={14} className="text-text-muted mt-0.5 shrink-0" />
                        <p className="text-sm text-text-secondary">{selectedTask.feedback.note}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-text-muted italic">No feedback submitted</p>
                )}

                {selectedTask.proof_url && (
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Proof Photo</p>
                    <a href={selectedTask.proof_url} target="_blank" rel="noopener noreferrer">
                      <img src={selectedTask.proof_url} alt="Proof" className="w-full max-w-xs rounded-xl border border-border" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
