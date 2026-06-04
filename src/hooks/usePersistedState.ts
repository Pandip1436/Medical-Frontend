import { useState, useEffect } from 'react'

// Drop-in replacement for useState that persists the value under `key` in
// sessionStorage. Used for list-page filters so they survive a page refresh and
// in-app navigate-away-and-back within the same tab (they reset when the tab is
// closed — filters shouldn't linger across days). Swap `useState(x)` for
// `usePersistedState('some:key', x)`; keep the explicit generic for union types
// e.g. `usePersistedState<'all' | 'short'>('grn:card', 'all')`.
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw != null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota / serialization errors — persistence is best-effort
    }
  }, [key, value])

  return [value, setValue]
}
