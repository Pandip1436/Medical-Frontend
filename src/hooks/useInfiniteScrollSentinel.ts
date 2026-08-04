import { useEffect, useRef, type RefObject } from 'react'

/**
 * Hardened infinite-scroll sentinel. Attach the returned ref target (a small
 * element rendered after the last list item) and this fires `onLoadMore` as it
 * nears the viewport.
 *
 * Fixes the fragile pattern that previously shipped in every split view:
 *  - `rootMargin: 300px` pre-loads before the user hits the exact bottom;
 *  - the observer RE-ARMS whenever `itemCount` changes, so a fresh observer is
 *    attached after each appended page (the old code only re-ran on
 *    [hasMore, onLoadMore], so it could stall after page 1);
 *  - a per-`itemCount` guard fires `onLoadMore` at most ONCE per loaded page,
 *    so a sentinel that stays on-screen (short list / large viewport) keeps
 *    filling one page at a time instead of firing a burst — and it can never
 *    get permanently stuck the way the old `pendingLoadRef` could.
 *
 * `onLoadMore` should ideally be a stable reference (useCallback); correctness
 * holds either way thanks to the guard.
 */
export function useInfiniteScrollSentinel(
  sentinelRef: RefObject<HTMLElement | null>,
  opts: { hasMore?: boolean; onLoadMore?: () => void; itemCount: number },
): void {
  const { hasMore, onLoadMore, itemCount } = opts
  // Tracks the itemCount for which we've already requested the next page, so a
  // sentinel that remains intersecting doesn't re-fire until new items arrive.
  const firedForCountRef = useRef(-1)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || !onLoadMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && firedForCountRef.current !== itemCount) {
          firedForCountRef.current = itemCount
          onLoadMore()
        }
      },
      { root: null, rootMargin: '300px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [sentinelRef, hasMore, onLoadMore, itemCount])
}
