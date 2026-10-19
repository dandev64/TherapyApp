import { MAX_VIDEO_BYTES, MAX_SECONDS, VIDEO_BITS, AUDIO_BITS, pickMimeType } from './proofVideo'

// Proof videos are stored at most 720p, the same as in-app recordings
const MAX_LONG_SIDE = 1280
const MAX_SHORT_SIDE = 720
// Phone clips trimmed to "1:00" can be a few frames over
const DURATION_TOLERANCE = 0.5

/** An error whose message is meant for the patient. */
export class VideoError extends Error {}

const UNREADABLE = "This video can't be read on this device. Please record it in the app instead."
const TOO_LONG = 'Videos must be 1 minute or shorter. Trim it in your gallery app, then upload it again.'
const TOO_LARGE = 'That video is too large to upload. Please choose a shorter clip.'

function abortError() {
  return new DOMException('Video processing was cancelled', 'AbortError')
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2)

/** Output size: fits in 1280×720 (or 720×1280 for portrait), never upscaled. */
function targetSize(width, height) {
  const landscape = width >= height
  const scale = Math.min(
    1,
    (landscape ? MAX_LONG_SIDE : MAX_SHORT_SIDE) / width,
    (landscape ? MAX_SHORT_SIDE : MAX_LONG_SIDE) / height
  )
  return { width: even(width * scale), height: even(height * scale) }
}

/** Duration in seconds via the browser's own player, or null if it can't open the file. */
function probeDuration(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => resolve(null)
    video.src = url
  })
}

/**
 * Fast path: transcode with WebCodecs (the phone's hardware encoder) through
 * Mediabunny, loaded only when someone uploads. Much faster than real time.
 */
async function transcodeWithWebCodecs(file, { onProgress, signal }) {
  const mb = await import('mediabunny')
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
  try {
    const duration = await input.computeDuration()
    if (duration > MAX_SECONDS + DURATION_TOLERANCE) throw new VideoError(TOO_LONG)

    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new VideoError(UNREADABLE)
    const size = targetSize(track.displayWidth, track.displayHeight)

    // H.264 + AAC in MP4 plays everywhere; VP9/VP8 + Opus in WebM is the fallback
    const videoCodec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], size)
    if (!videoCodec) return null
    const mp4 = videoCodec === 'avc'
    const audioCodec = await mb.getFirstEncodableAudioCodec(mp4 ? ['aac', 'opus'] : ['opus'])

    const output = new mb.Output({
      format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
      target: new mb.BufferTarget(),
    })
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: { ...size, fit: 'fill', codec: videoCodec, quality: new mb.Quality({ bitrate: VIDEO_BITS }), forceTranscode: true },
      // No usable audio encoder: keep the video, drop the sound
      audio: audioCodec
        ? { codec: audioCodec, quality: new mb.Quality({ bitrate: AUDIO_BITS }), forceTranscode: true }
        : { discard: true },
      showWarnings: false,
    })
    if (!conversion.isValid) return null

    const cancel = () => conversion.cancel()
    signal?.addEventListener('abort', cancel)
    conversion.onProgress = (p) => onProgress?.(p)
    try {
      await conversion.execute()
    } catch (err) {
      if (signal?.aborted) throw abortError()
      throw err
    } finally {
      signal?.removeEventListener('abort', cancel)
    }

    const blob = new Blob([output.target.buffer], { type: mp4 ? 'video/mp4' : 'video/webm' })
    return { blob, duration: Math.min(MAX_SECONDS, Math.round(duration)) }
  } finally {
    input.dispose?.()
  }
}

/**
 * Fallback for browsers without WebCodecs: play the file into a canvas and
 * re-record it with MediaRecorder. Takes as long as the video itself.
 */
