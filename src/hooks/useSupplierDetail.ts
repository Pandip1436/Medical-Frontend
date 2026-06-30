import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import type { Supplier } from '@/types'
import {
  type SupplierActivity,
  type SupplierActivityPayload,
} from '@/components/shared/SupplierActivityDialog'

// ─────────────────────────────────────────────────────────────
// Types — mirrors useCustomerDetail so both hooks stay structurally identical.
// ─────────────────────────────────────────────────────────────

type LedgerRow = {
  date: string
  ref?: string
  description?: string
  debit?: number | string
  credit?: number | string
  balance?: number | string
  sourceType?: 'GRN' | 'PURCHASE_RETURN'
  sourceId?: string
}

type Kpi = { label: string; value: string | number }

export type SupplierLedgerResponse = {
  supplier?: any
  tableData: LedgerRow[]
  kpis: Kpi[]
}

type BatchRow = {
  id: string
  productName?: string
  product?: { name?: string }
  batchNumber: string
  mfgDate?: string
  expiryDate?: string
  quantity: number
  mrp: number | string
  purchaseRate: number | string
}

export type SupplierWithRelations = Supplier & {
  batches?: BatchRow[]
  purchaseOrders?: any[]
}

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

type LazyState<T> = AsyncState<T> & {
  attempted: boolean
}

function isCanceled(err: any) {
  return err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError'
}

// ─────────────────────────────────────────────────────────────
// Hook — centralises every API call. Component renders state only.
// Critical-path fetchers (supplier, ledger) fire on mount.
// Lazy tabs (POs, GRNs, DNs, activities) fire on first tab visit.
// ─────────────────────────────────────────────────────────────

