import { useEffect, useRef, useState } from 'react'
import { Video, Upload, Circle, Square, SwitchCamera, X } from 'lucide-react'
import { MAX_VIDEO_BYTES, MAX_SECONDS, VIDEO_BITS, AUDIO_BITS, pickMimeType } from '../utils/proofVideo'
import { compressVideo, VideoError } from '../utils/videoCompress'

function formatSeconds(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function canRecordVideo() {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Gets a proof video: either recorded in the browser at a fixed bitrate and
 * capped at 60 seconds, or picked from the gallery and compressed to the
 * same quality (utils/videoCompress.js). Calls onRecorded({ blob, duration })
 * when a clip is ready.
 */
export default function VideoRecorder({ onRecorded }) {
  // 'idle' | 'starting' | 'preview' | 'recording' | 'processing'
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [facing, setFacing] = useState('environment')
  const [progress, setProgress] = useState(0)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const timerRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  // Bumped whenever the camera is stopped, so a getUserMedia call still waiting
  // (e.g. on the permission prompt) knows its stream is no longer wanted
  const cameraIdRef = useRef(0)

  function stopCamera() {
    cameraIdRef.current++
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => {
    abortRef.current?.abort()
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.ondataavailable = null
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    stopCamera()
  }, [])

  async function openCamera(facingMode = facing) {
    setError('')
    setPhase('starting')
    stopCamera()
    const cameraId = cameraIdRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode },
        audio: true,
      })
      // Closed, unmounted or reopened while waiting: release it, or the camera stays on
      if (cameraId !== cameraIdRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setPhase('preview')
    } catch (err) {
      if (cameraId !== cameraIdRef.current) return
      console.error('Camera error:', err)
      setPhase('idle')
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow camera and microphone access in your browser settings, or submit a photo instead.'
          : "Couldn't open the camera. Please submit a photo instead."
      )
    }
  }

  // The <video> element only exists once we leave 'idle', so attach the stream after render
  useEffect(() => {
    if (phase === 'preview' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [phase])

  function closeCamera() {
    stopCamera()
    setPhase('idle')
  }

  function flipCamera() {
    const next = facing === 'environment' ? 'user' : 'environment'
    setFacing(next)
    openCamera(next)
  }

  function startRecording() {
    const mimeType = pickMimeType()
    let recorder
    try {
      recorder = new MediaRecorder(streamRef.current, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: VIDEO_BITS,
        audioBitsPerSecond: AUDIO_BITS,
      })
    } catch (err) {
      console.error('MediaRecorder error:', err)
      setError("This browser can't record video. Please submit a photo instead.")
      closeCamera()
      return
    }

    const chunks = []
    const startedAt = Date.now()
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      const duration = Math.min(MAX_SECONDS, Math.round((Date.now() - startedAt) / 1000))
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })
      stopCamera()
      setPhase('idle')
      if (blob.size > MAX_VIDEO_BYTES) {
        setError('That video is too large to upload. Please record a shorter clip.')
        return
      }
      if (!blob.size) {
        setError('Nothing was recorded. Please try again.')
        return
      }
      onRecorded({ blob, duration })
    }

    recorderRef.current = recorder
    recorder.start(1000)
    setElapsed(0)
    setPhase('recording')
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000)
      setElapsed(Math.min(secs, MAX_SECONDS))
      if (secs >= MAX_SECONDS && recorder.state === 'recording') recorder.stop()
    }, 250)
  }

  function stopRecording() {
    clearInterval(timerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    if (!file.type.startsWith('video/') && !/\.(mov|mp4|m4v|webm|3gp)$/i.test(file.name)) {
      setError('Please choose a video file.')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setError('')
    setProgress(0)
    setPhase('processing')
    try {
      const result = await compressVideo(file, { onProgress: setProgress, signal: controller.signal })
      if (controller.signal.aborted) return
      setPhase('idle')
      onRecorded(result)
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Video processing failed:', err)
      setPhase('idle')
      setError(err instanceof VideoError ? err.message : "Couldn't prepare that video. Please try another one or record it in the app.")
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  function cancelProcessing() {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase('idle')
  }

  if (phase === 'processing') {
    const pct = Math.round(progress * 100)
    return (
      <div className="space-y-3 p-5 rounded-xl bg-surface-alt">
        <p className="text-sm font-semibold text-text-primary">Preparing video… {pct}%</p>
        <div className="h-2 rounded-full bg-border overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-text-muted">Making the video smaller for upload. Please keep this screen open.</p>
        <button
          onClick={cancelProcessing}
          className="text-sm font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (phase === 'idle') {
    const recordable = canRecordVideo()
    return (
      <div className="space-y-2">
        <div className={`grid gap-2 ${recordable ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {recordable && (
            <button
              onClick={() => openCamera()}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-surface-alt transition-colors cursor-pointer"
            >
              <div className="p-3 rounded-full bg-primary-container">
                <Video size={22} className="text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">Record a video</p>
                <p className="text-xs text-text-muted mt-1">With your camera</p>
              </div>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <div className="p-3 rounded-full bg-primary-container">
              <Upload size={22} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-text-primary">Upload a video</p>
              <p className="text-xs text-text-muted mt-1">From your gallery</p>
            </div>
          </button>
        </div>
        <p className="text-xs text-text-muted text-center">Videos can be up to 1 minute long.</p>
        {/* No `capture` attribute, so phones open the gallery */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          aria-label="Upload proof video"
          onChange={handleFileSelect}
          className="hidden"
        />
        {error && <p className="text-xs text-danger font-medium">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full max-h-80 object-contain ${facing === 'user' ? '-scale-x-100' : ''}`}
        />
        {phase === 'recording' && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {formatSeconds(elapsed)} / {formatSeconds(MAX_SECONDS)}
          </div>
        )}
        {phase === 'preview' && (
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              onClick={flipCamera}
              aria-label="Switch camera"
              className="p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
            >
              <SwitchCamera size={16} />
            </button>
            <button
              onClick={closeCamera}
              aria-label="Close camera"
              className="p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {phase === 'recording' ? (
        <button
          onClick={stopRecording}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-danger text-white text-sm font-bold cursor-pointer"
        >
          <Square size={14} fill="currentColor" /> Stop recording
        </button>
      ) : (
        <button
          onClick={startRecording}
          disabled={phase !== 'preview'}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-on-primary text-sm font-bold cursor-pointer disabled:opacity-50"
        >
          <Circle size={14} fill="currentColor" /> {phase === 'starting' ? 'Opening camera...' : 'Start recording'}
        </button>
      )}
      <p className="text-xs text-text-muted text-center">Recording stops automatically after 1 minute.</p>
    </div>
  )
}
