/** Storage paths (or legacy full URLs) of a task's proof photos. */
export function getProofPaths(task) {
  if (task?.proof_urls?.length) return task.proof_urls
  return task?.proof_url ? [task.proof_url] : []
}

// Proof videos are deleted from Cloudflare R2 this many days after upload.
// Must match the bucket's lifecycle rule and R2_RETENTION_DAYS in the
// proof-video Edge Function.
export const RETENTION_DAYS = 10

/** True once a task's proof video is past the retention window. */
export function isVideoExpired(video) {
  if (!video?.uploaded_at) return true
  return Date.now() - new Date(video.uploaded_at).getTime() > RETENTION_DAYS * 24 * 60 * 60 * 1000
}
