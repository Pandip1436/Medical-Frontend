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
  type KpiTileData,
} from '@/components/dashboard'

const DASHBOARD_REFRESH_MS = 30_000

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
  recentInvoices?: Array<{ id?: string; invoiceNumber: string; customerName: string; date?: string }>
  lowStockItems?: Array<{ id: string; name: string; packSize: string; totalStock: number; minStock: number }>
  expiringBatches?: Array<{ id: string; batchNumber: string; expiryDate: string; quantity: number; product: { name: string; packSize: string } }>
  overdueCustomers?: Array<{ customerId: string; customerName: string; overdueAmount: number; daysOverdue: number; invoiceCount: number }>
  overdueCustomersCount?: number
  overdueTotal?: number
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

function buildActivities(dashData: DashData | null): ActivityItem[] {
  const recentInvoices = dashData?.recentInvoices ?? []
  return recentInvoices.map((inv) => ({
    id: inv.id ?? inv.invoiceNumber,
    type: 'SALE' as const,
    // Row shows just the invoice number; the customer surfaces on hover via tooltip.
    action: inv.invoiceNumber,
    detail: inv.customerName,
    timestamp: inv.date ?? new Date().toISOString(),
    // Deep-link to the dedicated invoice detail page (same destination notifications use).
    href: inv.id ? `/customers/invoices/detail?id=${inv.id}` : undefined,
  }))
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

  const fetchDashboard = async () => {
    setIsLoading(true)
    const results = await Promise.allSettled([
      api.get('/reports/dashboard'),
      fetchProducts(),
    ])
    const dashSettled = results[0]
    if (dashSettled.status === 'fulfilled') {
      setDashData((dashSettled.value as { data: DashData }).data)
      setLoadStatus('idle')
    } else {
      const status = (dashSettled.reason as { response?: { status?: number } })?.response?.status
      setLoadStatus(status === 403 ? 'forbidden' : 'error')
    }
    setIsLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchDashboardCb = useCallback(() => { fetchDashboard() }, [])
  useBranchRefresh(fetchDashboardCb)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchDashboard()
    const interval = window.setInterval(() => {
      if (!document.hidden) fetchDashboard()
    }, DASHBOARD_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [])

  const kpiTiles = buildKpiTiles(dashData)
  const activities = buildActivities(dashData)
  const hasLoadError = !isLoading && !dashData && loadStatus !== 'idle'

  return (
    <div className="space-y-6">
      <DashboardHeader
        userName={userName}
        businessName={businessProfile?.name || 'Hospital Suppliers'}
        isRefreshing={isLoading}
        onRefresh={fetchDashboard}
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
              lowStockItems={dashData?.lowStockItems ?? []}
              expiringBatches={dashData?.expiringBatches ?? []}
              overdueCustomers={dashData?.overdueCustomers ?? []}
              lowStockTotal={dashData?.lowStockAlertsCount ?? 0}
              expiringTotal={dashData?.expiringBatchesCount ?? 0}
              overdueTotal={dashData?.overdueCustomersCount ?? 0}
            />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <ActivityTimeline activities={activities} />
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
