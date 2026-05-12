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
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-1", className)}>
      {totalItems !== undefined && (
        <p className="text-[11px] text-muted-foreground whitespace-nowrap">
          Showing <span className="font-bold text-foreground">{rangeStart}-{rangeEnd}</span> of <span className="font-bold text-foreground">{totalItems}</span> results
        </p>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <div className="flex items-center gap-1.5 px-2">
          <Input
            className="h-8 w-12 px-1 text-center text-xs font-bold tabular-nums"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
          />
          <span className="text-xs text-muted-foreground font-medium">
            / {totalPages || 1}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <span className="hidden sm:inline mr-1">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
