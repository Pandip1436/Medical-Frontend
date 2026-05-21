import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { useDebounce } from './useDebounce'

interface PaginatedResponse<T> {
  data: T[]
  total: number
  hasMore?: boolean
}

interface UsePaginatedSearchOptions {
  endpoint: string
  pageSize?: number
  debounceMs?: number
  /** Extra query params merged into every request (e.g. customerType, schedule). */
  extraParams?: Record<string, string | number | boolean | undefined>
  /** When false, the hook will not fetch (useful for gating on dropdown open). */
  enabled?: boolean
}

interface UsePaginatedSearchResult<T> {
  items: T[]
  query: string
  setQuery: (v: string) => void
  hasMore: boolean
  loading: boolean
  error: string | null
  loadMore: () => void
  reset: () => void
  total: number
  /** Optimistically update the loaded items in place without refetching. Used
   *  by consumers that mutate individual rows (mark read / delete / resolve)
   *  so the visible list reflects the change before the API round-trip. */
  mutate: (updater: (items: T[]) => T[]) => void
}

/**
 * Server-paginated search with debounced query and infinite scroll.
 *
 * - Resets to page 0 whenever the debounced query or extraParams change.
 * - Appends to items on loadMore().
 * - Cancels in-flight requests via AbortController.
 * - Backend contract: returns { data, total, hasMore? } when `take` param is sent.
 *   When hasMore is absent, computed locally as (skip + data.length) < total.
 */
export function usePaginatedSearch<T>(opts: UsePaginatedSearchOptions): UsePaginatedSearchResult<T> {
  const { endpoint, pageSize = 20, debounceMs = 300, extraParams, enabled = true } = opts

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, debounceMs)
  const [items, setItems] = useState<T[]>([])
  const [skip, setSkip] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  // Monotonic request id — only the most recent fetch is allowed to write
  // back into state. Guards against the "rapid loadMore" race where two
  // requests are in flight and the older one lands second.
  const requestIdRef = useRef(0)
  // Stable key for extraParams to avoid re-renders re-fetching on every render.
  // Sort keys so { a:1, b:2 } and { b:2, a:1 } produce the same string.
  const extraParamsKey = JSON.stringify(
    Object.keys(extraParams ?? {})
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (extraParams as any)[k]
        return acc
      }, {})
  )

  const fetchPage = useCallback(
    async (nextSkip: number, append: boolean) => {
      if (!enabled) return
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const myId = ++requestIdRef.current
      setLoading(true)
      setError(null)
      try {
        const params: Record<string, unknown> = {
          ...(extraParams ?? {}),
          q: debouncedQuery || undefined,
          skip: nextSkip,
          take: pageSize,
        }
        // Drop undefined values to keep URL clean
        Object.keys(params).forEach((k) => params[k] === undefined && delete params[k])
        const res = await api.get<PaginatedResponse<T> | T[]>(endpoint, { params, signal: controller.signal })
        // Stale response: a newer request has been issued — discard.
        if (myId !== requestIdRef.current) return
        // Tolerate both paginated envelope and raw array (older endpoints)
        let data: T[] = []
        let totalCount = 0
        let more = false
        if (Array.isArray(res.data)) {
          data = res.data
          totalCount = data.length
          more = false
        } else {
          data = res.data.data ?? []
          totalCount = res.data.total ?? data.length
          more = typeof res.data.hasMore === 'boolean'
            ? res.data.hasMore
            : nextSkip + data.length < totalCount
        }
        setItems((prev) => (append ? [...prev, ...data] : data))
        setSkip(nextSkip + data.length)
        setHasMore(more)
        setTotal(totalCount)
      } catch (e: unknown) {
        // Axios aborts surface as canceled errors — ignore silently
        const err = e as { name?: string; code?: string; message?: string }
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return
        if (myId !== requestIdRef.current) return
        setError(err?.message ?? 'Failed to load')
      } finally {
        if (myId === requestIdRef.current) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, debouncedQuery, pageSize, extraParamsKey, enabled],
  )

  // Reset and re-fetch when the debounced query or filters change
  useEffect(() => {
    setItems([])
    setSkip(0)
    setHasMore(false)
    setTotal(0)
    fetchPage(0, false)
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, extraParamsKey, enabled])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    fetchPage(skip, true)
  }, [loading, hasMore, skip, fetchPage])

  const reset = useCallback(() => {
    setQuery('')
    setItems([])
    setSkip(0)
    setHasMore(false)
    setTotal(0)
    setError(null)
  }, [])

  const mutate = useCallback((updater: (items: T[]) => T[]) => {
    setItems((prev) => updater(prev))
  }, [])

  return { items, query, setQuery, hasMore, loading, error, loadMore, reset, total, mutate }
}
