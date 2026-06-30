import { ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
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

interface PurchaseOrderCompactCardProps {
  purchaseOrder: PurchaseOrder
  selected: boolean
  onClick: () => void
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function PurchaseOrderCompactCard({ purchaseOrder: po, selected, onClick, isFieldVisible, isFieldRight }: PurchaseOrderCompactCardProps) {
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'date' || id === 'status' || id === 'items'
  const cfg = statusBadgeConfig[po.status] ?? { label: po.status, variant: 'secondary' as const }
  const initial = (po.supplierName || 'P').charAt(0).toUpperCase()

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
        {/* Row 1: supplier name | date (top right) */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold leading-tight text-foreground">
            {po.supplierName}
          </span>
          {iv('date') && ir('date') && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDate(po.date)}
            </span>
          )}
        </div>

        {/* Row 2: PO number */}
        {iv('poNumber') && (
          <div className="flex items-center gap-1.5">
            <ClipboardList className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {po.poNumber}
            </span>
          </div>
        )}

        {/* Row 3: total left | items + status right */}
        {showRow3 && (
          <div className="flex items-center gap-1.5">
            {iv('total') && (
              <span className="font-mono text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(po.totalAmount)}
              </span>
            )}
            {iv('items') && !ir('items') && (
              <span className="text-[10px] text-muted-foreground">
                {po.items.length} item{po.items.length !== 1 ? 's' : ''}
              </span>
            )}
            {iv('status') && !ir('status') && (
              <Badge variant={cfg.variant} size="sm" dot className="text-[10px]">
                {cfg.label}
              </Badge>
            )}
            {((iv('items') && ir('items')) || (iv('status') && ir('status'))) && (
              <div className="ml-auto flex items-center gap-1.5">
                {iv('items') && ir('items') && (
                  <span className="text-[10px] text-muted-foreground">
                    {po.items.length} item{po.items.length !== 1 ? 's' : ''}
                  </span>
                )}
                {iv('status') && ir('status') && (
                  <Badge variant={cfg.variant} size="sm" dot className="text-[10px]">
                    {cfg.label}
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
