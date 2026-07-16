import { Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import type { Customer } from '@/types'

const typeBadgeVariant: Record<string, 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
  RETAIL: 'success',
  WHOLESALE: 'purple',
  DOCTOR: 'warning',
}

const typeAvatarColor: Record<string, string> = {
  RETAIL: 'bg-emerald-500',
  WHOLESALE: 'bg-purple-500',
  DOCTOR: 'bg-amber-500',
}

interface CustomerCompactCardProps {
  customer: Customer
  selected: boolean
  onClick: () => void
  isFieldVisible?: (id: string) => boolean
  isFieldRight?: (id: string) => boolean
}

export function CustomerCompactCard({ customer, selected, onClick, isFieldVisible, isFieldRight }: CustomerCompactCardProps) {
  const iv = (id: string) => (isFieldVisible ? isFieldVisible(id) : true)
  const ir = (id: string) => id === 'outstanding'
  const initial = customer.name.charAt(0).toUpperCase()
  const outstanding = customer.currentOutstanding ?? 0

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
          selected ? 'bg-primary' : (typeAvatarColor[customer.type] ?? 'bg-muted'),
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
              {customer.name}
            </span>
            {iv('phone') && customer.phone && (
              <span className="text-[10px] text-muted-foreground">{customer.phone}</span>
            )}
          </div>
          {iv('outstanding') && outstanding > 0 && (
            <span className="shrink-0 font-mono text-[11px] font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(outstanding)}
            </span>
          )}
        </div>

        {/* Row 2: type + source + pending (left) | status (right) */}
        <div className="flex items-center gap-1.5">
          {iv('type') && (
            <Badge variant={typeBadgeVariant[customer.type] ?? 'secondary'} size="sm" className="text-[10px]">
              {customer.type === 'RETAIL' ? 'Retail' : customer.type === 'WHOLESALE' ? 'Wholesale' : 'Doctor'}
            </Badge>
          )}
          {iv('source') && (
            <span className="text-[10px] text-muted-foreground">
              {customer.source || '—'}
            </span>
          )}
          {iv('pending') && (customer.pendingCreditCount ?? 0) > 0 && (
            <span className="text-[10px] text-rose-500">
              {customer.pendingCreditCount} pending
            </span>
          )}
          {iv('status') && (
            <Badge
              variant={customer.isActive === false ? 'secondary' : 'success'}
              size="sm"
              dot
              className="ml-auto text-[10px]"
            >
              {customer.isActive === false ? 'Inactive' : 'Active'}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}
