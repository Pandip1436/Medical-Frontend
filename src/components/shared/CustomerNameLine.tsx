import { cn } from '@/lib/utils'

interface CustomerNameLineProps {
  name: string
  phone?: string | null
  /** Wrapper class for the outer <div>. */
  className?: string
  /** Override class on the name <p>. Defaults to a list-row sensible style. */
  nameClassName?: string
  /** Override class on the phone <p>. */
  phoneClassName?: string
}

// Renders a customer's display name with their phone shown directly beneath
// in a smaller muted font. Used in every list / table row / dropdown option /
// drawer header where multiple customers could appear together — staff
// can't tell two "Murugan S" rows apart without a phone next to the name.
//
// Sentinel "0000000000" placeholders (used by walk-in / quotation-only flows
// where no real phone exists) collapse to no-phone, mirroring the existing
// rule in the NewSalePage customer picker.
export function CustomerNameLine({
  name,
  phone,
  className,
  nameClassName,
  phoneClassName,
}: CustomerNameLineProps) {
  const visiblePhone = phone && phone !== '0000000000' ? phone : null
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn('text-sm font-medium leading-tight truncate', nameClassName)}>{name}</p>
      {visiblePhone && (
        <p className={cn('text-[11px] text-muted-foreground font-mono leading-tight tabular-nums', phoneClassName)}>
          {visiblePhone}
        </p>
      )}
    </div>
  )
}
