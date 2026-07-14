import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface SearchableSelectOption {
  label: string
  value: string
}

interface SearchableSelectProps {
  label?: string
  options: readonly SearchableSelectOption[] | SearchableSelectOption[]
  value: string
  onValueChange: (val: string) => void
  onClear?: () => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
}

/**
 * Drop-in replacement for EnumSelect when the option list is long enough to
 * want a search box. Unlike CustomerSearchSelect/SupplierSearchSelect this
 * filters a plain in-memory `options` array (no API call, no pagination) —
 * for lists like Category that are already fully loaded client-side.
 * Same trigger + portal-positioned popover UX as the async search-selects,
 * so it behaves consistently across split view, table view, and mobile.
 */
export function SearchableSelect({
  label,
  options,
  value,
  onValueChange,
  onClear,
  placeholder = 'All',
  searchPlaceholder = 'Search...',
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Search resets each time the popover re-opens rather than persisting.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const hasValue = Boolean(onClear && value && value !== 'all')
  const selected = options.find((o) => o.value === value)
  const triggerText = selected ? selected.label : placeholder

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:border-border/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn('flex-1 truncate text-left', !selected && 'text-muted-foreground')}>{triggerText}</span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              title="Clear"
              className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onClear?.() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClear?.() } }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        </button>

        {open && rect && createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 50 }}
            className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          >
            <div className="border-b border-border/60 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 w-full rounded-md bg-muted/40 pl-8 pr-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onValueChange(opt.value); setOpen(false) }}
                  className={cn(
                    'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent/60',
                    opt.value === value && 'bg-accent/40 font-medium',
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No matches for "{query}"
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  )
}
