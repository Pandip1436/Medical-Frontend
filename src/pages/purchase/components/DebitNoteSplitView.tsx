import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { SplitViewShell } from '@/components/shared/SplitViewShell'
import { useDebitNoteDetail } from '../hooks/useDebitNoteDetail'
import { DebitNoteCompactCard } from './DebitNoteCompactCard'
import { DebitNoteDetailContent } from '../DebitNoteDetailContent'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { ApiReturn } from '../DebitNotesPage'

interface DebitNoteSplitViewProps {
  debitNotes: ApiReturn[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  selectedDebitNoteId: string | null
  onSelectDebitNote: (id: string | null) => void
  onExitSplitView: () => void
  onRefresh: () => void
  tabsNode?: ReactNode
  isCardFieldVisible?: (id: string) => boolean
  isCardFieldRight?: (id: string) => boolean
}

export function DebitNoteSplitView({
  debitNotes,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  selectedDebitNoteId,
  onSelectDebitNote,
  onExitSplitView,
  onRefresh,
  tabsNode,
  isCardFieldVisible,
  isCardFieldRight,
}: DebitNoteSplitViewProps) {
  const [localSearch, setLocalSearch] = useState('')
  const detail = useDebitNoteDetail(selectedDebitNoteId)

  // Infinite scroll sentinel
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
    if (debitNotes.length === 0) return
    if (selectedDebitNoteId && debitNotes.some(dn => dn.id === selectedDebitNoteId)) return
    onSelectDebitNote(debitNotes[0].id)
  }, [debitNotes])

  const displayed = useMemo(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q) return debitNotes
    return debitNotes.filter(
      (dn) =>
        dn.debitNoteNo?.toLowerCase().includes(q) ||
        dn.supplierName?.toLowerCase().includes(q),
    )
  }, [debitNotes, localSearch])

  const rightContent = detail.debitNote ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-sm font-semibold">{detail.debitNote.noteNo}</p>
            <Badge
              variant={detail.debitNote.status === 'SETTLED' ? 'success' : detail.debitNote.status === 'SENT' ? 'info' : 'secondary'}
              size="sm"
              dot
              className="shrink-0"
            >
              {detail.debitNote.status}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(detail.debitNote.date)}
          </p>
        </div>
      </div>
      {/* Bounded flex column (no overflow-y-auto): DebitNoteDetailContent owns
          its scroll and has a static footer with totals + actions. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DebitNoteDetailContent
          debitNote={detail.debitNote}
          onUpdated={() => {
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
      searchPlaceholder="Search debit notes…"
      resultCount={displayed.length}
      resultLabel="debit note"
      loading={loading}
      tabsNode={tabsNode}
      cards={
        <>
          {displayed.map((dn) => (
            <DebitNoteCompactCard
              key={dn.id}
              debitNote={dn}
              selected={dn.id === selectedDebitNoteId}
              onClick={() => onSelectDebitNote(dn.id)}
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
      onBackToList={() => onSelectDebitNote(null)}
      selectedId={selectedDebitNoteId}
      detailLoading={detail.loading}
      detailError={detail.error}
      detailContent={rightContent}
      emptyIcon={<FileText className="h-8 w-8 opacity-40" />}
      emptyLabel="Select a debit note on the left to see its details"
    />
  )
}
