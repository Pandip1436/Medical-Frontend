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
  /** Whole-period row count (for pagination). Present when fetched with skip/take. */
  total?: number
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

// ─────────────────────────────────────────────────────────────
// Server-side pagination
// ─────────────────────────────────────────────────────────────

/** Rows per page across every list tab. */
export const CUSTOMER_TAB_PAGE_SIZE = 10

/** Date window passed down from the per-tab period filter / ledger date pickers. */
export type TabRange = { from?: string; to?: string }
/** Extra per-tab query params (e.g. activity `type`). */
type TabExtra = Record<string, string | undefined>

type PagedState<T> = {
  data: T[] | null
  loading: boolean
  error: string | null
  /** True once a page has been requested for this tab (gates first-load logic). */
  attempted: boolean
  /** Current 1-indexed page. */
  page: number
  /** Whole-result row count from the server. */
  total: number
}

function isCanceled(err: any) {
  return err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError'
}

/** Build a `?a=b&c=d` query string, dropping undefined/empty values. */
function qstr(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/**
 * One server-paginated list tab. `buildPath(skip, take, range, extra)` produces
 * the request URL. Returns only the current page in `data`, plus `total` for the
 * pager. Reuses a per-tab AbortController so a slow page can't overwrite a newer
 * one. `refresh()` re-runs the last request (used after optimistic mutations).
 */
function usePagedTab<T>(
  customerId: string | null,
  buildPath: (skip: number, take: number, range?: TabRange, extra?: TabExtra) => string,
  errLabel: string,
) {
  const [state, setState] = useState<PagedState<T>>({
    data: null,
    loading: false,
    error: null,
    attempted: false,
    page: 1,
    total: 0,
  })
  const abortRef = useRef<AbortController | null>(null)
  const lastArgs = useRef<{ page: number; range?: TabRange; extra?: TabExtra }>({ page: 1 })

  const fetchPage = useCallback(
    async (page: number, range?: TabRange, extra?: TabExtra) => {
      if (!customerId) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      lastArgs.current = { page, range, extra }
      setState((s) => ({ ...s, loading: true, error: null, attempted: true, page }))
      try {
        const skip = (page - 1) * CUSTOMER_TAB_PAGE_SIZE
        const path = buildPath(skip, CUSTOMER_TAB_PAGE_SIZE, range, extra)
        const res = await api.get(path, { signal: controller.signal })
        const data = (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as T[]
        const total = Array.isArray(res.data) ? res.data.length : Number(res.data?.total ?? data.length)
        setState({ data, loading: false, error: null, attempted: true, page, total })
      } catch (err: any) {
        if (isCanceled(err)) return
        setState((s) => ({ ...s, loading: false, error: err?.message ?? `Failed to load ${errLabel}`, attempted: true }))
      }
    },
    [customerId, buildPath, errLabel],
  )

  const refresh = useCallback(
    () => fetchPage(lastArgs.current.page, lastArgs.current.range, lastArgs.current.extra),
    [fetchPage],
  )
  const setPage = useCallback((p: number) => setState((s) => ({ ...s, page: p })), [])
  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState({ data: null, loading: false, error: null, attempted: false, page: 1, total: 0 })
  }, [])
  const setData = useCallback((updater: (prev: T[] | null) => T[] | null) => {
    setState((s) => ({ ...s, data: updater(s.data) }))
  }, [])

  return { state, fetchPage, refresh, setPage, reset, setData, abortRef }
}

