import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Receipt } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { useCreditNoteDetail } from '../hooks/useCreditNoteDetail'
import { CreditNoteCompactCard } from './CreditNoteCompactCard'
import { CreditNoteDetailContent } from '../CreditNoteDetailContent'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { CreditNote } from '../CreditNotesPage'

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  PENDING_REVIEW: { label: 'Pending Review', variant: 'warning' },
  APPROVED:       { label: 'Approved',       variant: 'success' },
  REJECTED:       { label: 'Rejected',       variant: 'destructive' },
}

interface CreditNoteSplitViewProps {
  creditNotes: CreditNote[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  selectedCreditNoteId: string | null
  onSelectCreditNote: (id: string | null) => void
  onExitSplitView: () => void
  onRefresh: () => void
  tabsNode?: ReactNode
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
}

export function CreditNoteSplitView({
  creditNotes,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  selectedCreditNoteId,
  onSelectCreditNote,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: CreditNoteSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')
  const detail = useCreditNoteDetail(selectedCreditNoteId)

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
    if (creditNotes.length === 0) return
    if (selectedCreditNoteId && creditNotes.some(cn => cn.id === selectedCreditNoteId)) return
    onSelectCreditNote(creditNotes[0].id)
  }, [creditNotes])

  const displayed = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return creditNotes
    return creditNotes.filter(
      (cn) =>
        cn.creditNoteNo.toLowerCase().includes(q) ||
        cn.customerName.toLowerCase().includes(q) ||
        cn.invoiceNumber.toLowerCase().includes(q),
    )
  }, [creditNotes, localSearch])

  const rightContent = detail.creditNote ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <Receipt className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold">{detail.creditNote.creditNoteNo}</p>
            {statusConfig[detail.creditNote.status] && (
              <Badge variant={statusConfig[detail.creditNote.status].variant} size="sm" dot>
                {statusConfig[detail.creditNote.status].label}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(detail.creditNote.date)} · {detail.creditNote.customerName}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CreditNoteDetailContent
          creditNote={detail.creditNote}
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
      searchPlaceholder="Search credit notes…"
      resultCount={displayed.length}
      resultLabel="credit note"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayed.map((cn) => (
            <CreditNoteCompactCard
              key={cn.id}
              creditNote={cn}
              selected={cn.id === selectedCreditNoteId}
              onClick={() => onSelectCreditNote(cn.id)}
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
      selectedId={selectedCreditNoteId}
      detailLoading={detail.loading}
      detailError={detail.error}
      detailContent={rightContent}
      emptyIcon={<Receipt className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a credit note on the left to see its details"
    />
  )
}
