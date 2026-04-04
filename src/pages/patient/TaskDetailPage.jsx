import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Linkify } from '../../utils/linkify'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Home, ArrowLeft, Camera, Upload, X, CheckSquare, Clock } from 'lucide-react'

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
  const [submitting, setSubmitting] = useState(false)

  // Feedback state
  const [selectedMood, setSelectedMood] = useState(null)
  const [feedbackNote, setFeedbackNote] = useState('')

  // Proof upload state
  const [proofFile, setProofFile] = useState(null)
  const [proofPreview, setProofPreview] = useState(null)
  const fileInputRef = useRef(null)

  async function loadTask(cancelled = false) {
    const { data, error } = await supabase
      .from('task_assignments')
      .select('*')
      .eq('id', id)
      .single()
    if (cancelled) return
    if (error) {
      console.error('Failed to load task:', error.message)
      setLoading(false)
      return
    }
    setTask(data)
    setLoading(false)

    // Auto-mark as in_progress if still pending
    if (data && data.status === 'pending') {
      await supabase
        .from('task_assignments')
        .update({ status: 'in_progress' })
        .eq('id', id)
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    let cancelled = false
    loadTask(cancelled)
    return () => { cancelled = true }
  }, [id])
  /* eslint-enable react-hooks/exhaustive-deps */

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert('Please upload an image file (JPEG, PNG, or WebP).')
      return
    }
    setProofFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setProofPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  function clearProof() {
    setProofFile(null)
    setProofPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleComplete() {
    if (task.requires_proof && !proofFile && !task.proof_url) return
    setSubmitting(true)

    let proofUrl = task.proof_url || null

    // Upload proof photo if provided
    if (proofFile) {
      const ext = proofFile.name.split('.').pop()
      const filePath = `${profile.id}/${id}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('task-proofs')
        .upload(filePath, proofFile, { upsert: true })

      if (uploadErr) {
        alert('Failed to upload proof photo. Please try again.')
        setSubmitting(false)
        return
      }

      const { data: urlData } = supabase.storage
        .from('task-proofs')
        .getPublicUrl(filePath)

      proofUrl = urlData.publicUrl
    }

    // Mark task as completed
    const { error: taskErr } = await supabase
      .from('task_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        proof_url: proofUrl,
      })
      .eq('id', id)

    if (taskErr) {
      alert('Failed to complete task. Please try again.')
      setSubmitting(false)
      return
    }

    // Save feedback if mood was selected
    if (selectedMood) {
      const { error: fbErr } = await supabase.from('task_feedback').insert({
        task_assignment_id: id,
        patient_id: profile.id,
        mood: selectedMood,
        note: feedbackNote.trim() || null,
      })
      if (fbErr) console.error('Failed to save feedback:', fbErr)
    }

    setSubmitting(false)
    navigate('/patient/schedule')
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

  const isCompleted = task.status === 'completed'
  const needsProof = task.requires_proof && !proofFile && !task.proof_url

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary cursor-pointer">
        <ArrowLeft size={16} /> Back
      </button>

      <h2 className="text-2xl font-extrabold text-text-primary">{task.title}</h2>

      {/* Scheduled Time */}
      {task.assigned_time && (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Clock size={16} className="text-primary" />
          <span>
            Scheduled for{' '}
            {new Date(`2000-01-01T${task.assigned_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Description */}
      <Card>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
          Description
        </p>
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

      {/* Proof of Completion Upload */}
      {task.requires_proof && !isCompleted && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={16} className="text-amber-600" />
            <p className="text-sm font-bold text-amber-700">
              Photo proof required to complete
            </p>
          </div>

          {proofPreview ? (
            <div className="relative">
              <img
                src={proofPreview}
                alt="Proof preview"
                className="w-full rounded-xl object-cover max-h-64"
              />
              <button
                onClick={clearProof}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                capture="environment"
                aria-label="Upload proof photo"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-surface-alt transition-colors cursor-pointer"
              >
                <div className="p-3 rounded-full bg-primary-container">
                  <Camera size={24} className="text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-text-primary">Take or upload a photo</p>
                  <p className="text-xs text-text-muted mt-1">Tap to open camera or choose from gallery</p>
                </div>
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Show existing proof if already completed */}
      {task.proof_url && (
        <Card>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Proof Submitted
          </p>
          <img
            src={task.proof_url}
            alt="Proof of completion"
            className="w-full rounded-xl object-cover max-h-64"
          />
        </Card>
      )}

      {/* Mood & Feedback -- only show if not yet completed */}
      {!isCompleted && (
        <>
          <Card>
            <p className="text-sm font-bold text-text-primary mb-4">How do I feel about this task?</p>
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

          <Card>
            <p className="text-sm font-bold text-text-primary mb-3">Any comments?</p>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
              rows={3}
              placeholder="Write anything you'd like to share..."
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
            />
          </Card>
        </>
      )}

      {/* Bottom Buttons */}
      <div className="flex items-center justify-between pt-4 pb-8">
        <Button variant="ghost" onClick={() => navigate('/patient/schedule')}>
          <Home size={16} /> Home
        </Button>
        {!isCompleted && (
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={handleComplete}
              disabled={needsProof || submitting}
            >
              {submitting ? (
                <><Upload size={16} className="animate-pulse" /> Completing...</>
              ) : (
                'Complete'
              )}
            </Button>
            {needsProof && (
              <p className="text-xs text-amber-600 font-medium">Upload proof first</p>
            )}
          </div>
        )}
        {isCompleted && (
          <span className="text-sm font-semibold text-success">Already completed</span>
        )}
      </div>
    </div>
  )
}
