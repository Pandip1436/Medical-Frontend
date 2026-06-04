import { useState } from 'react'
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
  onClearFilters?: () => void
  children?: React.ReactNode // The filter inputs/dropdowns
  actionNode?: React.ReactNode // Custom actions aligned right
  midNode?: React.ReactNode   // Extra control between search and filters button
  // Rendered inside the expandable filters panel (below the filter inputs) —
  // e.g. the "Customize Columns" toggle, so it lives with the filters rather
  // than cluttering the top action row.
  columnsNode?: React.ReactNode
  // Override the search container's width class. Default behaviour fills the
  // remaining row width (flex-1). Pass e.g. "w-full sm:w-80" to constrain it
  // when there are many action buttons on the right.
  searchClassName?: string
}

export function DataTableFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  resultsCount,
  activeFilterCount = 0,
  defaultFiltersOpen = false,
  onClearFilters,
  children,
  actionNode,
  midNode,
  columnsNode,
  searchClassName,
}: DataTableFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(defaultFiltersOpen)
  // The filters panel (and its toggle) appear when there are filter inputs OR a
  // columns control to host.
  const hasPanel = Boolean(children || columnsNode)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* Search — fills remaining row width by default, or override via searchClassName */}
        <div className={cn('min-w-0', searchClassName ?? 'flex-1')}>
          <Input
            icon={<Search className="h-4 w-4" />}
            suffix={
              resultsCount !== undefined ? (
                <span className="tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                  {resultsCount} found
                </span>
              ) : undefined
            }
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Right cluster: midNode + filter toggle + clear + actionNode. ml-auto keeps it
            pinned to the right edge when the search is constrained via searchClassName. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {midNode}

          {/* Filter toggle + clear — always visible, never wraps off-screen */}
          {hasPanel && (
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

              {onClearFilters && activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={onClearFilters}
                >
                  <X className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              )}
            </div>
          )}

          {actionNode}
        </div>
      </div>

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
