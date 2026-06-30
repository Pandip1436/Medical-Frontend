import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Truck } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { SupplierCompactCard } from './SupplierCompactCard'
import { SupplierDetailContent } from './SupplierDetailContent'
import type { Supplier } from '@/types'

interface SupplierSplitViewProps {
  suppliers: Supplier[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
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
  selectedSupplierId,
  onSelectSupplier,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: SupplierSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)

  // Reset the guard when the in-flight load finishes
  useEffect(() => {
    if (!loadingMore) pendingLoadRef.current = false
  }, [loadingMore])

  // Infinite scroll — trigger onLoadMore when sentinel enters viewport.
  // deps intentionally exclude suppliers.length to prevent cascade-loading.
  useEffect(() => {
    if (!hasMore || !onLoadMore || !sentinelRef.current) return
    const el = sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pendingLoadRef.current) {
          pendingLoadRef.current = true
          onLoadMore()
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, onLoadMore])

  // When the list changes (filter/tab applied), keep the selection if it's
  // still visible; otherwise snap to the first item in the new list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (suppliers.length === 0) return
    if (selectedSupplierId && suppliers.some(s => s.id === selectedSupplierId)) return
    onSelectSupplier(suppliers[0].id)
  }, [suppliers])

  const displayed = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q) ||
        s.gstin?.toLowerCase().includes(q),
    )
  }, [suppliers, localSearch])

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) ?? null,
    [suppliers, selectedSupplierId],
  )

  const rightContent = selectedSupplier ? (
    <SupplierDetailContent supplierId={selectedSupplier.id} />
  ) : null

  return (
    <SplitViewShell
      searchValue={localSearch}
      onSearchChange={setLocalSearch}
      searchPlaceholder="Search suppliers…"
      resultCount={displayed.length}
      resultLabel="supplier"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayed.map((s) => (
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
      selectedId={selectedSupplierId}
      detailLoading={false}
      detailError={null}
      detailContent={rightContent}
      emptyIcon={<Truck className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a supplier on the left to see their details"
    />
  )
}
