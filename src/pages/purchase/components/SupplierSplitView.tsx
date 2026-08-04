import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Truck } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel'
import { SupplierCompactCard } from './SupplierCompactCard'
import { SupplierDetailContent } from './SupplierDetailContent'
import type { Supplier } from '@/types'

interface SupplierSplitViewProps {
  suppliers: Supplier[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  /** Total matches across ALL pages (server count) — shown in the count strip. */
  total?: number
  /** Server-side search (the `q` param) so search spans the full directory,
      not just the pages already loaded into `suppliers`. */
  searchValue: string
  onSearchChange: (v: string) => void
  selectedSupplierId: string | null
  onSelectSupplier: (id: string | null) => void
  onExitSplitView: () => void
  onRefresh: () => void
  tabsNode?: ReactNode
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
}

export function SupplierSplitView({
  suppliers,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  total,
  searchValue,
  onSearchChange,
  selectedSupplierId,
  onSelectSupplier,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: SupplierSplitViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  useInfiniteScrollSentinel(sentinelRef, { hasMore, onLoadMore, itemCount: suppliers.length })

  // When the list changes (filter/tab/search applied), keep the selection if
  // it's still visible; otherwise snap to the first item in the new list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (suppliers.length === 0) return
    if (selectedSupplierId && suppliers.some(s => s.id === selectedSupplierId)) return
    onSelectSupplier(suppliers[0].id)
  }, [suppliers])

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) ?? null,
    [suppliers, selectedSupplierId],
  )

  const rightContent = selectedSupplier ? (
    <SupplierDetailContent supplierId={selectedSupplier.id} />
  ) : null

  return (
    <SplitViewShell
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search suppliers…"
      resultCount={total ?? suppliers.length}
      resultLabel="supplier"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {suppliers.map((s) => (
            <SupplierCompactCard
              key={s.id}
              supplier={s}
              selected={s.id === selectedSupplierId}
              onClick={() => onSelectSupplier(s.id)}
              isFieldVisible={isCardFieldVisible}
              isFieldRight={isCardFieldRight}
            />
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex justify-center py-3">
              <span className="text-[11px] text-muted-foreground">Loading more…</span>
            </div>
          )}
        </>
      }
      onExitSplitView={onExitSplitView}
      onBackToList={() => onSelectSupplier(null)}
      selectedId={selectedSupplierId}
      detailLoading={false}
      detailError={null}
      detailContent={rightContent}
      emptyIcon={<Truck className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a supplier on the left to see their details"
    />
  )
}