export function useSupplierDetail(supplierId: string | null) {
  // Critical-path state
  const [supplier, setSupplier] = useState<AsyncState<SupplierWithRelations>>({
    data: null,
    loading: false,
    error: null,
  })
  const [ledger, setLedger] = useState<AsyncState<SupplierLedgerResponse>>({
    data: null,
    loading: false,
    error: null,
  })

  // Lazy state
  const [pos, setPos] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [grns, setGrns] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [dns, setDns] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [activities, setActivities] = useState<LazyState<SupplierActivity[]>>({ data: null, loading: false, error: null, attempted: false })

  // Ledger date range (debounced refetch)
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')

  // Abort tracking
  const supplierAbortRef = useRef<AbortController | null>(null)
  const ledgerAbortRef = useRef<AbortController | null>(null)
  const posAbortRef = useRef<AbortController | null>(null)
  const grnsAbortRef = useRef<AbortController | null>(null)
  const dnsAbortRef = useRef<AbortController | null>(null)
  const activitiesAbortRef = useRef<AbortController | null>(null)

  // ── Critical-path fetchers ────────────────────────────────
  const fetchSupplier = useCallback(async () => {
    if (!supplierId) return
    supplierAbortRef.current?.abort()
    const controller = new AbortController()
    supplierAbortRef.current = controller
    setSupplier((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await api.get(`/suppliers/${supplierId}`, { signal: controller.signal })
      setSupplier({ data: res.data, loading: false, error: null })
    } catch (err: any) {
      if (isCanceled(err)) return
      setSupplier((s) => ({ data: s.data, loading: false, error: err?.message ?? 'Failed to load supplier' }))
    }
  }, [supplierId])

  const fetchLedger = useCallback(async () => {
    if (!supplierId) return
    ledgerAbortRef.current?.abort()
    const controller = new AbortController()
    ledgerAbortRef.current = controller
    setLedger((s) => ({ ...s, loading: true, error: null }))
    try {
      const params = new URLSearchParams()
      if (ledgerFrom) params.set('from', ledgerFrom)
      if (ledgerTo) params.set('to', ledgerTo)
      const qs = params.toString()
      const res = await api.get(
        `/reports/financial/supplier-ledger/${supplierId}${qs ? `?${qs}` : ''}`,
        { signal: controller.signal },
      )
      setLedger({ data: res.data, loading: false, error: null })
    } catch (err: any) {
      if (isCanceled(err)) return
      setLedger((s) => ({ data: s.data, loading: false, error: err?.message ?? 'Failed to load ledger' }))
    }
  }, [supplierId, ledgerFrom, ledgerTo])

  // On mount / supplierId change: fire both critical fetches in parallel and
  // reset every lazy tab back to its empty/unattempted state.
  useEffect(() => {
    if (!supplierId) return
    void Promise.allSettled([fetchSupplier(), fetchLedger()])
    setPos({ data: null, loading: false, error: null, attempted: false })
    setGrns({ data: null, loading: false, error: null, attempted: false })
    setDns({ data: null, loading: false, error: null, attempted: false })
    setActivities({ data: null, loading: false, error: null, attempted: false })
    return () => {
      supplierAbortRef.current?.abort()
      ledgerAbortRef.current?.abort()
      posAbortRef.current?.abort()
      grnsAbortRef.current?.abort()
      dnsAbortRef.current?.abort()
      activitiesAbortRef.current?.abort()
    }
    // fetchLedger not in deps — date-change has its own debounced effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, fetchSupplier])

  // Debounced ledger refetch on date-range change
  useEffect(() => {
    if (!supplierId) return
    const handle = setTimeout(() => { void fetchLedger() }, 300)
    return () => clearTimeout(handle)
  }, [supplierId, ledgerFrom, ledgerTo, fetchLedger])

  // ── Lazy fetchers (one-shot, cached per supplierId) ───────
  const ensurePosLoaded = useCallback(async () => {
    if (!supplierId || pos.attempted) return
    posAbortRef.current?.abort()
    const controller = new AbortController()
    posAbortRef.current = controller
    setPos({ data: null, loading: true, error: null, attempted: true })
    try {
      const res = await api.get('/purchase-orders', { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setPos({
        data: list.filter((x) => x.supplierId === supplierId),
        loading: false,
        error: null,
        attempted: true,
      })
    } catch (err: any) {
      if (isCanceled(err)) return
      setPos({ data: null, loading: false, error: err?.message ?? 'Failed to load POs', attempted: true })
    }
  }, [supplierId, pos.attempted])

  const ensureGrnsLoaded = useCallback(async () => {
    if (!supplierId || grns.attempted) return
    grnsAbortRef.current?.abort()
    const controller = new AbortController()
    grnsAbortRef.current = controller
    setGrns({ data: null, loading: true, error: null, attempted: true })
    try {
      const res = await api.get('/grn', { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setGrns({
        data: list.filter((x) => x.supplierId === supplierId),
        loading: false,
        error: null,
        attempted: true,
      })
    } catch (err: any) {
      if (isCanceled(err)) return
      setGrns({ data: null, loading: false, error: err?.message ?? 'Failed to load goods received notes', attempted: true })
    }
  }, [supplierId, grns.attempted])

  const ensureDnsLoaded = useCallback(async () => {
    if (!supplierId || dns.attempted) return
    dnsAbortRef.current?.abort()
    const controller = new AbortController()
    dnsAbortRef.current = controller
    setDns({ data: null, loading: true, error: null, attempted: true })
    try {
      const res = await api.get('/purchase-returns', { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setDns({
        data: list.filter((x) => x.supplierId === supplierId),
        loading: false,
        error: null,
        attempted: true,
      })
    } catch (err: any) {
      if (isCanceled(err)) return
      setDns({ data: null, loading: false, error: err?.message ?? 'Failed to load debit notes', attempted: true })
    }
  }, [supplierId, dns.attempted])

  const ensureActivitiesLoaded = useCallback(async () => {
    if (!supplierId || activities.attempted) return
    activitiesAbortRef.current?.abort()
    const controller = new AbortController()
    activitiesAbortRef.current = controller
    setActivities({ data: null, loading: true, error: null, attempted: true })
    try {
      const res = await api.get(`/suppliers/${supplierId}/activities`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as SupplierActivity[]
      setActivities({ data: list, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (isCanceled(err)) return
      setActivities({ data: null, loading: false, error: err?.message ?? 'Failed to load activities', attempted: true })
    }
  }, [supplierId, activities.attempted])

  // ── Activity mutators ─────────────────────────────────────
  const refetchActivities = useCallback(async () => {
    if (!supplierId) return
    activitiesAbortRef.current?.abort()
    const controller = new AbortController()
    activitiesAbortRef.current = controller
    try {
      const res = await api.get(`/suppliers/${supplierId}/activities`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as SupplierActivity[]
      setActivities({ data: list, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (isCanceled(err)) return
    }
  }, [supplierId])

  const createActivity = useCallback(
    async (payload: SupplierActivityPayload) => {
      if (!supplierId) return
      try {
        const res = await api.post(`/suppliers/${supplierId}/activities`, payload)
        const created = res.data as SupplierActivity
        setActivities((s) => ({
          ...s,
          data: s.data ? [created, ...s.data] : [created],
          attempted: true,
        }))
        toast.success(
          payload.type === 'REMINDER'
            ? 'Reminder scheduled'
            : `${payload.type.charAt(0)}${payload.type.slice(1).toLowerCase()} logged`,
        )
      } catch (err) {
        throw err
      }
    },
    [supplierId],
  )

  const updateActivity = useCallback(
    async (id: string, patch: Partial<SupplierActivityPayload>) => {
      if (!supplierId) return
      const prev = activities.data
      setActivities((s) => ({
        ...s,
        data: s.data ? s.data.map((a) => (a.id === id ? { ...a, ...patch } : a)) : s.data,
      }))
      try {
        const res = await api.patch(`/suppliers/${supplierId}/activities/${id}`, patch)
        const updated = res.data as SupplierActivity
        setActivities((s) => ({
          ...s,
          data: s.data ? s.data.map((a) => (a.id === id ? updated : a)) : s.data,
        }))
      } catch (err) {
        setActivities((s) => ({ ...s, data: prev }))
        throw err
      }
    },
    [supplierId, activities.data],
  )

  const removeActivity = useCallback(
    async (id: string) => {
      if (!supplierId) return
      const prev = activities.data
      setActivities((s) => ({
        ...s,
        data: s.data ? s.data.filter((a) => a.id !== id) : s.data,
      }))
      try {
        await api.delete(`/suppliers/${supplierId}/activities/${id}`)
        toast.success('Activity removed')
      } catch (err) {
        setActivities((s) => ({ ...s, data: prev }))
        throw err
      }
    },
    [supplierId, activities.data],
  )

  // Optimistic patch helper
  const applySupplierPatch = useCallback((patch: Partial<Supplier>) => {
    setSupplier((s) => (s.data ? { ...s, data: { ...s.data, ...patch } } : s))
  }, [])

  return {
    supplier: { ...supplier, refetch: fetchSupplier, applyPatch: applySupplierPatch },
    ledger: {
      ...ledger,
      refetch: fetchLedger,
      from: ledgerFrom,
      to: ledgerTo,
      setFrom: setLedgerFrom,
      setTo: setLedgerTo,
    },
    pos: {
      ...pos,
      ensureLoaded: ensurePosLoaded,
      refetch: () => { setPos((s) => ({ ...s, attempted: false })); void ensurePosLoaded() },
    },
    grns: {
      ...grns,
      ensureLoaded: ensureGrnsLoaded,
      refetch: () => { setGrns((s) => ({ ...s, attempted: false })); void ensureGrnsLoaded() },
    },
    dns: {
      ...dns,
      ensureLoaded: ensureDnsLoaded,
      refetch: () => { setDns((s) => ({ ...s, attempted: false })); void ensureDnsLoaded() },
    },
    activities: {
      ...activities,
      ensureLoaded: ensureActivitiesLoaded,
      refetch: refetchActivities,
      create: createActivity,
      update: updateActivity,
      remove: removeActivity,
    },
  }
}
