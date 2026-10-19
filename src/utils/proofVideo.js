import { supabase } from '../lib/supabase'

// Same cap as the proof-video Edge Function; a 60 s clip at the recorder's
// bitrate is about 10 MB.
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024

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
 * Uploads a recorded proof video straight to R2 through a signed link and
 * records it on the task. Returns the task's new proof_video value.
 * onProgress receives a fraction from 0 to 1.
 */
export async function uploadProofVideo(taskId, blob, duration, onProgress) {
  const contentType = uploadType(blob)
  const { url, key } = await callProofVideo({
    action: 'upload',
    task_id: taskId,
    size: blob.size,
    content_type: contentType,
  })

  // XHR rather than fetch, because fetch can't report upload progress
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Video upload failed (${xhr.status})`)))
    xhr.onerror = () => reject(new Error('Video upload failed. Please check your connection.'))
    xhr.send(blob)
  })

  const { proof_video } = await callProofVideo({ action: 'confirm', task_id: taskId, key, duration })
  return proof_video
}

/** { url } to play the task's video, or { expired: true } once it's been deleted. */
export function getProofVideoUrl(taskId) {
  return callProofVideo({ action: 'view', task_id: taskId })
}
