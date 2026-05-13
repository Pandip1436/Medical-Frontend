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
  type KpiDelta,
  type KpiTileData,
} from '@/components/dashboard'

const DASHBOARD_REFRESH_MS = 30_000

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

// ─── Mock helpers ──────────────────────────────────────────────────
// Deltas aren't returned by the backend yet. The mock is deterministic
// per KPI key so the design reads correctly without churn between renders;
// swap to real fields when getDashboardKpis returns them.
function seededRandom(seed: string): () => number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    return h / 0x7fffffff
  }
}

function mockDelta(key: string): KpiDelta {
  const rng = seededRandom(key)
  const isUp = rng() > 0.45
  const pct = (rng() * 18 + 2) * (isUp ? 1 : -1)
  return { pct, dir: Math.abs(pct) < 0.5 ? 'flat' : isUp ? 'up' : 'down' }
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
  const base = [
    { key: 'todaysSales',  title: "Today's Sales",        value: dashData?.todaysSales ?? 0,        subtitle: 'invoices today',         icon: TrendingUp,    sparkColor: '#3b82f6', iconBg: 'bg-blue-500/15',    iconColor: 'text-blue-600 dark:text-blue-400',     href: '/billing/sales',        isCurrency: true  },
    { key: 'monthlySales', title: 'Monthly Sales',        value: dashData?.monthlySales ?? 0,       subtitle: 'this month',             icon: ShoppingCart,  sparkColor: '#a855f7', iconBg: 'bg-purple-500/15',  iconColor: 'text-purple-600 dark:text-purple-400', href: '/billing/sales',        isCurrency: true  },
    { key: 'outstanding',  title: 'Outstanding',          value: dashData?.totalOutstanding ?? 0,   subtitle: 'across all customers',   icon: IndianRupee,   sparkColor: '#f59e0b', iconBg: 'bg-amber-500/15',   iconColor: 'text-amber-600 dark:text-amber-400',   href: '/customers/outstanding', isCurrency: true  },
    { key: 'lowStock',     title: 'Low Stock Items',      value: dashData?.lowStockAlertsCount ?? 0,subtitle: 'products below reorder', icon: AlertTriangle, sparkColor: '#f43f5e', iconBg: 'bg-rose-500/15',    iconColor: 'text-rose-600 dark:text-rose-400',     href: '/inventory/stock',      isCurrency: false },
    { key: 'expiring',     title: 'Near-Expiry (90d)',    value: dashData?.expiringBatchesCount ?? 0,subtitle: 'batches need attention',icon: Clock,         sparkColor: '#f97316', iconBg: 'bg-orange-500/15',  iconColor: 'text-orange-600 dark:text-orange-400', href: '/inventory/expiry',     isCurrency: false },
    { key: 'products',     title: 'Total Products',       value: dashData?.totalProducts ?? 0,      subtitle: 'in catalog',             icon: Package,       sparkColor: '#10b981', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400', href: '/inventory/products', isCurrency: false },
  ]
  return base.map((kpi) => ({
    ...kpi,
    delta: mockDelta(kpi.key),
  })) as KpiTileData[]
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

  const fetchDashboard = async () => {
    setIsLoading(true)
    const results = await Promise.allSettled([
      api.get('/reports/dashboard'),
      fetchProducts(),
    ])
    const dashRes = results[0].status === 'fulfilled' ? (results[0] as PromiseFulfilledResult<{ data: DashData }>).value : null
    if (dashRes) {
      setDashData(dashRes.data)
    } else {
      console.error('Core dashboard data failed to load')
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

  return (
    <div className="space-y-6">
      <DashboardHeader
        userName={userName}
        businessName={businessProfile?.name || 'Hospital Suppliers'}
        isRefreshing={isLoading}
        onRefresh={fetchDashboard}
      />

      <div className="space-y-4">
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
