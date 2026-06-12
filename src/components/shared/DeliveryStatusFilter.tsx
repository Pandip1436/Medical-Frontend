import { useState } from 'react'
import { Check, ChevronDown, ListFilter, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DeliveryStatus } from '@/types'
import { DELIVERY_STATUSES, STATUS_LABEL, STATUS_DOT } from '@/lib/courierOcr'

// A premium status filter: a popover of delivery statuses, each with its colour
// dot and a live count (counts respect the other active filters). The trigger
// shows the current selection with its dot, and an inline clear when active.
interface DeliveryStatusFilterProps {
  value: DeliveryStatus | 'ALL'
  onChange: (v: DeliveryStatus | 'ALL') => void
  counts: Record<string, number>
  className?: string
}

export function DeliveryStatusFilter({ value, onChange, counts, className }: DeliveryStatusFilterProps) {
  const [open, setOpen] = useState(false)
  const isActive = value !== 'ALL'

  const select = (v: DeliveryStatus | 'ALL') => {
    onChange(v)
    setOpen(false)
  }

  const Count = ({ n, active }: { n: number; active: boolean }) => (
    <span
      className={cn(
        'ml-auto min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums',
        active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {n ?? 0}
    </span>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-10 justify-between gap-2 font-normal',
            isActive && 'border-primary/50 bg-primary/5 text-foreground',
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {isActive ? (
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[value as DeliveryStatus])} />
            ) : (
              <ListFilter className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="truncate">{isActive ? STATUS_LABEL[value as DeliveryStatus] : 'All statuses'}</span>
          </span>
          {isActive ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear status filter"
              onClick={(e) => { e.stopPropagation(); select('ALL') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); select('ALL') } }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        {/* All */}
        <button
          onClick={() => select('ALL')}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
            value === 'ALL' ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
          )}
        >
          <ListFilter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          All statuses
          <Count n={counts.ALL ?? 0} active={value === 'ALL'} />
          {value === 'ALL' && <Check className="h-4 w-4 shrink-0" />}
        </button>

        <div className="my-1 h-px bg-border/50" />

        {/* Per-status — "Dispatched" is folded into "In Transit" (the workflow
            treats them as one), so it isn't listed as its own row. */}
        {DELIVERY_STATUSES.filter((s) => s !== 'DISPATCHED').map((s) => {
          const active = value === s
          return (
            <button
              key={s}
              onClick={() => select(s)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
                active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
              )}
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[s])} />
              <span className="truncate">{STATUS_LABEL[s]}</span>
              <Count n={counts[s] ?? 0} active={active} />
              {active && <Check className="h-4 w-4 shrink-0" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
