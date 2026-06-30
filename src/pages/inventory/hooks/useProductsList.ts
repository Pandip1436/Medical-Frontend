import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import type { Product } from '@/types'

export interface ProductListFilters {
  categoryId?: string
  schedule?: string
  status?: string
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
 */
export function useProductsList(filters?: ProductListFilters): UseProductsListResult {
  const [data, setData] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearchState] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep a ref to the latest filter/search values so doFetch always uses them.
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const searchRef = useRef(search)
  searchRef.current = search

  const doFetch = useCallback(async (q: string, page: number) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const isFirstPage = page === 1
    if (isFirstPage) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
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
      const incoming: Product[] = res.data.data || []
      const newTotal: number = res.data.total || 0
      setTotal(newTotal)
      if (isFirstPage) {
        setData(incoming)
      } else {
        setData(prev => [...prev, ...incoming])
      }
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load products')
    } finally {
      if (!ctrl.signal.aborted) {
        if (isFirstPage) {
          setLoading(false)
        } else {
          setLoadingMore(false)
        }
      }
    }
  }, [])

  const setSearch = useCallback(
    (s: string) => {
      setSearchState(s)
      // Reset to page 1 and clear accumulated data when search changes
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

  // Re-fetch (reset to page 1) when filters change.
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setCurrentPage(1)
    doFetch(searchRef.current, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doFetch, filtersKey])

  // Cleanup on unmount.
  useEffect(() => () => {
    abortRef.current?.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const hasMore = data.length < total

  return { data, total, loading, loadingMore, hasMore, error, search, setSearch, loadMore, refetch }
}
