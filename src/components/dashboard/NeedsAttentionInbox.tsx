import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { parseISO } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Clock,
  IndianRupee,
  Loader2,
  Package,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { navigate } from '@/lib/router'
import { cn, formatCurrencyCompact } from '@/lib/utils'
import type { ExpiringBatch, LowStockItem, OverdueCustomer } from './types'

export type FilterTag = 'all' | 'due' | 'low' | 'exp'

type Severity = 'critical' | 'high' | 'medium'

interface AttentionRow {
  id: string
  severity: Severity
  tag: string
  tagColor: string
  icon: LucideIcon
  title: string
  // Optional second identity line shown directly under the title (used by
  // overdue customer rows to surface phone for disambiguation).
  titleSub?: string
  meta: string
  actionLabel: string
  onAction: () => void
  sortKey: number
}

function daysUntil(date: string): number {
  // Use parseISO for cross-browser consistency — Safari fails on some
  // non-ISO date strings the backend might return for expiry/due dates.
  const parsed = parseISO(date)
  const ms = Number.isNaN(parsed.getTime()) ? new Date(date).getTime() : parsed.getTime()
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000))
}

function buildRows({
  lowStockItems,
  expiringBatches,
  overdueCustomers,
}: {
  lowStockItems: LowStockItem[]
  expiringBatches: ExpiringBatch[]
  overdueCustomers: OverdueCustomer[]
}): AttentionRow[] {
  const rows: AttentionRow[] = []

  lowStockItems.forEach((item) => {
    const isOut = item.totalStock === 0
    const deficit = item.minStock > 0 ? (item.minStock - item.totalStock) / item.minStock : 0
    rows.push({
      id: `stock-${item.id}`,
      severity: isOut ? 'critical' : deficit > 0.5 ? 'high' : 'medium',
      tag: isOut ? 'OUT' : 'LOW',
      tagColor: isOut ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400' : 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
      icon: Package,
      title: item.name,
      meta: `${item.totalStock} / ${item.minStock} in stock · ${item.packSize}`,
      actionLabel: 'View stock',
      // Deep-link to the product's stock history so the user lands on context, not a generic list.
      onAction: () => navigate(`/inventory/product-history?productId=${item.id}`),
      sortKey: isOut ? 0 : 100 - deficit * 100,
    })
  })

  expiringBatches.forEach((batch) => {
    const days = daysUntil(batch.expiryDate)
    rows.push({
      id: `exp-${batch.id}`,
      severity: days < 30 ? 'critical' : days < 60 ? 'high' : 'medium',
      tag: 'EXP',
      tagColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      icon: Clock,
      title: batch.product.name,
      meta: `Batch ${batch.batchNumber} · ${batch.quantity} units · ${days} ${days === 1 ? 'day' : 'days'} left`,
      actionLabel: 'View batch',
      // Dedicated batch detail page — same destination expiry notifications use.
      onAction: () => navigate(`/inventory/batches/detail?id=${batch.id}`),
      sortKey: days,
    })
  })

  overdueCustomers.forEach((cust) => {
    const phone = cust.customerPhone && cust.customerPhone !== '0000000000' ? cust.customerPhone : undefined
    rows.push({
      id: `due-${cust.customerId || cust.customerName}`,
      severity: cust.daysOverdue > 90 ? 'critical' : cust.daysOverdue > 60 ? 'high' : 'medium',
      tag: 'OVR',
      tagColor: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
      icon: IndianRupee,
      title: cust.customerName,
      titleSub: phone,
      meta: `${formatCurrencyCompact(cust.overdueAmount)} · ${cust.daysOverdue} ${cust.daysOverdue === 1 ? 'day' : 'days'} overdue · ${cust.invoiceCount} ${cust.invoiceCount === 1 ? 'invoice' : 'invoices'}`,
      actionLabel: 'Remind',
      onAction: () =>
        navigate(cust.customerId ? `/customers/${cust.customerId}` : '/customers/outstanding'),
      sortKey: -cust.daysOverdue,
    })
  })

  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2 }
  return rows.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity]
    return s !== 0 ? s : a.sortKey - b.sortKey
  })
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-rose-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
}

