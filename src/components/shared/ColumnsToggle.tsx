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
  /** Returns true if the given field is right-positioned in the card. */
  isRight?: (id: string) => boolean
  /** Toggle a field's left/right position. */
  onTogglePosition?: (id: string) => void
}

/**
 * "Customize Columns" control — checkbox list to show/hide card fields, with
 * optional L/R position toggle for positionable fields.
 * Pairs with `useColumnVisibility(tableKey, columns)`.
 */
export function ColumnsToggle({ columns, visible, onToggle, onReset, isRight, onTogglePosition }: ColumnsToggleProps) {
  const hasPositionable = columns.some((c) => c.positionable)

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
      <PopoverContent align="end" className={cn('p-0', hasPositionable ? 'w-64' : 'w-56')}>
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
              const right = isRight?.(col.id) ?? col.defaultPosition === 'right'

              return (
                <div
                  key={col.id}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    isLocked ? 'cursor-default opacity-80' : 'hover:bg-accent',
                  )}
                >
                  {/* Visibility checkbox */}
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={isOn}
                      disabled={isLocked}
                      onCheckedChange={() => !isLocked && onToggle(col.id)}
                    />
                    <span className={cn(isOn && 'font-medium text-foreground')}>{col.label}</span>
                  </label>

                  {/* Position toggle (L/R) for positionable fields */}
                  {col.positionable && isRight && onTogglePosition ? (
                    <div className="flex shrink-0 items-center overflow-hidden rounded border border-border/60">
                      <button
                        type="button"
                        onClick={() => right && onTogglePosition(col.id)}
                        className={cn(
                          'px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                          !right
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                        title="Left side"
                      >
                        L
                      </button>
                      <button
                        type="button"
                        onClick={() => !right && onTogglePosition(col.id)}
                        className={cn(
                          'border-l border-border/60 px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                          right
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                        title="Right side"
                      >
                        R
                      </button>
                    </div>
                  ) : isLocked ? (
                    <Badge variant="secondary" size="sm" className="shrink-0 text-[9px]">
                      required
                    </Badge>
                  ) : null}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
