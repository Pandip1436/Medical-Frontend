import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import type { Customer } from '@/types'

// ─────────────────────────────────────────────────────────────
// Types — kept loose; backend payloads have richer shapes than consumers need.
// Mirrors the supplier-detail hook so both pages stay structurally identical.
// ─────────────────────────────────────────────────────────────

type LedgerRow = {
  date: string
  ref?: string
  description?: string
  debit?: number | string
  credit?: number | string
  balance?: number | string
  sourceType?: 'INVOICE' | 'CREDIT_NOTE'
  sourceId?: string
}

type Kpi = { label: string; value: string | number }

export type CustomerLedgerResponse = {
  customer?: any
  tableData: LedgerRow[]
  kpis: Kpi[]
}

// Activity type aliases — reuses the supplier-activity dialog component which
// is entity-agnostic. Customer activities have the same fields/lifecycle.
export type CustomerActivityType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'NOTE' | 'REMINDER'
export type CustomerActivityStatus = 'PENDING' | 'DONE' | 'CANCELLED'

export interface CustomerActivity {
  id: string
  type: CustomerActivityType
  notes?: string | null
  title?: string | null
  occurredAt?: string | null
  dueAt?: string | null
  status?: CustomerActivityStatus | null
  contactName?: string | null
  subject?: string | null
  createdAt: string
  createdBy?: { id: string; name: string; email: string } | null
}

export interface CustomerActivityPayload {
  type: CustomerActivityType
  notes?: string
  title?: string
  contactName?: string
  subject?: string
  occurredAt?: string
  dueAt?: string
  status?: CustomerActivityStatus
}

export type CustomerWithExtras = Customer & {
  registrationNumber?: string | null
  branchId?: string | null
}

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

type LazyState<T> = AsyncState<T> & {
  /** Set to true after the first fetch attempt for this tab. Used to gate `ensureLoaded`. */
  attempted: boolean
}

// ─────────────────────────────────────────────────────────────
// Hook — centralises every API call. Component renders state only.
// Same scaffolding pattern as `useSupplierDetail` (lazy + AbortController +
// optimistic). Critical-path fetchers fire on mount; lazies fire on first
// tab activation; activities slice exposes optimistic mutators.
// ─────────────────────────────────────────────────────────────

