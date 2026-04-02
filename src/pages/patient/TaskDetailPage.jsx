import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Linkify } from '../../utils/linkify'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Home, Timer, ArrowLeft } from 'lucide-react'

const MOODS = [
  { key: 'excited', emoji: '🤩', label: 'Excited' },
  { key: 'happy', emoji: '😊', label: 'Happy' },
  { key: 'calm', emoji: '😌', label: 'Calm' },
  { key: 'scared', emoji: '😨', label: 'Scared' },
  { key: 'anxious', emoji: '😰', label: 'Anxious' },
  { key: 'angry', emoji: '😠', label: 'Angry' },
  { key: 'tired', emoji: '😴', label: 'Tired' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
]

export default function TaskDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState('detail') // 'detail' | 'feedback'

  // Timer state
  const [seconds, setSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const intervalRef = useRef(null)

  // Feedback state
  const [selectedMood, setSelectedMood] = useState(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadTask()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [id])

  async function loadTask() {
    const { data, error } = await supabase
      .from('task_assignments')
      .select('*')
      .eq('id', id)
      .single()
    if (error) console.error('Failed to load task:', error.message)
    setTask(data)
    setLoading(false)
  }

  function toggleTimer() {
    if (timerRunning) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      setTimerRunning(false)
    } else {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      setTimerRunning(true)
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  async function handleDone() {
    // Mark task as completed
    const { error } = await supabase
      .from('task_assignments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('Failed to mark task as done. Please try again.'); return }

    // Stop timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      setTimerRunning(false)
    }

    setScreen('feedback')
  }

  async function handleSaveFeedback() {
    if (!selectedMood) return
    setSaving(true)
    const { error } = await supabase.from('task_feedback').insert({
      task_assignment_id: id,
      patient_id: profile.id,
      mood: selectedMood,
      note: feedbackNote.trim() || null,
    })
    setSaving(false)
    if (error) { alert('Failed to save feedback. Please try again.'); return }
    navigate('/patient/schedule')
  }

  function handleGoHome() {
    // If feedback has a mood selected, save it before leaving
    if (selectedMood) {
      handleSaveFeedback()
    } else {
      navigate('/patient/schedule')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Task not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/patient/schedule')}>
          Back to Schedule
        </Button>
      </div>
    )
  }

  // Screen 1: Task Detail
  if (screen === 'detail') {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary cursor-pointer">
          <ArrowLeft size={16} /> Back
        </button>

        <h2 className="text-2xl font-extrabold text-text-primary">{task.title}</h2>

        {/* Description Card */}
        <Card>
          <div className="text-sm text-text-secondary leading-relaxed">
            <Linkify text={task.description || 'No description provided.'} />
          </div>
        </Card>

        {task.details && (
          <Card>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Additional Instructions
            </p>
            <div className="text-sm text-text-secondary leading-relaxed">
              <Linkify text={task.details} />
            </div>
          </Card>
        )}

        {task.resource_url && (
          <Card>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Resources
            </p>
            <div className="text-sm text-text-secondary leading-relaxed">
              <Linkify text={task.resource_url} />
            </div>
          </Card>
        )}

        {task.requires_proof && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 font-medium">
            Your therapist has requested proof of completion for this task.
          </div>
        )}

        {/* Stopwatch */}
        <Card className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Timer size={20} className="text-primary" />
            <span className="text-xs font-bold text-outline uppercase tracking-wider">Stopwatch</span>
          </div>
          <p className="text-5xl font-extrabold text-text-primary font-heading tabular-nums">
            {formatTime(seconds)}
          </p>
          <button
            onClick={toggleTimer}
            className={`mt-4 px-6 py-2 rounded-full text-sm font-bold transition-colors cursor-pointer ${
              timerRunning
                ? 'bg-warning-bg text-warning hover:bg-warning/10'
                : 'bg-primary-container text-primary hover:bg-primary-container/70'
            }`}
          >
            {timerRunning ? 'Pause' : seconds > 0 ? 'Resume' : 'Start'}
          </button>
        </Card>

        {/* Bottom Buttons */}
        <div className="flex items-center justify-between pt-4">
          <Button variant="ghost" onClick={() => navigate('/patient/schedule')}>
            <Home size={16} /> Home
          </Button>
          {task.status !== 'completed' && (
            <Button onClick={handleDone}>Done!</Button>
          )}
          {task.status === 'completed' && (
            <span className="text-sm font-semibold text-success">Already completed</span>
          )}
        </div>
      </div>
    )
  }

  // Screen 2: Post-Task Feedback
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-extrabold text-text-primary">{task.title}</h2>
      <p className="text-sm text-text-muted">Great job completing this task!</p>

      {/* Mood Selection */}
      <Card>
        <p className="text-sm font-bold text-text-primary mb-4">How did I feel doing this task?</p>
        <div className="grid grid-cols-4 gap-3">
          {MOODS.map(({ key, emoji, label }) => (
            <button
              key={key}
              onClick={() => setSelectedMood(key)}
              className={`flex flex-col items-center gap-1 p-3 rounded-2xl transition-all cursor-pointer ${
                selectedMood === key
                  ? 'bg-primary-container ring-2 ring-primary scale-105'
                  : 'bg-surface-alt hover:bg-surface-container'
              }`}
            >
              <span className="text-2xl">{emoji}</span>
              <span className="text-[10px] font-semibold text-text-secondary">{label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Note */}
      <Card>
        <p className="text-sm font-bold text-text-primary mb-3">Is there anything I want to say?</p>
        <textarea
          className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
          rows={4}
          placeholder="Write anything you'd like to share..."
          value={feedbackNote}
          onChange={(e) => setFeedbackNote(e.target.value)}
        />
      </Card>

      {/* Bottom Buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={handleGoHome}>
          <Home size={16} /> Home
        </Button>
      </div>
    </div>
  )
}
