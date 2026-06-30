import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { Invoice } from '@/types'

interface UseInvoiceDetailResult {
  invoice: Invoice | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  patchLocal: (patch: Partial<Invoice>) => void
}

/**
 * Fetches a single invoice by id. Re-fetches when `id` changes; aborts
 * in-flight requests via AbortController so rapid item-switching never
 * settles stale data in the right panel.
 */
export function useInvoiceDetail(id: string | null): UseInvoiceDetailResult {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!id) {
      setInvoice(null)
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
      const res = await api.get(`/billing/${id}`, { signal: ctrl.signal })
      setInvoice(res.data ?? null)
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load invoice')
      setInvoice(null)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  const patchLocal = useCallback((patch: Partial<Invoice>) => {
    setInvoice((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  return { invoice, loading, error, refetch, patchLocal }
}
