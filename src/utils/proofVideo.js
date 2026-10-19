import { supabase } from '../lib/supabase'

// Same cap as the proof-video Edge Function; a 60 s clip at the recorder's
// bitrate is about 10 MB.
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024
export const MAX_SECONDS = 60

// ~1.2 Mbps video + 64 kbps audio ≈ 9.5 MB per minute at 720p, which keeps
// ten days of videos for every patient inside R2's free 10 GB. Used both for
// recording in the app and for compressing uploaded videos.
export const VIDEO_BITS = 1_200_000
export const AUDIO_BITS = 64_000

// MP4 first: it plays everywhere, including on a therapist's iPhone
const MIME_TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

/** Best MediaRecorder format this browser supports, or '' for its default. */
export function pickMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

async function callProofVideo(body) {
  const { data, error } = await supabase.functions.invoke('proof-video', { body })
  if (error) {
    let message = error.message
    try {
      message = (await error.context.json()).error || message
    } catch {
      // Response body wasn't JSON; keep the generic message
    }
    throw new Error(message)
  }
  return data
}

// R2 only needs the container type; codec details stay inside the file
function uploadType(blob) {
  return blob.type.startsWith('video/mp4') ? 'video/mp4' : 'video/webm'
}

/**
 * Uploads a proof video straight to R2 through a signed link and records it
 * on the task. Returns the task's new proof_video value.
 * - onProgress receives a fraction from 0 to 1.
 * - onUploaded(key) fires once the file is in R2. Pass that key back as
 *   uploadedKey on a retry so only the confirm step is repeated, instead of
 *   uploading (and storing) the same video twice.
 */
export async function uploadProofVideo(taskId, blob, duration, { onProgress, uploadedKey, onUploaded } = {}) {
  let key = uploadedKey
  if (!key) {
    const contentType = uploadType(blob)
    const link = await callProofVideo({
      action: 'upload',
      task_id: taskId,
      size: blob.size,
      content_type: contentType,
    })

    // XHR rather than fetch, because fetch can't report upload progress
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', link.url)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total)
      }
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Video upload failed (${xhr.status})`)))
      xhr.onerror = () => reject(new Error('Video upload failed. Please check your connection.'))
      xhr.send(blob)
    })
    key = link.key
    onUploaded?.(key)
  }

  // Saving can briefly miss a file that just landed; one quiet retry first
  const confirm = () => callProofVideo({ action: 'confirm', task_id: taskId, key, duration })
  try {
    return (await confirm()).proof_video
  } catch {
    await new Promise((r) => setTimeout(r, 1500))
    return (await confirm()).proof_video
  }
}

/** { url } to play the task's video, or { expired: true } once it's been deleted. */
export function getProofVideoUrl(taskId) {
  return callProofVideo({ action: 'view', task_id: taskId })
}
