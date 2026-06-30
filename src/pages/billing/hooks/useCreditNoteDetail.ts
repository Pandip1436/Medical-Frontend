import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { CreditNote } from '../CreditNotesPage'

interface UseCreditNoteDetailResult {
  creditNote: CreditNote | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  patchLocal: (patch: Partial<CreditNote>) => void
}

export function useCreditNoteDetail(id: string | null): UseCreditNoteDetailResult {
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!id) {
      setCreditNote(null)
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
      const res = await api.get(`/credit-notes/${id}`, { signal: ctrl.signal })
      setCreditNote(res.data ?? null)
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load credit note')
      setCreditNote(null)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  const patchLocal = useCallback((patch: Partial<CreditNote>) => {
    setCreditNote((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  return { creditNote, loading, error, refetch, patchLocal }
}
