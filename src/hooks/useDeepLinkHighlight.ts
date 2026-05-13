import { useCallback, useState } from 'react'
import { useRoute } from '@/lib/router'

/**
 * Reads a deep-link target ID from `?<paramKey>=...` once on mount.
 *
 * Returns a stable `targetId` and a `clearParam()` function the page should
 * call after handling the deep link (so refresh doesn't replay it).
 *
 * The caller owns the scroll/highlight/pagination/tab logic — this hook just
 * surfaces the param. Use {@link useDeepLinkHighlightState} for the highlight
 * state machine.
 *
 *   const { targetId, clearParam } = useDeepLinkParam('batchId', '/inventory/expiry')
 */
export function useDeepLinkParam(paramKey: string, cleanPath: string) {
  const { search } = useRoute()
  // Capture the param on first render so later setSearch (from clearParam) doesn't reset it.
  const [targetId] = useState<string | null>(
    () => new URLSearchParams(search).get(paramKey),
  )

  const clearParam = useCallback(() => {
    window.history.replaceState(null, '', cleanPath)
  }, [cleanPath])

  return { targetId, clearParam }
}

/**
 * Holds a transient highlight ID that auto-clears after `durationMs`.
 *
 *   const { highlightId, highlight } = useDeepLinkHighlightState()
 *   highlight(targetId)  // pulses for 2.5s
 *   ...
 *   <tr data-highlighted={highlightId === id}>
 */
export function useDeepLinkHighlightState(durationMs = 2500) {
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const highlight = useCallback(
    (id: string) => {
      setHighlightId(id)
      const t = setTimeout(() => setHighlightId(null), durationMs)
      return () => clearTimeout(t)
    },
    [durationMs],
  )

  return { highlightId, highlight }
}