// ─────────────────────────────────────────────────────────────
// Hook — centralises every API call. Component renders state only.
// Critical-path fetchers (customer, ledger) fire on mount — the ledger also
// powers the KPI strip, so it loads even though Overview is the default tab.
// List tabs are server-paginated: 10 rows/page via `fetchPage`.
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
  const [ledgerPage, setLedgerPage] = useState(1)

  // Ledger date range (debounced refetch)
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')

  // Abort tracking for the two critical-path requests.
  const customerAbortRef = useRef<AbortController | null>(null)
  const ledgerAbortRef = useRef<AbortController | null>(null)

  // ── Paginated list tabs ───────────────────────────────────
  const invoicesPath = useCallback(
    (skip: number, take: number, range?: TabRange) =>
      `/billing${qstr({ customerId: customerId ?? '', skip, take, from: range?.from, to: range?.to })}`,
    [customerId],
  )
  const creditNotesPath = useCallback(
    (skip: number, take: number, range?: TabRange) =>
      `/credit-notes${qstr({ customerId: customerId ?? '', skip, take, from: range?.from, to: range?.to })}`,
    [customerId],
  )
  const paymentsPath = useCallback(
    (skip: number, take: number, range?: TabRange) =>
      `/customers/${customerId}/payments${qstr({ skip, take, from: range?.from, to: range?.to })}`,
    [customerId],
  )
  const quotationsPath = useCallback(
    (skip: number, take: number, range?: TabRange) =>
      `/quotations${qstr({ customerId: customerId ?? '', skip, take, fromDate: range?.from, toDate: range?.to })}`,
    [customerId],
  )
  const prescriptionsPath = useCallback(
    (skip: number, take: number) => `/prescriptions${qstr({ customerId: customerId ?? '', skip, take })}`,
    [customerId],
  )
  const activitiesPath = useCallback(
    (skip: number, take: number, range?: TabRange, extra?: TabExtra) =>
      `/customers/${customerId}/activities${qstr({ skip, take, from: range?.from, to: range?.to, type: extra?.type })}`,
    [customerId],
  )

  const invoicesTab = usePagedTab<any>(customerId, invoicesPath, 'invoices')
  const creditNotesTab = usePagedTab<any>(customerId, creditNotesPath, 'credit notes')
  const paymentsTab = usePagedTab<any>(customerId, paymentsPath, 'payments')
  const quotationsTab = usePagedTab<any>(customerId, quotationsPath, 'quotations')
  const prescriptionsTab = usePagedTab<any>(customerId, prescriptionsPath, 'prescriptions')
  const activitiesTab = usePagedTab<CustomerActivity>(customerId, activitiesPath, 'activities')

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
      if (isCanceled(err)) return
      setCustomer((s) => ({ data: s.data, loading: false, error: err?.message ?? 'Failed to load customer' }))
    }
  }, [customerId])

  const fetchLedger = useCallback(
    async (page = 1) => {
      if (!customerId) return
      ledgerAbortRef.current?.abort()
      const controller = new AbortController()
      ledgerAbortRef.current = controller
      setLedgerPage(page)
      setLedger((s) => ({ ...s, loading: true, error: null }))
      try {
        const skip = (page - 1) * CUSTOMER_TAB_PAGE_SIZE
        const path = `/reports/financial/ledger/${customerId}${qstr({
          from: ledgerFrom,
          to: ledgerTo,
          skip,
          take: CUSTOMER_TAB_PAGE_SIZE,
        })}`
        const res = await api.get(path, { signal: controller.signal })
        setLedger({ data: res.data, loading: false, error: null })
      } catch (err: any) {
        if (isCanceled(err)) return
        setLedger((s) => ({ data: s.data, loading: false, error: err?.message ?? 'Failed to load ledger' }))
      }
    },
    [customerId, ledgerFrom, ledgerTo],
  )

  // On mount / customerId change: fire both critical fetches in parallel and
  // reset every list tab back to its empty/page-1 state.
  useEffect(() => {
    if (!customerId) return
    void Promise.allSettled([fetchCustomer(), fetchLedger(1)])
    invoicesTab.reset()
    creditNotesTab.reset()
    paymentsTab.reset()
    quotationsTab.reset()
    prescriptionsTab.reset()
    activitiesTab.reset()
    return () => {
      customerAbortRef.current?.abort()
      ledgerAbortRef.current?.abort()
    }
    // fetchLedger isn't in deps — date-change has its own debounced effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, fetchCustomer])

  // Debounced ledger refetch on date-range change → always back to page 1.
  useEffect(() => {
    if (!customerId) return
    const handle = setTimeout(() => { void fetchLedger(1) }, 300)
    return () => clearTimeout(handle)
  }, [customerId, ledgerFrom, ledgerTo, fetchLedger])

  // ── Activity mutators (optimistic, then reconcile via refresh) ──
  const createActivity = useCallback(
    async (payload: CustomerActivityPayload) => {
      if (!customerId) return
      try {
        const res = await api.post(`/customers/${customerId}/activities`, payload)
        const created = res.data as CustomerActivity
        // Optimistic prepend for instant feedback…
        activitiesTab.setData((prev) => (prev ? [created, ...prev] : [created]))
        toast.success(
          payload.type === 'REMINDER'
            ? 'Reminder scheduled'
            : `${payload.type.charAt(0)}${payload.type.slice(1).toLowerCase()} logged`,
        )
        // …then reconcile page contents + total with the server.
        await activitiesTab.refresh()
      } catch (err) {
        throw err
      }
    },
    [customerId, activitiesTab],
  )

  const updateActivity = useCallback(
    async (id: string, patch: Partial<CustomerActivityPayload>) => {
      if (!customerId) return
      activitiesTab.setData((prev) => (prev ? prev.map((a) => (a.id === id ? { ...a, ...patch } : a)) : prev))
      try {
        const res = await api.patch(`/customers/${customerId}/activities/${id}`, patch)
        const updated = res.data as CustomerActivity
        activitiesTab.setData((prev) => (prev ? prev.map((a) => (a.id === id ? updated : a)) : prev))
      } catch (err) {
        await activitiesTab.refresh()
        throw err
      }
    },
    [customerId, activitiesTab],
  )

  const removeActivity = useCallback(
    async (id: string) => {
      if (!customerId) return
      activitiesTab.setData((prev) => (prev ? prev.filter((a) => a.id !== id) : prev))
      try {
        await api.delete(`/customers/${customerId}/activities/${id}`)
        toast.success('Activity removed')
        await activitiesTab.refresh()
      } catch (err) {
        await activitiesTab.refresh()
        throw err
      }
    },
    [customerId, activitiesTab],
  )

  // Optimistic patch helper: merge edits into customer.data without flashing skeleton.
  const applyCustomerPatch = useCallback((patch: Partial<CustomerWithExtras>) => {
    setCustomer((s) => (s.data ? { ...s, data: { ...s.data, ...patch } } : s))
  }, [])

  // Stable ledger pager handles — keep these out of inline arrows so the page's
  // effects (keyed on them) don't re-run every render.
  const fetchLedgerPage = useCallback((page: number) => fetchLedger(page), [fetchLedger])
  const refetchLedger = useCallback(() => fetchLedger(ledgerPage), [fetchLedger, ledgerPage])

  return {
    customer: { ...customer, refetch: fetchCustomer, applyPatch: applyCustomerPatch },
    ledger: {
      ...ledger,
      page: ledgerPage,
      total: ledger.data?.total ?? 0,
      from: ledgerFrom,
      to: ledgerTo,
      setFrom: setLedgerFrom,
      setTo: setLedgerTo,
      fetchPage: fetchLedgerPage,
      setPage: setLedgerPage,
      refetch: refetchLedger,
    },
    invoices: {
      ...invoicesTab.state,
      fetchPage: invoicesTab.fetchPage,
      setPage: invoicesTab.setPage,
      refetch: invoicesTab.refresh,
    },
    creditNotes: {
      ...creditNotesTab.state,
      fetchPage: creditNotesTab.fetchPage,
      setPage: creditNotesTab.setPage,
      refetch: creditNotesTab.refresh,
    },
    payments: {
      ...paymentsTab.state,
      fetchPage: paymentsTab.fetchPage,
      setPage: paymentsTab.setPage,
      refetch: paymentsTab.refresh,
    },
    quotations: {
      ...quotationsTab.state,
      fetchPage: quotationsTab.fetchPage,
      setPage: quotationsTab.setPage,
      refetch: quotationsTab.refresh,
    },
    prescriptions: {
      ...prescriptionsTab.state,
      fetchPage: prescriptionsTab.fetchPage,
      setPage: prescriptionsTab.setPage,
      refetch: prescriptionsTab.refresh,
    },
    activities: {
      ...activitiesTab.state,
      fetchPage: activitiesTab.fetchPage,
      setPage: activitiesTab.setPage,
      refetch: activitiesTab.refresh,
      create: createActivity,
      update: updateActivity,
      remove: removeActivity,
    },
  }
}