function transcodeRealtime(url, duration, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      reject(new VideoError(UNREADABLE))
      return
    }

    const video = document.createElement('video')
    video.playsInline = true
    video.src = url
    // iOS only renders frames for videos that are in the page
    Object.assign(video.style, { position: 'fixed', left: '-9999px', width: '2px', height: '2px', opacity: '0' })
    document.body.appendChild(video)

    let audioCtx = null
    let recorder = null
    let stream = null
    let frameHandle = null
    let finished = false

    function cleanup() {
      finished = true
      if (frameHandle && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameHandle)
      else if (frameHandle) cancelAnimationFrame(frameHandle)
      video.pause()
      video.remove()
      stream?.getTracks().forEach((t) => t.stop())
      audioCtx?.close().catch(() => {})
      signal?.removeEventListener('abort', onAbort)
    }

    function fail(err) {
      if (finished) return
      if (recorder?.state === 'recording') {
        recorder.onstop = null
        recorder.stop()
      }
      cleanup()
      reject(err)
    }

    function onAbort() {
      fail(abortError())
    }
    signal?.addEventListener('abort', onAbort)

    video.onerror = () => fail(new VideoError(UNREADABLE))
    video.onloadedmetadata = async () => {
      const { width, height } = targetSize(video.videoWidth, video.videoHeight)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      stream = canvas.captureStream(30)

      // Route the soundtrack into the recording without playing it aloud
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const dest = audioCtx.createMediaStreamDestination()
        audioCtx.createMediaElementSource(video).connect(dest)
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
      } catch {
        video.muted = true
      }

      const mimeType = pickMimeType()
      try {
        recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: VIDEO_BITS,
          audioBitsPerSecond: AUDIO_BITS,
        })
      } catch {
        fail(new VideoError(UNREADABLE))
        return
      }

      const chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data)
      }
      recorder.onstop = () => {
        if (finished) return
        cleanup()
        resolve({
          blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }),
          duration: Math.min(MAX_SECONDS, Math.round(duration)),
        })
      }

      const draw = () => {
        if (finished) return
        ctx.drawImage(video, 0, 0, width, height)
        frameHandle = video.requestVideoFrameCallback
          ? video.requestVideoFrameCallback(draw)
          : requestAnimationFrame(draw)
      }

      video.ontimeupdate = () => onProgress?.(Math.min(1, video.currentTime / duration))
      video.onended = () => {
        ctx.drawImage(video, 0, 0, width, height)
        if (recorder.state === 'recording') recorder.stop()
      }

      try {
        await audioCtx?.resume()
        recorder.start(1000)
        await video.play()
        draw()
      } catch {
        // Autoplay with sound was blocked: carry on silently
        try {
          video.muted = true
          await video.play()
          draw()
        } catch {
          fail(new VideoError(UNREADABLE))
        }
      }
    }
  })
}

/**
 * Prepares a gallery video for upload as proof: rejects clips over a minute,
 * passes small mp4/webm files straight through, and otherwise compresses to
 * 720p at the same bitrate as in-app recordings.
 * Resolves to { blob, duration }. Throws VideoError (message is for the
 * patient) or an AbortError when `signal` aborts.
 */
export async function compressVideo(file, { onProgress, signal } = {}) {
  const url = URL.createObjectURL(file)
  try {
    const probed = await probeDuration(url)
    if (probed != null && probed > MAX_SECONDS + DURATION_TOLERANCE) throw new VideoError(TOO_LONG)

    // Already small and in a format every device plays
    const playable = /^video\/(mp4|webm)$/.test(file.type)
    if (probed != null && playable && file.size <= MAX_VIDEO_BYTES) {
      return { blob: file, duration: Math.min(MAX_SECONDS, Math.round(probed)) }
    }

    let result = null
    if (typeof window.VideoEncoder !== 'undefined') {
      try {
        result = await transcodeWithWebCodecs(file, { onProgress, signal })
      } catch (err) {
        if (err instanceof VideoError || err?.name === 'AbortError') throw err
        console.warn('WebCodecs conversion failed, falling back to real-time:', err)
      }
    }
    if (!result) {
      if (probed == null) throw new VideoError(UNREADABLE)
      onProgress?.(0)
      result = await transcodeRealtime(url, probed, { onProgress, signal })
    }

    if (!result.blob.size) throw new VideoError(UNREADABLE)
    if (result.blob.size > MAX_VIDEO_BYTES) throw new VideoError(TOO_LARGE)
    return result
  } finally {
    URL.revokeObjectURL(url)
  }
}
