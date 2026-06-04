import { Columns3, ChevronDown, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@/types/table'

interface ColumnsToggleProps {
  columns: ColumnDef[]
  /** Currently-visible column ids. */
  visible: string[]
  onToggle: (id: string) => void
  onReset?: () => void
}

/**
 * "Customize Columns" control — a button that opens a checkbox list to show/hide
 * a table's columns. Drop it into a page's DataTableFilterBar `actionNode`.
 * Pairs with `useColumnVisibility(tableKey, columns)`.
 */
export function ColumnsToggle({ columns, visible, onToggle, onReset }: ColumnsToggleProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">Columns</span>
          <Badge variant="secondary" size="sm" className="h-4 px-1 text-[10px]">
            {visible.length}
          </Badge>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
          <h3 className="text-xs font-semibold">Toggle Columns</h3>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Restore default columns"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-1">
            {columns.map((col) => {
              const isOn = visible.includes(col.id)
              const isLocked = !!col.required
              return (
                <label
                  key={col.id}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
                    isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:bg-accent',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={isOn}
                      disabled={isLocked}
                      onCheckedChange={() => !isLocked && onToggle(col.id)}
                    />
                    <span className={cn(isOn && 'font-medium text-foreground')}>{col.label}</span>
                  </span>
                  {isLocked && (
                    <Badge variant="secondary" size="sm" className="text-[9px]">
                      required
                    </Badge>
                  )}
                </label>
              )
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
