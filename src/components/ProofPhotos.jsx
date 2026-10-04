import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProofPaths } from '../utils/proofs'

async function toViewableUrl(path) {
  // Old records store full public URLs; new records store just the file path
  if (path.startsWith('http')) return path
  const { data } = await supabase.storage.from('task-proofs').createSignedUrl(path, 3600)
  if (data?.signedUrl) return data.signedUrl
  // Fallback in case the bucket is still public
  return supabase.storage.from('task-proofs').getPublicUrl(path).data?.publicUrl || null
}

/** Grid of a task's proof photos, each opening full size in a new tab. */
export default function ProofPhotos({ task, title = 'Proof Photo' }) {
  const paths = getProofPaths(task)
  const key = paths.join('|')
  const [urls, setUrls] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all(paths.map((p) => toViewableUrl(p).catch(() => null))).then((res) => {
      if (!cancelled) setUrls(res.filter(Boolean))
    })
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
