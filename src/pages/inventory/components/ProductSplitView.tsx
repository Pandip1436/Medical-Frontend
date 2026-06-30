import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Boxes } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { useProductsList, type ProductListFilters } from '../hooks/useProductsList'
import { ProductCompactCard } from './ProductCompactCard'
import { ProductDetailContent } from './ProductDetailContent'

interface ProductSplitViewProps {
  selectedProductId: string | null
  onSelectProduct: (id: string) => void
  onExitSplitView: () => void
  /** Optional tabs rendered in the left rail between search and cards */
  tabsNode?: ReactNode
  /** Controls which fields are rendered in each compact card */
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
  /** Active filters forwarded from the parent page */
  filters?: ProductListFilters
}

export function ProductSplitView({
  selectedProductId,
  onSelectProduct,
  onExitSplitView,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
  filters,
}: ProductSplitViewProps) {
  const list = useProductsList(filters)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)

  // Reset the guard when the in-flight load finishes
  useEffect(() => {
    if (!list.loadingMore) pendingLoadRef.current = false
  }, [list.loadingMore])

  // Infinite scroll — trigger loadMore when sentinel enters viewport.
  // deps intentionally omit data.length to avoid cascade-loading all pages.
  useEffect(() => {
    if (!list.hasMore || !sentinelRef.current) return
    const el = sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pendingLoadRef.current) {
          pendingLoadRef.current = true
          list.loadMore()
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.hasMore, list.loadMore])

  const handleSelect = useCallback((id: string) => onSelectProduct(id), [onSelectProduct])

  // When the list changes (filter/tab applied), keep the selection if it's
  // still visible; otherwise snap to the first item in the new list.
  useEffect(() => {
    if (list.data.length === 0) return
    if (selectedProductId && list.data.some(p => p.id === selectedProductId)) return
    handleSelect(list.data[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data])

  const detailContent = selectedProductId ? (
    <ProductDetailContent productId={selectedProductId} />
  ) : null

  return (
    <SplitViewShell
      searchValue={list.search}
      onSearchChange={list.setSearch}
      searchPlaceholder="Search products…"
      resultCount={list.total}
      resultLabel="product"
      loading={list.loading}
      tabsNode={tabsNode}
      onExitSplitView={onExitSplitView}
      selectedId={selectedProductId}
      cards={
        <>
          {list.data.map((p) => (
            <ProductCompactCard
              key={p.id}
              product={p}
              selected={p.id === selectedProductId}
              onClick={() => onSelectProduct(p.id)}
              isFieldVisible={isCardFieldVisible}
              isFieldRight={isCardFieldRight}
            />
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {list.loadingMore && (
            <div className="flex justify-center py-3">
              <span className="text-[11px] text-muted-foreground">Loading more…</span>
            </div>
          )}
        </>
      }
      detailLoading={false}
      detailError={list.error}
      detailContent={detailContent}
      emptyIcon={<Boxes className="h-8 w-8 text-muted-foreground/40" />}
      emptyLabel="Select a product to view details"
    />
  )
}
