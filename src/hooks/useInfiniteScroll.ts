import { useEffect, type RefObject } from 'react'

interface UseInfiniteScrollOptions {
  // The scrolling container to observe within (e.g. a ScrollArea viewport).
  root: RefObject<HTMLElement | null>
  // A zero-height marker rendered at the end of the scrollable content.
  sentinel: RefObject<HTMLElement | null>
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  // Distance from the sentinel at which to pre-fetch the next page.
  rootMargin?: string
}

// Fires onLoadMore when the sentinel scrolls into view inside `root`.
// Guards against firing while a load is in flight or when there is no more
// data. Re-runs when the inputs change, so appended pages push the sentinel
// down and the next fetch only triggers on further scrolling.
export function useInfiniteScroll({
  root,
  sentinel,
  hasMore,
  isLoading,
  onLoadMore,
  rootMargin = '150px',
}: UseInfiniteScrollOptions) {
  useEffect(() => {
    const rootEl = root.current
    const target = sentinel.current
    if (!rootEl || !target || !hasMore) return
    // Only drive lazy-load when the container actually scrolls. On layouts
    // where the card grows to fit its content (e.g. mobile, no fixed height),
    // the sentinel would sit permanently in view and fire every page at once.
    if (rootEl.scrollHeight <= rootEl.clientHeight + 4) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          onLoadMore()
        }
      },
      { root: rootEl, rootMargin },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [root, sentinel, hasMore, isLoading, onLoadMore, rootMargin])
}