export function useCustomerDetail(customerId: string | null) {
  // Critical-path state (fired on mount)
  const [customer, setCustomer] = useState<AsyncState<CustomerWithExtras>>({
    data: null,
    loading: false,
    error: null,
  })
  const [ledger, setLedger] = useState<AsyncState<CustomerLedgerResponse>>({
    data: null,
    loading: false,
    error: null,
  })

  // Lazy state (fired on first tab click)
  const [invoices, setInvoices] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [creditNotes, setCreditNotes] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [payments, setPayments] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [quotations, setQuotations] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [prescriptions, setPrescriptions] = useState<LazyState<any[]>>({ data: null, loading: false, error: null, attempted: false })
  const [activities, setActivities] = useState<LazyState<CustomerActivity[]>>({ data: null, loading: false, error: null, attempted: false })

  // Ledger date range (debounced refetch)
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')

  // Abort tracking per logical request so stale responses can't overwrite fresh state
  const customerAbortRef = useRef<AbortController | null>(null)
  const ledgerAbortRef = useRef<AbortController | null>(null)
  const invoicesAbortRef = useRef<AbortController | null>(null)
  const creditNotesAbortRef = useRef<AbortController | null>(null)
  const paymentsAbortRef = useRef<AbortController | null>(null)
  const quotationsAbortRef = useRef<AbortController | null>(null)
  const prescriptionsAbortRef = useRef<AbortController | null>(null)
  const activitiesAbortRef = useRef<AbortController | null>(null)

  // ── Critical-path fetchers ────────────────────────────────
  const fetchCustomer = useCallback(async () => {
    if (!customerId) return
    customerAbortRef.current?.abort()
    const controller = new AbortController()
    customerAbortRef.current = controller
    setCustomer((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await api.get(`/customers/${customerId}`, { signal: controller.signal })
      setCustomer({ data: res.data, loading: false, error: null })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setCustomer((s) => ({ data: s.data, loading: false, error: err?.message ?? 'Failed to load customer' }))
    }
  }, [customerId])

  const fetchLedger = useCallback(async () => {
    if (!customerId) return
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
        `/reports/financial/ledger/${customerId}${qs ? `?${qs}` : ''}`,
        { signal: controller.signal },
      )
      setLedger({ data: res.data, loading: false, error: null })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setLedger((s) => ({ data: s.data, loading: false, error: err?.message ?? 'Failed to load ledger' }))
    }
  }, [customerId, ledgerFrom, ledgerTo])

  // On mount / customerId change: fire both critical fetches in parallel.
  useEffect(() => {
    if (!customerId) return
    void Promise.allSettled([fetchCustomer(), fetchLedger()])
    setInvoices({ data: null, loading: false, error: null, attempted: false })
    setCreditNotes({ data: null, loading: false, error: null, attempted: false })
    setPayments({ data: null, loading: false, error: null, attempted: false })
    setQuotations({ data: null, loading: false, error: null, attempted: false })
    setPrescriptions({ data: null, loading: false, error: null, attempted: false })
    setActivities({ data: null, loading: false, error: null, attempted: false })
    return () => {
      customerAbortRef.current?.abort()
      ledgerAbortRef.current?.abort()
      invoicesAbortRef.current?.abort()
      creditNotesAbortRef.current?.abort()
      paymentsAbortRef.current?.abort()
      quotationsAbortRef.current?.abort()
      prescriptionsAbortRef.current?.abort()
      activitiesAbortRef.current?.abort()
    }
    // fetchLedger isn't in deps — date-change has its own debounced effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, fetchCustomer])

  // Debounced ledger refetch on date-range change
  useEffect(() => {
    if (!customerId) return
    const handle = setTimeout(() => { void fetchLedger() }, 300)
    return () => clearTimeout(handle)
  }, [customerId, ledgerFrom, ledgerTo, fetchLedger])

  // ── Lazy fetchers (one shot, cached) ──────────────────────
  // Unconditional fetcher — always runs, regardless of `attempted`. The
  // `ensureLoaded` wrappers below are thin gates on top of these so the
  // first-tab-click semantics are preserved. `refetch*` reuses these directly
  // so external mutation (CN approve, payment record) shows up on tab click.
  const fetchInvoices = useCallback(async () => {
    if (!customerId) return
    invoicesAbortRef.current?.abort()
    const controller = new AbortController()
    invoicesAbortRef.current = controller
    setInvoices((s) => ({ ...s, loading: true, error: null, attempted: true }))
    try {
      const res = await api.get(`/billing?customerId=${customerId}`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setInvoices({ data: list, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setInvoices({ data: null, loading: false, error: err?.message ?? 'Failed to load invoices', attempted: true })
    }
  }, [customerId])

  const ensureInvoicesLoaded = useCallback(async () => {
    if (!customerId || invoices.attempted) return
    await fetchInvoices()
  }, [customerId, invoices.attempted, fetchInvoices])

  const fetchCreditNotes = useCallback(async () => {
    if (!customerId) return
    creditNotesAbortRef.current?.abort()
    const controller = new AbortController()
    creditNotesAbortRef.current = controller
    setCreditNotes((s) => ({ ...s, loading: true, error: null, attempted: true }))
    try {
      const res = await api.get(`/credit-notes?customerId=${customerId}`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setCreditNotes({ data: list, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setCreditNotes({ data: null, loading: false, error: err?.message ?? 'Failed to load credit notes', attempted: true })
    }
  }, [customerId])

  const ensureCreditNotesLoaded = useCallback(async () => {
    if (!customerId || creditNotes.attempted) return
    await fetchCreditNotes()
  }, [customerId, creditNotes.attempted, fetchCreditNotes])

  const fetchPayments = useCallback(async () => {
    if (!customerId) return
    paymentsAbortRef.current?.abort()
    const controller = new AbortController()
    paymentsAbortRef.current = controller
    setPayments((s) => ({ ...s, loading: true, error: null, attempted: true }))
    try {
      const res = await api.get(`/customers/${customerId}/payments`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setPayments({ data: list, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setPayments({ data: null, loading: false, error: err?.message ?? 'Failed to load payments', attempted: true })
    }
  }, [customerId])

  const ensurePaymentsLoaded = useCallback(async () => {
    if (!customerId || payments.attempted) return
    await fetchPayments()
  }, [customerId, payments.attempted, fetchPayments])

  const ensureQuotationsLoaded = useCallback(async () => {
    if (!customerId || quotations.attempted) return
    quotationsAbortRef.current?.abort()
    const controller = new AbortController()
    quotationsAbortRef.current = controller
    setQuotations({ data: null, loading: true, error: null, attempted: true })
    try {
      // Quotations endpoint doesn't support a customerId filter — fetch all and
      // filter client-side. Wasteful for customers with many historic quotes,
      // but acceptable until a backend filter lands.
      const res = await api.get('/quotations', { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      const mine = list.filter((q) => q.customerId === customerId)
      setQuotations({ data: mine, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setQuotations({ data: null, loading: false, error: err?.message ?? 'Failed to load quotations', attempted: true })
    }
  }, [customerId, quotations.attempted])

  const ensurePrescriptionsLoaded = useCallback(async () => {
    if (!customerId || prescriptions.attempted) return
    prescriptionsAbortRef.current?.abort()
    const controller = new AbortController()
    prescriptionsAbortRef.current = controller
    setPrescriptions({ data: null, loading: true, error: null, attempted: true })
    try {
      const res = await api.get(`/prescriptions?customerId=${customerId}`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setPrescriptions({ data: list, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setPrescriptions({ data: null, loading: false, error: err?.message ?? 'Failed to load prescriptions', attempted: true })
    }
  }, [customerId, prescriptions.attempted])

  const ensureActivitiesLoaded = useCallback(async () => {
    if (!customerId || activities.attempted) return
    activitiesAbortRef.current?.abort()
    const controller = new AbortController()
    activitiesAbortRef.current = controller
    setActivities({ data: null, loading: true, error: null, attempted: true })
    try {
      const res = await api.get(`/customers/${customerId}/activities`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as CustomerActivity[]
      setActivities({ data: list, loading: false, error: null, attempted: true })
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      setActivities({ data: null, loading: false, error: err?.message ?? 'Failed to load activities', attempted: true })
    }
  }, [customerId, activities.attempted])

  // ── Activity mutators (optimistic) ────────────────────────
  const createActivity = useCallback(
    async (payload: CustomerActivityPayload) => {
      if (!customerId) return
      try {
        const res = await api.post(`/customers/${customerId}/activities`, payload)
        const created = res.data as CustomerActivity
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
    [customerId],
  )

  const updateActivity = useCallback(
    async (id: string, patch: Partial<CustomerActivityPayload>) => {
      if (!customerId) return
      const prev = activities.data
      setActivities((s) => ({
        ...s,
        data: s.data ? s.data.map((a) => (a.id === id ? { ...a, ...patch } : a)) : s.data,
      }))
      try {
        const res = await api.patch(`/customers/${customerId}/activities/${id}`, patch)
        const updated = res.data as CustomerActivity
        setActivities((s) => ({
          ...s,
          data: s.data ? s.data.map((a) => (a.id === id ? updated : a)) : s.data,
        }))
      } catch (err) {
        setActivities((s) => ({ ...s, data: prev }))
        throw err
      }
    },
    [customerId, activities.data],
  )

  const removeActivity = useCallback(
    async (id: string) => {
      if (!customerId) return
      const prev = activities.data
      setActivities((s) => ({
        ...s,
        data: s.data ? s.data.filter((a) => a.id !== id) : s.data,
      }))
      try {
        await api.delete(`/customers/${customerId}/activities/${id}`)
        toast.success('Activity removed')
      } catch (err) {
        setActivities((s) => ({ ...s, data: prev }))
        throw err
      }
    },
    [customerId, activities.data],
  )

  // Optimistic patch helper: merge edits into customer.data without flashing skeleton.
  const applyCustomerPatch = useCallback((patch: Partial<CustomerWithExtras>) => {
    setCustomer((s) => (s.data ? { ...s, data: { ...s.data, ...patch } } : s))
  }, [])

  // ── Manual prescription refetch (used by upload + delete flows) ──
  const refetchPrescriptions = useCallback(async () => {
    if (!customerId) return
    prescriptionsAbortRef.current?.abort()
    const controller = new AbortController()
    prescriptionsAbortRef.current = controller
    try {
      const res = await api.get(`/prescriptions?customerId=${customerId}`, { signal: controller.signal })
      const list = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as any[]
      setPrescriptions({ data: list, loading: false, error: null, attempted: true })
    } catch {
      /* swallow — caller already toasted */
    }
  }, [customerId])

  return {
    customer: { ...customer, refetch: fetchCustomer, applyPatch: applyCustomerPatch },
    ledger: {
      ...ledger,
      refetch: fetchLedger,
      from: ledgerFrom,
      to: ledgerTo,
      setFrom: setLedgerFrom,
      setTo: setLedgerTo,
    },
    invoices: { ...invoices, ensureLoaded: ensureInvoicesLoaded, refetch: fetchInvoices },
    creditNotes: { ...creditNotes, ensureLoaded: ensureCreditNotesLoaded, refetch: fetchCreditNotes },
    payments: { ...payments, ensureLoaded: ensurePaymentsLoaded, refetch: fetchPayments },
    quotations: { ...quotations, ensureLoaded: ensureQuotationsLoaded, refetch: () => { setQuotations((s) => ({ ...s, attempted: false })); void ensureQuotationsLoaded() } },
    prescriptions: { ...prescriptions, ensureLoaded: ensurePrescriptionsLoaded, refetch: refetchPrescriptions },
    activities: {
      ...activities,
      ensureLoaded: ensureActivitiesLoaded,
      create: createActivity,
      update: updateActivity,
      remove: removeActivity,
    },
  }
}
