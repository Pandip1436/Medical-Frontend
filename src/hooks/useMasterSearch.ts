import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { useDebounce } from './useDebounce'

// One result item, normalized across all 8 backend entity types so the
// command palette can render them with the same row component.
export type MasterSearchResultItem = {
  id: string
  title: string
  subtitle: string
  href: string
}

export type MasterSearchType =
  | 'customer'
  | 'supplier'
  | 'product'
  | 'invoice'
  | 'quotation'
  | 'purchase-order'
  | 'grn'
  | 'credit-note'

export type MasterSearchGroup = {
  type: MasterSearchType
  label: string
  items: MasterSearchResultItem[]
  // Total matching rows available on the server. For endpoints that don't
  // return a count (raw-array responses), this equals items.length and
  // hasMore is false — there is no way to ask for more from the client.
  total: number
  // Initial fetch in flight (skip=0)
  loading: boolean
  // Subsequent page fetch in flight (skip>0)
  loadingMore: boolean
  // True when items.length < total (more pages available)
  hasMore: boolean
}

export interface UseMasterSearchResult {
  results: MasterSearchGroup[]
  loadMore: (type: MasterSearchType) => void
  loading: boolean
  totalCount: number
}

// Endpoint + label + display order. The dropdown renders groups in this
// sequence — Customers first because phone/name lookups are the most common
// motivation for opening the master search.
const GROUP_ORDER: { type: MasterSearchType; label: string; endpoint: string; extraParams?: Record<string, string | number> }[] = [
  { type: 'customer', label: 'Customers', endpoint: '/customers' },
  { type: 'product', label: 'Products', endpoint: '/products' },
  { type: 'invoice', label: 'Invoices', endpoint: '/billing', extraParams: { type: 'INVOICE' } },
  { type: 'supplier', label: 'Suppliers', endpoint: '/suppliers' },
  { type: 'quotation', label: 'Quotations', endpoint: '/quotations' },
  { type: 'purchase-order', label: 'Purchase Orders', endpoint: '/purchase-orders' },
  { type: 'grn', label: 'Goods Receipts (GRN)', endpoint: '/grn' },
  { type: 'credit-note', label: 'Credit Notes', endpoint: '/credit-notes' },
]

const MIN_QUERY_LEN = 2
const INITIAL_PAGE_SIZE = 8
const LOAD_MORE_PAGE_SIZE = 15