// Each alert type gets its own hue so users can scan by category at a glance:
// rose = out of stock, orange = below reorder, amber = expiring, violet = overdue payment.
// rowBg is a very-light tint that fills the whole row; hoverBg deepens it on hover.
const TYPE_STYLES: Record<string, { border: string; iconBg: string; iconColor: string; rowBg: string; hoverBg: string }> = {
  OUT: { border: 'border-l-rose-500',   iconBg: 'bg-rose-500/15',   iconColor: 'text-rose-700 dark:text-rose-400',     rowBg: 'bg-rose-500/5',   hoverBg: 'hover:bg-rose-500/10' },
  LOW: { border: 'border-l-orange-500', iconBg: 'bg-orange-500/15', iconColor: 'text-orange-700 dark:text-orange-400', rowBg: 'bg-orange-500/5', hoverBg: 'hover:bg-orange-500/10' },
  EXP: { border: 'border-l-amber-500',  iconBg: 'bg-amber-500/15',  iconColor: 'text-amber-700 dark:text-amber-400',   rowBg: 'bg-amber-500/5',  hoverBg: 'hover:bg-amber-500/10' },
  OVR: { border: 'border-l-violet-500', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-700 dark:text-violet-400', rowBg: 'bg-violet-500/5', hoverBg: 'hover:bg-violet-500/10' },
}

interface NeedsAttentionInboxProps {
  lowStockItems: LowStockItem[]
  expiringBatches: ExpiringBatch[]
  overdueCustomers: OverdueCustomer[]
  lowStockTotal: number
  expiringTotal: number
  overdueTotal: number
  isLoadingMore?: boolean
  // Lazy-load the next page for the active filter's source(s). For 'all' the
  // parent extends whichever sources still have rows; for a single-type tab it
  // pages just that source.
  onLoadMore?: (filter: FilterTag) => void
}

export function NeedsAttentionInbox({
  lowStockItems,
  expiringBatches,
  overdueCustomers,
  lowStockTotal,
  expiringTotal,
  overdueTotal,
  isLoadingMore = false,
  onLoadMore,
}: NeedsAttentionInboxProps) {
  const rows = useMemo(
    () => buildRows({ lowStockItems, expiringBatches, overdueCustomers }),
    [lowStockItems, expiringBatches, overdueCustomers],
  )
  const [filter, setFilter] = useState<FilterTag>('all')

  // Tab totals use BACKEND counts so users see true magnitudes (the row list
  // grows as pages are lazy-loaded on scroll).
  const tabs: Array<{ value: FilterTag; label: string; count: number }> = [
    { value: 'all', label: 'All', count: lowStockTotal + expiringTotal + overdueTotal },
    { value: 'due', label: 'Due', count: overdueTotal },
    { value: 'low', label: 'Low', count: lowStockTotal },
    { value: 'exp', label: 'Exp', count: expiringTotal },
  ]

  const filteredRows = useMemo(() => {
    switch (filter) {
      case 'due': return rows.filter((r) => r.tag === 'OVR')
      case 'low': return rows.filter((r) => r.tag === 'LOW' || r.tag === 'OUT')
      case 'exp': return rows.filter((r) => r.tag === 'EXP')
      default:    return rows
    }
  }, [rows, filter])

  const totalCount = lowStockTotal + expiringTotal + overdueTotal
  const activeTotal = tabs.find((t) => t.value === filter)?.count ?? 0
  const hasMore = Boolean(onLoadMore) && filteredRows.length < activeTotal

  const viewportRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useInfiniteScroll({
    root: viewportRef,
    sentinel: sentinelRef,
    hasMore,
    isLoading: isLoadingMore,
    onLoadMore: () => onLoadMore?.(filter),
  })

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="h-full">
      <Card className="flex flex-col min-h-75 lg:h-115">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-base">Needs attention</CardTitle>
            </div>
            <FilterTabs tabs={tabs} active={filter} onChange={setFilter} />
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden">
          {totalCount === 0 ? (
            <EmptyState />
          ) : filteredRows.length === 0 ? (
            <FilterEmptyState />
          ) : (
            <ScrollArea className="h-full pr-3" viewportRef={viewportRef}>
              <div className="space-y-1.5">
                {filteredRows.map((row, idx) => (
                  <AttentionItem key={row.id} row={row} index={idx} />
                ))}
              </div>
              {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden />}
              {isLoadingMore && <LoadMoreRow />}
            </ScrollArea>
          )}
        </CardContent>
        <ViewAllFooter
          filter={filter}
          visibleCount={filteredRows.length}
          totalCount={activeTotal}
        />
      </Card>
    </motion.div>
  )
}

