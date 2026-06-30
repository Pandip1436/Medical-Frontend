import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { ApiReturn } from '../DebitNotesPage'

interface DebitNoteCompactCardProps {
  debitNote: ApiReturn
  selected: boolean
  onClick: () => void
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function DebitNoteCompactCard({ debitNote, selected, onClick, isFieldVisible, isFieldRight }: DebitNoteCompactCardProps) {
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'date' || id === 'status'
  const initial = (debitNote.supplierName || 'S').charAt(0).toUpperCase()
  const isShortBilling = /short/i.test(debitNote.reason || '')
  const isSettled = /settl/i.test(debitNote.status || '')

  const showRow3 = iv('amount') || iv('type') || iv('status')

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full gap-2.5 border-b border-border/40 px-3 py-3 text-left transition-colors',
        selected ? 'bg-primary/6 hover:bg-primary/8' : 'hover:bg-muted/40',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {initial}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Row 1: supplier name + phone (stacked) | date (top right) */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">
              {debitNote.supplierName}
            </span>
            {iv('phone') && debitNote.supplierPhone && (
              <span className="text-[10px] text-muted-foreground">{debitNote.supplierPhone}</span>
            )}
          </div>
          {iv('date') && ir('date') && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDate(debitNote.date)}
            </span>
          )}
        </div>

        {/* Row 2: debit note number */}
        {iv('debitNoteNo') && (
          <div className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {debitNote.debitNoteNo}
            </span>
          </div>
        )}

        {/* Row 3: amount left | type + status right */}
        {showRow3 && (
          <div className="flex items-center gap-1.5">
            {iv('amount') && (
              <span className="font-mono text-[13px] font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(debitNote.totalAmount)}
              </span>
            )}
            {iv('type') && !ir('type') && (
              <Badge variant={isShortBilling ? 'warning' : 'secondary'} size="sm" className="text-[10px]">
                {isShortBilling ? 'Short-Billing' : 'Goods Returned'}
              </Badge>
            )}
            {iv('status') && !ir('status') && (
              <Badge variant={isSettled ? 'success' : 'secondary'} size="sm" dot className="text-[10px]">
                {debitNote.status}
              </Badge>
            )}
            {((iv('type') && ir('type')) || (iv('status') && ir('status'))) && (
              <div className="ml-auto flex items-center gap-1">
                {iv('type') && ir('type') && (
                  <Badge variant={isShortBilling ? 'warning' : 'secondary'} size="sm" className="text-[10px]">
                    {isShortBilling ? 'Short-Billing' : 'Goods Returned'}
                  </Badge>
                )}
                {iv('status') && ir('status') && (
                  <Badge variant={isSettled ? 'success' : 'secondary'} size="sm" dot className="text-[10px]">
                    {debitNote.status}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  )
}
