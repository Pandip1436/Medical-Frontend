import { useEffect } from 'react'

/**
 * Calls the provided callback whenever the active branch changes.
 * Pages with their own api.get calls use this to re-fetch on branch switch.
 */
export function useBranchRefresh(callback: () => void) {
  useEffect(() => {
    window.addEventListener('pbims:branch-changed', callback)
    return () => window.removeEventListener('pbims:branch-changed', callback)
  }, [callback])
}
