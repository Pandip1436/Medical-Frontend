import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DataTableFilterBarProps {
  searchQuery: string
  onSearchChange: (val: string) => void
  searchPlaceholder?: string
  resultsCount?: number
  activeFilterCount?: number
  defaultFiltersOpen?: boolean
  // Optional controlled open state — pass both to let a parent open/close the
  // filters panel (e.g. auto-open it when "Custom Range" is picked). Omit to
  // keep the built-in uncontrolled behaviour seeded by defaultFiltersOpen.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onClearFilters?: () => void
  children?: React.ReactNode // The filter inputs/dropdowns
  actionNode?: React.ReactNode // Custom actions aligned right
  // Always-visible filter rendered at the LEFT of the search row (outside the
  // collapsible panel) — used for the most-changed filter, e.g. Period.
  leadingNode?: React.ReactNode
  midNode?: React.ReactNode   // Extra control between search and filters button
  // Rendered inside the expandable filters panel (below the filter inputs) —
  // e.g. the "Customize Columns" toggle, so it lives with the filters rather
  // than cluttering the top action row.
  columnsNode?: React.ReactNode
  // Override the search container's width class. Default behaviour fills the
  // remaining row width (flex-1). Pass e.g. "w-full sm:w-80" to constrain it
  // when there are many action buttons on the right.
  searchClassName?: string
  // Opt-in: keep search + the filter/action cluster on ONE row on mobile
  // instead of the default three-stacked-rows layout. Only safe for pages
  // whose actionNode is compact (e.g. just an Export dropdown) — pages with
  // several prominent CTAs (Create X, view toggles, ...) should leave this
  // off so those buttons keep their own full-width row instead of crowding
  // the search input.
  compactActionsRow?: boolean
}

export function DataTableFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  resultsCount,
  activeFilterCount = 0,
  defaultFiltersOpen = false,
  open,
  onOpenChange,
  onClearFilters,
  children,
  actionNode,
  leadingNode,
  midNode,
  columnsNode,
  searchClassName,
  compactActionsRow = false,
}: DataTableFilterBarProps) {
  const [internalOpen, setInternalOpen] = useState(defaultFiltersOpen)
  // Controlled when `open` is provided; otherwise self-managed.
  const filtersOpen = open ?? internalOpen
  const setFiltersOpen = (v: boolean) => {
    onOpenChange?.(v)
    if (open === undefined) setInternalOpen(v)
  }
  // The filters panel (and its toggle) appear when there are filter inputs OR a
  // columns control to host.
  const hasPanel = Boolean(children || columnsNode)

  // framer-motion's height:'auto' entrance animation measures scrollHeight once
  // at transition start; if content settles at a taller size afterward (e.g. an
  // async-loaded search-select), the panel can freeze at a shorter height while
  // `overflow-hidden` permanently clips the rest — visible content gets cut off
  // with no way to scroll to it (the outer page has nothing left to scroll into).
  // Once the enter transition finishes, drop overflow-hidden so any residual
  // mismeasurement just lets content overflow visibly instead of clipping it.
  const [panelSettled, setPanelSettled] = useState(false)
  useEffect(() => {
    if (!filtersOpen) setPanelSettled(false)
  }, [filtersOpen])

  return (
    <div className="space-y-3">
      {/* When a leading filter (with its own top label) is present, bottom-align
          the row so its select lines up with the search box + buttons instead of
          sitting lower than them. Without it, keep the plain centered layout. */}
      {/* Mobile stacks into two rows via flex-wrap + order: row 1 = search +
          Filters button together (full width); row 2 = leading filter (grows) +
          action cluster. From sm up it collapses onto a single row (leading,
          search flex-1, filters, actions) — identical to the previous desktop. */}
      <div className={cn('flex flex-wrap gap-2', leadingNode ? 'items-end' : 'items-center')}>
        {/* Always-visible leading filter (e.g. Period) — grows to fill mobile
            row 2 beside the actions; natural width from sm up. */}
        {leadingNode && <div className="order-2 min-w-0 flex-1 sm:order-1 sm:w-auto sm:flex-none sm:shrink-0">{leadingNode}</div>}

        {/* Search + Filters — ONE unit on a single row. Full-width row 1 on mobile
            (or stays inline with the action cluster when compactActionsRow is on);
            grows to fill the middle from sm up. Inside: search (flex-1) then the
            Filters toggle, so desktop reads leading → search → filters → actions. */}
        <div className={cn(
          'order-1 flex items-center gap-2 sm:order-2 sm:w-auto sm:flex-1',
          compactActionsRow ? 'min-w-40 flex-1' : 'w-full',
        )}>
          <div className={cn('min-w-0', searchClassName ?? 'flex-1')}>
            <Input
              icon={<Search className="h-4 w-4" />}
              suffix={
                resultsCount !== undefined ? (
                  <span className="whitespace-nowrap rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {resultsCount} found
                  </span>
                ) : undefined
              }
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Filters group (midNode + toggle) — icon-only on mobile, labelled sm+. */}
          {(midNode || hasPanel) && (
            <div className="flex shrink-0 items-center gap-1.5">
              {midNode}

              {hasPanel && (
                <Button
                  variant={filtersOpen ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5 whitespace-nowrap"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  aria-label="Toggle filters"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <Badge variant={filtersOpen ? 'secondary' : 'info'} size="sm">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {actionNode && (
          <div className={cn(
            'order-3 flex items-center justify-end gap-1.5 sm:w-auto sm:shrink-0',
            compactActionsRow ? 'shrink-0' : (leadingNode ? 'ml-auto' : 'w-full'),
          )}>
            {hasPanel && <div className="mx-0.5 hidden h-6 w-px bg-border/60 sm:block" />}
            {actionNode}
          </div>
        )}
      </div>

      <AnimatePresence>
        {filtersOpen && hasPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            onAnimationComplete={() => setPanelSettled(true)}
            className={panelSettled ? undefined : 'overflow-hidden'}
          >
            <Card className="bg-muted/20 dark:bg-muted/10">
              <CardContent className="p-4">
                {/* Clear-all lives INSIDE the panel — a labelled header row above
                    the filter inputs, so clearing filters is discovered where the
                    filters themselves live rather than in the top toolbar. */}
                {onClearFilters && activeFilterCount > 0 && (
                  <div className={cn(
                    'flex items-center justify-between gap-3',
                    (children || columnsNode) && 'mb-4 border-b border-border/40 pb-3',
                  )}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={onClearFilters}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Clear all
                    </Button>
                  </div>
                )}
                {children && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {children}
                  </div>
                )}
                {/* Customize-columns control lives at the foot of the filters panel. */}
                {columnsNode && (
                  <div className={cn(
                    'flex flex-wrap items-center justify-between gap-3',
                    children && 'mt-4 border-t border-border/40 pt-3',
                  )}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Visible Columns
                    </span>
                    {columnsNode}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}