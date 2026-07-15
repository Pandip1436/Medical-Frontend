import { useCallback, useState } from 'react'

// Standard rows-per-page options offered by the DataTablePagination selector.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

/**
 * Configurable, persisted rows-per-page for a list page.
 *
 * Returns `[pageSize, setPageSize]`. The setter persists the choice to
 * localStorage under `storageKey` so it sticks across visits. Callers should
 * typically also reset the current page to 1 when the size changes, e.g.:
 *
 *   const [pageSize, setPageSize] = usePageSize('pbims.invoices.pageSize', 10)
 *   ...
 *   onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
 */
export function usePageSize(
  storageKey: string,
  defaultSize = 10,
): readonly [number, (n: number) => void] {
  const [pageSize, setPageSizeState] = useState<number>(() => {
    const stored = Number(localStorage.getItem(storageKey))
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(stored) ? stored : defaultSize
  })

  const setPageSize = useCallback(
    (n: number) => {
      setPageSizeState(n)
      try {
        localStorage.setItem(storageKey, String(n))
      } catch {
        /* localStorage unavailable — non-fatal */
      }
    },
    [storageKey],
  )

  return [pageSize, setPageSize] as const
}
