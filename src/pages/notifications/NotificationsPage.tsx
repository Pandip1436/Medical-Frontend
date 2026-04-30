import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Bell, Package, Clock, IndianRupee, AlertTriangle, ShieldCheck,
  CheckCheck, Trash2, RefreshCw, Zap, FileX2, Check,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { cn, timeAgo } from '@/lib/utils'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAuthStore } from '@/stores/authStore'
import type { Notification } from '@/types'

// ─── Tab config ───────────────────────────────────────────────
type TabKey = 'all' | 'LOW_STOCK' | 'EXPIRY' | 'PAYMENT_DUE' | 'APPROVAL'

const TABS: {
  key: TabKey
  label: string
  icon: typeof Package
  color: string
  activeColor: string
  borderColor: string
  roles: string[] | null  // null = all roles
}[] = [
  { key: 'all',         label: 'All',         icon: Bell,        color: 'text-muted-foreground',                           activeColor: 'text-primary border-primary',         borderColor: 'border-l-primary',    roles: null },
  { key: 'LOW_STOCK',   label: 'Low Stock',   icon: Package,     color: 'text-amber-600 dark:text-amber-400',               activeColor: 'text-amber-600 border-amber-500',     borderColor: 'border-l-amber-500',  roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'EXPIRY',      label: 'Expiry',      icon: Clock,       color: 'text-red-600 dark:text-red-400',                   activeColor: 'text-red-600 border-red-500',         borderColor: 'border-l-red-500',    roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
  { key: 'PAYMENT_DUE', label: 'Payment Due', icon: IndianRupee, color: 'text-blue-600 dark:text-blue-400',                 activeColor: 'text-blue-600 border-blue-500',       borderColor: 'border-l-blue-500',   roles: ['ADMIN', 'PHARMACIST', 'ACCOUNTANT'] },
  { key: 'APPROVAL',    label: 'Approvals',   icon: ShieldCheck, color: 'text-emerald-600 dark:text-emerald-400',           activeColor: 'text-emerald-600 border-emerald-500', borderColor: 'border-l-emerald-500', roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER'] },
]

const notificationColors: Record<Notification['type'], { icon: string; strip: string; badge: string }> = {
  LOW_STOCK:   { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',   strip: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  EXPIRY:      { icon: 'bg-red-500/10 text-red-600 dark:text-red-400',         strip: 'bg-red-500',     badge: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  PAYMENT_DUE: { icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',      strip: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  SYSTEM:      { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',   strip: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  APPROVAL:    { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', strip: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
}

const notificationIcon: Record<Notification['type'], typeof Package> = {
  LOW_STOCK: Package, EXPIRY: Clock, PAYMENT_DUE: IndianRupee, SYSTEM: AlertTriangle, APPROVAL: ShieldCheck,
}

const typeLabel: Record<Notification['type'], string> = {
  LOW_STOCK: 'Low Stock', EXPIRY: 'Expiry', PAYMENT_DUE: 'Payment Due', SYSTEM: 'System', APPROVAL: 'Approval',
}

function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000)
  const groups: Record<string, Notification[]> = { 'Just now': [], 'Earlier today': [], Yesterday: [], 'This week': [], Older: [] }
  for (const n of notifications) {
    const ts = new Date(n.timestamp)
    const diffMin = (now.getTime() - ts.getTime()) / 60000
    if (diffMin < 5) groups['Just now'].push(n)
    else if (ts >= todayStart) groups['Earlier today'].push(n)
    else if (ts >= yesterdayStart) groups['Yesterday'].push(n)
    else if (ts >= weekStart) groups['This week'].push(n)
    else groups['Older'].push(n)
  }
  return Object.entries(groups).filter(([, items]) => items.length > 0).map(([label, items]) => ({ label, items }))
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}

// ─── Main Page ────────────────────────────────────────────────
export default function NotificationsPage() {
  const { notifications, isLoading, fetchNotifications, markAsRead, markAllAsRead, removeNotification, generateAlerts } =
    useNotificationStore()
  const userRole = useAuthStore((s) => s.user?.role ?? 'PHARMACIST')

  const visibleTabs = useMemo(
    () => TABS.filter(t => t.roles === null || t.roles.includes(userRole)),
    [userRole]
  )

  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [generating, setGenerating] = useState(false)

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const handleGenerateAlerts = async () => {
    setGenerating(true)
    try { await generateAlerts(); toast.success('Alerts generated and refreshed') }
    catch { toast.error('Failed to generate alerts') }
    finally { setGenerating(false) }
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead()
    toast.success('All notifications marked as read')
  }

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) await markAsRead(n.id)
    if (n.actionUrl) navigate(n.actionUrl)
  }

  // ── Per-tab counts (unread) ────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: 0, LOW_STOCK: 0, EXPIRY: 0, PAYMENT_DUE: 0, APPROVAL: 0 }
    for (const n of notifications) {
      if (!n.isRead) {
        counts.all++
        if (n.type in counts) counts[n.type as TabKey]++
      }
    }
    return counts
  }, [notifications])

  // ── Filtered list for current tab ─────────────────────────
  const filtered = useMemo(() => {
    let result = notifications
    if (activeTab !== 'all') result = result.filter(n => n.type === activeTab)
    if (readFilter === 'unread') result = result.filter(n => !n.isRead)
    if (readFilter === 'read') result = result.filter(n => n.isRead)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(n => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q))
    }
    return result
  }, [notifications, activeTab, readFilter, searchQuery])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  const unreadInTab = filtered.filter(n => !n.isRead).length
  const activeFilterCount = [readFilter !== 'all', searchQuery.trim() !== ''].filter(Boolean).length

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">

      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">System alerts and activity updates</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fetchNotifications()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleGenerateAlerts} disabled={generating}>
            <Zap className="h-4 w-4" /> {generating ? 'Generating…' : 'Generate Alerts'}
          </Button>
          {unreadInTab > 0 && (
            <Button size="sm" className="gap-1.5" onClick={handleMarkAllRead}>
              <CheckCheck className="h-4 w-4" /> Mark All Read
            </Button>
          )}
        </div>
      </motion.div>

      {/* Tab bar */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-border/60 px-1 shrink-0">
            {visibleTabs.map(tab => {
              const Icon = tab.icon
              const count = tabCounts[tab.key]
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setActiveTab(tab.key); setSearchQuery(''); setReadFilter('all') }}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? `border-current ${tab.activeColor}`
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {count > 0 && (
                    <span className={cn(
                      'flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                      isActive ? 'bg-current/15' : 'bg-muted text-muted-foreground'
                    )}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Filter bar inside card */}
          <div className="border-b border-border/40">
            <DataTableFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search notifications…"
              resultsCount={filtered.length}
              activeFilterCount={activeFilterCount}
              onClearFilters={() => { setReadFilter('all'); setSearchQuery('') }}
            >
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                {(['all', 'unread', 'read'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setReadFilter(v)}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                      readFilter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </DataTableFilterBar>
          </div>

          {/* Notification list */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Loading notifications…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                <FileX2 className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">No notifications found</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {activeFilterCount > 0 ? 'Try clearing the filters' : 'Click "Generate Alerts" to scan for issues'}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/30 overflow-y-auto max-h-150">
              {grouped.map((group) => (
                <div key={group.label}>
                  <div className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm px-4 py-2 border-b border-border/30">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{group.label}</p>
                  </div>
                  {group.items.map((n) => {
                    const Icon = notificationIcon[n.type]
                    const colors = notificationColors[n.type]
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          'flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer hover:bg-muted/30',
                          !n.isRead && 'bg-primary/3 dark:bg-primary/5'
                        )}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div className={cn('mt-1 w-1 self-stretch rounded-full shrink-0', colors.strip)} />
                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', colors.icon)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn('text-sm font-medium', !n.isRead && 'font-semibold')}>{n.title}</p>
                            {activeTab === 'all' && (
                              <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold', colors.badge)}>
                                {typeLabel[n.type]}
                              </span>
                            )}
                            {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                          <p className="text-[11px] text-muted-foreground/60 mt-1">{timeAgo(n.timestamp)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
                          {!n.isRead && (
                            <Button size="icon-sm" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-emerald-600"
                              onClick={() => markAsRead(n.id)} title="Mark as read">
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon-sm" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeNotification(n.id)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
  )
}
