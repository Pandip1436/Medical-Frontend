import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface PaginatedOption {
  label: string
  value: string
}

/** Async fetcher signature. Returns the next page of options + a hasMore flag. */
export type PaginatedFetcher = (args: {
  skip: number
  take: number
  query: string
}) => Promise<{ data: PaginatedOption[]; hasMore: boolean }>

export interface PaginatedSelectProps {
  label: string
  value: string
  onValueChange: (val: string) => void
  placeholder?: string
  clearable?: boolean
  onClear?: () => void
  className?: string
  /** How many items to fetch / reveal per batch. Default 10. */
  pageSize?: number
  /** Always pin this option at the top (e.g. "All …"). Provide the label too. */
  pinnedOption?: PaginatedOption
  /** Static list mode: pass options directly. Component paginates client-side. */
  options?: readonly PaginatedOption[] | PaginatedOption[]
  /** Async mode: pass a fetcher. Component calls it on open + scroll-to-end. */
  fetcher?: PaginatedFetcher
  /**
   * When in async mode, this label is shown as the trigger text for the
   * currently-selected value (since we don't have the full options list
   * preloaded to look it up). Optional — falls back to the raw value.
   */
  selectedLabel?: string
}

/**
 * Dropdown that loads options in pages of `pageSize`.
 *
 * Two modes:
 * - Pass `options` for static client-side pagination (slices an already-loaded list).
 * - Pass `fetcher` for true backend-driven pagination (fetches each page on demand).
 *
 * Works around Radix Select's virtual-scrolling by composing primitives directly
 * with `overflow-y-auto` on the Viewport. A ref-callback attaches the scroll
 * listener the moment the Viewport mounts (avoids useEffect timing race with
 * the Radix Portal).
 */
