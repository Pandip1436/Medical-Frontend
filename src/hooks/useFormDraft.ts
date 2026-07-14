import { useCallback, useEffect, useRef } from 'react'

/**
 * Generalizes the auto-draft pattern originally hand-rolled in NewSalePage.tsx
 * (localStorage snapshot, restored once on mount, saved on every change) into
 * a reusable hook for any in-progress form. The caller keeps its existing
 * useState fields untouched — this just persists whatever plain object it's
 * given.
 *
 * Usage:
 *   const draft = useFormDraft('grn-draft:branch-123', { skip: editMode })
 *   useEffect(() => {
 *     const saved = draft.load()
 *     if (saved) { setFoo(saved.foo); setBar(saved.bar) }
 *   }, [])
 *   useEffect(() => { draft.save({ foo, bar }) }, [foo, bar])
 *   // on successful submit / explicit discard:
 *   draft.clear()
 */
export function useFormDraft<T = unknown>(key: string, options: { skip?: boolean } = {}) {
  const { skip = false } = options
  // Avoids writing a snapshot before the mount-time restore has had a chance
  // to run — otherwise an empty initial render could overwrite a real draft
  // a split second before it's read back.
  const readyToSaveRef = useRef(false)

  const load = useCallback((): T | null => {
    if (skip) return null
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      // Corrupted snapshot — drop it so it doesn't keep failing to parse.
      try { localStorage.removeItem(key) } catch { /* ignore */ }
      return null
    } finally {
      readyToSaveRef.current = true
    }
  }, [key, skip])

  const save = useCallback((snapshot: T) => {
    if (skip || !readyToSaveRef.current) return
    try {
      localStorage.setItem(key, JSON.stringify(snapshot))
    } catch {
      // Storage full/unavailable — non-fatal, the form just won't survive a reload.
    }
  }, [key, skip])

  const clear = useCallback(() => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }, [key])

  // If a page never calls load() (e.g. it's skip=true this render because of
  // a prefill param), still flip the ready flag so save() isn't permanently
  // blocked if skip later becomes false without a remount.
  useEffect(() => {
    if (skip) readyToSaveRef.current = true
  }, [skip])

  return { load, save, clear }
}
