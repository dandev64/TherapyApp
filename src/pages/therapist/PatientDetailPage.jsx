import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { calculateStreak } from '../../utils/streak'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import ReadOnlyCalendar from '../../components/therapist/ReadOnlyCalendar'
import PatientMoodChart from '../../components/therapist/PatientMoodChart'
import PatientFeedbackList from '../../components/therapist/PatientFeedbackList'
import {
  ArrowLeft, Flame, Target, CheckCircle, Calendar, ClipboardList, MessageSquare, Send,
} from 'lucide-react'

const WEEKDAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
]

const timeSlots = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
]

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function PatientDetailPage() {
  const { patientId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [patient, setPatient] = useState(null)
  const [allTasks, setAllTasks] = useState([])
  const [feedback, setFeedback] = useState([])
  const [feedbackNotes, setFeedbackNotes] = useState([])
  const [remarks, setRemarks] = useState([])
  const [loading, setLoading] = useState(true)

  // Assign task state
  const [showAssign, setShowAssign] = useState(false)
  const [templates, setTemplates] = useState([])
  const [assignForm, setAssignForm] = useState({
    template_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    repeat_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    assigned_time_of_day: 'morning',
    details: '',
  })
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    if (!profile || !patientId) return
    loadAll()
  }, [profile, patientId])

  async function loadAll() {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()

    const [patientRes, tasksRes, feedbackRes, notesRes, remarksRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, condition')
        .eq('id', patientId)
        .single(),
      supabase
        .from('task_assignments')
        .select('assigned_date, status, is_rest_day')
        .eq('patient_id', patientId)
        .eq('therapist_id', profile.id)
        .order('assigned_date', { ascending: false })
        .limit(500),
      supabase
        .from('task_feedback')
        .select('mood, created_at')
        .eq('patient_id', patientId)
        .gte('created_at', thirtyDaysAgoStr),
      supabase
        .from('task_feedback')
        .select('id, mood, note, created_at')
        .eq('patient_id', patientId)
        .not('note', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('daily_remarks')
        .select('date, content')
        .eq('patient_id', patientId)
        .order('date', { ascending: false })
        .limit(20),
    ])

    setPatient(patientRes.data)
    setAllTasks(tasksRes.data || [])
    setFeedback(feedbackRes.data || [])
    setFeedbackNotes(notesRes.data || [])
    setRemarks(remarksRes.data || [])
    setLoading(false)
  }

  async function openAssignModal() {
    const { data } = await supabase
      .from('task_templates')
      .select('id, title, description, duration_minutes, therapy_type')
      .eq('therapist_id', profile.id)
      .order('created_at', { ascending: false })
    setTemplates(data || [])
    setAssignForm({
      template_id: data?.[0]?.id || '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      repeat_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      assigned_time_of_day: 'morning',
      details: '',
    })
    setShowAssign(true)
  }

  async function handleAssign(e) {
    e.preventDefault()
    if (!assignForm.template_id || !assignForm.start_date || !assignForm.end_date || assignForm.repeat_days.length === 0) return
    setAssigning(true)

    const rows = []
    const start = new Date(assignForm.start_date + 'T00:00:00')
    const end = new Date(assignForm.end_date + 'T00:00:00')
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const selectedTemplate = templates.find((t) => t.id === assignForm.template_id)

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayName = DAY_NAMES[d.getDay()]
      const dateStr = toDateStr(d)

      if (dayName === 'sunday') continue

      rows.push({
        template_id: assignForm.template_id,
        patient_id: patientId,
        therapist_id: profile.id,
        assigned_date: dateStr,
        assigned_time_of_day: assignForm.assigned_time_of_day,
        is_rest_day: !assignForm.repeat_days.includes(dayName),
        title: selectedTemplate?.title || null,
        description: selectedTemplate?.description || null,
        duration_minutes: selectedTemplate?.duration_minutes || null,
        therapy_type: selectedTemplate?.therapy_type || null,
        details: assignForm.details || null,
      })
    }

    if (rows.length > 0) {
      await supabase.from('task_assignments').insert(rows)
    }

    setAssigning(false)
    setShowAssign(false)
    loadAll()
  }

  function toggleDay(day) {
    setAssignForm((prev) => ({
      ...prev,
      repeat_days: prev.repeat_days.includes(day)
        ? prev.repeat_days.filter((d) => d !== day)
        : [...prev.repeat_days, day],
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  // Stats
  const realTasks = allTasks.filter((t) => !t.is_rest_day)
  const totalCompleted = realTasks.filter((t) => t.status === 'completed').length
  const totalAssigned = realTasks.length
  const consistency = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0
  const streak = calculateStreak(allTasks)

  // Daily completion % for last 14 days
  const dailyData = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = toDateStr(d)
    const dayTasks = realTasks.filter((t) => t.assigned_date === dateStr)
    const dayCompleted = dayTasks.filter((t) => t.status === 'completed').length
    const pct = dayTasks.length > 0 ? Math.round((dayCompleted / dayTasks.length) * 100) : null
    dailyData.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      pct: pct ?? 0,
      hasTasks: dayTasks.length > 0,
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/therapist/patients')}
          className="p-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer text-text-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">
            {patient?.full_name}
          </h2>
          {patient?.condition && (
            <p className="text-text-secondary mt-1">{patient.condition}</p>
          )}
        </div>
        <Button size="sm" onClick={openAssignModal}>
          <Send size={14} /> Assign Task
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/therapist/messages/${patientId}`)}
        >
          <MessageSquare size={14} /> Message
        </Button>
      </div>

      {/* Section 1 — Calendar */}
      <Card>
        <ReadOnlyCalendar patientId={patientId} therapistId={profile.id} />
      </Card>

      {/* Section 2 — Task Completion Stats */}
      <div>
        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">
          Task Completion Stats
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-warning-bg">
                <Flame size={18} className="text-warning" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-text-primary font-heading">{streak}</p>
                <p className="text-[10px] font-medium text-text-muted">Day Streak</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success-bg">
                <Target size={18} className="text-success" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-text-primary font-heading">{consistency}%</p>
                <p className="text-[10px] font-medium text-text-muted">Consistency</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary-container">
                <ClipboardList size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-text-primary font-heading">{totalAssigned}</p>
                <p className="text-[10px] font-medium text-text-muted">Assigned</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-secondary-container">
                <CheckCircle size={18} className="text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-text-primary font-heading">{totalCompleted}</p>
                <p className="text-[10px] font-medium text-text-muted">Completed</p>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">
            Daily Completion % (Last 14 Days)
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyData} barCategoryGap="15%">
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#757c7e' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#757c7e' }}
                axisLine={false}
                tickLine={false}
                width={30}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, 'Completion']}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {dailyData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={!entry.hasTasks ? '#eaeff0' : entry.pct >= 80 ? '#22c55e' : entry.pct >= 50 ? '#f59e0b' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Section 3 — Mood Summary */}
      <div>
        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">
          Mood Summary
        </h3>
        <Card>
          <PatientMoodChart feedback={feedback} />
        </Card>
        {feedbackNotes.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">
              Recent Feedback Notes
            </p>
            <PatientFeedbackList feedbackNotes={feedbackNotes} />
          </div>
        )}
      </div>

      {/* Section 4 — Therapy Session Remarks */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
            Session Remarks
          </h3>
        </div>
        <div className="space-y-3">
          {remarks.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted text-center py-6">
                No session remarks yet.
              </p>
            </Card>
          ) : (
            remarks.map((r) => (
              <Card key={r.date} className="!p-4">
                <p className="text-xs font-semibold text-text-muted mb-1">
                  {new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm text-text-primary">{r.content}</p>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Assign Modal */}
      <Modal
        isOpen={showAssign}
        onClose={() => setShowAssign(false)}
        title={`Assign Task to ${patient?.full_name}`}
      >
        <form onSubmit={handleAssign} className="space-y-4">
          {templates.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No templates yet. Create one in Task Templates first.
            </p>
          ) : (
            <>
              <Select
                label="Task Template"
                value={assignForm.template_id}
                onChange={(e) => setAssignForm({ ...assignForm, template_id: e.target.value })}
                options={templates.map((t) => ({ value: t.id, label: `${t.title} (${t.therapy_type})` }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-secondary">Details (optional)</label>
                <textarea
                  className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white resize-none"
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
                  <label className="text-sm font-semibold text-text-secondary">Repeat Days</label>
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
                            : 'bg-white text-text-muted border-dashed border-border hover:border-primary/40 hover:text-text-secondary'
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
                onChange={(e) => setAssignForm({ ...assignForm, assigned_time_of_day: e.target.value })}
                options={timeSlots}
              />
              <Button type="submit" disabled={assigning || !assignForm.end_date} className="w-full">
                {assigning ? 'Creating Schedule...' : 'Save Schedule'}
              </Button>
            </>
          )}
        </form>
      </Modal>
    </div>
  )
}
