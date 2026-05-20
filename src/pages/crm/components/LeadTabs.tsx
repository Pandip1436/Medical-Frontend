import { type ReactNode } from 'react'
import {
  Activity,
  CalendarClock,
  FileText,
  IndianRupee,
  Package,
  ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type LeadDetailTab =
  | 'details'
  | 'activity'
  | 'quotations'
  | 'invoices'
  | 'products'
  | 'followups'

const TABS: { value: LeadDetailTab; label: string; icon: typeof Activity }[] = [
  { value: 'details', label: 'Lead Details', icon: ScrollText },
  { value: 'activity', label: 'Activity', icon: Activity },
  { value: 'quotations', label: 'Quotations', icon: FileText },
  { value: 'invoices', label: 'Invoices', icon: IndianRupee },
  { value: 'products', label: 'Products', icon: Package },
  { value: 'followups', label: 'Follow Ups', icon: CalendarClock },
]

interface LeadTabsProps {
  active: LeadDetailTab
  onChange: (next: LeadDetailTab) => void
  children: ReactNode
  /**
   * Optional content rendered at the right end of the tab strip — used for
   * the per-lead communication icons (call / WhatsApp / email) so they
   * sit on the same line as the tabs.
   */
  rightSlot?: ReactNode
}

/**
 * Tab strip + content shell for the right detail panel. The strip itself
 * is sticky (sits right under the quick-actions row); the children render
 * inside a scrolling region below. Matches the styling of the customer
 * detail page tabs (border-b-2 active indicator) but specialized for leads.
 */
export function LeadTabs({
  active,
  onChange,
  children,
  rightSlot,
}: LeadTabsProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/40 bg-background">
        {/* Tabs on the left scroll horizontally if they overflow; the right
            slot (comm icons) is shrink-0 and stays pinned to the right edge. */}
        <div className="flex items-end justify-between gap-2 pl-2 pr-2">
          <div className="flex min-w-0 flex-1 items-end overflow-x-auto">
            {TABS.map((t) => {
              const isActive = t.value === active
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onChange(t.value)}
                  aria-label={t.label}
                  title={t.label}
                  className={cn(
                    '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2 sm:px-3 py-2.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-primary text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              )
            })}
          </div>
          {rightSlot && (
            <div className="flex shrink-0 items-center gap-0.5 pb-1.5">
              {rightSlot}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/[0.04]">
        {children}
      </div>
    </div>
  )
}
