import { useEffect, useState, useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import CountUpModule from 'react-countup'
// Handle CJS/ESM interop — Vite dev server may double-wrap the default export
const CountUp = typeof CountUpModule === 'function' ? CountUpModule : (CountUpModule as any).default
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  IndianRupee,
  AlertTriangle,
  Clock,
  Wallet,
  Zap,
  Package,
  UserPlus,
  ArrowUpRight,
  Activity,
  RefreshCw,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { cn, formatCurrency, timeAgo, getInitials } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
}

// ─────────────────────────────────────────────────────────────
// KPI sparkline data (static mini-trends, visual only)
// ─────────────────────────────────────────────────────────────

const sparklineData = {
  sales: [4, 6, 5, 8, 7, 9, 11, 10, 12, 14, 13, 15],
  purchases: [3, 5, 4, 6, 7, 5, 8, 6, 7, 9, 8, 7],
  receivables: [12, 11, 13, 12, 14, 13, 12, 11, 12, 13, 12, 11],
  lowStock: [5, 6, 8, 7, 9, 10, 12, 14, 15, 16, 17, 18],
  expiry: [8, 10, 12, 15, 18, 22, 25, 28, 32, 36, 40, 42],
  profit: [2, 3, 2.5, 4, 3.5, 5, 4.5, 6, 5.5, 7, 6.5, 8],
}

// ─────────────────────────────────────────────────────────────
// KPI card definitions
// ─────────────────────────────────────────────────────────────

const getKpiCards = (kpiData: any) => [
  {
    title: "Today's Sales",
    value: kpiData?.todaysSales ?? 0,
    subtitle: 'invoices today',
    change: 12,
    direction: 'up' as const,
    icon: TrendingUp,
    gradient: 'from-blue-500/10 via-blue-500/5 to-transparent',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-600 dark:text-blue-400',
    sparkColor: '#3b82f6',
    sparkData: sparklineData.sales,
    href: '/billing/sales',
  },
  {
    title: "Monthly Sales",
    value: kpiData?.monthlySales ?? 0,
    subtitle: 'this month',
    change: 8,
    direction: 'up' as const,
    icon: ShoppingCart,
    gradient: 'from-purple-500/10 via-purple-500/5 to-transparent',
    iconBg: 'bg-purple-500/15',
    iconColor: 'text-purple-600 dark:text-purple-400',
    sparkColor: '#8b5cf6',
    sparkData: sparklineData.purchases,
    href: '/billing/sales',
  },
  {
    title: 'Outstanding Receivables',
    value: kpiData?.totalOutstanding ?? 0,
    subtitle: 'across all customers',
    change: 0,
    direction: 'neutral' as const,
    icon: IndianRupee,
    gradient: 'from-amber-500/10 via-amber-500/5 to-transparent',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-600 dark:text-amber-400',
    sparkColor: '#f59e0b',
    sparkData: sparklineData.receivables,
    href: '/customers/outstanding',
  },
  {
    title: 'Low Stock Items',
    value: kpiData?.lowStockAlertsCount ?? 0,
    subtitle: 'products below reorder',
    change: 3,
    direction: 'up' as const,
    icon: AlertTriangle,
    gradient: 'from-rose-500/10 via-rose-500/5 to-transparent',
    iconBg: 'bg-rose-500/15',
    iconColor: 'text-rose-600 dark:text-rose-400',
    sparkColor: '#ef4444',
    sparkData: sparklineData.lowStock,
    isCurrencyValue: false,
    href: '/inventory/stock',
  },
  {
    title: 'Near-Expiry (90 days)',
    value: kpiData?.expiringBatchesCount ?? 0,
    subtitle: 'batches need attention',
    change: 5,
    direction: 'up' as const,
    icon: Clock,
    gradient: 'from-orange-500/10 via-orange-500/5 to-transparent',
    iconBg: 'bg-orange-500/15',
    iconColor: 'text-orange-600 dark:text-orange-400',
    sparkColor: '#f97316',
    sparkData: sparklineData.expiry,
    isCurrencyValue: false,
    href: '/inventory/expiry',
  },
  {
    title: 'Total Products',
    value: kpiData?.totalProducts ?? 0,
    subtitle: 'in catalog',
    change: 0,
    direction: 'up' as const,
    icon: Package,
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    sparkColor: '#10b981',
    sparkData: sparklineData.profit,
    isCurrencyValue: false,
    href: '/inventory/products',
  },
]

// ─────────────────────────────────────────────────────────────
// Quick action definitions
// ─────────────────────────────────────────────────────────────

