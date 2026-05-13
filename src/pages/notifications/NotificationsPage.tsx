import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Package, Clock, IndianRupee, AlertTriangle, ShieldCheck,
  CheckCheck, Trash2, RefreshCw, FileX2, Check, Search, BellOff,
  Inbox, CalendarClock, ChevronDown, ChevronRight,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAuthStore } from '@/stores/authStore'
import type { Notification } from '@/types'

// ─── Category config ──────────────────────────────────────────
type CategoryKey = 'all' | 'LOW_STOCK' | 'EXPIRY' | 'PAYMENT_DUE' | 'APPROVAL' | 'REMINDER' | 'SYSTEM'

const CATEGORIES: {
  key: CategoryKey
  label: string
  icon: typeof Package
  accent: string
  roles: string[] | null
}[] = [
  { key: 'all',         label: 'All',         icon: Inbox,         accent: 'text-foreground',                       roles: null },
  { key: 'LOW_STOCK',   label: 'Low Stock',   icon: Package,       accent: 'text-amber-600 dark:text-amber-400',    roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'EXPIRY',      label: 'Expiry',      icon: Clock,         accent: 'text-red-600 dark:text-red-400',        roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'PAYMENT_DUE', label: 'Payment Due', icon: IndianRupee,   accent: 'text-blue-600 dark:text-blue-400',      roles: ['ADMIN', 'PHARMACIST', 'ACCOUNTANT'] },
  { key: 'APPROVAL',    label: 'Approvals',   icon: ShieldCheck,   accent: 'text-emerald-600 dark:text-emerald-400', roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'REMINDER',    label: 'Reminders',   icon: CalendarClock, accent: 'text-cyan-600 dark:text-cyan-400',      roles: null },
  { key: 'SYSTEM',      label: 'System',      icon: AlertTriangle, accent: 'text-purple-600 dark:text-purple-400',  roles: null },
]

