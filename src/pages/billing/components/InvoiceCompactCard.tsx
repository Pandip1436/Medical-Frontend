import { Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice } from '@/types'

const avatarStyle: Record<string, string> = {
  PAID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  PARTIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  UNPAID: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  RETURNED: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  DRAFT: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-muted text-muted-foreground',
}

const paymentModeLabels: Record<string, string> = {
  CASH: 'Cash', CARD: 'Card', UPI: 'UPI', CREDIT: 'Credit', SPLIT: 'Split',
}

interface InvoiceCompactCardProps {
  invoice: Invoice
  selected: boolean
  onClick: () => void
  /** Returns true if a given field id should be rendered. Defaults to showing all. */
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function InvoiceCompactCard({ invoice, selected, onClick, isFieldVisible, isFieldRight }: InvoiceCompactCardProps) {
  const initial = (invoice.customerName || 'W').charAt(0).toUpperCase()
  const balance = Number(invoice.grandTotal ?? 0) - Number(invoice.amountPaid ?? 0)
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'date' || id === 'status'

  const showAmountsRow = iv('total') || iv('paid') || iv('balance')
  const showRow3 = showAmountsRow || iv('status')

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full gap-2.5 border-b border-border/40 px-3 py-3 text-left transition-colors',
        selected ? 'bg-primary/6 hover:bg-primary/8' : 'hover:bg-muted/40',
      )}
    >
      {/* Avatar — colour reflects payment status */}
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          selected
            ? 'bg-primary text-primary-foreground'
            : (avatarStyle[invoice.status] ?? 'bg-muted text-muted-foreground'),
        )}
      >
        {initial}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Row 1: customer name (always) + phone (toggleable) + date (toggleable) */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">
              {invoice.customerName || 'Walk-in'}
            </span>
            {iv('phone') && invoice.customerPhone && (
              <span className="text-[10px] text-muted-foreground">{invoice.customerPhone}</span>
            )}
          </div>
          {iv('date') && ir('date') && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatDate(invoice.date)}
            </span>
          )}
        </div>

        {/* Row 2: invoice number + payment mode */}
        {(iv('invoiceNumber') || iv('paymentMode')) && (
          <div className="flex items-center gap-1.5">
            {iv('invoiceNumber') && (
              <>
                <Receipt className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {invoice.invoiceNumber}
                </span>
              </>
            )}
            {iv('paymentMode') && (
              <span
                className={cn(
                  'rounded px-1 py-0.5 text-[9px] font-medium',
                  invoice.paymentMode === 'CREDIT'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-muted/60 text-muted-foreground',
                  iv('invoiceNumber') && 'ml-auto',
                )}
              >
                {paymentModeLabels[invoice.paymentMode] || invoice.paymentMode}
              </span>
            )}
          </div>
        )}

        {/* Row 3: amounts + status (right) */}
        {showRow3 && (
          <div className="flex items-center gap-2">
            {showAmountsRow && (
              <div className="flex flex-col leading-tight">
                {iv('total') && (
                  <span className="font-mono text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(invoice.grandTotal)}
                  </span>
                )}
                {iv('paid') && Number(invoice.amountPaid ?? 0) > 0 && (
                  <span className="font-mono text-[10px] text-sky-600 dark:text-sky-400">
                    Pd {formatCurrency(invoice.amountPaid)}
                  </span>
                )}
                {iv('balance') && balance > 0.01 && (
                  <span className="font-mono text-[10px] font-medium text-rose-600 dark:text-rose-400">
                    Bal {formatCurrency(balance)}
                  </span>
                )}
              </div>
            )}
            {iv('status') && !ir('status') && (
              invoice.isReplacement ? (
                <Badge variant="outline" size="sm" className="border-sky-200 bg-sky-50 text-[10px] font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400">
                  Replacement
                </Badge>
              ) : (
                <StatusBadge status={invoice.status} />
              )
            )}
            {iv('status') && ir('status') && (
              <span className="ml-auto">
                {invoice.isReplacement ? (
                  <Badge variant="outline" size="sm" className="border-sky-200 bg-sky-50 text-[10px] font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400">
                    Replacement
                  </Badge>
                ) : (
                  <StatusBadge status={invoice.status} />
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}
