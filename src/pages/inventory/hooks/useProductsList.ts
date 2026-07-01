import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { Product } from '@/types'

export interface ProductListFilters {
  categoryId?: string
  schedule?: string
  status?: string
  stockFilter?: 'in_stock' | 'low_stock' | 'out_of_stock'
}

interface UseProductsListResult {
  data: Product[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: string | null
  search: string
  setSearch: (s: string) => void
  loadMore: () => void
  refetch: () => void
}

const PAGE_SIZE = 30

/**
 * Standalone product list hook for the split-view left rail.
 * Independent from ProductsPage's own fetch — manages its own search
 * state and fetches 30 products per page with infinite scroll support.
 * Optional `filters` narrow the results by category, schedule, and status.
 *
 * When `stockFilter` is active, items are filtered client-side after each
 * page fetch. `total` reflects the filtered item count (accurate after all
 * raw pages are loaded). `hasMore` is driven by raw loaded vs server total
 * so infinite scroll continues until every raw page is consumed.
 */
export function useProductsList(filters?: ProductListFilters): UseProductsListResult {
  const [data, setData] = useState<Product[]>([])
  // rawTotal = server-reported total (unfiltered). Used for hasMore logic.
  const [rawTotal, setRawTotal] = useState(0)
  // rawLoaded = raw items fetched so far across all pages (before stockFilter).
  const [rawLoaded, setRawLoaded] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearchState] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const searchRef = useRef(search)
  searchRef.current = search

  const doFetch = useCallback(async (q: string, page: number) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const isFirstPage = page === 1
    if (isFirstPage) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    const f = filtersRef.current
    try {
      const res = await api.get('/products', {
        params: {
          q: q.trim() || undefined,
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          categoryId: f?.categoryId && f.categoryId !== 'all' ? f.categoryId : undefined,
          schedule: f?.schedule && f.schedule !== 'all' ? f.schedule : undefined,
          status: f?.status && f.status !== 'all' ? f.status : undefined,
        },
        signal: ctrl.signal,
      })

      const rawIncoming: Product[] = res.data.data || []
      const newRawTotal: number = res.data.total || 0
      setRawTotal(newRawTotal)

      // Apply client-side stock filter if requested.
      // "in_stock" = any positive stock (aligned with backend's definition).
      // "low_stock" = has stock but below the product's minimum threshold.
      let incoming = rawIncoming
      if (f?.stockFilter) {
        incoming = rawIncoming.filter(p => {
          const stock = p.totalStock || 0
          if (f.stockFilter === 'out_of_stock') return stock <= 0
          if (f.stockFilter === 'low_stock') {
            const min = p.minStock ?? 0
            return stock > 0 && min > 0 && stock < min
          }
          // in_stock: any positive stock
          return stock > 0
        })
      }

      if (isFirstPage) {
        setData(incoming)
        setRawLoaded(rawIncoming.length)
      } else {
        setData(prev => [...prev, ...incoming])
        setRawLoaded(prev => prev + rawIncoming.length)
      }
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load products')
    } finally {
      if (!ctrl.signal.aborted) {
        if (isFirstPage) setLoading(false)
        else setLoadingMore(false)
      }
    }
  }, [])

  const setSearch = useCallback(
    (s: string) => {
      setSearchState(s)
      setCurrentPage(1)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => doFetch(s, 1), 300)
    },
    [doFetch],
  )

  const loadMore = useCallback(() => {
    setCurrentPage(prev => {
      const next = prev + 1
      doFetch(searchRef.current, next)
      return next
    })
  }, [doFetch])

  const refetch = useCallback(() => {
    setCurrentPage(1)
    doFetch(searchRef.current, 1)
  }, [doFetch])

  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setCurrentPage(1)
    setData([])       // clear stale items immediately so the old list doesn't flash
    setRawLoaded(0)
    doFetch(searchRef.current, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doFetch, filtersKey])

  useEffect(() => () => {
    abortRef.current?.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // Guard: don't signal hasMore while page-1 is still in-flight.
  // Without this the IntersectionObserver calls loadMore() immediately,
  // which invokes doFetch(q, 2) and aborts the ongoing page-1 request via
  // AbortController — causing the first page's results to be skipped.
  const hasMore = !loading && (filters?.stockFilter
    ? rawLoaded < rawTotal
    : data.length < rawTotal)

  // When stockFilter active: show filtered item count (what the user sees).
  // Otherwise: show server total (full catalogue size).
  const total = filters?.stockFilter ? data.length : rawTotal

  return { data, total, loading, loadingMore, hasMore, error, search, setSearch, loadMore, refetch }
}
