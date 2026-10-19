import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { Linkify } from '../../utils/linkify'
import { compressImage } from '../../utils/imageCompress'
import { toDateStr } from '../../utils/streak'
import { formatExpected } from '../../utils/time'
import ProofPhotos from '../../components/ProofPhotos'
import ProofVideo from '../../components/ProofVideo'
import VideoRecorder from '../../components/VideoRecorder'
import { uploadProofVideo } from '../../utils/proofVideo'
import { getProofPaths } from '../../utils/proofs'
import { isScheduled, getResourceLinks } from '../../utils/tasks'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { ArrowLeft, ArrowRight, Camera, Upload, X, CheckSquare, Clock, Lock, Pencil, ImagePlus, Video } from 'lucide-react'

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

const MAX_PHOTOS = 3

function isImage(file) {
  // Some phones report an empty type for HEIC photos picked from the library
  return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)
}

export default function TaskDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { showToast } = useNotifications()
  const navigate = useNavigate()

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  // 'proof' = description + photos, 'feedback' = mood + comments
  const [step, setStep] = useState('proof')
  // Editing photos of an already completed task
  const [editing, setEditing] = useState(false)
  const [keptPaths, setKeptPaths] = useState([])

  // Feedback state
  const [selectedMood, setSelectedMood] = useState(null)
  const [feedbackNote, setFeedbackNote] = useState('')

  // New photos picked on this visit: [{ file, preview }]
  const [newPhotos, setNewPhotos] = useState([])
  const fileInputRef = useRef(null)

  // Proof can be photos or a video recorded in the app
  const [proofMode, setProofMode] = useState('photo')
  // Video recorded on this visit: { blob, duration, preview }
  const [newVideo, setNewVideo] = useState(null)
  const [videoProgress, setVideoProgress] = useState(null)

  async function loadTask(cancelled = false) {
    const { data, error } = await supabase
      .from('task_assignments')
      .select('*')
      .eq('id', id)
      .single()
    if (cancelled) return
    if (error || isScheduled(data)) {
      if (error) console.error('Failed to load task:', error.message)
      setLoading(false)
      return
    }
    setTask(data)
    setLoading(false)

    // Auto-mark as in_progress if still pending (not for future days, which are view-only)
    if (data && data.status === 'pending' && data.assigned_date <= toDateStr(new Date())) {
      await supabase
        .from('task_assignments')
        .update({ status: 'in_progress' })
        .eq('id', id)
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    let cancelled = false
    setStep('proof')
    setEditing(false)
    setNewPhotos([])
    setNewVideo(null)
    setProofMode('photo')
    loadTask(cancelled)
    return () => { cancelled = true }
  }, [id])
  /* eslint-enable react-hooks/exhaustive-deps */

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/patient/schedule')
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!files.length) return

    const slots = MAX_PHOTOS - keptPaths.length - newPhotos.length
    if (files.some((f) => !isImage(f))) {
      showToast('Please choose image files only.', 'task_overdue')
    }
    const images = files.filter(isImage).slice(0, Math.max(0, slots))
    if (files.filter(isImage).length > slots) {
      showToast(`You can add up to ${MAX_PHOTOS} photos.`, 'task_overdue')
    }

    const added = await Promise.all(
      images.map(async (file) => {
        const compressed = await compressImage(file)
        return { file: compressed, preview: URL.createObjectURL(compressed) }
      })
    )
    setNewPhotos((prev) => [...prev, ...added])
  }

  function removeNewPhoto(index) {
    setNewPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function handleVideoRecorded({ blob, duration }) {
    setNewVideo({ blob, duration, preview: URL.createObjectURL(blob) })
  }

  function removeNewVideo() {
    if (newVideo) URL.revokeObjectURL(newVideo.preview)
    setNewVideo(null)
  }

  // Uploads the recorded video to R2 and saves it on the task.
  // Returns the task's proof_video, undefined if there was none, or null on failure.
  async function uploadVideo() {
    if (!newVideo) return undefined
    setVideoProgress(0)
    try {
      return await uploadProofVideo(id, newVideo.blob, newVideo.duration, {
        onProgress: setVideoProgress,
        // Remember the upload so tapping Submit again doesn't send the file twice
        uploadedKey: newVideo.key,
        onUploaded: (key) => setNewVideo((v) => (v ? { ...v, key } : v)),
      })
    } catch (err) {
      console.error('Video upload failed:', err)
      showToast(err.message || 'Failed to upload video. Please try again.', 'task_overdue')
      return null
    } finally {
      setVideoProgress(null)
    }
  }

  // Uploads new photos and returns all storage paths (kept + new), or null on failure
  async function uploadPhotos() {
    const paths = [...keptPaths]
    for (const [i, { file }] of newPhotos.entries()) {
      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `${profile.id}/${id}-${Date.now()}-${i}.${ext}`
      const { error } = await supabase.storage
        .from('task-proofs')
        .upload(filePath, file, { upsert: true })
      if (error) {
        showToast('Failed to upload proof photo. Please try again.', 'task_overdue')
        return null
      }
      paths.push(filePath)
    }
    return paths
  }

  async function handleComplete() {
    if (needsProof) return
    setSubmitting(true)

    if ((await uploadVideo()) === null) { setSubmitting(false); return }
    const paths = await uploadPhotos()
    if (!paths) { setSubmitting(false); return }

    const { error: taskErr } = await supabase
      .from('task_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        proof_url: paths[0] || null,
        proof_urls: paths.length ? paths : null,
      })
      .eq('id', id)

    if (taskErr) {
      showToast('Failed to complete task. Please try again.', 'task_overdue')
      setSubmitting(false)
      return
    }

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

  function startEditing(mode = 'photo') {
    setKeptPaths(getProofPaths(task))
    setNewPhotos([])
    removeNewVideo()
    setProofMode(mode)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setNewPhotos([])
    removeNewVideo()
  }

  async function saveEdit() {
    if (task.requires_proof && keptPaths.length + newPhotos.length === 0 && !newVideo && !task.proof_video) return
    setSubmitting(true)
    if ((await uploadVideo()) === null) { setSubmitting(false); return }
    const paths = await uploadPhotos()
    if (!paths) { setSubmitting(false); return }

    const { data, error } = await supabase
      .from('task_assignments')
      .update({ proof_url: paths[0] || null, proof_urls: paths.length ? paths : null })
      .eq('id', id)
      .select()
      .single()
    setSubmitting(false)
    if (error) {
      showToast('Failed to update your submission. Please try again.', 'task_overdue')
      return
    }
    setTask(data)
    setNewPhotos([])
    removeNewVideo()
    setEditing(false)
    showToast('Submission updated.', 'task_completed')
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
  const isFuture = task.assigned_date > toDateStr(new Date())
  const photoCount = keptPaths.length + newPhotos.length
  const needsProof = task.requires_proof && newPhotos.length === 0 && !newVideo
  const hasSubmittedProof = getProofPaths(task).length > 0 || !!task.proof_video
  const scheduledDate = new Date(task.assigned_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })

  const photoPicker = (
    <div className="space-y-3">
      {(keptPaths.length > 0 || newPhotos.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {editing && keptPaths.map((path) => (
            <div key={path} className="relative">
              <ProofPhotos task={{ proof_urls: [path] }} title="Current" />
              <button
                onClick={() => setKeptPaths((prev) => prev.filter((p) => p !== path))}
                aria-label="Remove photo"
                className="absolute top-7 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {newPhotos.map((p, i) => (
            <div key={p.preview} className="relative">
              <img src={p.preview} alt={`Proof ${i + 1}`} className="w-full h-40 rounded-xl object-cover" />
              <button
                onClick={() => removeNewPhoto(i)}
                aria-label="Remove photo"
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* No `capture` attribute, so phones offer both the camera and the photo library */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        aria-label="Upload proof photos"
        onChange={handleFileSelect}
        className="hidden"
      />
      {photoCount < MAX_PHOTOS && (
        photoCount === 0 ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <div className="p-3 rounded-full bg-primary-container">
              <Camera size={24} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-text-primary">Take or upload a photo</p>
              <p className="text-xs text-text-muted mt-1">Use your camera or choose from your photo library (up to {MAX_PHOTOS})</p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-surface-alt transition-colors cursor-pointer text-sm font-semibold text-text-secondary"
          >
            <ImagePlus size={16} /> Add another photo ({photoCount}/{MAX_PHOTOS})
          </button>
        )
      )}
    </div>
  )

  const videoPicker = newVideo ? (
    <div className="space-y-1">
      <div className="relative">
        <video src={newVideo.preview} controls playsInline className="w-full max-h-80 rounded-xl bg-black" />
        <button
          onClick={removeNewVideo}
          aria-label="Remove video"
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-text-muted">
        {newVideo.duration}s · {(newVideo.blob.size / 1024 / 1024).toFixed(1)} MB. Tap X to record again.
      </p>
    </div>
  ) : (
    <VideoRecorder onRecorded={handleVideoRecorded} />
  )

  const proofTabs = [
    { key: 'photo', icon: <Camera size={16} />, label: photoCount ? `Photo (${photoCount})` : 'Photo' },
    { key: 'video', icon: <Video size={16} />, label: newVideo ? 'Video ✓' : 'Video' },
  ]

  const proofPicker = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-alt" role="tablist">
        {proofTabs.map(({ key, icon, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={proofMode === key}
            onClick={() => setProofMode(key)}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              proofMode === key ? 'bg-surface-card text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
      {proofMode === 'photo' ? photoPicker : videoPicker}
    </div>
  )

  const submitLabel = videoProgress !== null
    ? `Uploading video ${Math.round(videoProgress * 100)}%`
    : 'Submitting...'

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-extrabold text-text-primary">{task.title}</h2>

      {/* Scheduled date & time */}
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Clock size={16} className="text-primary" />
        <span>
          {scheduledDate}{task.assigned_time ? ` · ${formatExpected(task.assigned_time)}` : ''}
        </span>
      </div>

      {/* Step 2 replaces the task info with the feedback questions */}
      {step === 'proof' && (
        <>
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

          {getResourceLinks(task).length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Resources
              </p>
              <ul className="space-y-2 text-sm text-text-secondary leading-relaxed break-words">
                {getResourceLinks(task).map((link, i) => (
                  <li key={i}><Linkify text={link} /></li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Future task: view only */}
      {isFuture && !isCompleted && (
        <Card className="!bg-surface-alt">
          <div className="flex items-center gap-3">
            <Lock size={18} className="text-text-muted shrink-0" />
            <p className="text-sm text-text-secondary">
              This task opens on {scheduledDate}. You can view it now and start it on that day.
            </p>
          </div>
        </Card>
      )}

      {/* Step 1: proof upload */}
      {!isFuture && !isCompleted && step === 'proof' && task.requires_proof && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={16} className="text-amber-600" />
            <p className="text-sm font-bold text-amber-700">Photo or video proof required to complete</p>
          </div>
          {proofPicker}
        </Card>
      )}

      {/* Step 2: feedback */}
      {!isFuture && !isCompleted && step === 'feedback' && (
        <>
          <Card>
            <p className="text-sm font-bold text-text-primary mb-4">
              After completing the task, how did the <strong className="font-extrabold underline">patient</strong> feel about the task?
            </p>
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
            <p className="text-sm font-bold text-text-primary mb-3">
              Do you or the patient have any comments after the task?
            </p>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-border text-sm bg-surface-alt text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-surface-card resize-none"
              rows={3}
              placeholder="Write anything you'd like to share..."
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              maxLength={1000}
            />
          </Card>
        </>
      )}

      {/* Completed: show / edit submission */}
      {isCompleted && !editing && hasSubmittedProof && (
        <Card>
          <div className="space-y-4">
            <ProofPhotos task={task} title="Proof Submitted" />
            <ProofVideo task={task} title="Video Submitted" />
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => startEditing(task.proof_video && !getProofPaths(task).length ? 'video' : 'photo')}
          >
            <Pencil size={14} /> Edit submission
          </Button>
        </Card>
      )}
      {isCompleted && !editing && !hasSubmittedProof && task.requires_proof && (
        <Card>
          <p className="text-sm text-text-muted mb-3">No proof on this task.</p>
          <Button variant="secondary" size="sm" onClick={() => startEditing()}>
            <ImagePlus size={14} /> Add photo or video
          </Button>
        </Card>
      )}
      {isCompleted && editing && (
        <Card>
          <p className="text-sm font-bold text-text-primary mb-1">Edit submission</p>
          <p className="text-xs text-text-muted mb-4">
            Replace or add photos, or record a new video, if your therapist asked for a clearer one.
          </p>
          {task.proof_video && !newVideo && proofMode === 'video' && (
            <div className="mb-3">
              <ProofVideo task={task} title="Current video" />
              <p className="text-xs text-text-muted mt-1">Recording a new video replaces this one.</p>
            </div>
          )}
          {proofPicker}
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" onClick={cancelEditing} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveEdit}
              disabled={submitting || (task.requires_proof && photoCount === 0 && !newVideo && !task.proof_video)}
            >
              {submitting ? (videoProgress !== null ? submitLabel : 'Saving...') : 'Save changes'}
            </Button>
          </div>
        </Card>
      )}

      {/* Bottom Buttons */}
      <div className="flex items-center justify-between pt-4 pb-8">
        {step === 'feedback' && !isCompleted ? (
          <Button variant="ghost" onClick={() => setStep('proof')}>
            <ArrowLeft size={16} /> Back
          </Button>
        ) : (
          <Button variant="ghost" onClick={goBack}>
            <ArrowLeft size={16} /> Back
          </Button>
        )}

        {!isCompleted && !isFuture && step === 'proof' && (
          <div className="flex flex-col items-end gap-1">
            <Button onClick={() => setStep('feedback')} disabled={needsProof}>
              Next <ArrowRight size={16} />
            </Button>
            {needsProof && (
              <p className="text-xs text-amber-600 font-medium">Upload proof first</p>
            )}
          </div>
        )}

        {!isCompleted && !isFuture && step === 'feedback' && (
          <Button onClick={handleComplete} disabled={submitting}>
            {submitting ? (
              <><Upload size={16} className="animate-pulse" /> {submitLabel}</>
            ) : (
              'Submit'
            )}
          </Button>
        )}

        {isCompleted && (
          <span className="text-sm font-semibold text-success">Completed</span>
        )}
      </div>
    </div>
  )
}