const typeConfig: Record<Notification['type'], { label: string; icon: typeof Package; tone: string }> = {
  LOW_STOCK:   { label: 'Low Stock',   icon: Package,       tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  EXPIRY:      { label: 'Expiry',      icon: Clock,         tone: 'text-red-600 dark:text-red-400 bg-red-500/10' },
  PAYMENT_DUE: { label: 'Payment Due', icon: IndianRupee,   tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  SYSTEM:      { label: 'System',      icon: AlertTriangle, tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10' },
  APPROVAL:    { label: 'Approval',    icon: ShieldCheck,   tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
}

// Reminders are stored with type SYSTEM + a [reminderId:…] marker
const REMINDER_MARKER = '[reminderId:'
const isReminder = (n: Notification) => n.type === 'SYSTEM' && n.message.includes(REMINDER_MARKER)

const reminderConfig = {
  label: 'Reminder',
  icon: CalendarClock,
  tone: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
}
const cfgFor = (n: Notification) => (isReminder(n) ? reminderConfig : typeConfig[n.type])

const SNOOZE_PRESETS: { label: string; hours: number }[] = [
  { label: 'For 1 hour',     hours: 1 },
  { label: 'For 4 hours',    hours: 4 },
  { label: 'Until tomorrow', hours: 24 },
  { label: 'For 1 week',     hours: 24 * 7 },
]

// ─── Action URL resolution ────────────────────────────────────
// Notifications store the relevant entity id in the message as `[invoiceId:xxx]`,
// `[productId:xxx]`, etc. At click time we extract that marker and append it
// as a query param so the destination page can deep-link straight to the row
// or detail modal. Works for old notifications that pre-date the backend
// embedding the id in actionUrl directly.
// Legacy URL rewrites: old notifications stored generic paths; route them to
// the new dedicated detail pages.
const URL_REWRITES: Record<string, string> = {
  '/inventory/products':         '/inventory/product-history',
  '/inventory/expiry':           '/inventory/batches/detail',
  '/customers/invoices':         '/customers/invoices/detail',
  '/reminders':                  '/reminders/detail',
  '/admin/approvals':            '/admin/approvals/detail',
}
// For each base path (after rewrite), which marker in the message holds the
// entity id and what query param name to use.
const MARKER_FOR_PATH: Record<string, { marker: string; param: string }> = {
  '/inventory/product-history':  { marker: 'productId',  param: 'productId' },
  '/inventory/products':         { marker: 'productId',  param: 'productId' },
  '/inventory/batches/detail':   { marker: 'batchId',    param: 'id' },
  '/inventory/expiry':           { marker: 'batchId',    param: 'batchId' },
  '/customers/invoices/detail':  { marker: 'invoiceId',  param: 'id' },
  '/customers/invoices':         { marker: 'invoiceId',  param: 'invoiceId' },
  '/reminders/detail':           { marker: 'reminderId', param: 'id' },
  '/reminders':                  { marker: 'reminderId', param: 'reminderId' },
  // Approvals don't have a message marker — the id lives only in the actionUrl
  // emitted at create time. Legacy approval notifications can't be deep-linked.
}
function extractMarker(message: string, marker: string): string | null {
  const m = message.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`))
  return m?.[1] ?? null
}

// Try every known id-style query param so legacy URLs (?invoiceId=…) still work
// when we point them at the new detail pages (which read ?id=…).
const ID_QUERY_KEYS = ['id', 'invoiceId', 'batchId', 'productId', 'reminderId', 'requestId']
function extractIdFromQuery(query: string): string | null {
  const params = new URLSearchParams(query)
  for (const key of ID_QUERY_KEYS) {
    const v = params.get(key)
    if (v) return v
  }
  return null
}

function resolveActionUrl(n: Notification): string | null {
  if (!n.actionUrl) return null
  const [basePath, existingQuery] = n.actionUrl.split('?')
  const rewrittenPath = URL_REWRITES[basePath] ?? basePath
  // Spec for the *destination* page tells us the canonical param name we should emit.
  const spec = MARKER_FOR_PATH[rewrittenPath] ?? MARKER_FOR_PATH[basePath]

  // Find the entity id — first try the URL's existing query, then the message marker.
  let id: string | null = null
  if (existingQuery) id = extractIdFromQuery(existingQuery)
  if (!id && spec) id = extractMarker(n.message, spec.marker)

  if (id && spec) return `${rewrittenPath}?${spec.param}=${id}`
  // Fallback: preserve the original query (unlikely to match anymore, but safer than dropping).
  if (existingQuery) return `${rewrittenPath}?${existingQuery}`
  return rewrittenPath
}

// Strip dedup markers for display
function cleanMessage(msg: string): string {
  return msg.replace(/\s*\[\w+Id:[^\]]+\](?:\[[^\]]+\])*/g, '').trim()
}

// ─── Date grouping ──────────────────────────────────────────
function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000)
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000)
  const buckets: Record<string, Notification[]> = {
    'Just now': [], 'Earlier today': [], 'Yesterday': [], 'This week': [], 'Older': [],
  }
  for (const n of notifications) {
    const ts = new Date(n.timestamp)
    const diffMin = (now.getTime() - ts.getTime()) / 60_000
    if (diffMin < 5) buckets['Just now'].push(n)
    else if (ts >= todayStart) buckets['Earlier today'].push(n)
    else if (ts >= yesterdayStart) buckets['Yesterday'].push(n)
    else if (ts >= weekStart) buckets['This week'].push(n)
    else buckets['Older'].push(n)
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

// ─── Smart grouping ──────────────────────────────────────────
// Runs of `MIN_GROUP_SIZE` consecutive same-type rows collapse into one
// expandable cluster so 400 Low Stock alerts don't drown out other categories.
const MIN_GROUP_SIZE = 5

type ListEntry =
  | { kind: 'single'; item: Notification }
  | { kind: 'cluster'; type: Notification['type']; items: Notification[] }

function clusterSameType(items: Notification[]): ListEntry[] {
  const out: ListEntry[] = []
  let i = 0
  while (i < items.length) {
    const start = i
    const t = items[i].type
    while (i < items.length && items[i].type === t) i++
    const run = items.slice(start, i)
    if (run.length >= MIN_GROUP_SIZE) {
      out.push({ kind: 'cluster', type: t, items: run })
    } else {
      for (const item of run) out.push({ kind: 'single', item })
    }
  }
  return out
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}

// ─── Page ─────────────────────────────────────────────────────
export default function NotificationsPage() {
  const {
    notifications, isLoading, fetchNotifications,
    markAsRead, markAllAsRead, snooze, resolve, removeNotification,
  } = useNotificationStore()
  const userRole = useAuthStore((s) => s.user?.role ?? 'PHARMACIST')

  const visibleCategories = useMemo(
    () => CATEGORIES.filter((c) => c.roles === null || c.roles.includes(userRole)),
    [userRole]
  )

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // ── Per-category unread counts ────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = { all: 0, LOW_STOCK: 0, EXPIRY: 0, PAYMENT_DUE: 0, APPROVAL: 0, REMINDER: 0, SYSTEM: 0 }
    for (const n of notifications) {
      if (n.isRead) continue
      counts.all++
      if (n.type === 'SYSTEM') {
        if (isReminder(n)) counts.REMINDER++
        else counts.SYSTEM++
      } else if (n.type in counts) {
        counts[n.type as CategoryKey]++
      }
    }
    return counts
  }, [notifications])

  // ── Filtered list ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = notifications
    if (activeCategory === 'REMINDER') {
      result = result.filter(isReminder)
    } else if (activeCategory === 'SYSTEM') {
      result = result.filter((n) => n.type === 'SYSTEM' && !isReminder(n))
    } else if (activeCategory !== 'all') {
      result = result.filter((n) => n.type === activeCategory)
    }
    if (readFilter === 'unread') result = result.filter((n) => !n.isRead)
    if (readFilter === 'read') result = result.filter((n) => n.isRead)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((n) => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q))
    }
    return result
  }, [notifications, activeCategory, readFilter, searchQuery])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  // ── Handlers ───────────────────────────────────────────────
  // Single click on a row: mark read + navigate to the deep-linked destination.
  // The row IS the action — no separate detail pane to fill in.
  const openNotification = (n: Notification) => {
    if (!n.isRead) markAsRead(n.id)
    const url = resolveActionUrl(n)
    if (url) navigate(url)
  }

  const handleSnooze = async (id: string, hours: number) => {
    const until = new Date(Date.now() + hours * 3_600_000)
    await snooze(id, until)
    toast.success(`Snoozed ${hours < 24 ? `for ${hours}h` : `for ${Math.round(hours / 24)}d`}`)
  }

  const handleResolve = async (id: string) => {
    await resolve(id)
    toast.success('Marked as resolved')
  }

  const handleDelete = async (id: string) => {
    await removeNotification(id)
    toast.success('Notification deleted')
  }

  const toggleCluster = (key: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const activeCategoryLabel =
    visibleCategories.find((c) => c.key === activeCategory)?.label ?? 'All'

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden p-0">
          {/* Slim toolbar — count, view filter, and global actions all live here */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {categoryCounts.all > 0
                ? <><span className="font-semibold text-foreground">{categoryCounts.all}</span> unread · {notifications.length} total</>
                : <>You&apos;re all caught up · {notifications.length} total</>}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-border/60 bg-background p-0.5">
                {(['all', 'unread', 'read'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setReadFilter(v)}
                    className={cn(
                      'rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors',
                      readFilter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => fetchNotifications()} disabled={isLoading} aria-label="Refresh">
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              </Button>
              {categoryCounts.all > 0 && (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => markAllAsRead()}>
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </Button>
              )}
            </div>
          </div>

          <div className="flex h-[calc(100vh-160px)] min-h-100 flex-col lg:flex-row">

            {/* ── Sidebar: categories ── */}
            <aside className="shrink-0 border-b border-border/60 lg:w-56 lg:border-b-0 lg:border-r">
              <div className="px-3 py-3">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Folders
                </p>
                <nav className="space-y-0.5">
                  {visibleCategories.map((cat) => {
                    const Icon = cat.icon
                    const count = categoryCounts[cat.key]
                    const isActive = activeCategory === cat.key
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setActiveCategory(cat.key)}
                        className={cn(
                          'group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                          isActive
                            ? 'bg-accent font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? cat.accent : '')} />
                        <span className="flex-1 truncate">{cat.label}</span>
                        {count > 0 && (
                          <span className={cn(
                            'rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </nav>
              </div>
            </aside>

            {/* ── Main: list (now full width with no detail pane) ── */}
            <section className="flex min-h-0 flex-1 flex-col">

              {/* Search row */}
              <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search ${activeCategoryLabel.toLowerCase()}…`}
                    className="h-8 border-border/60 pl-8 text-xs"
                  />
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {filtered.length} in {activeCategoryLabel}
                </span>
              </div>

              {/* List body */}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
                      <FileX2 className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No notifications</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {searchQuery || readFilter !== 'all'
                          ? 'Try clearing the filters'
                          : 'Nothing in this folder'}
                      </p>
                    </div>
                  </div>
                ) : (
                  grouped.map((group) => {
                    const entries = clusterSameType(group.items)
                    return (
                      <div key={group.label}>
                        <div className="sticky top-0 z-10 bg-background/95 px-3 py-1 backdrop-blur-sm">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {group.label}
                          </p>
                        </div>
                        {entries.map((entry, entryIdx) => {
                          if (entry.kind === 'cluster') {
                            const clusterKey = `${group.label}-${entry.type}-${entryIdx}`
                            const isExpanded = expandedClusters.has(clusterKey)
                            const sample = entry.items[0]
                            const cfg = sample ? cfgFor(sample) : typeConfig[entry.type]
                            const Icon = cfg.icon
                            const unreadCount = entry.items.filter((n) => !n.isRead).length
                            return (
                              <div key={clusterKey}>
                                <button
                                  type="button"
                                  onClick={() => toggleCluster(clusterKey)}
                                  className="flex w-full items-center gap-2.5 border-b border-border/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                                >
                                  <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cfg.tone)}>
                                    <Icon className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-semibold leading-tight">
                                      {cfg.label} · {entry.items.length} alerts
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {unreadCount > 0
                                        ? `${unreadCount} unread · click to ${isExpanded ? 'collapse' : 'expand'}`
                                        : `All read · click to ${isExpanded ? 'collapse' : 'expand'}`}
                                    </p>
                                  </div>
                                  <ChevronDown
                                    className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                                  />
                                </button>
                                {isExpanded && entry.items.map((n) => (
                                  <NotificationRow
                                    key={n.id}
                                    notification={n}
                                    indented
                                    onOpen={openNotification}
                                    onSnooze={handleSnooze}
                                    onResolve={handleResolve}
                                    onDelete={handleDelete}
                                  />
                                ))}
                              </div>
                            )
                          }
                          return (
                            <NotificationRow
                              key={entry.item.id}
                              notification={entry.item}
                              onOpen={openNotification}
                              onSnooze={handleSnooze}
                              onResolve={handleResolve}
                              onDelete={handleDelete}
                            />
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}

// ─── List row ────────────────────────────────────────────────
// Single notification row. Click anywhere (except action area) to open the
// deep-linked destination. Hover reveals snooze/resolve/delete actions.
function NotificationRow({
  notification: n,
  indented,
  onOpen,
  onSnooze,
  onResolve,
  onDelete,
}: {
  notification: Notification
  indented?: boolean
  onOpen: (n: Notification) => void
  onSnooze: (id: string, hours: number) => void
  onResolve: (id: string) => void
  onDelete: (id: string) => void
}) {
  const cfg = cfgFor(n)
  const Icon = cfg.icon
  const isResolved = !!n.resolvedAt
  const message = cleanMessage(n.message)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(n)
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 border-b border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/40',
        indented && 'pl-9',
        isResolved && 'opacity-70',
      )}
    >
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cfg.tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn(
            'truncate text-[13px] leading-tight',
            !n.isRead ? 'font-semibold text-foreground' : 'font-normal text-foreground/80',
          )}>
            {n.title}
          </p>
          {isResolved ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <Check className="h-2.5 w-2.5" /> Resolved
            </span>
          ) : !n.isRead ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{message}</p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">{timeAgo(n.timestamp)}</p>
      </div>

      {/* Action cluster — fades in on hover, taps stop propagation so the row click doesn't fire */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      >
        {!isResolved && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="h-7 w-7" aria-label="Snooze">
                <BellOff className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SNOOZE_PRESETS.map((p) => (
                <DropdownMenuItem key={p.label} onClick={() => onSnooze(n.id, p.hours)}>
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!isResolved && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
            onClick={() => onResolve(n.id)}
            aria-label="Mark resolved"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(n.id)}
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Click affordance — only shown when hover actions aren't */}
      <ChevronRight
        className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-opacity group-hover:opacity-0"
        aria-hidden
      />
    </div>
  )
}
