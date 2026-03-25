import { useEffect, useState } from 'react'

/**
 * Returns a key that increments each time the page becomes visible again
 * (e.g. user switches back to PWA tab, or app comes from background).
 * Add this key as a useEffect dependency to force refetch on focus.
 */
export function useRefreshOnFocus() {
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden) {
        setRefreshKey((k) => k + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return refreshKey
}
