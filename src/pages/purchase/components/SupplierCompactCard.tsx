import { Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import type { Supplier } from '@/types'

interface SupplierCompactCardProps {
  supplier: Supplier
  selected: boolean
  onClick: () => void
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function SupplierCompactCard({ supplier, selected, onClick, isFieldVisible, isFieldRight }: SupplierCompactCardProps) {
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'outstanding'
  const initial = supplier.name.charAt(0).toUpperCase()
  const outstanding = supplier.currentOutstanding ?? 0

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
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
          selected ? 'bg-primary' : 'bg-blue-500',
        )}
      >
        {initial}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Row 1: name + phone (stacked) | outstanding (right) */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">
              {supplier.name}
            </span>
            {iv('phone') && supplier.phone && (
              <span className="font-mono text-[10px] text-muted-foreground">{supplier.phone}</span>
            )}
          </div>
          {iv('outstanding') && outstanding > 0 && ir('outstanding') && (
            <span className="shrink-0 font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(outstanding)}
            </span>
          )}
        </div>

        {/* Outstanding when left-positioned */}
        {iv('outstanding') && outstanding > 0 && !ir('outstanding') && (
          <span className="font-mono text-[13px] font-bold text-rose-600 dark:text-rose-400">
            {formatCurrency(outstanding)}
          </span>
        )}

        {/* Row 2: payment terms + gstin (left) | status (right) */}
        <div className="flex items-center gap-1.5">
          {iv('paymentTerms') && supplier.paymentTerms && (
            <Badge variant="secondary" size="sm" className="text-[10px]">
              {supplier.paymentTerms === 'NET_30' ? 'Net 30' : supplier.paymentTerms === 'NET_45' ? 'Net 45' : 'Net 60'}
            </Badge>
          )}
          {iv('gstin') && supplier.gstin && (
            <span className="font-mono text-[10px] text-muted-foreground">{supplier.gstin}</span>
          )}
          {iv('status') && (
            <Badge
              variant={supplier.isActive === false ? 'secondary' : 'success'}
              size="sm"
              dot
              className="ml-auto text-[10px]"
            >
              {supplier.isActive === false ? 'Inactive' : 'Active'}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}
