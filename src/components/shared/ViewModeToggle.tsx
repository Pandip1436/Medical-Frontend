import { LayoutList, LayoutPanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ViewMode = 'table' | 'split'

interface ViewModeToggleProps {
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  className?: string
}

export function ViewModeToggle({ view, onViewChange, className }: ViewModeToggleProps) {
  return (
    <div
      className={cn(
        // Hidden on mobile/tablet — split view is only reachable from lg up
        // (below that the list is forced to table view), so the toggle would
        // be a no-op there.
        'hidden items-center rounded-md border border-border/60 bg-muted/30 p-0.5 lg:flex',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        title="Table view"
        aria-label="Table view"
        className={cn(
          'h-9 w-9 rounded-sm transition-all md:h-7 md:w-7',
          view === 'table' && 'bg-background shadow-sm text-foreground',
        )}
        onClick={() => onViewChange('table')}
      >
        <LayoutList className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Split view"
        aria-label="Split view"
        className={cn(
          'h-9 w-9 rounded-sm transition-all md:h-7 md:w-7',
          view === 'split' && 'bg-background shadow-sm text-foreground',
        )}
        onClick={() => onViewChange('split')}
      >
        <LayoutPanelLeft className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
