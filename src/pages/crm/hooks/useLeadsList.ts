import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageFilter } from '@/hooks/usePageFilter'
import type {
  Lead,
  LeadListCounts,
  LeadSource,
  LeadStage,
  LeadTab,
} from '../types'
import { USE_MOCK_DATA, mockFilteredLeads, mockCounts } from '../mockData'

interface UseLeadsListOptions {
  tab?: LeadTab
  pageSize?: number
}

export interface LeadsFilters {
  q: string
  stage: LeadStage[]
  source: LeadSource[]
  assignedToUserId?: string
  /**
   * Cached label for the selected sales person so the filter chip can render
   * the name without a second fetch. Kept in client state only — never sent
   * to the API.
   */
  assignedToUserName?: string
  createdFrom?: string
  createdTo?: string
  updatedFrom?: string
  updatedTo?: string
}

const emptyCounts: LeadListCounts = {
  all: 0,
  open: 0,
  closed: 0,
  untouched: 0,
  lead: 0,
  qualified: 0,
  proposal: 0,
  negotiation: 0,
  won: 0,
  lost: 0,
}

/**
 * Server-paginated leads list with debounced search + tab counts.
 *
 * Fires one request whenever (debouncedQuery, filters, tab, page) changes,
 * and exposes the same shape the backend returns. Tab counts come back in
 * the same payload so the top-bar pills can update in sync with the table.
 */
export function useLeadsList(opts: UseLeadsListOptions = {}) {
  const pageSize = opts.pageSize ?? 30

  const [tab, setTab] = usePageFilter<LeadTab>('crm.leads', 'tab', opts.tab ?? 'all')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = usePageFilter<LeadsFilters>('crm.leads', 'filters', {
    q: '',
    stage: [],
    source: [],
  })

  const debouncedQ = useDebounce(filters.q, 300)

  const [data, setData] = useState<Lead[]>([])
  const [allData, setAllData] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<LeadListCounts>(emptyCounts)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const refetch = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)

    // Mock-data short circuit — see src/pages/crm/mockData.ts. Flip
    // USE_MOCK_DATA = false there once the real IndiaMART feed is live.
    if (USE_MOCK_DATA) {
      const filtered = mockFilteredLeads({
        q: debouncedQ,
        tab,
        stage: filters.stage,
        source: filters.source,
      })
      const start = (page - 1) * pageSize
      // Spread each lead into a new object — mock helpers mutate MOCK_LEADS
      // in place, and child components that compare lead refs (or any inner
      // memoization) would otherwise see "same reference" and skip the
      // re-render, leaving the stage badge stale in the rail.
      const slice = filtered.slice(start, start + pageSize).map((l) => ({ ...l }))
      setData(slice)
      setAllData(prev => page === 1 ? slice : [...prev, ...slice])
      setTotal(filtered.length)
      setCounts(mockCounts(filtered))
      setLoading(false)
      return
    }

    try {
      const params: Record<string, string | number> = {
        page,
        take: pageSize,
        tab,
      }
      if (debouncedQ) params.q = debouncedQ
      if (filters.stage.length > 0) params.stage = filters.stage.join(',')
      if (filters.source.length > 0) params.source = filters.source.join(',')
      if (filters.assignedToUserId) params.assignedToUserId = filters.assignedToUserId
      if (filters.createdFrom) params.createdFrom = filters.createdFrom
      if (filters.createdTo) params.createdTo = filters.createdTo
      if (filters.updatedFrom) params.updatedFrom = filters.updatedFrom
      if (filters.updatedTo) params.updatedTo = filters.updatedTo
      const res = await api.get('/leads', {
        params,
        signal: ctrl.signal,
      })
      const payload = res.data ?? {}
      const items = Array.isArray(payload.data) ? payload.data : []
      setData(items)
      setAllData(prev => page === 1 ? items : [...prev, ...items])
      setTotal(Number(payload.total ?? 0))
      setCounts(payload.counts ?? emptyCounts)
    } catch (err: unknown) {
      // Axios v1 aborts surface as ERR_CANCELED — ignore those.
      const e = err as { code?: string; message?: string; name?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load leads')
      setData([])
      setTotal(0)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [
    page,
    pageSize,
    tab,
    debouncedQ,
    filters.stage,
    filters.source,
    filters.assignedToUserId,
    filters.createdFrom,
    filters.createdTo,
    filters.updatedFrom,
    filters.updatedTo,
  ])

  useEffect(() => {
    refetch()
    return () => abortRef.current?.abort()
  }, [refetch])

  // Reset page to 1 (and the accumulated allData) whenever the *filters*
  // change (so the user never lands on an empty page-3 after narrowing).
  // Tab changes also reset.
  useEffect(() => {
    setAllData([])
    setPage(1)
  }, [
    debouncedQ,
    filters.stage,
    filters.source,
    filters.assignedToUserId,
    filters.createdFrom,
    filters.createdTo,
    filters.updatedFrom,
    filters.updatedTo,
    tab,
  ])

  const activeFilterCount =
    (filters.stage.length > 0 ? 1 : 0) +
    (filters.source.length > 0 ? 1 : 0) +
    (filters.assignedToUserId ? 1 : 0) +
    (filters.createdFrom || filters.createdTo ? 1 : 0) +
    (filters.updatedFrom || filters.updatedTo ? 1 : 0)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    // data
    data,
    allData,
    total,
    counts,
    loading,
    error,
    // infinite scroll helpers
    loadingMore: loading && page > 1,
    hasMore: allData.length < total,
    loadMore: () => setPage(p => p + 1),
    // pagination
    page,
    setPage,
    pageSize,
    totalPages,
    // tab
    tab,
    setTab,
    // filters
    filters,
    setFilters,
    activeFilterCount,
    clearFilters: () =>
      setFilters({ q: filters.q, stage: [], source: [] }),
    setAssignedTo: (next: { id: string; name: string } | null) =>
      setFilters((prev) => ({
        ...prev,
        assignedToUserId: next?.id,
        assignedToUserName: next?.name,
      })),
    // actions
    refetch,
  }
}
