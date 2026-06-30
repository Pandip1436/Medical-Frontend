import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { GRN } from '@/types'

interface UseGRNDetailResult {
  grn: GRN | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Fetches a single GRN by id. Re-fetches when `id` changes; aborts in-flight
 * requests so rapid item-switching never settles stale data in the right panel.
 */
export function useGRNDetail(id: string | null): UseGRNDetailResult {
  const [grn, setGrn] = useState<GRN | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!id) {
      setGrn(null)
      setLoading(false)
      setError(null)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/grn/${id}`, { signal: ctrl.signal })
      setGrn(res.data ?? null)
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load purchase entry')
      setGrn(null)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  return { grn, loading, error, refetch }
}
