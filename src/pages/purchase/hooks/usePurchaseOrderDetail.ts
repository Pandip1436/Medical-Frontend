import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { PurchaseOrder } from '@/types'

export function usePurchaseOrderDetail(id: string | null) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetch = useCallback(async (poId: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/purchase-orders/${poId}`, { signal: ctrl.signal })
      setPurchaseOrder(res.data)
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'CanceledError') return
      setError('Failed to load purchase order')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (id) void fetch(id)
    else { setPurchaseOrder(null); setError(null) }
    return () => { abortRef.current?.abort() }
  }, [id, fetch])

  const refetch = useCallback(() => { if (id) void fetch(id) }, [id, fetch])

  return { purchaseOrder, loading, error, refetch }
}
