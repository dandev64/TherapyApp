import { useState, useCallback } from 'react'

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
    cache.set(key, v)
    _setValue(v)
  }, [key])

  return [value, setValue]
}
