import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronUp, FileQuestion, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SplitViewShellProps {
  // Left rail
  searchValue: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  resultCount: number
  resultLabel: string
  loading: boolean
  /** Rendered inside the scrollable card list area */
  cards: ReactNode
  /**
   * Kept for backward compatibility with existing callers, which also wire
   * the same handler to the page's table/split ViewModeToggle — that's the
   * only place it's still invoked from. The shell itself no longer renders
   * its own exit-split-view control (see the header strip below).
   */
  onExitSplitView: () => void
  /**
   * Mobile-only (<768px): clear the current selection and return to the list
   * pane without exiting split view. Falls back to onExitSplitView when
   * omitted, so existing callers keep compiling unchanged.
   */
  onBackToList?: () => void
  /** Optional tabs rendered between the search strip and the result count */
  tabsNode?: ReactNode

  // Right panel
  selectedId: string | null
  detailLoading: boolean
  detailError: string | null
  /** Rendered when an item is selected and detail is loaded */
  detailContent: ReactNode
  emptyIcon?: ReactNode
  emptyLabel?: string
}

/**
 * Generic two-column split-view shell reused by Invoices, GRN, and Products.
 * Left rail: search strip + scrollable compact card list.
 * Right panel: detail content with loading / error / empty states.
 */
export function SplitViewShell({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  resultCount,
  resultLabel,
  loading,
  cards,
  onBackToList,
  tabsNode,
  selectedId,
  detailLoading,
  detailError,
  detailContent,
  emptyIcon,
  emptyLabel,
}: SplitViewShellProps) {
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [showListTop, setShowListTop] = useState(false)

  // On phones the two panels can't sit side by side, so we show one at a time:
  // the list, or the selected item's detail. The view OPENS on the list; tapping
  // a card switches to the detail; the in-detail "Back" button returns to the
  // list. md+ ignores this and shows both panels side by side.
  const [mobileShowDetail, setMobileShowDetail] = useState(false)

  const handleListScroll = () => {
    setShowListTop((listScrollRef.current?.scrollTop ?? 0) > 120)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-border/60 bg-background md:grid-cols-[minmax(280px,30%)_1fr]">
      {/* ── Left rail ── (list). On phones it's hidden while viewing a detail. */}
      <aside className={cn('min-h-0 min-w-0 flex-col border-r border-border/40', mobileShowDetail ? 'hidden md:flex' : 'flex')}>
        {/* Header strip: search. Exiting split view lives in the toolbar's
            table/split ViewModeToggle (via the same onExitSplitView the
            caller wires there) — a second exit control here, right next to
            an unrelated local search box, was redundant and confusing. */}
        <div className="flex shrink-0 items-center border-b border-border/40 px-3 py-2.5">
          <Input
            icon={<Search className="h-3.5 w-3.5" />}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        {/* Optional status tabs. In the narrow rail we stretch the pill group
            to full width (no dead whitespace on the right): force the tabs
            container to flex/w-full and let each tab button split the width
            evenly. This targets the shared pill pattern every caller uses
            (a single <div> of <button>s) without each page needing its own
            fullWidth flag. */}
        {tabsNode && (
          <div className="shrink-0 border-b border-border/40 px-3 py-2 [&>div]:flex [&>div]:w-full [&>div>button]:flex-1 [&>div>button]:justify-center">
            {tabsNode}
          </div>
        )}

        {/* Result count strip */}
        <div className="shrink-0 border-b border-border/40 bg-muted/15 px-3 py-1.5 text-[11px] text-muted-foreground">
          {loading
            ? 'Loading…'
            : `${resultCount} ${resultLabel}${resultCount === 1 ? '' : 's'}`}
        </div>

        {/* Scrollable card list */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={listScrollRef}
            onScroll={handleListScroll}
            // Tapping a card (which bubbles here) switches to the detail on phones.
            onClick={() => setMobileShowDetail(true)}
            className="h-full overflow-y-auto"
          >
            {loading && resultCount === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : resultCount === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                No {resultLabel}s match the current filters
              </div>
            ) : (
              cards
            )}
          </div>

          {/* Scroll-to-top button — appears after scrolling down */}
          <button
            type="button"
            onClick={() => listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll to top"
            className={cn(
              'absolute bottom-3 left-1/2 -translate-x-1/2 z-10',
              'flex h-7 w-7 items-center justify-center rounded-full',
              'bg-background/90 border border-border/60 shadow-md backdrop-blur-sm',
              'text-muted-foreground hover:text-foreground hover:border-border',
              'transition-all duration-200',
              showListTop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
            )}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      {/* ── Right panel ── (detail). On phones it's shown only while a detail is
          open, with a Back button to return to the list. */}
      <section className={cn('min-h-0 min-w-0 flex-col', mobileShowDetail ? 'flex' : 'hidden md:flex')}>
        {/* Mobile-only back-to-list bar — always available so you can never get
            stuck on the detail panel. */}
        <div className="flex shrink-0 items-center border-b border-border/40 px-2 py-1.5 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setMobileShowDetail(false)}
            aria-label="Back to list"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to list
          </Button>
        </div>
        {detailLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-xs text-muted-foreground">Loading…</span>
            </div>
          </div>
        ) : detailError ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-600 dark:text-rose-400">
            {detailError}
          </div>
        ) : !selectedId || !detailContent ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            {emptyIcon ?? <FileQuestion className="h-8 w-8 opacity-40" />}
            <p>{emptyLabel ?? `Select a ${resultLabel} on the left to see its details`}</p>
          </div>
        ) : (
          detailContent
        )}
      </section>
    </div>
  )
}
