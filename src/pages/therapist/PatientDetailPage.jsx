import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { calculateStreak, calculateConsistency, toDateStr, getRange, firstTaskDate, dailyCompletion } from '../../utils/streak'
import { createTasksForDates, joinLinks } from '../../utils/assignTask'
import PeriodToggle from '../../components/PeriodToggle'
import CompletionChart from '../../components/therapist/CompletionChart'
import { LinkListField, DateListField } from '../../components/therapist/TaskFields'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ReadOnlyCalendar from '../../components/therapist/ReadOnlyCalendar'
import PatientMoodChart from '../../components/therapist/PatientMoodChart'
import PatientFeedbackList from '../../components/therapist/PatientFeedbackList'
import PublishTimeField from '../../components/therapist/PublishTimeField'
import { formatPublishAt } from '../../utils/tasks'
import {
  ArrowLeft, Flame, Target, CheckCircle, Calendar, ClipboardList, MessageSquare, Send,
} from 'lucide-react'

function emptyAssignForm() {
  return {
    title: '',
    description: '',
    dates: [toDateStr(new Date())],
    assigned_time: '09:00',
    links: [''],
    requires_proof: false,
    publish_at: '',
  }
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
  const [assignForm, setAssignForm] = useState(emptyAssignForm)
  const [period, setPeriod] = useState('week')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)

  async function loadAll(cancelled = false) {
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
        .order('assigned_date', { ascending: false }),
      supabase
        .from('task_feedback')
        .select('mood, created_at')
        .eq('patient_id', patientId),
      supabase
        .from('task_feedback')
        .select('id, mood, note, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('therapist_remarks')
        .select('date, content')
        .eq('patient_id', patientId)
        .eq('therapist_id', profile.id)
        .order('date', { ascending: false })
        .limit(20),
    ])

    if (cancelled) return
    setPatient(patientRes.data)
    setAllTasks(tasksRes.data || [])
    setFeedback(feedbackRes.data || [])
    setFeedbackNotes(notesRes.data || [])
    setRemarks(remarksRes.data || [])
    setLoading(false)
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!profile || !patientId) return
    let cancelled = false
    loadAll(cancelled)
    return () => { cancelled = true }
  }, [profile, patientId])
  /* eslint-enable react-hooks/exhaustive-deps */

  function openAssignModal() {
    setAssignForm(emptyAssignForm())
    setAssignError('')
    setShowAssign(true)
  }

  async function handleAssign(e) {
    e.preventDefault()
    if (!assignForm.title || !assignForm.dates.length || !assignForm.assigned_time) return
    let publishAt = null
    if (assignForm.publish_at) {
      const at = new Date(assignForm.publish_at)
      if (at <= new Date()) { setAssignError('The post time must be in the future.'); return }
      if (at > new Date(`${assignForm.dates[0]}T${assignForm.assigned_time}:00`)) {
        setAssignError("The post time must be before the task's scheduled date and time.")
        return
      }
      publishAt = at.toISOString()
    }
    setAssignError('')
    setAssigning(true)

    const { error: err } = await createTasksForDates({
      dates: assignForm.dates,
      publishAt,
      fields: {
        patient_id: patientId,
        therapist_id: profile.id,
        title: assignForm.title,
        description: assignForm.description || null,
        assigned_time: assignForm.assigned_time,
        resource_url: joinLinks(assignForm.links),
        requires_proof: assignForm.requires_proof,
      },
    })

    setAssigning(false)
    if (err) { setAssignError('Failed to assign task.'); return }
    setShowAssign(false)
    setCalendarRefreshKey((k) => k + 1)
    loadAll()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  // Consistency covers the whole course of therapy; counts cover this week
  const consistency = calculateConsistency(allTasks).percent
  const week = calculateConsistency(allTasks, getRange('week'))
  const streak = calculateStreak(allTasks)

  // Chart period (Week / Month / Overall, with ‹ › for earlier periods)
  const range = getRange(period, periodOffset, firstTaskDate(allTasks))
  const completionDays = dailyCompletion(allTasks, range)
  const feedbackInRange = feedback.filter((f) => {
    const d = toDateStr(new Date(f.created_at))
    return d >= range.from && d <= range.to
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button
          onClick={() => navigate('/therapist/patients')}
          aria-label="Back to patients"
          className="p-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer text-text-secondary"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight truncate">
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
        <ReadOnlyCalendar
          patientId={patientId}
          therapistId={profile.id}
          refreshKey={calendarRefreshKey}
          onRemarkSaved={() => loadAll()}
        />
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
                <p className="text-[10px] font-medium text-text-muted">Consistency (overall)</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary-container">
                <ClipboardList size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-text-primary font-heading">{week.total}</p>
                <p className="text-[10px] font-medium text-text-muted">Assigned (this week)</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-secondary-container">
                <CheckCircle size={18} className="text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-text-primary font-heading">{week.completed}</p>
                <p className="text-[10px] font-medium text-text-muted">Completed (this week){week.missed > 0 ? ` · ${week.missed} missed` : ''}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="mb-4 overflow-x-auto">
          <PeriodToggle
            period={period}
            onPeriodChange={setPeriod}
            offset={periodOffset}
            onOffsetChange={setPeriodOffset}
            label={range.label}
          />
        </div>
        <Card>
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">
            Daily Completion % · {range.label}
          </p>
          <CompletionChart days={completionDays} period={period} height={200} />
        </Card>
      </div>

      {/* Section 3 — Mood Summary */}
      <div>
        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">
          Mood Summary
        </h3>
        <Card>
          <PatientMoodChart feedback={feedbackInRange} subtitle={`· ${range.label}`} />
        </Card>
        {feedbackNotes.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">
              Recent Feedback
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
                No remarks yet. Select a day on the calendar above to write one.
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
        title={`New Task for ${patient?.full_name}`}
      >
        <form onSubmit={handleAssign} className="space-y-4">
          {assignError && (
            <div className="p-3 rounded-xl bg-danger-bg text-danger text-sm font-medium">{assignError}</div>
          )}
          <Input
            label="Title"
            placeholder="e.g. Practice vowel sounds for 10 minutes"
            value={assignForm.title}
            onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
            required
          />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-text-secondary">Description</label>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
              rows={3}
              placeholder="Describe the task..."
              value={assignForm.description}
              onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })}
              maxLength={2000}
            />
          </div>
          <DateListField dates={assignForm.dates} onChange={(dates) => setAssignForm({ ...assignForm, dates })} />
          <Input
            label="Expected completion time"
            type="time"
            value={assignForm.assigned_time}
            onChange={(e) => setAssignForm({ ...assignForm, assigned_time: e.target.value })}
            required
          />
          <LinkListField links={assignForm.links} onChange={(links) => setAssignForm({ ...assignForm, links })} />
          <PublishTimeField
            value={assignForm.publish_at}
            onChange={(v) => setAssignForm({ ...assignForm, publish_at: v })}
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={assignForm.requires_proof}
              onChange={(e) => setAssignForm({ ...assignForm, requires_proof: e.target.checked })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
            />
            <span className="text-sm font-semibold text-text-secondary">
              Require proof of completion
            </span>
          </label>
          <Button type="submit" disabled={assigning || !assignForm.title || !assignForm.dates.length} className="w-full">
            {assigning
              ? 'Saving...'
              : assignForm.publish_at
                ? `Schedule for ${formatPublishAt(new Date(assignForm.publish_at))}`
                : assignForm.dates.length > 1 ? `Assign ${assignForm.dates.length} Tasks` : 'Assign Task'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
