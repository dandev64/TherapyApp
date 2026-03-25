import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCachedState, hasCache } from '../../hooks/useCachedState'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { Plus, Clock, Trash2, Send } from 'lucide-react'

const therapyTypes = [
  { value: 'speech', label: 'Speech' },
  { value: 'occupational', label: 'Occupational' },
  { value: 'physical', label: 'Physical' },
]

const timeSlots = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
]

const WEEKDAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
]

const DAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

export default function TaskTemplatesPage() {
  const { profile } = useAuth()
  const [templates, setTemplates] = useCachedState('therapist-templates', [])
  const [pageLoading, setPageLoading] = useState(() => !hasCache('therapist-templates'))
  const [showCreate, setShowCreate] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [patients, setPatients] = useCachedState('therapist-tmpl-patients', [])
  const [form, setForm] = useState({
    title: '',
    description: '',
    duration_minutes: 15,
    therapy_type: 'speech',
  })
  const [assignForm, setAssignForm] = useState({
    patient_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    repeat_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    assigned_time_of_day: 'morning',
    details: '',
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
      loadTemplates()
      loadPatients()
    }
  }, [profile])

  async function loadTemplates() {
    const { data, error: err } = await supabase
      .from('task_templates')
      .select('*')
      .eq('therapist_id', profile.id)
      .order('created_at', { ascending: false })
    if (err) { setError('Failed to load templates.'); setPageLoading(false); return }
    setError(null)
    setTemplates(data || [])
    setPageLoading(false)
  }

  async function loadPatients() {
    const { data } = await supabase
      .from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name)')
      .eq('assigned_to', profile.id)
      .eq('relationship', 'therapist')
    setPatients(data?.map((a) => a.profiles) || [])
  }

  async function handleCreate(e) {
    e.preventDefault()
    setLoading(true)
    const { error: err } = await supabase.from('task_templates').insert({
      ...form,
      therapist_id: profile.id,
    })
    setLoading(false)
    if (err) { setError('Failed to create template.'); return }
    setForm({ title: '', description: '', duration_minutes: 15, therapy_type: 'speech' })
    setShowCreate(false)
    showSuccess('Template created successfully.')
    loadTemplates()
  }

  async function handleAssign(e) {
    e.preventDefault()
    if (!assignForm.start_date || !assignForm.end_date || assignForm.repeat_days.length === 0) return
    setLoading(true)

    const rows = []
    const start = new Date(assignForm.start_date + 'T00:00:00')
    const end = new Date(assignForm.end_date + 'T00:00:00')
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayName = DAY_NAMES[d.getDay()]
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      if (dayName === 'sunday') continue // Sunday is excluded

      if (assignForm.repeat_days.includes(dayName)) {
        rows.push({
          template_id: selectedTemplate.id,
          patient_id: assignForm.patient_id,
          therapist_id: profile.id,
          assigned_date: dateStr,
          assigned_time_of_day: assignForm.assigned_time_of_day,
          title: selectedTemplate.title,
          description: selectedTemplate.description,
          duration_minutes: selectedTemplate.duration_minutes,
          therapy_type: selectedTemplate.therapy_type,
          details: assignForm.details || null,
          is_rest_day: false,
        })
      } else {
        // Rest day for weekdays not in repeat_days
        rows.push({
          template_id: selectedTemplate.id,
          patient_id: assignForm.patient_id,
          therapist_id: profile.id,
          assigned_date: dateStr,
          assigned_time_of_day: assignForm.assigned_time_of_day,
          title: selectedTemplate.title,
          description: selectedTemplate.description,
          duration_minutes: selectedTemplate.duration_minutes,
          therapy_type: selectedTemplate.therapy_type,
          details: assignForm.details || null,
          is_rest_day: true,
        })
      }
    }

    if (rows.length > 0) {
      const { error: err } = await supabase.from('task_assignments').insert(rows)
      if (err) { setError('Failed to assign tasks.'); setLoading(false); return }
    }

    setLoading(false)
    setShowAssign(false)
    showSuccess('Tasks assigned successfully.')
  }

  async function handleDelete(id) {
    const { error: err } = await supabase.from('task_templates').delete().eq('id', id)
    if (err) { setError('Failed to delete template.'); return }
    loadTemplates()
  }

  function openAssign(template) {
    setSelectedTemplate(template)
    setAssignForm({
      patient_id: patients[0]?.id || '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      repeat_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      assigned_time_of_day: 'morning',
      details: '',
    })
    setShowAssign(true)
  }

  function toggleDay(day) {
    setAssignForm((prev) => ({
      ...prev,
      repeat_days: prev.repeat_days.includes(day)
        ? prev.repeat_days.filter((d) => d !== day)
        : [...prev.repeat_days, day],
    }))
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
          <button onClick={() => { setError(null); loadTemplates() }} className="text-red-500 hover:text-red-700 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
          {successMsg}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Task Templates</h2>
          <p className="text-text-secondary mt-2">
            Create reusable therapy tasks and assign them to patients
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Template
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {templates.length === 0 ? (
          <Card className="sm:col-span-2">
            <p className="text-sm text-text-muted text-center py-8">
              No templates yet. Create one to get started.
            </p>
          </Card>
        ) : (
          templates.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-text-primary">{t.title}</h4>
                  {t.description && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {t.description}
                    </p>
                  )}
                </div>
                <Badge color={t.therapy_type}>{t.therapy_type}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <Clock size={12} /> {t.duration_minutes} min
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openAssign(t)}
                    title="Assign to patient"
                  >
                    <Send size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(t.id)}
                    title="Delete template"
                  >
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Create Template Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Task Template"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Vowel Resonation Exercises"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-text-secondary">Description</label>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
              rows={3}
              placeholder="Describe the exercise..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Duration (minutes)"
              type="number"
              min={1}
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 1 })}
            />
            <Select
              label="Therapy Type"
              value={form.therapy_type}
              onChange={(e) => setForm({ ...form, therapy_type: e.target.value })}
              options={therapyTypes}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating...' : 'Create Template'}
          </Button>
        </form>
      </Modal>

      {/* Assign Task Modal */}
      <Modal
        isOpen={showAssign}
        onClose={() => setShowAssign(false)}
        title={`Assign: ${selectedTemplate?.title}`}
      >
        <form onSubmit={handleAssign} className="space-y-4">
          {patients.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              You have no patients assigned. Add a patient first.
            </p>
          ) : (
            <>
              <Select
                label="Patient"
                value={assignForm.patient_id}
                onChange={(e) => setAssignForm({ ...assignForm, patient_id: e.target.value })}
                options={patients.map((p) => ({ value: p.id, label: p.full_name }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-secondary">Details (optional)</label>
                <textarea
                  className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
                  rows={2}
                  placeholder="Additional instructions or links..."
                  value={assignForm.details}
                  onChange={(e) => setAssignForm({ ...assignForm, details: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  value={assignForm.start_date}
                  onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })}
                  required
                />
                <Input
                  label="End Date"
                  type="date"
                  value={assignForm.end_date}
                  onChange={(e) => setAssignForm({ ...assignForm, end_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-text-secondary">
                    Repeat Days
                  </label>
                  <span className="text-xs text-text-muted">
                    {assignForm.repeat_days.length} of {WEEKDAYS.length} selected
                  </span>
                </div>
                <div className="flex gap-2">
                  {WEEKDAYS.map(({ key, label }) => {
                    const selected = assignForm.repeat_days.includes(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDay(key)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-2 ${
                          selected
                            ? 'bg-primary text-on-primary border-primary shadow-sm'
                            : 'bg-surface-card text-text-muted border-dashed border-border hover:border-primary/40 hover:text-text-secondary'
                        }`}
                      >
                        {label}
                        <div className={`text-[10px] font-medium mt-0.5 ${selected ? 'text-on-primary/70' : 'text-text-muted/60'}`}>
                          {selected ? '✓ On' : 'Off'}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-text-muted mt-1.5">
                  Unselected days will be marked as rest days
                </p>
              </div>
              <Select
                label="Time of Day"
                value={assignForm.assigned_time_of_day}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, assigned_time_of_day: e.target.value })
                }
                options={timeSlots}
              />
              <Button type="submit" disabled={loading || !assignForm.end_date} className="w-full">
                {loading ? 'Creating Schedule...' : 'Save Schedule'}
              </Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  )
}
