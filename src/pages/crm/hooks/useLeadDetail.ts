import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { Lead } from '../types'
import { MOCK_LEADS, USE_MOCK_DATA } from '../mockData'

interface UseLeadDetailResult {
  lead: Lead | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** Mutate the in-memory lead without a network round trip (optimistic UI). */
  patchLocal: (patch: Partial<Lead>) => void
}

/**
 * Fetches a single lead by id and exposes a minimal API for the right
 * detail panel. Re-fetches when `id` changes; aborts in-flight requests
 * via AbortController so rapid lead-switching never settles stale data.
 */
export function useLeadDetail(id: string | null): UseLeadDetailResult {
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!id) {
      setLead(null)
      setLoading(false)
      setError(null)
      return
    }

    // Mock-data short circuit — see src/pages/crm/mockData.ts.
    // Spread into a new object so React sees a fresh reference: the mock
    // helpers (mockSetLeadStage, etc.) mutate MOCK_LEADS in place, and
    // setLead(sameRef) would otherwise be a no-op (Object.is check) and
    // the right panel wouldn't refresh.
    if (USE_MOCK_DATA) {
      const hit = MOCK_LEADS.find((l) => l.id === id) ?? null
      setLead(hit ? { ...hit } : null)
      setError(hit ? null : 'Lead not found')
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/leads/${id}`, { signal: ctrl.signal })
      setLead(res.data ?? null)
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load lead')
      setLead(null)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  const patchLocal = useCallback((patch: Partial<Lead>) => {
    setLead((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  return { lead, loading, error, refetch, patchLocal }
}
