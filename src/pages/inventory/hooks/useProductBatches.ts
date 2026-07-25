import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { Batch } from '@/types'

interface UseProductBatchesResult {
  batches: Batch[]
  loading: boolean
  refetch: () => Promise<void>
}

/**
 * Fetches a product's in-stock batches (quantity > 0) from `/batches`.
 * Lean sibling of {@link useProductDetail} for callers (e.g. the full-page
 * Product History view) that already have the product and only need its
 * batches for the Batches tab. Aborts in-flight requests on id change.
 */
export function useProductBatches(productId: string | null): UseProductBatchesResult {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!productId) {
      setBatches([])
      setLoading(false)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const res = await api.get('/batches', { params: { productId }, signal: ctrl.signal })
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
      setBatches(rows.filter((b: Batch) => b.quantity > 0))
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setBatches([])
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  return { batches, loading, refetch }
}
