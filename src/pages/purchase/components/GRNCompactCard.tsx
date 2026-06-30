import { PackageCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { GRN } from '@/types'

function grnPayStatus(grn: GRN): 'PAID' | 'PARTIAL' | 'UNPAID' {
  const balance = Math.max(0, Number(grn.supplierInvoiceAmount || 0) - Number(grn.amountPaid || 0))
  if (balance <= 0.01) return 'PAID'
  if (Number(grn.amountPaid || 0) > 0) return 'PARTIAL'
  return 'UNPAID'
}

const avatarStyle: Record<string, string> = {
  PAID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  PARTIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  UNPAID: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
}

interface GRNCompactCardProps {
  grn: GRN
  selected: boolean
  onClick: () => void
  /** Returns true if a given field id should be rendered. Defaults to showing all. */
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function GRNCompactCard({ grn, selected, onClick, isFieldVisible, isFieldRight }: GRNCompactCardProps) {
  const initial = (grn.supplierName || 'S').charAt(0).toUpperCase()
  const payStatus = grnPayStatus(grn)
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'date' || id === 'status'

  const hasIssues =
    grn.items.some((i) => (i.damageQty ?? 0) > 0) ||
    grn.items.some((i) => i.orderedQty > 0 && i.receivedQty < i.orderedQty)

  const showRow3 = iv('value') || iv('status') || iv('issues')

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
          selected
            ? 'bg-primary text-primary-foreground'
            : (avatarStyle[payStatus] ?? 'bg-muted text-muted-foreground'),
        )}
      >
        {initial}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Row 1: supplier + date */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold leading-tight text-foreground">
            {grn.supplierName}
          </span>
          {iv('date') && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDate(grn.date)}
            </span>
          )}
        </div>

        {/* Row 2: GRN number + supplier invoice + source */}
        {(iv('grnNumber') || iv('supplierInvoice') || iv('source')) && (
          <div className="flex items-center gap-1.5">
            {iv('grnNumber') && (
              <>
                <PackageCheck className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="font-mono text-[10px] text-muted-foreground">{grn.grnNumber}</span>
              </>
            )}
            {iv('supplierInvoice') && grn.supplierInvoiceNo && (
              <span className="text-[10px] text-muted-foreground/60">· {grn.supplierInvoiceNo}</span>
            )}
            {iv('source') && (
              <Badge
                variant={grn.poId ? 'info' : 'secondary'}
                size="sm"
                className={cn('ml-auto text-[9px]', !iv('grnNumber') && 'ml-0')}
              >
                {grn.poId ? 'PO' : 'Direct'}
              </Badge>
            )}
          </div>
        )}

        {/* Row 3: value + issues (left) | status (right) */}
        {showRow3 && (
          <div className="flex items-center gap-1.5">
            {iv('value') && (
              <span className="font-mono text-[13px] font-bold text-foreground">
                {formatCurrency(grn.supplierInvoiceAmount || grn.totalAmount)}
              </span>
            )}
            {iv('issues') && hasIssues && (
              <Badge variant="warning" size="sm" className="text-[10px]">Issues</Badge>
            )}
            {iv('status') && !ir('status') && (
              grn.isReplacement ? (
                <Badge variant="outline" size="sm" className="border-sky-200 bg-sky-50 font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400 text-[10px]">
                  Replacement
                </Badge>
              ) : (
                <StatusBadge status={payStatus} />
              )
            )}
            {iv('status') && ir('status') && (
              <span className="ml-auto">
                {grn.isReplacement ? (
                  <Badge variant="outline" size="sm" className="border-sky-200 bg-sky-50 font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400 text-[10px]">
                    Replacement
                  </Badge>
                ) : (
                  <StatusBadge status={payStatus} />
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}
