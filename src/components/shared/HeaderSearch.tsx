import { useState, useEffect, useRef, useCallback } from 'react'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search,
  ArrowRight,
  Loader2,
  Sparkles,
  FileText,
  ShoppingCart,
  Package,
  Users,
  FileCheck,
  PackageCheck,
  Truck,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { useMasterSearch, type MasterSearchType } from '@/hooks/useMasterSearch'

const masterSearchSectionIcons: Record<MasterSearchType, React.ElementType> = {
  customer: Users,
  product: Package,
  invoice: FileText,
  supplier: Truck,
  quotation: FileCheck,
  'purchase-order': ShoppingCart,
  grn: PackageCheck,
  'credit-note': Receipt,
}

// Inline header search. Behaves like a normal text input — clicking it puts
// focus straight into the input (no modal), typing pops a results dropdown
// anchored directly beneath. Ctrl+K (or Cmd+K) is a focus shortcut from
// anywhere in the app.
export function HeaderSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { results: masterResults, loading: masterLoading, totalCount: masterCount, loadMore } = useMasterSearch(query)

  // Ctrl+K (or Cmd+K) — focus the input from anywhere in the app
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
      setOpen(true)
    } else if (e.key === 'Escape' && open) {
      setOpen(false)
      inputRef.current?.blur()
    }
  }, [open])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Close dropdown when clicking outside the search container. We do this on
  // mousedown so a click on a result row still fires its onSelect before the
  // popover unmounts.
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const navigateTo = (path: string) => {
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    navigate(path)
  }

  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length > 0
  const isQueryTooShort = hasQuery && trimmedQuery.length < 2
  const showNoResults = hasQuery && !isQueryTooShort && !masterLoading && masterCount === 0

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <Command
        shouldFilter={false}
        loop
        className={cn(
          'flex items-center gap-2.5 rounded-full border h-10 w-72 lg:w-80 px-4',
          'border-border bg-background shadow-sm',
          'transition-all hover:border-primary/40 hover:shadow',
          open && 'border-primary/50 ring-2 ring-primary/15 shadow-md',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-primary/70" />
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={(v) => {
            setQuery(v)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          placeholder="Search customers, products, invoices…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
        />

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              // Anchor the dropdown to the right edge of the input so it
              // doesn't overflow the viewport on narrow desktops. Width is
              // wider than the input itself so result subtitles fit cleanly.
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-96 lg:w-md"
            >
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-popover/95 shadow-2xl backdrop-blur-xl">
                <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2">
                  {!hasQuery && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <Sparkles className="h-7 w-7 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-muted-foreground">Start typing to search</p>
                      <p className="text-xs text-muted-foreground/60 px-4">
                        Customers, products, invoices, suppliers, quotations, POs, GRN, credit notes
                      </p>
                    </div>
                  )}

                  {isQueryTooShort && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <Search className="h-7 w-7 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Keep typing…</p>
                      <p className="text-xs text-muted-foreground/60">Enter at least 2 characters</p>
                    </div>
                  )}

                  {hasQuery && !isQueryTooShort && masterResults.map((group) => {
                    if (group.items.length === 0 && !group.loading) return null
                    const SectionIcon = masterSearchSectionIcons[group.type] || ArrowRight
                    return (
                      <Command.Group
                        key={`server-${group.type}`}
                        heading={
                          <span className="flex items-center justify-between w-full">
                            <span className="flex items-center gap-1.5">
                              <SectionIcon className="h-3 w-3" />
                              {group.label}
                              {group.loading && (
                                <Loader2 className="ml-1 h-3 w-3 animate-spin text-muted-foreground/50" />
                              )}
                            </span>
                            {group.total > 0 && (
                              <span className="text-[10px] font-medium tabular-nums text-muted-foreground/60 normal-case tracking-normal">
                                {group.items.length} of {group.total}
                              </span>
                            )}
                          </span>
                        }
                        className="**:[[cmdk-group-heading]]:flex **:[[cmdk-group-heading]]:items-center **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground/60"
                      >
                        {group.items.map((item) => (
                          <Command.Item
                            key={`${group.type}-${item.id}`}
                            value={`${group.type}-${item.id}`}
                            onSelect={() => navigateTo(item.href)}
                            className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors aria-selected:bg-accent/80 aria-selected:text-accent-foreground"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/40 transition-colors group-aria-selected:border-primary/30 group-aria-selected:bg-primary/10">
                              <SectionIcon className="h-3.5 w-3.5 text-muted-foreground transition-colors group-aria-selected:text-primary" />
                            </span>
                            <span className="flex flex-1 flex-col gap-0.5 min-w-0">
                              <span className="font-medium leading-none truncate">{item.title}</span>
                              {item.subtitle && (
                                <span className="text-[11px] leading-none text-muted-foreground/70 truncate">
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground/0 transition-all group-aria-selected:text-muted-foreground/60 group-aria-selected:translate-x-0 -translate-x-1" />
                          </Command.Item>
                        ))}
                        {group.hasMore && (
                          // Renders as a non-selectable cmdk item so it
                          // doesn't steal focus when the user is keyboard-
                          // navigating between actual results. Click /
                          // mousedown both fire to ensure it works even
                          // when the popover's outside-click handler is
                          // about to fire.
                          <div
                            onMouseDown={(e) => {
                              e.preventDefault()
                              loadMore(group.type)
                            }}
                            className="mt-0.5 flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/5 transition-colors"
                          >
                            {group.loadingMore ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading…
                              </>
                            ) : (
                              <>
                                Load more
                                <span className="text-muted-foreground/60 font-normal">
                                  ({group.total - group.items.length} remaining)
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </Command.Group>
                    )
                  })}

                  {showNoResults && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <Search className="h-7 w-7 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No results for "{trimmedQuery}"</p>
                      <p className="text-xs text-muted-foreground/60 px-4">Try a different name, phone, or document number</p>
                    </div>
                  )}
                </Command.List>

                {hasQuery && !isQueryTooShort && (
                  <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5">
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                      <span className="flex items-center gap-1">
                        <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0.5 font-mono">↑↓</kbd>
                        Navigate
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0.5 font-mono">↵</kbd>
                        Open
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0.5 font-mono">Esc</kbd>
                        Close
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60">
                      {masterCount} result{masterCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Command>
    </div>
  )
}
