import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DataTablePaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems?: number
  itemsPerPage?: number
  className?: string
}

export function DataTablePagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  className,
}: DataTablePaginationProps) {
  const [inputValue, setInputValue] = useState(currentPage.toString())

  useEffect(() => {
    setInputValue(currentPage.toString())
  }, [currentPage])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }

  const handleInputBlur = () => {
    const page = parseInt(inputValue)
    if (isNaN(page) || page < 1) {
      setInputValue(currentPage.toString())
    } else if (page > totalPages) {
      onPageChange(totalPages)
      setInputValue(totalPages.toString())
    } else {
      onPageChange(page)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur()
    }
  }

  const rangeStart = totalItems ? (currentPage - 1) * (itemsPerPage || 10) + 1 : 0
  const rangeEnd = totalItems ? Math.min(currentPage * (itemsPerPage || 10), totalItems) : 0

  return (
    <div className={cn("flex flex-row items-center justify-between gap-2 sm:gap-4 py-3 px-1", className)}>
      {totalItems !== undefined && (
        <p className="text-[11px] sm:text-[11px] text-muted-foreground whitespace-nowrap truncate">
          <span className="sm:hidden">{rangeStart}-{rangeEnd} of {totalItems}</span>
          <span className="hidden sm:inline">
            Showing <span className="font-bold text-foreground">{rangeStart}-{rangeEnd}</span> of <span className="font-bold text-foreground">{totalItems}</span> results
          </span>
        </p>
      )}

      <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-9 sm:h-8 min-w-9 px-2"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <div className="flex items-center gap-1.5 px-1 sm:px-2">
          <Input
            className="h-9 sm:h-8 w-10 sm:w-12 px-1 text-center text-xs font-bold tabular-nums"
            inputMode="numeric"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            aria-label="Current page"
          />
          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
            / {totalPages || 1}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-9 sm:h-8 min-w-9 px-2"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
        >
          <span className="hidden sm:inline mr-1">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
