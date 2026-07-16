import { cn } from '@/lib/utils'

type PartyType = 'customer' | 'supplier'

const TABS: { key: PartyType; label: string }[] = [
  { key: 'customer', label: 'Customers' },
  { key: 'supplier', label: 'Suppliers' },
]

export function LedgerPartyTypeTabs({ type, onChange, counts }: {
  type: PartyType
  onChange: (t: PartyType) => void
  counts: Record<PartyType, number>
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1 shadow-sm shadow-black/[0.02]">
      {TABS.map((t) => {
        const active = type === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors',
                active ? 'bg-foreground/10 text-foreground' : 'bg-foreground/[0.06] text-muted-foreground',
              )}
            >
              {counts[t.key] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}
