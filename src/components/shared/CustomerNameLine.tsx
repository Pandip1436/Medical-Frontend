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
  /**
   * When provided, the name becomes a clickable blue link — e.g. to navigate
   * to the party's detail page. The click is isolated from the surrounding
   * row's own onClick (stopPropagation), so it opens the party rather than the
   * row's drawer.
   */
  onNameClick?: () => void
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
  onNameClick,
}: CustomerNameLineProps) {
  const visiblePhone = phone && phone !== '0000000000' ? phone : null
  const clickable = !!onNameClick
  return (
    <div className={cn('min-w-0', className)}>
      <p
        className={cn(
          'text-sm font-bold leading-tight truncate',
          clickable && 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer',
          nameClassName,
        )}
        {...(clickable && {
          role: 'link',
          tabIndex: 0,
          title: 'View party details',
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); onNameClick!() },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onNameClick!() }
          },
        })}
      >
        {name}
      </p>
      {visiblePhone && (
        <p className={cn('text-[11px] text-muted-foreground font-mono leading-tight tabular-nums', phoneClassName)}>
          {visiblePhone}
        </p>
      )}
    </div>
  )
}
