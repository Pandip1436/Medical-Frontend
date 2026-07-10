import { useCallback, useEffect, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { AlertTriangle, Clock, IndianRupee, Package, ShoppingCart, TrendingUp } from 'lucide-react'

import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useSettingsStore } from '@/stores/settingsStore'

import {
  ActivityTimeline,
  DashboardHeader,
  DateRangeProvider,
  KpiTile,
  NeedsAttentionInbox,
  QuickActions,
  SalesHeroChart,
  type ActivityItem,
  type ExpiringBatch,
  type FilterTag,
  type KpiTileData,
  type LowStockItem,
  type OverdueCustomer,
} from '@/components/dashboard'

const DASHBOARD_REFRESH_MS = 30_000
// Page size for the inbox / activity cards. The first page arrives inside
// /reports/dashboard; later pages are fetched lazily on scroll.
const DASH_PAGE = 20

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

interface DashData {
  todaysSales?: number
  monthlySales?: number
  totalOutstanding?: number
  lowStockAlertsCount?: number
  expiringBatchesCount?: number
  totalProducts?: number
  recentInvoices?: RecentInvoice[]
  recentInvoicesCount?: number
  lowStockItems?: LowStockItem[]
  expiringBatches?: ExpiringBatch[]
  overdueCustomers?: OverdueCustomer[]
  overdueCustomersCount?: number
  overdueTotal?: number
}

type RecentInvoice = { id?: string; invoiceNumber: string; customerName: string; customerPhone?: string | null; date?: string }

// Drop duplicates by key when appending a lazily-loaded page — a defensive
// guard in case a page is fetched twice (e.g. rapid scroll).
function appendUnique<T>(prev: T[], next: T[], key: (x: T) => string): T[] {
  const seen = new Set(prev.map(key))
  return [...prev, ...next.filter((x) => !seen.has(key(x)))]
}