const quickActions = [
  { label: 'New Sale', shortcut: 'Alt+N', icon: Zap, iconBg: 'bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-400', href: '/billing/new' },
  { label: 'New Purchase', shortcut: 'F2', icon: ShoppingCart, iconBg: 'bg-purple-500/15', iconColor: 'text-purple-600 dark:text-purple-400', href: '/purchase/orders' },
  { label: 'Add Product', shortcut: '', icon: Package, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400', href: '/inventory/products' },
  { label: 'Add Customer', shortcut: '', icon: UserPlus, iconBg: 'bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-400', href: '/customers' },
]

// ─────────────────────────────────────────────────────────────
// Chart colors
// ─────────────────────────────────────────────────────────────

const STOCK_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#f97316', '#06b6d4']
const EXPIRY_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e']

// ─────────────────────────────────────────────────────────────
// Activity type color map
// ─────────────────────────────────────────────────────────────

const activityTypeConfig: Record<string, { border: string; bg: string }> = {
  sale: { border: 'border-l-blue-500', bg: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  purchase: { border: 'border-l-purple-500', bg: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
  stock: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  payment: { border: 'border-l-amber-500', bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  system: { border: 'border-l-rose-500', bg: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
  customer: { border: 'border-l-cyan-500', bg: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
}

// ─────────────────────────────────────────────────────────────
// Mini sparkline component
// ─────────────────────────────────────────────────────────────

function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  const chartData = data.map((v, i) => ({ v, i }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={true}
          animationDuration={1200}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────
// Custom chart tooltip
// ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Empty state for charts
// ─────────────────────────────────────────────────────────────

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
      <div className="rounded-full bg-muted/40 p-3">
        <Activity className="h-5 w-5 text-muted-foreground/40" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Dashboard Page
// ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const userName = user?.name?.split(' ')[0] ?? 'User'
  const products = useMasterDataStore((s) => s.products)
  const batches = useMasterDataStore((s) => s.batches)
  const fetchProducts = useMasterDataStore((s) => s.fetchProducts)

  const [dashData, setDashData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchDashboard = () => {
    setIsLoading(true)
    Promise.all([
      api.get('/reports/dashboard'),
      fetchProducts(),
    ])
      .then(([res]) => setDashData(res.data))
      .catch((err) => console.error('Failed to fetch dashboard data', err))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    fetchDashboard()

    // Establish Server-Sent Events (SSE) stream for real-time dashboard feed
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'
    const eventSource = new EventSource(`${baseUrl}/events/dashboard-feed`)
    
    eventSource.onmessage = (event) => {
      try {
        const newActivity = JSON.parse(event.data)
        setDashData((prev: any) => {
          if (!prev) return prev
          const currentFeed = prev.activityFeed || []
          
          // Avoid duplicates if SSE reconnects
          if (currentFeed.some((f: any) => f.id === newActivity.id)) return prev
          
          return {
            ...prev,
            // Prepend new live event and slice to keep top 15
            activityFeed: [newActivity, ...currentFeed].slice(0, 15)
          }
        })
      } catch (err) {
        console.error('Failed to parse incoming dashboard event', err)
      }
    }

    return () => {
      eventSource.close()
    }
  }, [])

  const kpiCards = getKpiCards(dashData)

  // ── Derive stock distribution from live products store ──────
  const stockDistribution = useMemo(() => {
    if (!products.length) return dashData?.stockDistribution ?? []
    // Use API data if available (more accurate with rates), else compute from store
    return dashData?.stockDistribution ?? []
  }, [products, dashData])

  // ── Sales trend from API ────────────────────────────────────
  const salesTrend = dashData?.salesTrend ?? []

  // ── Top products from API ───────────────────────────────────
  const topProducts = dashData?.topProducts ?? []

  // ── Expiry timeline from API ────────────────────────────────
  const expiryTimeline = dashData?.expiryTimeline ?? []

  // ── Recent activity from API ────────────────────────────────
  const recentActivity = dashData?.recentActivity ?? []

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const totalStockValue = stockDistribution.reduce((sum: number, d: any) => sum + d.value, 0)

  return (
    <div className="space-y-6">
      {/* ── Greeting Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
        className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening at Hospital Suppliers today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={fetchDashboard}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/reports')}
          >
            <Activity className="h-3.5 w-3.5" />
            View Reports
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/billing/new')}
          >
            <Zap className="h-3.5 w-3.5" />
            Quick Sale
          </Button>
        </div>
      </motion.div>

      {/* ── Section 1: KPI Bento Grid ── */}
      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          const isCurrency = kpi.isCurrencyValue !== false
          return (
            <motion.div key={kpi.title} variants={itemVariants}>
              <Card
                hover
                className={cn(
                  'group relative cursor-pointer overflow-hidden bg-gradient-to-br',
                  kpi.gradient
                )}
                onClick={() => navigate(kpi.href)}
              >
                <CardContent className="p-4 pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {kpi.title}
                      </p>
                      <p className="text-2xl font-bold tracking-tight">
                        {isLoading ? (
                          <span className="inline-block h-8 w-24 animate-pulse rounded-md bg-muted/60" />
                        ) : isCurrency ? (
                          <>
                            <span className="text-base font-semibold text-muted-foreground">₹</span>
                            <CountUp
                              end={kpi.value}
                              duration={1.5}
                              separator=","
                              useEasing
                            />
                          </>
                        ) : (
                          <CountUp end={kpi.value} duration={1.2} />
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {kpi.subtitle}
                        </span>
                        {kpi.change > 0 && (
                          <Badge
                            variant={kpi.direction === 'up' && (kpi.title.includes('Low') || kpi.title.includes('Expiry')) ? 'destructive' : kpi.direction === 'up' ? 'success' : 'destructive'}
                            size="sm"
                            dot
                          >
                            {kpi.direction === 'up' ? '+' : '-'}{kpi.change}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className={cn('rounded-xl p-2.5 transition-transform group-hover:scale-110', kpi.iconBg)}>
                        <Icon className={cn('h-4.5 w-4.5', kpi.iconColor)} />
                      </div>
                    </div>
                  </div>
                  {/* Sparkline */}
                  <div className="mt-2 -mx-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Sparkline data={kpi.sparkData} color={kpi.sparkColor} height={28} />
                  </div>
                  {/* Hover arrow */}
                  <ArrowUpRight className="absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60" />
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      {/* ── Section 2: Quick Actions ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <motion.div key={action.label} variants={itemVariants}>
                <Card
                  hover
                  className="group cursor-pointer"
                  onClick={() => navigate(action.href)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className={cn('rounded-xl p-2.5 transition-transform group-hover:scale-110', action.iconBg)}>
                      <Icon className={cn('h-4.5 w-4.5', action.iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{action.label}</p>
                      {action.shortcut && (
                        <kbd className="mt-0.5 inline-flex h-4 items-center rounded border border-border/60 bg-muted/50 px-1 font-mono text-[9px] text-muted-foreground">
                          {action.shortcut}
                        </kbd>
                      )}
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60" />
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* ── Section 3: Charts Bento Grid ── */}
      <motion.div
        className="grid grid-cols-1 gap-4 lg:grid-cols-7"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Sales Trend — spans 4 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Sales Trend</CardTitle>
                  <CardDescription>Last 30 days revenue</CardDescription>
                </div>
                <Badge variant="info" size="sm">30D</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {salesTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={salesTrend}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => {
                        const d = new Date(v)
                        return `${d.getDate()}/${d.getMonth() + 1}`
                      }}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      width={50}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#salesGradient)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No sales data yet. Start billing to see trends." />
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Stock Value Distribution — spans 3 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Stock Distribution</CardTitle>
              <CardDescription>Inventory value by category</CardDescription>
            </CardHeader>
            <CardContent>
              {stockDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={stockDistribution.filter((d: any) => d.value > 0)}
                      cx="50%"
                      cy="45%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="category"
                      strokeWidth={0}
                    >
                      {stockDistribution
                        .filter((d: any) => d.value > 0)
                        .map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={STOCK_COLORS[index % STOCK_COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), 'Value']}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border) / 0.6)',
                        background: 'hsl(var(--popover) / 0.95)',
                        backdropFilter: 'blur(8px)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value: string) => (
                        <span className="text-[11px] text-muted-foreground">{value}</span>
                      )}
                    />
                    <text x="50%" y="42%" textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                      Total
                    </text>
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-sm font-semibold">
                      {formatCurrency(totalStockValue)}
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No product data available." />
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Selling Products — spans 4 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Top Selling Products</CardTitle>
                  <CardDescription>Revenue this month</CardDescription>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => navigate('/inventory/products')}>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={topProducts}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="productName"
                      type="category"
                      tick={{ fontSize: 9 }}
                      width={130}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v}
                    />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border) / 0.6)',
                        background: 'hsl(var(--popover) / 0.95)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No sales data this month. Create invoices to see top products." />
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Expiry Timeline — spans 3 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Expiry Timeline</CardTitle>
                  <CardDescription>Batch quantities by expiry window</CardDescription>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => navigate('/inventory/expiry')}>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {expiryTimeline.some((e: any) => e.count > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={expiryTimeline}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                      className="text-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border) / 0.6)',
                        background: 'hsl(var(--popover) / 0.95)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" name="Units" radius={[6, 6, 0, 0]} barSize={36}>
                      {expiryTimeline.map((_: any, index: number) => (
                        <Cell key={`exp-${index}`} fill={EXPIRY_COLORS[index % EXPIRY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No expiry data. Add batches to track expiry." />
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Section 4: Recent Activity Feed ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>Latest actions across the system</CardDescription>
              </div>
              <Badge variant="outline" size="sm" className="gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              <div className="space-y-1">
                {recentActivity.length > 0 ? recentActivity.map((activity: any, idx: number) => {
                  const config = activityTypeConfig[activity.type] ?? activityTypeConfig.system
                  return (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.25 }}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border-l-2 p-3 transition-colors hover:bg-muted/30',
                        config.border
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                          config.bg
                        )}
                      >
                        {activity.type === 'sale' ? '₹' : getInitials(activity.action.split(':').pop()?.trim() ?? 'S')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-foreground">{activity.action}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                          {timeAgo(activity.timestamp)}
                        </p>
                      </div>
                    </motion.div>
                  )
                }) : (
                  <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center">
                    <Activity className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No recent activity yet.</p>
                    <p className="text-xs text-muted-foreground/60">Actions like sales and registrations will appear here.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