function LoadMoreRow() {
  return (
    <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading more…
    </div>
  )
}

function FilterTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ value: FilterTag; label: string; count: number }>
  active: FilterTag
  onChange: (v: FilterTag) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
            active === t.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          <span className={cn(
            'rounded px-1 text-[10px] font-semibold tabular-nums',
            active === t.value ? 'bg-muted text-foreground' : 'text-muted-foreground/70',
          )}>
            {t.count}
          </span>
        </button>
      ))}
    </div>
  )
}

function ViewAllFooter({
  filter,
  visibleCount,
  totalCount,
}: {
  filter: FilterTag
  visibleCount: number
  totalCount: number
}) {
  // Nothing to show / no overflow: skip the footer entirely.
  if (totalCount === 0 || visibleCount >= totalCount) return null

  // 'all' tab mixes types — there's no single page to view-all on, so the
  // footer just nudges the user toward the type filters instead.
  const viewAll = filter === 'all'
    ? null
    : ({
        due: { label: 'View all overdue', href: '/customers/outstanding' },
        low: { label: 'View all low stock', href: '/inventory/stock' },
        exp: { label: 'View all near-expiry', href: '/inventory/expiry' },
      } as const)[filter]

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/40 px-5 py-2.5 text-xs">
      <span className="text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{visibleCount}</span> of{' '}
        <span className="font-semibold text-foreground">{totalCount}</span>
      </span>
      {viewAll ? (
        <button
          type="button"
          onClick={() => navigate(viewAll.href)}
          className="inline-flex items-center gap-1 font-medium text-foreground transition-colors hover:text-primary"
        >
          {viewAll.label}
          <ArrowRight className="h-3 w-3" />
        </button>
      ) : (
        <span className="text-muted-foreground/70">Filter by type to view all</span>
      )}
    </div>
  )
}

function FilterEmptyState() {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-muted-foreground">No items in this category.</p>
    </div>
  )
}

function AttentionItem({ row, index }: { row: AttentionRow; index: number }) {
  const Icon = row.icon
  const style = TYPE_STYLES[row.tag] ?? TYPE_STYLES.LOW
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.03, duration: 0.25 }}
      onClick={row.onAction}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          row.onAction()
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/40 border-l-4 p-2 transition-colors',
        style.border,
        style.rowBg,
        style.hoverBg,
      )}
    >
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[row.severity])} aria-hidden />

      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', style.iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', style.iconColor)} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider', row.tagColor)}>
            {row.tag}
          </span>
          <p className="truncate text-sm font-medium leading-snug text-foreground">{row.title}</p>
        </div>
        {row.titleSub && (
          <p className="font-mono text-[11px] text-muted-foreground tabular-nums leading-tight">{row.titleSub}</p>
        )}
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">{row.meta}</p>
      </div>

      <ArrowUpRight
        className="h-4 w-4 shrink-0 self-center text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
        aria-hidden
      />
    </motion.div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center">
      <div className="rounded-full bg-emerald-500/10 p-3">
        <AlertTriangle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <p className="text-sm font-medium">All clear</p>
      <p className="text-xs text-muted-foreground">No alerts right now — nice work.</p>
    </div>
  )
}