function buildKpiTiles(dashData: DashData | null): KpiTileData[] {
  // No `delta` field: backend doesn't return period-over-period yet, so the
  // chips stay off until /reports/dashboard exposes real history.
  return [
    { key: 'todaysSales',  title: "Today's Sales",        value: dashData?.todaysSales ?? 0,        subtitle: 'invoices today',         icon: TrendingUp,    sparkColor: '#3b82f6', iconBg: 'bg-blue-500/15',    iconColor: 'text-blue-600 dark:text-blue-400',     href: '/billing/sales',        isCurrency: true  },
    { key: 'monthlySales', title: 'Monthly Sales',        value: dashData?.monthlySales ?? 0,       subtitle: 'this month',             icon: ShoppingCart,  sparkColor: '#a855f7', iconBg: 'bg-purple-500/15',  iconColor: 'text-purple-600 dark:text-purple-400', href: '/billing/sales',        isCurrency: true  },
    { key: 'outstanding',  title: 'Outstanding',          value: dashData?.totalOutstanding ?? 0,   subtitle: 'across all customers',   icon: IndianRupee,   sparkColor: '#f59e0b', iconBg: 'bg-amber-500/15',   iconColor: 'text-amber-600 dark:text-amber-400',   href: '/customers/outstanding', isCurrency: true  },
    { key: 'lowStock',     title: 'Low Stock Items',      value: dashData?.lowStockAlertsCount ?? 0,subtitle: 'products below reorder', icon: AlertTriangle, sparkColor: '#f43f5e', iconBg: 'bg-rose-500/15',    iconColor: 'text-rose-600 dark:text-rose-400',     href: '/inventory/stock',      isCurrency: false },
    { key: 'expiring',     title: 'Near-Expiry (90d)',    value: dashData?.expiringBatchesCount ?? 0,subtitle: 'batches need attention',icon: Clock,         sparkColor: '#f97316', iconBg: 'bg-orange-500/15',  iconColor: 'text-orange-600 dark:text-orange-400', href: '/inventory/expiry',     isCurrency: false },
    { key: 'products',     title: 'Total Products',       value: dashData?.totalProducts ?? 0,      subtitle: 'in catalog',             icon: Package,       sparkColor: '#10b981', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400', href: '/inventory/products', isCurrency: false },
  ]
}

function buildActivities(recentInvoices: RecentInvoice[]): ActivityItem[] {
  return recentInvoices.map((inv) => {
    // Append phone to the customer detail line so duplicate customer names
    // are distinguishable in the activity timeline. Sentinel placeholder
    // numbers are skipped — see CustomerNameLine for the same rule.
    const phone = inv.customerPhone && inv.customerPhone !== '0000000000' ? inv.customerPhone : null
    return {
      id: inv.id ?? inv.invoiceNumber,
      type: 'SALE' as const,
      // Row shows the customer (+ phone to disambiguate duplicate names); the
      // invoice number surfaces on hover via tooltip.
      action: phone ? `${inv.customerName} · ${phone}` : inv.customerName,
      detail: inv.invoiceNumber,
      timestamp: inv.date ?? new Date().toISOString(),
      // Deep-link to the dedicated invoice detail page (same destination notifications use).
      href: inv.id ? `/billing/sales?view=split&invoiceId=${inv.id}` : undefined,
    }
  })
}

function DashboardBody() {
  const user = useAuthStore((s) => s.user)
  const userName = user?.name?.split(' ')[0] ?? 'User'
  const fetchProducts = useMasterDataStore((s) => s.fetchProducts)
  const businessProfile = useSettingsStore((s) => s.businessProfile)

  const [dashData, setDashData] = useState<DashData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // `loadStatus` separates the "still fetching" state from the "fetch failed"
  // state so the UI never renders ₹0 placeholders that look like real data when
  // the call actually 403'd / errored. See BUGS.md SEV-2.
  const [loadStatus, setLoadStatus] = useState<'idle' | 'forbidden' | 'error'>('idle')

  // Accumulator state for the lazy-loaded cards. Seeded from /reports/dashboard
  // (page 1) and grown by the per-source paginated endpoints as the user
  // scrolls. Counts/totals stay on `dashData` and keep refreshing every 30s.
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([])
  const [overdueCustomers, setOverdueCustomers] = useState<OverdueCustomer[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [loadingLow, setLoadingLow] = useState(false)
  const [loadingExp, setLoadingExp] = useState(false)
  const [loadingOverdue, setLoadingOverdue] = useState(false)

  const fetchDashboard = async ({ reset = true }: { reset?: boolean } = {}) => {
    setIsLoading(true)
    const results = await Promise.allSettled([
      api.get('/reports/dashboard'),
      fetchProducts(),
    ])
    const dashSettled = results[0]
    if (dashSettled.status === 'fulfilled') {
      const data = (dashSettled.value as { data: DashData }).data
      setDashData(data)
      setLoadStatus('idle')
      // On a forced refresh (initial load, manual, branch switch) re-seed every
      // list. On the silent 30s tick, only re-seed lists the user hasn't paged
      // past page 1 — so scrolled-in rows aren't yanked away mid-read.
      setActivities((prev) => (reset || prev.length <= DASH_PAGE ? buildActivities(data.recentInvoices ?? []) : prev))
      setLowStockItems((prev) => (reset || prev.length <= DASH_PAGE ? (data.lowStockItems ?? []) : prev))
      setExpiringBatches((prev) => (reset || prev.length <= DASH_PAGE ? (data.expiringBatches ?? []) : prev))
      setOverdueCustomers((prev) => (reset || prev.length <= DASH_PAGE ? (data.overdueCustomers ?? []) : prev))
    } else {
      const status = (dashSettled.reason as { response?: { status?: number } })?.response?.status
      setLoadStatus(status === 403 ? 'forbidden' : 'error')
    }
    setIsLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchDashboardCb = useCallback(() => { fetchDashboard({ reset: true }) }, [])
  useBranchRefresh(fetchDashboardCb)

  useEffect(() => {
    fetchDashboard({ reset: true })
    const interval = window.setInterval(() => {
      if (!document.hidden) fetchDashboard({ reset: false })
    }, DASHBOARD_REFRESH_MS)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Lazy-load handlers — fetch the next page and append ────────
  const activityTotal = dashData?.recentInvoicesCount ?? activities.length
  const lowStockTotal = dashData?.lowStockAlertsCount ?? 0
  const expiringTotal = dashData?.expiringBatchesCount ?? 0
  const overdueTotal = dashData?.overdueCustomersCount ?? 0

  const loadMoreActivity = useCallback(async () => {
    if (loadingActivity || activities.length >= activityTotal) return
    setLoadingActivity(true)
    try {
      const { data } = await api.get('/reports/dashboard/activity', { params: { skip: activities.length, take: DASH_PAGE } })
      const more = buildActivities((data?.items ?? []) as RecentInvoice[])
      setActivities((prev) => appendUnique(prev, more, (a) => a.id))
    } catch { /* error already surfaced by the global toast interceptor */ } finally {
      setLoadingActivity(false)
    }
  }, [activities.length, activityTotal, loadingActivity])

  const loadMoreLow = useCallback(async () => {
    if (loadingLow || lowStockItems.length >= lowStockTotal) return
    setLoadingLow(true)
    try {
      const { data } = await api.get('/reports/dashboard/low-stock', { params: { skip: lowStockItems.length, take: DASH_PAGE } })
      setLowStockItems((prev) => appendUnique(prev, (data?.items ?? []) as LowStockItem[], (x) => x.id))
    } catch { /* noop */ } finally {
      setLoadingLow(false)
    }
  }, [lowStockItems.length, lowStockTotal, loadingLow])

  const loadMoreExp = useCallback(async () => {
    if (loadingExp || expiringBatches.length >= expiringTotal) return
    setLoadingExp(true)
    try {
      const { data } = await api.get('/reports/dashboard/expiring', { params: { skip: expiringBatches.length, take: DASH_PAGE } })
      setExpiringBatches((prev) => appendUnique(prev, (data?.items ?? []) as ExpiringBatch[], (x) => x.id))
    } catch { /* noop */ } finally {
      setLoadingExp(false)
    }
  }, [expiringBatches.length, expiringTotal, loadingExp])

  const loadMoreOverdue = useCallback(async () => {
    if (loadingOverdue || overdueCustomers.length >= overdueTotal) return
    setLoadingOverdue(true)
    try {
      const { data } = await api.get('/reports/dashboard/overdue', { params: { skip: overdueCustomers.length, take: DASH_PAGE } })
      setOverdueCustomers((prev) => appendUnique(prev, (data?.items ?? []) as OverdueCustomer[], (x) => x.customerId || x.customerName))
    } catch { /* noop */ } finally {
      setLoadingOverdue(false)
    }
  }, [overdueCustomers.length, overdueTotal, loadingOverdue])

  // The inbox calls this with its active filter; 'all' extends every source
  // that still has rows, single-type tabs page just that source.
  const loadMoreAttention = useCallback((filter: FilterTag) => {
    if (filter === 'due' || filter === 'all') loadMoreOverdue()
    if (filter === 'low' || filter === 'all') loadMoreLow()
    if (filter === 'exp' || filter === 'all') loadMoreExp()
  }, [loadMoreOverdue, loadMoreLow, loadMoreExp])

  const kpiTiles = buildKpiTiles(dashData)
  const hasLoadError = !isLoading && !dashData && loadStatus !== 'idle'

  return (
    <div className="space-y-6">
      <DashboardHeader
        userName={userName}
        businessName={businessProfile?.name || 'Hospital Suppliers'}
      />

      <div className="space-y-4">
        {hasLoadError ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <h3 className="mt-3 text-base font-semibold">
              {loadStatus === 'forbidden' ? 'Dashboard not available for your role' : 'Couldn’t load dashboard data'}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {loadStatus === 'forbidden'
                ? 'Your account does not have permission to view these company-wide metrics. Use the sidebar to reach the pages your role can access.'
                : 'The dashboard data failed to load. Check your connection and try refreshing.'}
            </p>
          </div>
        ) : (
        <>
        {/* Row 1: Compact KPI strip — single row of 6 on desktop, fits in viewport. */}
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {kpiTiles.map((kpi) => (
            <KpiTile key={kpi.key} kpi={kpi} isLoading={isLoading && !dashData} />
          ))}
        </motion.div>

        {/* Row 2: Sales chart on the left, quick actions stacked on the right.
            Same 7/5 column split as Row 3 below, so both rows align visually. */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-7">
            <SalesHeroChart />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <QuickActions />
          </div>
        </div>

        {/* Row 3: Alerts + activity, matching column widths to row 2.
            Each card pins its own height on lg+ (see Card className inside),
            so both stay equal even when one filter has 1 item and the other 20. */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-7">
            <NeedsAttentionInbox
              lowStockItems={lowStockItems}
              expiringBatches={expiringBatches}
              overdueCustomers={overdueCustomers}
              lowStockTotal={lowStockTotal}
              expiringTotal={expiringTotal}
              overdueTotal={overdueTotal}
              isLoadingMore={loadingLow || loadingExp || loadingOverdue}
              onLoadMore={loadMoreAttention}
            />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <ActivityTimeline
              activities={activities}
              total={activityTotal}
              isLoadingMore={loadingActivity}
              onLoadMore={loadMoreActivity}
            />
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <DateRangeProvider>
      <DashboardBody />
    </DateRangeProvider>
  )
}
