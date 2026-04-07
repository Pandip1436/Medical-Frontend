import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'purple'

const statusVariantMap: Record<string, BadgeVariant> = {
  // Success (green)
  paid: 'success',
  active: 'success',
  healthy: 'success',
  completed: 'success',
  verified: 'success',
  fully_received: 'success',
  received: 'success',
  confirmed: 'success',
  approved: 'success',

  // Warning (amber)
  credit: 'warning',
  pending: 'warning',
  partial: 'warning',
  partially_received: 'warning',
  overdue: 'warning',

  // Info (blue)
  sent: 'info',
  acknowledged: 'info',
  processing: 'info',
  in_progress: 'info',

  // Secondary (gray)
  draft: 'secondary',
  inactive: 'secondary',
  closed: 'secondary',

  // Destructive (red)
  returned: 'destructive',
  cancelled: 'destructive',
  expired: 'destructive',
  rejected: 'destructive',
  damaged: 'destructive',
  failed: 'destructive',
}

interface StatusBadgeProps {
  status: string
  className?: string
  variantOverrides?: Record<string, BadgeVariant>
  dot?: boolean
}

export function StatusBadge({
  status,
  className,
  variantOverrides,
  dot = true,
}: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/[\s-]/g, '_')
  const overrides = variantOverrides || {}
  const variant =
    overrides[normalizedStatus] ||
    statusVariantMap[normalizedStatus] ||
    'secondary'

  const displayLabel = status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <Badge variant={variant} size="sm" dot={dot} className={cn('capitalize', className)}>
      {displayLabel}
    </Badge>
  )
}