export function PaginatedSelect({
  label,
  value,
  onValueChange,
  placeholder,
  clearable = true,
  onClear,
  className,
  pageSize = 10,
  pinnedOption,
  options,
  fetcher,
  selectedLabel,
}: PaginatedSelectProps) {
  // ── Mode A: static options (client-side pagination) ──────────────────────
  // ── Mode B: async fetcher (server-side pagination) ───────────────────────

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  // Loaded items (for async mode; mirrors `options` slice for static mode)
  const [loaded, setLoaded] = useState<PaginatedOption[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(pageSize) // static-mode cursor

  // Filtered/displayable list ----------------------------------------------
  const staticFiltered = useMemo(() => {
    if (fetcher || !options) return []
    if (!query.trim()) return options as PaginatedOption[]
    const q = query.toLowerCase()
    return (options as PaginatedOption[]).filter((o) => o.label.toLowerCase().includes(q))
  }, [fetcher, options, query])

  const visibleItems: PaginatedOption[] = fetcher
    ? loaded
    : staticFiltered.slice(0, visibleCount)

  const moreAvailable = fetcher
    ? hasMore
    : visibleCount < staticFiltered.length

  // ── Async fetch: first page on open, subsequent pages on scroll ──────────
  const fetchPage = useCallback(
    async (skip: number, reset: boolean) => {
      if (!fetcher) return
      setLoading(true)
      try {
        const { data, hasMore: more } = await fetcher({ skip, take: pageSize, query })
        setLoaded((prev) => (reset ? data : [...prev, ...data]))
        setHasMore(more)
      } catch {
        // On error, keep current state. (Toast handled by caller's fetcher if desired.)
      } finally {
        setLoading(false)
      }
    },
    [fetcher, pageSize, query],
  )

  // Reset & fetch first page whenever opened or query changes (async mode)
  useEffect(() => {
    if (!fetcher) return
    if (!open) return
    setLoaded([])
    setHasMore(true)
    void fetchPage(0, true)
  }, [open, query, fetcher, fetchPage])

  // Reset static cursor on close
  useEffect(() => {
    if (open) return
    setVisibleCount(pageSize)
    if (!fetcher) setQuery('')
  }, [open, pageSize, fetcher])

  // ── Scroll-to-load-more handler ──────────────────────────────────────────
  // Latest-ref pattern so the listener doesn't capture stale state.
  const stateRef = useRef({
    moreAvailable,
    loading,
    fetcher,
    pageSize,
    visibleCount,
    loadedLength: loaded.length,
    staticLength: staticFiltered.length,
  })
  useEffect(() => {
    stateRef.current = {
      moreAvailable,
      loading,
      fetcher,
      pageSize,
      visibleCount,
      loadedLength: loaded.length,
      staticLength: staticFiltered.length,
    }
  })

  // Track the cleanup fn for the scroll listener attached to the current Viewport
  const cleanupRef = useRef<(() => void) | null>(null)

  const viewportRefCallback = useCallback((node: HTMLDivElement | null) => {
    // Always detach the previous listener (handles unmount & re-mount cycles)
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    if (!node) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = node
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      if (distanceFromBottom > 60) return

      const s = stateRef.current
      if (!s.moreAvailable || s.loading) return

      if (s.fetcher) {
        void fetchPageRef.current(s.loadedLength, false)
      } else {
        setVisibleCount((c) => Math.min(c + s.pageSize, s.staticLength))
      }
    }

    node.addEventListener('scroll', handleScroll, { passive: true })
    cleanupRef.current = () => node.removeEventListener('scroll', handleScroll)
  }, [])

  // fetchPage in a ref too (since the callback above closes over it)
  const fetchPageRef = useRef(fetchPage)
  useEffect(() => {
    fetchPageRef.current = fetchPage
  })

  // ── UI helpers ───────────────────────────────────────────────────────────
  const hasValue = clearable && Boolean(value && value !== 'all' && value !== '')

  // Remember the option the user actually picked so the trigger keeps showing
  // its label even after the dropdown closes and the fetched page is dropped —
  // and even when the parent can't resolve `selectedLabel` from a cache.
  const [picked, setPicked] = useState<PaginatedOption | null>(null)
  const handleValueChange = useCallback(
    (val: string) => {
      if (val && val !== 'all' && val !== '') {
        const opt =
          pinnedOption?.value === val
            ? pinnedOption
            : visibleItems.find((o) => o.value === val) ?? null
        setPicked(opt)
      } else {
        setPicked(null)
      }
      onValueChange(val)
    },
    [onValueChange, pinnedOption, visibleItems],
  )

  // Trigger label: prefer explicit selectedLabel (async mode), then the option
  // the user just picked, then a lookup in loaded/static options, then fall back
  // to the raw value or placeholder.
  const triggerLabel: string | undefined = useMemo(() => {
    if (!value || value === 'all' || value === '') return undefined
    if (selectedLabel) return selectedLabel
    if (picked?.value === value) return picked.label
    if (pinnedOption?.value === value) return pinnedOption.label
    const match =
      (fetcher ? loaded : (options ?? [])).find((o) => o.value === value) ||
      undefined
    return match?.label ?? value
  }, [value, selectedLabel, picked, pinnedOption, fetcher, loaded, options])

  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={handleValueChange}
        onOpenChange={setOpen}
      >
        <SelectTrigger hasValue={hasValue} onClear={onClear}>
          <SelectValue placeholder={placeholder}>{triggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className={cn(
              'relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            )}
          >
            <SelectPrimitive.Viewport
              ref={viewportRefCallback}
              className="p-1 max-h-65 overflow-y-auto min-w-(--radix-select-trigger-width)"
            >
              {pinnedOption && (
                <PaginatedItem option={pinnedOption} />
              )}
              {visibleItems.length === 0 && !loading ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No results
                </div>
              ) : (
                visibleItems.map((opt) => (
                  <PaginatedItem key={opt.value} option={opt} />
                ))
              )}
              {loading && (
                <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading…
                </div>
              )}
              {/* Invisible sentinel at the very bottom — guarantees the
                  scroll handler has room to fire even with small batches. */}
              <div aria-hidden="true" className="h-px w-full" />
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </Select>
    </div>
  )
}

function PaginatedItem({ option }: { option: PaginatedOption }) {
  return (
    <SelectPrimitive.Item
      value={option.value}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
        'focus:bg-accent focus:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
      )}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
