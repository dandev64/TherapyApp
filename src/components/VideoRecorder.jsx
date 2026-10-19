import { useEffect, useRef, useState } from 'react'
import { Video, Circle, Square, SwitchCamera, X } from 'lucide-react'
import { MAX_VIDEO_BYTES } from '../utils/proofVideo'

const MAX_SECONDS = 60
// ~1.2 Mbps video + 64 kbps audio ≈ 9.5 MB per minute at 720p, which keeps
// ten days of videos for every patient inside R2's free 10 GB
const VIDEO_BITS = 1_200_000
const AUDIO_BITS = 64_000

// MP4 first: it plays everywhere, including on a therapist's iPhone
const MIME_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

function pickMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

function formatSeconds(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function canRecordVideo() {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Records a proof video in the browser, at a fixed bitrate and capped at
 * 60 seconds. Calls onRecorded({ blob, duration }) when a clip is ready.
 * There is deliberately no gallery upload: proof is recorded live.
 */
export default function VideoRecorder({ onRecorded }) {
  // 'idle' | 'starting' | 'preview' | 'recording'
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [facing, setFacing] = useState('environment')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const timerRef = useRef(null)

  function stopCamera() {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => {
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setPhase('preview')
    } catch (err) {
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

  if (!canRecordVideo()) {
    return (
      <p className="text-sm text-text-muted p-4 rounded-xl bg-surface-alt">
        Video recording isn't supported on this browser. Please submit a photo instead.
      </p>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="space-y-2">
        <button
          onClick={() => openCamera()}
          className="w-full flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-surface-alt transition-colors cursor-pointer"
        >
          <div className="p-3 rounded-full bg-primary-container">
            <Video size={24} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">Record a video</p>
            <p className="text-xs text-text-muted mt-1">Up to 1 minute, recorded with your camera</p>
          </div>
        </button>
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
