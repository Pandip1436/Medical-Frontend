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
  onClearFilters?: () => void
  children?: React.ReactNode // The filter inputs/dropdowns
  actionNode?: React.ReactNode // Custom actions (e.g. view toggles) aligned right
}

export function DataTableFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  resultsCount,
  activeFilterCount = 0,
  onClearFilters,
  children,
  actionNode,
}: DataTableFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-full max-w-sm">
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

        {children && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={filtersOpen ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant={filtersOpen ? 'secondary' : 'info'} size="sm">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            
            {onClearFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={onClearFilters}
              >
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        )}

        {actionNode && (
          <div className="ml-auto flex items-center">
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
