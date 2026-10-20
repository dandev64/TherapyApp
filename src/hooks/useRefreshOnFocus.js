import { useEffect, useState } from 'react'

// Coming back sooner than this keeps what's on screen instead of refetching
const MIN_REFRESH_MS = 60000

/**
 * Returns a key that increments each time the page becomes visible again
 * (e.g. user switches back to PWA tab, or app comes from background), at most
 * once a minute. Add this key as a useEffect dependency to force refetch on focus.
 */
export function useRefreshOnFocus() {
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let last = Date.now()
    function handleVisibility() {
      if (document.hidden || Date.now() - last < MIN_REFRESH_MS) return
      last = Date.now()
      setRefreshKey((k) => k + 1)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return refreshKey
}
