import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
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

interface QuotationCompactCardProps {
  quotation: Quotation
  selected: boolean
  onClick: () => void
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function QuotationCompactCard({ quotation, selected, onClick, isFieldVisible, isFieldRight }: QuotationCompactCardProps) {
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'date' || id === 'status' || id === 'items'
  const initial = (quotation.customerName || 'Q').charAt(0).toUpperCase()

  const showRow3 = iv('total') || iv('status') || iv('items')

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
              {quotation.customerName}
            </span>
            {iv('phone') && quotation.customerPhone && (
              <span className="text-[10px] text-muted-foreground">{quotation.customerPhone}</span>
            )}
          </div>
          {iv('date') && ir('date') && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDate(quotation.date)}
            </span>
          )}
        </div>

        {/* Row 2: quotation number */}
        {iv('quotationNumber') && (
          <div className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {quotation.quotationNumber}
            </span>
          </div>
        )}

        {/* Row 3: total left | items + status right */}
        {showRow3 && (
          <div className="flex items-center gap-1.5">
            {iv('total') && (
              <span className="font-mono text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(quotation.total)}
              </span>
            )}
            {iv('items') && !ir('items') && (
              <span className="text-[10px] text-muted-foreground">
                {quotation.items.length} item{quotation.items.length !== 1 ? 's' : ''}
              </span>
            )}
            {iv('status') && !ir('status') && (
              <Badge variant={statusBadgeVariant[quotation.status]} size="sm" dot className="text-[10px]">
                {statusLabel[quotation.status]}
              </Badge>
            )}
            {((iv('items') && ir('items')) || (iv('status') && ir('status'))) && (
              <div className="ml-auto flex items-center gap-1.5">
                {iv('items') && ir('items') && (
                  <span className="text-[10px] text-muted-foreground">
                    {quotation.items.length} item{quotation.items.length !== 1 ? 's' : ''}
                  </span>
                )}
                {iv('status') && ir('status') && (
                  <Badge variant={statusBadgeVariant[quotation.status]} size="sm" dot className="text-[10px]">
                    {statusLabel[quotation.status]}
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
