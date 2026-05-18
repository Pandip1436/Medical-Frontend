import { useEffect, useState } from 'react'
import { Columns3, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ALL_COLUMNS } from '../types'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'pbims_leads_columns'

function loadVisible(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultVisible()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return defaultVisible()
    // Always keep required columns even if a stale localStorage omits them.
    const required = ALL_COLUMNS.filter((c) => c.required).map((c) => c.id)
    return Array.from(new Set([...required, ...parsed]))
  } catch {
    return defaultVisible()
  }
}

function defaultVisible(): string[] {
  return ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)
}

/**
 * Stateful hook that owns the visible-columns set and persists it.
 * Used by the leads page itself; the popover below is a controlled UI on top.
 */
export function useVisibleColumns() {
  const [visible, setVisible] = useState<string[]>(() => loadVisible())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visible))
    } catch { /* localStorage full or disabled — non-fatal */ }
  }, [visible])

  function toggle(id: string) {
    const col = ALL_COLUMNS.find((c) => c.id === id)
    if (!col || col.required) return // can't hide a required column
    setVisible((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function isVisible(id: string) {
    return visible.includes(id)
  }

  return { visible, isVisible, toggle, reset: () => setVisible(defaultVisible()) }
}

interface ColumnsToggleProps {
  visible: string[]
  onToggle: (id: string) => void
}

export function ColumnsToggle({ visible, onToggle }: ColumnsToggleProps) {
  // Trigger is styled to match the sibling filter chips so the whole row
  // (Source / Stage / Employ / Created / Update / Columns) reads as one unit.
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-2">
            <Columns3 className="h-3.5 w-3.5" />
            <span>Columns</span>
          </span>
          <span className="flex items-center gap-1">
            <Badge variant="secondary" size="sm" className="h-4 px-1 text-[10px]">
              {visible.length}
            </Badge>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <div className="border-b border-border/40 px-3 py-2">
          <h3 className="text-xs font-semibold">Toggle Columns</h3>
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-1">
            {ALL_COLUMNS.map((col) => {
              const isOn = visible.includes(col.id)
              const isLocked = !!col.required
              return (
                <label
                  key={col.id}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
                    isLocked
                      ? 'cursor-not-allowed opacity-80'
                      : 'hover:bg-accent',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={isOn}
                      disabled={isLocked}
                      onCheckedChange={() => !isLocked && onToggle(col.id)}
                    />
                    <span className={cn(isOn && 'font-medium text-foreground')}>
                      {col.label}
                    </span>
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
