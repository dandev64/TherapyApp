import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { calculateStreak, toDateStr } from '../../utils/streak'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ReadOnlyCalendar from '../../components/therapist/ReadOnlyCalendar'
import PatientMoodChart from '../../components/therapist/PatientMoodChart'
import PatientFeedbackList from '../../components/therapist/PatientFeedbackList'
import {
  ArrowLeft, Flame, Target, CheckCircle, Calendar, ClipboardList, MessageSquare, Send,
} from 'lucide-react'

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
  const [assignForm, setAssignForm] = useState({
    title: '',
    description: '',
    assigned_date: new Date().toISOString().split('T')[0],
    assigned_time: '09:00',
    resource_url: '',
    requires_proof: false,
  })
  const [assigning, setAssigning] = useState(false)

  async function loadAll(cancelled = false) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString()
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0]

    const [patientRes, tasksRes, feedbackRes, notesRes, remarksRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, condition')
        .eq('id', patientId)
        .single(),
      supabase
        .from('task_assignments')
        .select('assigned_date, status')
        .eq('patient_id', patientId)
        .eq('therapist_id', profile.id)
        .gte('assigned_date', ninetyDaysAgoStr)
        .order('assigned_date', { ascending: false }),
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
    setAssignForm({
      title: '',
      description: '',
      assigned_date: new Date().toISOString().split('T')[0],
      assigned_time: '09:00',
      resource_url: '',
      requires_proof: false,
    })
    setShowAssign(true)
  }

  async function handleAssign(e) {
    e.preventDefault()
    if (!assignForm.title || !assignForm.assigned_date || !assignForm.assigned_time) return
    setAssigning(true)

    const { error: err } = await supabase.from('task_assignments').insert({
      patient_id: patientId,
      therapist_id: profile.id,
      title: assignForm.title,
      description: assignForm.description || null,
      assigned_date: assignForm.assigned_date,
      assigned_time: assignForm.assigned_time,
      resource_url: assignForm.resource_url || null,
      requires_proof: assignForm.requires_proof,
    })

    if (err) { setAssigning(false); return }
    setAssigning(false)
    setShowAssign(false)
    loadAll()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  // Stats
  const totalCompleted = allTasks.filter((t) => t.status === 'completed').length
  const totalAssigned = allTasks.length
  const consistency = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0
  const streak = calculateStreak(allTasks)

  // Daily completion % for last 14 days
  const dailyData = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = toDateStr(d)
    const dayTasks = allTasks.filter((t) => t.assigned_date === dateStr)
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
          aria-label="Back to patients"
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
        title={`New Task for ${patient?.full_name}`}
      >
        <form onSubmit={handleAssign} className="space-y-4">
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
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={assignForm.assigned_date}
              onChange={(e) => setAssignForm({ ...assignForm, assigned_date: e.target.value })}
              required
            />
            <Input
              label="Time"
              type="time"
              value={assignForm.assigned_time}
              onChange={(e) => setAssignForm({ ...assignForm, assigned_time: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-text-secondary">Resources (guides, video links, or instructions)</label>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
              rows={2}
              placeholder="e.g. https://youtube.com/watch?v=... or describe the resource"
              value={assignForm.resource_url}
              onChange={(e) => setAssignForm({ ...assignForm, resource_url: e.target.value })}
            />
          </div>
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
          <Button type="submit" disabled={assigning || !assignForm.title} className="w-full">
            {assigning ? 'Assigning...' : 'Assign Task'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
