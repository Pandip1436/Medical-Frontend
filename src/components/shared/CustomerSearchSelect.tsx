import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X, Loader2, User } from 'lucide-react'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CustomerLite {
  id: string
  name: string
}

interface CustomerSearchSelectProps {
  label?: string
  /** 'all' (or '') when no customer is selected, else the customer id. */
  value: string
  /** Display name of the currently-selected customer (the list is paginated,
   *  so the parent owns the chosen label for the trigger text). */
  selectedName?: string
  /** Called with the picked customer's id + name. id is 'all' when cleared. */
  onChange: (value: string, name: string) => void
  className?: string
}

/**
 * Customer picker backed by the server-paginated `/customers` endpoint with a
 * debounced search box + infinite scroll. Mirrors SupplierSearchSelect: the
 * parent owns the selected name (so the trigger label is reliable even though
 * the list is paginated), and the dropdown renders in a portal so it escapes
 * `overflow-hidden` filter-panel ancestors. Only fetches while open.
 */
export function CustomerSearchSelect({
  label = 'Customer',
  value,
  selectedName,
  onChange,
  className,
}: CustomerSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const search = usePaginatedSearch<CustomerLite>({ endpoint: '/customers', pageSize: 20, enabled: open })

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

  const hasValue = Boolean(value && value !== 'all')
  const triggerText = hasValue ? (selectedName || 'Selected customer') : 'All Customers'

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="relative">
        <button
          ref={triggerRef}
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
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  placeholder="Search customers..."
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
                All Customers
              </button>
              {search.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(c.id, c.name); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60"
                >
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {search.loading && (
                <div className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              )}
              {!search.loading && search.items.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {search.query ? `No customers match "${search.query}"` : 'No customers found'}
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
