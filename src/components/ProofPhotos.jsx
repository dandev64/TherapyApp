import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProofPaths } from '../utils/proofs'

/** Viewable URLs for a task's photos, signing all stored paths in one request. */
async function toViewableUrls(paths) {
  // Old records store full public URLs; new records store just the file path
  const stored = paths.filter((p) => !p.startsWith('http'))
  const signed = {}
  if (stored.length) {
    const { data } = await supabase.storage.from('task-proofs').createSignedUrls(stored, 3600)
    ;(data || []).forEach((d) => { if (d.signedUrl) signed[d.path] = d.signedUrl })
  }
  return paths.map((p) => (p.startsWith('http') ? p : signed[p] || null))
}

/** Grid of a task's proof photos, each opening full size in a new tab. */
export default function ProofPhotos({ task, title = 'Proof Photo' }) {
  const paths = getProofPaths(task)
  const key = paths.join('|')
  const [urls, setUrls] = useState([])

  useEffect(() => {
    let cancelled = false
    toViewableUrls(paths)
      .then((res) => {
        if (!cancelled) setUrls(res.filter(Boolean))
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (paths.length === 0) return null

  return (
    <div>
      <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
        {title}{paths.length > 1 ? `s (${paths.length})` : ''}
      </p>
      {urls.length === 0 ? (
        <p className="text-sm text-text-muted">Loading proof image...</p>
      ) : (
        <div className={`grid gap-2 ${urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {urls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt="Proof of completion"
                className="w-full max-h-64 object-cover rounded-xl border border-border"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
