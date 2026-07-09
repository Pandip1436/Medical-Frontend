import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
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
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onClearFilters?: () => void
  children?: React.ReactNode
  actionNode?: React.ReactNode
  leadingNode?: React.ReactNode
  // Renders to the RIGHT of leadingNode in the same flex row on mobile.
  // Use this for primary actions (e.g. Create + PE buttons) so they sit
  // alongside the period selector instead of a third separate row.
  leadingActionNode?: React.ReactNode
  midNode?: React.ReactNode
  // Renders to the RIGHT of the search input in the same row.
  // Ideal for icon-only controls (filter toggle, stats toggle) so they
  // sit inline with the search bar on both mobile and desktop.
  searchEndNode?: React.ReactNode
  // When true the built-in filter toggle button is NOT rendered in the
  // bottom action row — use this when searchEndNode already contains a
  // custom filter toggle so the button doesn't appear twice.
  hideFilterToggle?: boolean
  columnsNode?: React.ReactNode
  searchClassName?: string
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
  leadingActionNode,
  midNode,
  searchEndNode,
  hideFilterToggle = false,
  columnsNode,
  searchClassName,
}: DataTableFilterBarProps) {
  const [internalOpen, setInternalOpen] = useState(defaultFiltersOpen)
  const filtersOpen = open ?? internalOpen
  const setFiltersOpen = (v: boolean) => {
    onOpenChange?.(v)
    if (open === undefined) setInternalOpen(v)
  }
  const hasPanel = Boolean(children || columnsNode)

  const clearBtn = onClearFilters && activeFilterCount > 0 ? (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-foreground"
      onClick={onClearFilters}
    >
      <X className="h-3.5 w-3.5 sm:mr-1" />
      <span className="hidden sm:inline">Clear</span>
    </Button>
  ) : null

  return (
    <div className="space-y-3">
      {/* ── Row 1: Period selector (leadingNode) + mobile primary actions ── */}
      {/* On mobile this is its own full-width row. On sm+ it collapses into
          the single flex line (natural-width leading, flex-1 search, auto trailing). */}
      {(leadingNode || leadingActionNode) && (
        <div className={cn(
          'flex w-full items-center gap-1.5',
          'order-1 sm:w-auto sm:shrink-0',
          leadingNode ? 'items-end' : 'items-center',
        )}>
          {leadingNode && (
            <div className="min-w-0 flex-1 sm:flex-none sm:w-40">{leadingNode}</div>
          )}
          {/* Mobile-only: primary actions beside the period. On sm+ these are
              hidden here — they appear in actionNode instead. */}
          {leadingActionNode && (
            <div className="flex shrink-0 items-center gap-1 sm:hidden">
              {leadingActionNode}
            </div>
          )}
        </div>
      )}

      {/* ── Row 2: Search input + inline icon controls ── */}
      <div className={cn(
        'flex items-center gap-1.5',
        'order-2 w-full min-w-0 sm:w-auto',
        searchClassName ?? 'sm:flex-1',
      )}>
        <div className="min-w-0 flex-1">
          <Input
            icon={<Search className="h-4 w-4" />}
            suffix={
              resultsCount !== undefined ? (
                <span className="whitespace-nowrap rounded-md bg-foreground/6 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {resultsCount} found
                </span>
              ) : undefined
            }
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {/* Icon controls inline with search (filter toggle, stats toggle, etc.) */}
        {searchEndNode && (
          <div className="flex shrink-0 items-center gap-0.5">{searchEndNode}</div>
        )}
      </div>

      {/* ── Row 3: Clear + midNode + default filter toggle + actionNode ── */}
      <div className="order-3 flex w-full flex-wrap items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end">
        {midNode}

        {/* Default filter toggle — suppressed when searchEndNode owns it */}
        {hasPanel && !hideFilterToggle && (
          <div className="flex shrink-0 items-center gap-1.5">
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
            {clearBtn}
          </div>
        )}

        {/* When filter toggle is suppressed, still show the clear button */}
        {hasPanel && hideFilterToggle && clearBtn}

        {actionNode && hasPanel && !hideFilterToggle && (
          <div className="mx-0.5 hidden h-6 w-px bg-border/60 sm:block" />
        )}

        {actionNode}
      </div>

      {/* ── Expandable filter panel ── */}
      <AnimatePresence>
        {filtersOpen && hasPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Card className="bg-muted/20 dark:bg-muted/10">
              <CardContent className="p-4">
                {children && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {children}
                  </div>
                )}
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
