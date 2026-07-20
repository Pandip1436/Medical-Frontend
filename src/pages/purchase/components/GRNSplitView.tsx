import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PackageCheck } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { GRNCompactCard } from './GRNCompactCard'
import { GRNDetailContent } from '../GRNDetailContent'
import { useGRNDetail } from '../hooks/useGRNDetail'
import type { GRN } from '@/types'

interface GRNSplitViewProps {
  /** Already filtered list from the parent page */
  grns: GRN[]
  /** Full unfiltered list — needed by GRNDetailContent for shortage resolution */
  allGrns: GRN[]
  loading: boolean
  /** True while an additional page is being fetched (page > 1) */
  loadingMore?: boolean
  /** Whether there are more pages to load */
  hasMore?: boolean
  /** Called when the sentinel enters the viewport to request the next page */
  onLoadMore?: () => void
  selectedGrnId: string | null
  onSelectGrn: (id: string | null) => void
  onExitSplitView: () => void
  onRefresh: () => void
  /** Optional tabs rendered in the left rail between search and cards */
  tabsNode?: ReactNode
  /** Controls which fields are rendered in each compact card */
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
}

export function GRNSplitView({
  grns,
  allGrns,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  selectedGrnId,
  onSelectGrn,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: GRNSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')
  const detail = useGRNDetail(selectedGrnId)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)

  // Reset the guard when the in-flight load finishes
  useEffect(() => {
    if (!loadingMore) pendingLoadRef.current = false
  }, [loadingMore])

  // Infinite scroll — trigger onLoadMore when sentinel enters viewport.
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

  // Auto-select the first row ONLY when nothing is selected yet. Never snap
  // away from a set selection just because it isn't on the current page — the
  // detail panel fetches it by id, and snapping broke deep links (opening a PE
  // via a notification whose row lives on a later page would jump to the first).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (grns.length === 0) return
    if (selectedGrnId) return
    onSelectGrn(grns[0].id)
  }, [grns])

  const displayedGrns = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return grns
    return grns.filter(
      (g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        (g.supplierInvoiceNo ?? '').toLowerCase().includes(q),
    )
  }, [grns, localSearch])

  const rightContent = detail.grn ? (
    // GRNDetailContent now owns the header (PE number + status + actions), its
    // own scroll, and the static totals footer.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <GRNDetailContent
        grn={detail.grn}
        allGrns={allGrns}
        onRefresh={() => {
          detail.refetch()
          onRefresh()
        }}
      />
    </div>
  ) : null

  return (
    <SplitViewShell
      searchValue={localSearch}
      onSearchChange={setLocalSearch}
      searchPlaceholder="Search PE #, supplier or invoice…"
      resultCount={displayedGrns.length}
      resultLabel="purchase entry"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayedGrns.map((grn) => (
            <GRNCompactCard
              key={grn.id}
              grn={grn}
              selected={grn.id === selectedGrnId}
              onClick={() => onSelectGrn(grn.id)}
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
      onBackToList={() => onSelectGrn(null)}
      selectedId={selectedGrnId}
      detailLoading={detail.loading}
      detailError={detail.error}
      detailContent={rightContent}
      emptyIcon={<PackageCheck className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a purchase entry on the left to see its details"
    />
  )
}
