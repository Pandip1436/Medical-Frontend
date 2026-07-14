import { useState, useEffect, useCallback, useRef } from 'react'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'

// Drop-in replacement for usePersistedState that also syncs to the server
// via useFilterPrefsStore. Reads initial value from localStorage immediately;
// overwrites with the server copy once it arrives so preferences follow the
// user across devices.
export function usePageFilter<T>(
  pageKey: string,
  filterKey: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const { filters, setFilter, loaded } = useFilterPrefsStore()

  const [value, _setValue] = useState<T>(() => {
    const stored = (filters[pageKey] ?? {})[filterKey]
    return stored !== undefined ? (stored as T) : defaultValue
  })
  // Mirrors `value` synchronously so a functional update (setValue(prev =>
  // ...)) resolves against the latest value even when called more than once
  // in the same tick, before a re-render lands.
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(valueRef.current) : next
      valueRef.current = resolved
      _setValue(resolved)
      setFilter(pageKey, filterKey, resolved)
    },
    [pageKey, filterKey, setFilter],
  )

  // Override with server value once the server load completes.
  useEffect(() => {
    if (loaded) {
      const serverVal = (filters[pageKey] ?? {})[filterKey]
      if (serverVal !== undefined) {
        _setValue(serverVal as T)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  return [value, setValue]
}
