import { useState, useEffect, useCallback } from 'react'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'

// Drop-in replacement for usePersistedState that also syncs to the server
// via useFilterPrefsStore. Reads initial value from localStorage immediately;
// overwrites with the server copy once it arrives so preferences follow the
// user across devices.
export function usePageFilter<T>(
  pageKey: string,
  filterKey: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const { filters, setFilter, loaded } = useFilterPrefsStore()

  const [value, _setValue] = useState<T>(() => {
    const stored = (filters[pageKey] ?? {})[filterKey]
    return stored !== undefined ? (stored as T) : defaultValue
  })

  const setValue = useCallback(
    (newVal: T) => {
      _setValue(newVal)
      setFilter(pageKey, filterKey, newVal)
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
