import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { Product, Batch } from '@/types'

interface UseProductDetailResult {
  product: Product | null
  batches: Batch[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Fetches a single product (with its active batches) by id.
 * Aborts in-flight requests on id change so rapid switching never settles stale data.
 */
export function useProductDetail(id: string | null): UseProductDetailResult {
  const [product, setProduct] = useState<Product | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!id) {
      setProduct(null)
      setBatches([])
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
      const [prodRes, batchRes] = await Promise.all([
        api.get(`/products/${id}`, { signal: ctrl.signal }),
        api.get('/inventory/batches', { params: { productId: id }, signal: ctrl.signal }).catch(() => ({ data: [] })),
      ])
      setProduct(prodRes.data ?? null)
      const rows = Array.isArray(batchRes.data) ? batchRes.data : (batchRes.data?.data ?? [])
      setBatches(rows.filter((b: Batch) => b.quantity > 0))
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load product')
      setProduct(null)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  return { product, batches, loading, error, refetch }
}
