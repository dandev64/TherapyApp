import { useState, useCallback } from 'react'

const MAX_CACHE_SIZE = 50
const cache = new Map()

export function clearDataCache() {
  cache.clear()
}

export function hasCache(key) {
  return cache.has(key)
}

export function useCachedState(key, defaultValue) {
  const [value, _setValue] = useState(() =>
    cache.has(key) ? cache.get(key) : defaultValue
  )

  const setValue = useCallback((v) => {
    // Evict oldest entry if cache is full
    if (!cache.has(key) && cache.size >= MAX_CACHE_SIZE) {
      const oldest = cache.keys().next().value
      cache.delete(oldest)
    }
    cache.set(key, v)
    _setValue(v)
  }, [key])

  return [value, setValue]
}
