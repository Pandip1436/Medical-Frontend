import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { QuotationCompactCard } from './QuotationCompactCard'
import { QuotationDetailContent } from './QuotationDetailContent'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Quotation, QuotationStatus } from '../QuotationsPage'

const statusBadgeVariant: Record<QuotationStatus, 'success' | 'warning' | 'info' | 'purple' | 'destructive' | 'secondary'> = {
  CONVERTED: 'success',
  ACCEPTED: 'success',
  SENT: 'info',
  DRAFT: 'secondary',
  REJECTED: 'destructive',
}

const statusLabel: Record<QuotationStatus, string> = {
  CONVERTED: 'Converted',
  ACCEPTED: 'Accepted',
  SENT: 'Sent',
  DRAFT: 'Draft',
  REJECTED: 'Rejected',
}

interface QuotationSplitViewProps {
  quotations: Quotation[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  selectedQuotationId: string | null
  onSelectQuotation: (id: string | null) => void
  onExitSplitView: () => void
  onRefresh: () => void
  tabsNode?: ReactNode
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
}

export function QuotationSplitView({
  quotations,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  selectedQuotationId,
  onSelectQuotation,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: QuotationSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')

  // ── Infinite scroll sentinel ──
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)

  useEffect(() => {
    if (!loadingMore) pendingLoadRef.current = false
  }, [loadingMore])

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
    if (quotations.length === 0) return
    if (selectedQuotationId && quotations.some(q => q.id === selectedQuotationId)) return
    onSelectQuotation(quotations[0].id)
  }, [quotations])

  const displayed = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return quotations
    return quotations.filter(
      (qt) =>
        qt.quotationNumber.toLowerCase().includes(q) ||
        qt.customerName.toLowerCase().includes(q),
    )
  }, [quotations, localSearch])

  const selectedQuotation = useMemo(
    () => quotations.find((qt) => qt.id === selectedQuotationId) ?? null,
    [quotations, selectedQuotationId],
  )

  const rightContent = selectedQuotation ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold">{selectedQuotation.quotationNumber}</p>
            <Badge variant={statusBadgeVariant[selectedQuotation.status]} size="sm" dot>
              {statusLabel[selectedQuotation.status]}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(selectedQuotation.date)} · {selectedQuotation.customerName}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <QuotationDetailContent
          quotation={selectedQuotation}
          onUpdated={() => {
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
      searchPlaceholder="Search quotations…"
      resultCount={displayed.length}
      resultLabel="quotation"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayed.map((qt) => (
            <QuotationCompactCard
              key={qt.id}
              quotation={qt}
              selected={qt.id === selectedQuotationId}
              onClick={() => onSelectQuotation(qt.id)}
              isFieldVisible={isCardFieldVisible}
              isFieldRight={isCardFieldRight}
            />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex justify-center py-3">
              <span className="text-[11px] text-muted-foreground">Loading more…</span>
            </div>
          )}
        </>
      }
      onExitSplitView={onExitSplitView}
      selectedId={selectedQuotationId}
      detailLoading={false}
      detailError={null}
      detailContent={rightContent}
      emptyIcon={<FileText className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a quotation on the left to see its details"
    />
  )
}
