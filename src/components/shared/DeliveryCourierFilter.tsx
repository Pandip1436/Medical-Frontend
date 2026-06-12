import { useState } from 'react'
import { Check, ChevronDown, Truck, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// A premium courier filter: a popover listing the couriers actually in use
// (derived from the server-side counts), each with a live count. The trigger
// shows the selected courier with a truck glyph and an inline clear when active.
interface DeliveryCourierFilterProps {
  value: string // courier name, or 'ALL'
  onChange: (v: string) => void
  counts: Record<string, number> // courierName → count, plus `ALL`
  className?: string
}

// A small deterministic tint per courier so the list reads at a glance without
// hard-coding colours for couriers we don't know about.
const TINTS = [
  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
]
function tintFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

export function DeliveryCourierFilter({ value, onChange, counts, className }: DeliveryCourierFilterProps) {
  const [open, setOpen] = useState(false)
  const isActive = value !== 'ALL'

  const couriers = Object.keys(counts)
    .filter((k) => k !== 'ALL')
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b))

  const select = (v: string) => {
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
            <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{isActive ? value : 'All couriers'}</span>
          </span>
          {isActive ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear courier filter"
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
          <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          All couriers
          <Count n={counts.ALL ?? 0} active={value === 'ALL'} />
          {value === 'ALL' && <Check className="h-4 w-4 shrink-0" />}
        </button>

        {couriers.length > 0 && <div className="my-1 h-px bg-border/50" />}

        {/* Per-courier */}
        {couriers.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No couriers assigned yet.</p>
        ) : (
          couriers.map((name) => {
            const active = value === name
            return (
              <button
                key={name}
                onClick={() => select(name)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
                  active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
                )}
              >
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', tintFor(name))}>
                  <Truck className="h-3 w-3" />
                </span>
                <span className="truncate">{name}</span>
                <Count n={counts[name] ?? 0} active={active} />
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
