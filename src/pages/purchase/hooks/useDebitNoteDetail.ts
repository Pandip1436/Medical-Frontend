import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { ReturnDetail } from '../DebitNotesPage'

interface UseDebitNoteDetailResult {
  debitNote: ReturnDetail | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

function toReturnDetail(pr: Record<string, unknown>): ReturnDetail {
  const grn = pr.grn as Record<string, unknown> | undefined
  const supplier = pr.supplier as Record<string, unknown> | undefined
  return {
    id: pr.id as string,
    noteNo: pr.debitNoteNo as string,
    date: pr.date as string,
    partyName: pr.supplierName as string,
    supplierId: pr.supplierId as string,
    supplierPhone: (supplier?.phone as string) ?? null,
    supplierAddress: (supplier?.address as string) ?? null,
    referenceValue: (grn?.grnNumber as string) ?? 'Direct',
    reason: pr.reason as string,
    items: (pr.items as ReturnDetail['items']) ?? [],
    grnItems: (grn?.items as ReturnDetail['grnItems']) ?? [],
    subtotal: pr.subtotal as number,
    cgst: pr.cgst as number | undefined,
    sgst: pr.sgst as number | undefined,
    totalAmount: pr.totalAmount as number,
    status: pr.status as string,
    settlementMode: (pr.settlementMode as 'REFUND' | 'REPLACEMENT' | 'ADJUST') ?? 'REFUND',
    replacementGrnId: (pr.replacementGrnId as string) ?? null,
    notes: pr.notes as string | undefined,
  }
}

export function useDebitNoteDetail(id: string | null): UseDebitNoteDetailResult {
  const [debitNote, setDebitNote] = useState<ReturnDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    if (!id) {
      setDebitNote(null)
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
      const res = await api.get(`/purchase-returns/${id}`, { signal: ctrl.signal })
      setDebitNote(toReturnDetail(res.data))
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load debit note')
      setDebitNote(null)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  return { debitNote, loading, error, refetch }
}
