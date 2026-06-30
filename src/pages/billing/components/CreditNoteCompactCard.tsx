import { Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { CreditNote } from '../CreditNotesPage'

const settlementConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'info' }> = {
  REFUND:      { label: 'Refund',       variant: 'success' },
  CREDIT:      { label: 'Adjust',       variant: 'warning' },
  REPLACEMENT: { label: 'Replacement',  variant: 'info' },
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  PENDING_REVIEW: { label: 'Pending', variant: 'warning' },
  APPROVED:       { label: 'Approved', variant: 'success' },
  REJECTED:       { label: 'Rejected', variant: 'destructive' },
}

interface CreditNoteCompactCardProps {
  creditNote: CreditNote
  selected: boolean
  onClick: () => void
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function CreditNoteCompactCard({ creditNote, selected, onClick, isFieldVisible, isFieldRight }: CreditNoteCompactCardProps) {
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'date' || id === 'status'
  const initial = (creditNote.customerName || 'C').charAt(0).toUpperCase()
  const settlement = settlementConfig[creditNote.settlementMode]
  const status = statusConfig[creditNote.status]

  const showRow3 = iv('amount') || iv('status') || iv('settlement')

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
        {/* Row 1: name + phone (stacked) | date (top right) */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">
              {creditNote.customerName}
            </span>
            {iv('phone') && creditNote.customerPhone && (
              <span className="text-[10px] text-muted-foreground">{creditNote.customerPhone}</span>
            )}
          </div>
          {iv('date') && ir('date') && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDate(creditNote.date)}
            </span>
          )}
        </div>

        {/* Row 2: credit note number */}
        {iv('creditNoteNo') && (
          <div className="flex items-center gap-1.5">
            <Receipt className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {creditNote.creditNoteNo}
            </span>
          </div>
        )}

        {/* Row 3: amount left | settlement + status right */}
        {showRow3 && (
          <div className="flex items-center gap-1.5">
            {iv('amount') && (
              <span className="font-mono text-[13px] font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(creditNote.totalAmount)}
              </span>
            )}
            {iv('settlement') && !ir('settlement') && settlement && (
              <Badge variant={settlement.variant} size="sm" dot className="text-[10px]">
                {settlement.label}
              </Badge>
            )}
            {iv('status') && !ir('status') && status && (
              <Badge variant={status.variant} size="sm" dot className="text-[10px]">
                {status.label}
              </Badge>
            )}
            {((iv('settlement') && ir('settlement') && settlement) || (iv('status') && ir('status') && status)) && (
              <div className="ml-auto flex items-center gap-1">
                {iv('settlement') && ir('settlement') && settlement && (
                  <Badge variant={settlement.variant} size="sm" dot className="text-[10px]">
                    {settlement.label}
                  </Badge>
                )}
                {iv('status') && ir('status') && status && (
                  <Badge variant={status.variant} size="sm" dot className="text-[10px]">
                    {status.label}
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
