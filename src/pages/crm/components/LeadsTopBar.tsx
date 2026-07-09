import {
  BarChart3,
  LayoutGrid,
  List,
  PanelLeftClose,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { IndiamartSyncIndicator } from './IndiamartSyncIndicator'
import type { LeadListCounts, LeadTab } from '../types'
import { TABS } from '../types'

// The view toggle is a single contiguous pill — list / kanban / split.
export type ViewMode = 'list' | 'kanban' | 'split'

interface LeadsTopBarProps {
  tab: LeadTab
  counts: LeadListCounts
  onTabChange: (tab: LeadTab) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
}

// Tab pill colour by tab key — matches the colour shorthand the screenshot uses.
const tabPillTone: Record<LeadTab, string> = {
  all: 'bg-muted text-muted-foreground',
  open: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  closed: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  untouched: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  lead: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  qualified: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  proposal: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  negotiation: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  won: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  lost: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
}

export function LeadsTopBar({
  tab,
  counts,
  onTabChange,
  view,
  onViewChange,
}: LeadsTopBarProps) {
  return (
    // Single row, never wraps. flex-nowrap is explicit. Tabs scroll within
    // their own track if needed; right cluster always pins to the right.
    // items-end keeps tab bottoms and the action cluster bottom on the same
    // baseline so the wrapper hairline reads as one line. min-w-0 + the
    // inner overflow-x-auto on the tab strip keep the page itself from
    // ever growing wider than its parent.
    <div className="flex min-w-0 flex-nowrap items-end justify-between gap-3 border-b border-border/40">
      {/* Tab strip — each tab's own bottom border IS the indicator, exactly
          like CustomerDetailPage tabs. Transparent when inactive, primary
          when active. overflow-hidden + min-w-0 so trackpad/mouse-wheel
          horizontal swipes can never scroll the strip (which the user was
          seeing as "the page shakes when I move the mouse horizontally"). */}
      {/* responsive: touch-scrollable on phones so all tabs are reachable;
          overflow-hidden at md+ keeps the desktop anti-wheel-shake behavior */}
      <div className="flex min-w-0 flex-1 items-end overflow-x-auto md:overflow-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <nav className="flex items-end gap-0">
          {TABS.map((t) => {
            const active = t.value === tab
            const count = counts[t.value]
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onTabChange(t.value)}
                className={cn(
                  // -mb-px so the tab's own border-b sits exactly on top of
                  // the wrapper's border-b, never above or below it.
                  '-mb-px flex shrink-0 items-center gap-1.5 rounded-none border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground font-semibold'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <span>{t.label}</span>
                <Badge
                  size="sm"
                  className={cn('h-4 px-1.5 text-[10px] font-bold', tabPillTone[t.value])}
                  variant="secondary"
                >
                  {count}
                </Badge>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Right cluster — view modes + upload/download + Add Lead + kebab.
          pb-2 + shrink-0 → never wraps; sits on the same baseline as the tabs. */}
      <div className="flex shrink-0 items-center gap-1.5 pb-2">
        <IndiamartSyncIndicator />
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate('/crm/leads/analytics')}
        >
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Analytics</span>
        </Button>

        {/* Grouped 3-way view toggle */}
        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
          {([
            { value: 'list', label: 'List', icon: List },
            { value: 'kanban', label: 'Board', icon: LayoutGrid },
            { value: 'split', label: 'Split', icon: PanelLeftClose },
          ] as const).map((opt) => {
            const active = view === opt.value
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onViewChange(opt.value)}
                title={opt.label}
                aria-label={opt.label}
                className={cn(
                  'inline-flex h-7 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-background text-primary shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            )
          })}
        </div>

      </div>
    </div>
  )
}