function formatCurrency(n: unknown): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function formatDate(s: unknown): string {
  if (!s) return ''
  const d = new Date(s as string)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Extract rows + total from any of three response shapes that exist across
// our backends:
//   1. raw array (legacy endpoints like quotations)        → total = array.length
//   2. { data, total, hasMore? } envelope (skip/take)      → total = total
//   3. { data, page, pageSize, total } envelope (GRN, POs) → total = total
// Returns the rows plus the best total we can compute.
function extractRowsAndTotal(payload: unknown): { rows: any[]; total: number } {
  if (Array.isArray(payload)) {
    return { rows: payload, total: payload.length }
  }
  if (payload && typeof payload === 'object') {
    const p = payload as { data?: unknown; total?: number }
    const data = Array.isArray(p.data) ? p.data : []
    const total = typeof p.total === 'number' ? p.total : data.length
    return { rows: data, total }
  }
  return { rows: [], total: 0 }
}

function mapRows(type: MasterSearchType, rows: any[]): MasterSearchResultItem[] {
  switch (type) {
    case 'customer':
      return rows.map((r) => ({
        id: r.id,
        title: r.name ?? '—',
        subtitle: [r.phone, r.type].filter(Boolean).join(' · '),
        href: `/customers/detail?customerId=${r.id}`,
      }))
    case 'supplier':
      return rows.map((r) => ({
        id: r.id,
        title: r.name ?? '—',
        subtitle: [r.phone, r.gstin].filter(Boolean).join(' · '),
        href: `/purchase/suppliers/detail?supplierId=${r.id}`,
      }))
    case 'product':
      return rows.map((r) => ({
        id: r.id,
        title: r.name ?? '—',
        subtitle: [r.manufacturer, r.totalStock != null ? `Stk ${r.totalStock}` : null].filter(Boolean).join(' · '),
        href: `/inventory/products?q=${encodeURIComponent(r.name ?? '')}`,
      }))
    case 'invoice':
      return rows.map((r) => ({
        id: r.id,
        title: r.invoiceNumber ?? '—',
        subtitle: [r.customerName, formatCurrency(r.grandTotal), r.status].filter(Boolean).join(' · '),
        href: `/customers/invoices/detail?id=${r.id}`,
      }))
    case 'quotation':
      return rows.map((r) => ({
        id: r.id,
        title: r.quotationNumber ?? '—',
        subtitle: [r.customerName, formatCurrency(r.total)].filter(Boolean).join(' · '),
        href: `/billing/quotations?q=${encodeURIComponent(r.quotationNumber ?? '')}`,
      }))
    case 'purchase-order':
      return rows.map((r) => ({
        id: r.id,
        title: r.poNumber ?? '—',
        subtitle: [r.supplierName, formatCurrency(r.total)].filter(Boolean).join(' · '),
        href: `/purchase/orders?q=${encodeURIComponent(r.poNumber ?? '')}`,
      }))
    case 'grn':
      return rows.map((r) => ({
        id: r.id,
        title: r.grnNumber ?? '—',
        subtitle: [r.supplierName, formatDate(r.date ?? r.createdAt)].filter(Boolean).join(' · '),
        href: `/purchase/grn-list?q=${encodeURIComponent(r.grnNumber ?? '')}`,
      }))
    case 'credit-note':
      return rows.map((r) => ({
        id: r.id,
        title: r.creditNoteNo ?? r.creditNoteNumber ?? '—',
        subtitle: [r.customerName, formatCurrency(r.totalAmount ?? r.total)].filter(Boolean).join(' · '),
        href: `/billing/credit-notes?q=${encodeURIComponent(r.creditNoteNo ?? r.creditNoteNumber ?? '')}`,
      }))
  }
}

function makeEmptyGroup(g: { type: MasterSearchType; label: string }): MasterSearchGroup {
  return {
    type: g.type,
    label: g.label,
    items: [],
    total: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
  }
}

/**
 * Global master search with per-group pagination. Debounces the query and
 * fans out parallel GETs for the initial page; each group exposes a
 * `loadMore(type)` action that pulls the next page when the user clicks
 * "Load more" in the dropdown. Aborts in-flight requests when the query
 * changes so only the latest set lands.
 */
export function useMasterSearch(query: string): UseMasterSearchResult {
  const debouncedQuery = useDebounce(query, 250)
  const [results, setResults] = useState<MasterSearchGroup[]>(() => GROUP_ORDER.map(makeEmptyGroup))
  // Monotonic id so a stale group response (older query) can't overwrite the
  // newer state — necessary because abort() races with response buffering.
  const queryIdRef = useRef(0)
  const initialAbortRef = useRef<AbortController | null>(null)
  // Independent abort controllers per group for load-more — a load-more on
  // group A shouldn't cancel a parallel load-more on group B.
  const loadMoreAbortRef = useRef<Partial<Record<MasterSearchType, AbortController>>>({})
  // Current query that load-more operations should use. Captured at fetch
  // time so a load-more triggered before the next debounced query lands
  // still uses the right `q`.
  const currentQueryRef = useRef('')

  // Initial fetch: triggered on debounced query change. Sends parallel
  // skip=0 requests with INITIAL_PAGE_SIZE per group.
  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    currentQueryRef.current = trimmed

    // Reset everything when query goes empty / too short.
    if (trimmed.length < MIN_QUERY_LEN) {
      if (initialAbortRef.current) initialAbortRef.current.abort()
      Object.values(loadMoreAbortRef.current).forEach((c) => c?.abort())
      loadMoreAbortRef.current = {}
      initialAbortRef.current = null
      setResults(GROUP_ORDER.map(makeEmptyGroup))
      return
    }

    // Cancel any in-flight initial fetch and all load-mores from the prior query
    if (initialAbortRef.current) initialAbortRef.current.abort()
    Object.values(loadMoreAbortRef.current).forEach((c) => c?.abort())
    loadMoreAbortRef.current = {}

    const controller = new AbortController()
    initialAbortRef.current = controller
    const myId = ++queryIdRef.current

    // Mark every group as loading + clear previous items
    setResults(
      GROUP_ORDER.map((g) => ({
        ...makeEmptyGroup(g),
        loading: true,
      })),
    )

    GROUP_ORDER.forEach((group) => {
      api
        .get(group.endpoint, {
          params: {
            q: trimmed,
            skip: 0,
            take: INITIAL_PAGE_SIZE,
            ...(group.extraParams ?? {}),
          },
          signal: controller.signal,
        })
        .then((res) => {
          if (myId !== queryIdRef.current) return
          const { rows, total } = extractRowsAndTotal(res.data)
          const items = mapRows(group.type, rows)
          setResults((prev) =>
            prev.map((g) =>
              g.type === group.type
                ? {
                    ...g,
                    items,
                    total,
                    loading: false,
                    loadingMore: false,
                    hasMore: items.length < total,
                  }
                : g,
            ),
          )
        })
        .catch((err: unknown) => {
          const e = err as { name?: string; code?: string }
          if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return
          if (myId !== queryIdRef.current) return
          // On failure clear this group only — don't tank the whole palette.
          setResults((prev) =>
            prev.map((g) => (g.type === group.type ? { ...makeEmptyGroup(group), loading: false } : g)),
          )
        })
    })

    return () => {
      controller.abort()
    }
  }, [debouncedQuery])

  // Load next page for one group. No-op if already loading, no more pages,
  // or the current query is too short.
  const loadMore = useCallback((type: MasterSearchType) => {
    const trimmed = currentQueryRef.current
    if (trimmed.length < MIN_QUERY_LEN) return

    const groupDef = GROUP_ORDER.find((g) => g.type === type)
    if (!groupDef) return

    let proceed = true
    let currentSkip = 0
    setResults((prev) => {
      const next = prev.map((g) => {
        if (g.type !== type) return g
        if (g.loading || g.loadingMore || !g.hasMore) {
          proceed = false
          return g
        }
        currentSkip = g.items.length
        return { ...g, loadingMore: true }
      })
      return next
    })

    if (!proceed) return

    // Cancel any prior load-more in flight for this group only
    loadMoreAbortRef.current[type]?.abort()
    const controller = new AbortController()
    loadMoreAbortRef.current[type] = controller
    const myId = queryIdRef.current

    api
      .get(groupDef.endpoint, {
        params: {
          q: trimmed,
          skip: currentSkip,
          take: LOAD_MORE_PAGE_SIZE,
          ...(groupDef.extraParams ?? {}),
        },
        signal: controller.signal,
      })
      .then((res) => {
        if (myId !== queryIdRef.current) return
        const { rows, total } = extractRowsAndTotal(res.data)
        const newItems = mapRows(type, rows)
        setResults((prev) =>
          prev.map((g) => {
            if (g.type !== type) return g
            const merged = [...g.items, ...newItems]
            return {
              ...g,
              items: merged,
              total: Math.max(g.total, total),
              loadingMore: false,
              hasMore: merged.length < Math.max(g.total, total),
            }
          }),
        )
      })
      .catch((err: unknown) => {
        const e = err as { name?: string; code?: string }
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return
        if (myId !== queryIdRef.current) return
        // On failure just stop the spinner — keep existing items so the
        // user doesn't lose their context.
        setResults((prev) => prev.map((g) => (g.type === type ? { ...g, loadingMore: false } : g)))
      })
  }, [])

  const loading = results.some((g) => g.loading)
  const totalCount = results.reduce((acc, g) => acc + g.items.length, 0)

  return { results, loadMore, loading, totalCount }
}
