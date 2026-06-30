import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Receipt } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { InvoiceCompactCard } from './InvoiceCompactCard'
import { InvoiceDetailContent } from '@/pages/customers/InvoiceDetailContent'
import { useInvoiceDetail } from '../hooks/useInvoiceDetail'
import { formatDate } from '@/lib/utils'
import type { Invoice } from '@/types'

interface InvoiceSplitViewProps {
  /** Already filtered list from the parent page (period + status + etc.) */
  invoices: Invoice[]
  loading: boolean
  selectedInvoiceId: string | null
  onSelectInvoice: (id: string | null) => void
  onExitSplitView: () => void
  /** Called after any mutation (collect-payment, cancel, etc.) so parent refreshes its list */
  onRefresh: () => void
  /** Optional tabs rendered in the left rail between search and cards */
  tabsNode?: ReactNode
  /** Controls which fields are rendered in each compact card */
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
}

export function InvoiceSplitView({
  invoices,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  selectedInvoiceId,
  onSelectInvoice,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: InvoiceSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pendingLoadRef = useRef(false)
  const detail = useInvoiceDetail(selectedInvoiceId)

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

  // Auto-select the first invoice when the list loads and nothing is selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedInvoiceId && invoices.length > 0) {
      onSelectInvoice(invoices[0].id)
    }
  }, [invoices.length, selectedInvoiceId])

  // Local search filters within the parent's already-filtered list.
  const displayedInvoices = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        (inv.customerPhone ?? '').includes(q),
    )
  }, [invoices, localSearch])

  // Right-panel content — header strip + scrollable InvoiceDetailContent.
  const rightContent = detail.invoice ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Receipt className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold">{detail.invoice.invoiceNumber}</p>
            {!detail.invoice.isReplacement && <StatusBadge status={detail.invoice.status} />}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(detail.invoice.date)} · {detail.invoice.billingType}
          </p>
        </div>
      </div>
      {/* Scrollable detail body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <InvoiceDetailContent
          invoice={detail.invoice}
          onClose={onExitSplitView}
          onUpdated={(updated) => {
            detail.patchLocal(updated)
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
      searchPlaceholder="Search invoices…"
      resultCount={displayedInvoices.length}
      resultLabel="invoice"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayedInvoices.map((inv) => (
            <InvoiceCompactCard
              key={inv.id}
              invoice={inv}
              selected={inv.id === selectedInvoiceId}
              onClick={() => onSelectInvoice(inv.id)}
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
      selectedId={selectedInvoiceId}
      detailLoading={detail.loading}
      detailError={detail.error}
      detailContent={rightContent}
      emptyIcon={<Receipt className="h-8 w-8 opacity-40" />}
      emptyLabel="Select an invoice on the left to see its details"
    />
  )
}
