import { useEffect, useState } from 'react'
import { getProofVideoUrl } from '../utils/proofVideo'
import { RETENTION_DAYS, isVideoExpired } from '../utils/proofs'

/** Player for a task's proof video, which is kept for RETENTION_DAYS. */
export default function ProofVideo({ task, title = 'Proof Video' }) {
  const video = task?.proof_video
  const expired = video ? isVideoExpired(video) : false
  const [state, setState] = useState({ key: null, url: null, failed: false })

  useEffect(() => {
    if (!video || expired) return
    let cancelled = false
    getProofVideoUrl(task.id)
      .then((res) => {
        if (!cancelled) setState({ key: video.key, url: res.url || null, failed: !res.url })
      })
      .catch(() => {
        if (!cancelled) setState({ key: video.key, url: null, failed: true })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, video?.key, expired])

  if (!video) return null

  // Ignore a link fetched for a video that has since been replaced
  const current = state.key === video.key ? state : { url: null, failed: false }

  return (
    <div>
      <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">{title}</p>
      {expired ? (
        <p className="text-sm text-text-muted italic">
          Video expired. Videos are kept for {RETENTION_DAYS} days.
        </p>
      ) : current.failed ? (
        <p className="text-sm text-text-muted">Couldn't load the video. Please try again later.</p>
      ) : !current.url ? (
        <p className="text-sm text-text-muted">Loading proof video...</p>
      ) : (
        <video
          src={current.url}
          controls
          playsInline
          preload="metadata"
          className="w-full max-h-80 rounded-xl border border-border bg-black"
        />
      )}
    </div>
  )
}
