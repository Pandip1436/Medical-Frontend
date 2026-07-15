import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { PurchaseOrderCompactCard } from './PurchaseOrderCompactCard'
import { PurchaseOrderDetailContent } from './PurchaseOrderDetailContent'
import { usePurchaseOrderDetail } from '../hooks/usePurchaseOrderDetail'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { PurchaseOrder } from '@/types'

const statusBadgeConfig: Record<
  string,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' | 'purple' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SENT: { label: 'Sent', variant: 'info' },
  ACKNOWLEDGED: { label: 'Confirmed', variant: 'success' },
  PARTIALLY_RECEIVED: { label: 'Partial', variant: 'warning' },
  FULLY_RECEIVED: { label: 'Received', variant: 'success' },
  CLOSED: { label: 'Closed', variant: 'purple' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

interface PurchaseOrderSplitViewProps {
  purchaseOrders: PurchaseOrder[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  selectedPoId: string | null
  onSelectPo: (id: string | null) => void
  onExitSplitView: () => void
  onRefresh: () => void
  tabsNode?: ReactNode
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
}

export function PurchaseOrderSplitView({
  purchaseOrders,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  selectedPoId,
  onSelectPo,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: PurchaseOrderSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')
  const detail = usePurchaseOrderDetail(selectedPoId)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)

  // Reset guard when the in-flight load finishes
  useEffect(() => {
    if (!loadingMore) pendingLoadRef.current = false
  }, [loadingMore])

  // Infinite scroll — trigger onLoadMore when sentinel enters viewport
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
    if (purchaseOrders.length === 0) return
    if (selectedPoId && purchaseOrders.some(po => po.id === selectedPoId)) return
    onSelectPo(purchaseOrders[0].id)
  }, [purchaseOrders])

  const displayed = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return purchaseOrders
    return purchaseOrders.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q),
    )
  }, [purchaseOrders, localSearch])

  const selectedPO = detail.purchaseOrder
  const cfg = selectedPO ? (statusBadgeConfig[selectedPO.status] ?? { label: selectedPO.status, variant: 'secondary' as const }) : null

  const rightContent = selectedPoId ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {selectedPO && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-mono text-sm font-semibold">{selectedPO.poNumber}</p>
              {cfg && (
                <Badge variant={cfg.variant} size="sm" dot className="shrink-0">
                  {cfg.label}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {formatDate(selectedPO.date)}
            </p>
          </div>
        </div>
      )}
      {/* No overflow-y-auto here: PurchaseOrderDetailContent manages its own
          scroll (scrollable body + sticky footer with the action buttons).
          Wrapping it in a second scroll container unbounds its height and
          pushes the footer buttons off-screen — so this is just a bounded flex
          column that clips. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {detail.purchaseOrder && (
          <PurchaseOrderDetailContent
            purchaseOrder={detail.purchaseOrder}
            onRefresh={() => {
              detail.refetch()
              onRefresh()
            }}
          />
        )}
      </div>
    </div>
  ) : null

  return (
    <SplitViewShell
      searchValue={localSearch}
      onSearchChange={setLocalSearch}
      searchPlaceholder="Search PO# or supplier…"
      resultCount={displayed.length}
      resultLabel="purchase order"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayed.map((po) => (
            <PurchaseOrderCompactCard
              key={po.id}
              purchaseOrder={po}
              selected={po.id === selectedPoId}
              onClick={() => onSelectPo(po.id)}
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
      onBackToList={() => onSelectPo(null)}
      selectedId={selectedPoId}
      detailLoading={detail.loading}
      detailError={detail.error}
      detailContent={rightContent}
      emptyIcon={<ClipboardList className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a purchase order on the left to see its details"
    />
  )
}
