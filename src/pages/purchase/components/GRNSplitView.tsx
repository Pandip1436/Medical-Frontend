import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PackageCheck } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { GRNCompactCard } from './GRNCompactCard'
import { GRNDetailContent } from '../GRNDetailContent'
import { useGRNDetail } from '../hooks/useGRNDetail'
import { formatDate } from '@/lib/utils'
import type { GRN } from '@/types'

function grnPayStatus(grn: GRN): 'PAID' | 'PARTIAL' | 'UNPAID' {
  const balance = Math.max(0, Number(grn.supplierInvoiceAmount || 0) - Number(grn.amountPaid || 0))
  if (balance <= 0.01) return 'PAID'
  if (Number(grn.amountPaid || 0) > 0) return 'PARTIAL'
  return 'UNPAID'
}

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

  // When the list changes (filter/tab applied), keep the selection if it's
  // still visible; otherwise snap to the first item in the new list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (grns.length === 0) return
    if (selectedGrnId && grns.some(g => g.id === selectedGrnId)) return
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <PackageCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-sm font-semibold">{detail.grn.grnNumber}</p>
            {!detail.grn.isReplacement && (
              <span className="shrink-0">
                <StatusBadge status={grnPayStatus(detail.grn)} />
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(detail.grn.date)}
          </p>
        </div>
      </div>
      {/* Scrollable detail body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <GRNDetailContent
          grn={detail.grn}
          allGrns={allGrns}
          onRefresh={() => {
            detail.refetch()
            onRefresh()
          }}
        />
      </div>
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
