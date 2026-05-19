import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Search, X } from 'lucide-react'

import api from '@/lib/api'
import { useDebounce } from '@/hooks/useDebounce'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export interface SalesPersonOption {
  id: string
  name: string
  email?: string | null
  isActive?: boolean
}

interface SalesPersonPickerProps {
  /** Render the trigger (chip, pill, button) — the picker only owns the popover. */
  trigger: ReactNode
  /** Currently selected sales-person id (null/undefined => no selection). */
  value: string | null | undefined
  /**
   * Called with the chosen option (or `null` when the user clears).
   * The full option is returned so the caller can cache the name without
   * a follow-up fetch (handy for the filter chip label).
   */
  onChange: (next: SalesPersonOption | null) => void
  /** Allow the "Clear" / "Unassigned" row inside the popover. Default: true. */
  allowClear?: boolean
  /** Optional override for the popover width. Defaults to trigger width. */
  contentClassName?: string
  /** Optional align prop forwarded to PopoverContent. */
  align?: 'start' | 'center' | 'end'
  /** Controlled open state — optional; if omitted the popover self-manages. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Server-side searchable sales-person picker.
 *
 * Hits `GET /api/v1/salespersons?q=…&take=50` with a 250ms debounce — keeps
 * the dropdown responsive even for tenants with hundreds of salespeople,
 * which is the whole point of avoiding a client-side list. The trigger is
 * left up to the caller so the same component drives both the filter chip
 * and the inline-edit pill in the leads table.
 */
export function SalesPersonPicker({
  trigger,
  value,
  onChange,
  allowClear = true,
  contentClassName,
  align = 'start',
  open: openProp,
  onOpenChange,
}: SalesPersonPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    // Resetting the query here (rather than in an effect) keeps cascading
    // setState-in-effect warnings off this component while still landing the
    // user on the default first page each time the popover re-opens.
    if (next) setQuery('')
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }

  const [query, setQuery] = useState('')
  const debouncedQ = useDebounce(query, 250)

  const [options, setOptions] = useState<SalesPersonOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Abort the previous /salespersons request whenever query changes — keeps
  // the list in lockstep with the input so the user never sees stale results.
  const abortRef = useRef<AbortController | null>(null)

  // Defined as a callback (mirrors the useLeadsList refetch pattern in this
  // codebase) so the effect body stays free of direct setState calls.
  const fetchOptions = useCallback(async (signal: AbortSignal, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { take: 50 }
      if (q.trim()) params.q = q.trim()
      const res = await api.get('/salespersons', { params, signal })
      const data = Array.isArray(res.data) ? res.data : []
      setOptions(
        data.map((u: { id: string; name: string; email?: string; isActive?: boolean }) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          isActive: u.isActive,
        })),
      )
    } catch (err: unknown) {
      const e = err as { code?: string; name?: string; message?: string }
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setError(e?.message ?? 'Failed to load sales persons')
      setOptions([])
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    void fetchOptions(ctrl.signal, debouncedQ)
    return () => ctrl.abort()
  }, [debouncedQ, open, fetchOptions])

  // Reset the query box every time the popover opens (handled via the
  // onOpenChange handler below, not via an effect, to keep this component
  // free of cascading setState-in-effect warnings).

  const triggerWidth = useMemo(
    () => ({ width: 'var(--radix-popover-trigger-width)' }) as React.CSSProperties,
    [],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className={cn('p-0', contentClassName)}
        style={contentClassName ? undefined : triggerWidth}
      >
        <div className="border-b border-border/40 p-2">
          <Input
            autoFocus
            icon={<Search className="h-3.5 w-3.5" />}
            placeholder="Search sales person…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {allowClear && (
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent',
                  !value && 'font-semibold text-foreground',
                )}
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                  <span>Unassigned</span>
                </span>
                {!value && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            )}

            {loading && options.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : error ? (
              <div className="px-2 py-4 text-center text-xs text-rose-600">
                {error}
              </div>
            ) : options.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                No sales persons found
              </div>
            ) : (
              options.map((opt) => {
                const isActive = opt.id === value
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                      isActive && 'bg-accent/60 font-semibold text-foreground',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {opt.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{opt.name}</span>
                        {opt.email && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {opt.email}
                          </span>
                        )}
                      </span>
                    </span>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
