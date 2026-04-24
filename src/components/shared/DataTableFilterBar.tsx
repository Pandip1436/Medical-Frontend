import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

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
}: DataTableFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(defaultFiltersOpen)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* Search — grows to fill available space */}
        <div className="min-w-0 flex-1">
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

        {midNode && <div className="shrink-0">{midNode}</div>}

        {/* Filter toggle + clear — always visible, never wraps off-screen */}
        {children && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant={filtersOpen ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setFiltersOpen(!filtersOpen)}
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

        {actionNode && (
          <div className="shrink-0">
            {actionNode}
          </div>
        )}
      </div>

      <AnimatePresence>
        {filtersOpen && children && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Card className="bg-muted/20 dark:bg-muted/10">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {children}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
