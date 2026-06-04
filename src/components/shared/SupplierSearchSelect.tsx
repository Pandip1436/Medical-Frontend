import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, X, Loader2, Building2 } from 'lucide-react'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface SupplierLite {
  id: string
  name: string
}

interface SupplierSearchSelectProps {
  label?: string
  /** 'all' (or '') when no supplier is selected, else the supplier id. */
  value: string
  /** Display name of the currently-selected supplier (the list is paginated,
   *  so the parent owns the chosen label for the trigger text). */
  selectedName?: string
  /** Called with the picked supplier's id + name. id is 'all' when cleared. */
  onChange: (value: string, name: string) => void
  className?: string
}

/**
 * Supplier picker backed by the server-paginated `/suppliers` endpoint with a
 * debounced search box + infinite scroll. Built for directories with hundreds
 * of suppliers where loading the full list up-front isn't viable. Mirrors the
 * New Sale customer-picker pattern. Only fetches while the dropdown is open.
 */
export function SupplierSearchSelect({
  label = 'Supplier',
  value,
  selectedName,
  onChange,
  className,
}: SupplierSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const search = usePaginatedSearch<SupplierLite>({ endpoint: '/suppliers', pageSize: 20, enabled: open })

  // Close on outside click (guarded so it only fires while open).
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const hasValue = Boolean(value && value !== 'all')
  const triggerText = hasValue ? (selectedName || 'Selected supplier') : 'All Suppliers'

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:border-border/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn('flex-1 truncate text-left', !hasValue && 'text-muted-foreground')}>{triggerText}</span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              title="Clear"
              className="rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onChange('all', '') }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange('all', '') } }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        </button>

        {open && (
          <div className="absolute z-50 left-0 right-0 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <div className="border-b border-border/60 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  autoFocus
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  placeholder="Search suppliers..."
                  className="h-8 w-full rounded-md bg-muted/40 pl-8 pr-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div
              className="max-h-60 overflow-y-auto"
              onScroll={(e) => {
                const el = e.currentTarget
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) search.loadMore()
              }}
            >
              <button
                type="button"
                onClick={() => { onChange('all', ''); setOpen(false) }}
                className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent/60"
              >
                All Suppliers
              </button>
              {search.items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onChange(s.id, s.name); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60"
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
              {search.loading && (
                <div className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              )}
              {!search.loading && search.items.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {search.query ? `No suppliers match "${search.query}"` : 'No suppliers found'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
