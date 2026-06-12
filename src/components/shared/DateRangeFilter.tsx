import { useState } from 'react'
import { Calendar as CalendarIcon, Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { cn, formatDate } from '@/lib/utils'

// A premium date-range filter: quick presets in a popover, plus a custom
// from/to range. Emits a fully-resolved value — `from`/`to` are ISO strings
// (or undefined for "All time") so callers pass them straight to the API.
export interface DateRangeValue {
  preset: string // 'all' | 'today' | '7d' | '30d' | 'month' | 'custom'
  from?: string
  to?: string
}

const PRESETS: { value: string; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
]

// Resolve a preset into an ISO {from,to}. 'all'/'custom' return {}.
function presetToRange(preset: string): { from?: string; to?: string } {
  if (preset === 'all' || preset === 'custom') return {}
  const now = new Date()
  const to = now.toISOString()
  const start = new Date(now)
  if (preset === 'today') start.setHours(0, 0, 0, 0)
  else if (preset === '7d') start.setDate(start.getDate() - 7)
  else if (preset === '30d') start.setDate(start.getDate() - 30)
  else if (preset === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0) }
  return { from: start.toISOString(), to }
}

// yyyy-mm-dd → ISO at start (00:00) or end (23:59:59.999) of that local day.
function dayToIso(day: string, edge: 'start' | 'end'): string {
  const d = new Date(day + (edge === 'start' ? 'T00:00:00' : 'T23:59:59.999'))
  return d.toISOString()
}

function triggerLabel(value: DateRangeValue): string {
  if (value.preset === 'custom') {
    const f = value.from ? formatDate(value.from) : '…'
    const t = value.to ? formatDate(value.to) : '…'
    return `${f} – ${t}`
  }
  return PRESETS.find((p) => p.value === value.preset)?.label ?? 'All time'
}

interface DateRangeFilterProps {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
  className?: string
}

export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  // Local custom-range draft (yyyy-mm-dd), applied on "Apply".
  const [customFrom, setCustomFrom] = useState(value.from ? value.from.slice(0, 10) : '')
  const [customTo, setCustomTo] = useState(value.to ? value.to.slice(0, 10) : '')

  const isActive = value.preset !== 'all'

  const selectPreset = (preset: string) => {
    onChange({ preset, ...presetToRange(preset) })
    setOpen(false)
  }

  const applyCustom = () => {
    if (!customFrom && !customTo) return
    onChange({
      preset: 'custom',
      from: customFrom ? dayToIso(customFrom, 'start') : undefined,
      to: customTo ? dayToIso(customTo, 'end') : undefined,
    })
    setOpen(false)
  }

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
          <span className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{triggerLabel(value)}</span>
          </span>
          {isActive ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date filter"
              onClick={(e) => { e.stopPropagation(); selectPreset('all') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); selectPreset('all') } }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        {/* Presets */}
        <div className="p-1.5">
          {PRESETS.map((p) => {
            const active = value.preset === p.value
            return (
              <button
                key={p.value}
                onClick={() => selectPreset(p.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition',
                  active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
                )}
              >
                {p.label}
                {active && <Check className="h-4 w-4" />}
              </button>
            )
          })}
        </div>

        {/* Custom range */}
        <div className="border-t border-border/50 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Custom range
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <DatePicker value={customFrom} onChange={setCustomFrom} max={customTo || undefined} clearable />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <DatePicker value={customTo} onChange={setCustomTo} min={customFrom || undefined} clearable />
            </div>
          </div>
          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={!customFrom && !customTo}
            onClick={applyCustom}
          >
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
