import { useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowLeft,
  FileDown,
  FileSpreadsheet,
  Printer,
  Table2,
  BarChart2,
  BarChart3,
  Calendar,
  TrendingUp,
  Package,
  Receipt,
  IndianRupee,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

const pageVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
}

// ─────────────────────────────────────────────────────────────
// Mock data - Daily Sales
// ─────────────────────────────────────────────────────────────

const dailySalesChartData = [
  { hour: '9 AM', amount: 12400 },
  { hour: '10 AM', amount: 18900 },
  { hour: '11 AM', amount: 23500 },
  { hour: '12 PM', amount: 15200 },
  { hour: '1 PM', amount: 8900 },
  { hour: '2 PM', amount: 19800 },
  { hour: '3 PM', amount: 22100 },
  { hour: '4 PM', amount: 17600 },
  { hour: '5 PM', amount: 25300 },
  { hour: '6 PM', amount: 14200 },
]

const dailySalesTableData = [
  { invoice: 'HS/25-26/INV/00421', time: '09:15 AM', customer: 'Apollo Hospital', amount: 12400 },
  { invoice: 'HS/25-26/INV/00422', time: '09:45 AM', customer: 'Walk-in Customer', amount: 3250 },
  { invoice: 'HS/25-26/INV/00423', time: '10:20 AM', customer: 'MIOT Hospital', amount: 18900 },
  { invoice: 'HS/25-26/INV/00424', time: '11:00 AM', customer: 'MedPlus - Madurai', amount: 8650 },
  { invoice: 'HS/25-26/INV/00425', time: '11:30 AM', customer: 'Meenakshi Mission', amount: 14850 },
  { invoice: 'HS/25-26/INV/00426', time: '12:10 PM', customer: 'Walk-in Customer', amount: 2100 },
  { invoice: 'HS/25-26/INV/00427', time: '02:30 PM', customer: 'PharmEasy Wholesale', amount: 19800 },
  { invoice: 'HS/25-26/INV/00428', time: '03:15 PM', customer: 'Apollo Hospital', amount: 22100 },
  { invoice: 'HS/25-26/INV/00429', time: '04:00 PM', customer: 'Dr. Rajesh Clinic', amount: 5400 },
  { invoice: 'HS/25-26/INV/00430', time: '05:20 PM', customer: 'MIOT Hospital', amount: 25300 },
]

// ─────────────────────────────────────────────────────────────
// Mock data - Product-wise Sales
// ─────────────────────────────────────────────────────────────

const productSalesChartData = [
  { product: 'Rituximab 500mg', qtySold: 12, revenue: 282000, margin: 23.4 },
  { product: 'Paclitaxel 260mg', qtySold: 18, revenue: 142200, margin: 26.4 },
  { product: 'Bevacizumab 400mg', qtySold: 8, revenue: 164000, margin: 29.5 },
  { product: 'Imatinib 400mg', qtySold: 35, revenue: 91000, margin: 28.8 },
  { product: 'Gemcitabine 1g', qtySold: 28, revenue: 98000, margin: 28.6 },
  { product: 'Erythropoietin 4000IU', qtySold: 45, revenue: 51750, margin: 26.1 },
  { product: 'Carboplatin 450mg', qtySold: 15, revenue: 58500, margin: 28.2 },
  { product: 'Torsemide 20mg', qtySold: 320, revenue: 24960, margin: 33.3 },
  { product: 'Tacrolimus 1mg', qtySold: 85, revenue: 25075, margin: 28.8 },
  { product: 'Darbepoetin 40mcg', qtySold: 20, revenue: 59000, margin: 28.8 },
]

// ─────────────────────────────────────────────────────────────
// Mock data - Stock Valuation
// ─────────────────────────────────────────────────────────────

const stockValuationPieData = [
  { category: 'Nephrology', value: 485000 },
  { category: 'Oncology', value: 1250000 },
  { category: 'General', value: 180000 },
  { category: 'OTC', value: 95000 },
]

const stockValuationTableData = [
  { product: 'Rituximab 500mg Inj', batch: 'RIT2601R', qty: 4, purchaseValue: 72000, mrpValue: 100000 },
  { product: 'Paclitaxel 260mg Inj', batch: 'PAC2511M', qty: 7, purchaseValue: 40600, mrpValue: 59500 },
  { product: 'Bevacizumab 400mg Inj', batch: 'BEV2601V', qty: 3, purchaseValue: 46500, mrpValue: 66000 },
  { product: 'Imatinib 400mg Tab', batch: 'IMA2510V', qty: 30, purchaseValue: 55500, mrpValue: 84000 },
  { product: 'Torsemide 20mg Tab', batch: 'TOR2502B', qty: 250, purchaseValue: 13000, mrpValue: 21250 },
  { product: 'Erythropoietin 4000IU', batch: 'EPO2509Y', qty: 35, purchaseValue: 29750, mrpValue: 43750 },
  { product: 'Tacrolimus 1mg Cap', batch: 'TAC2510F', qty: 18, purchaseValue: 3780, mrpValue: 5760 },
  { product: 'Losartan 50mg Tab', batch: 'LOS2601Y', qty: 400, purchaseValue: 16000, mrpValue: 27200 },
  { product: 'Furosemide 40mg Tab', batch: 'FUR2601D', qty: 600, purchaseValue: 9600, mrpValue: 16800 },
  { product: 'Mycophenolate 500mg', batch: 'MYC2509K', qty: 110, purchaseValue: 34100, mrpValue: 52800 },
]

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

// ─────────────────────────────────────────────────────────────
// KPI definitions per report type
// ─────────────────────────────────────────────────────────────

interface KpiDef {
  label: string
  value: string
  icon: React.ElementType
  badgeVariant: 'success' | 'warning' | 'info' | 'purple' | 'destructive'
  badgeLabel: string
}

const reportKpiMap: Record<string, KpiDef[]> = {
  'daily-sales': [
    { label: 'Total Sales', value: '\u20B91,47,832', icon: IndianRupee, badgeVariant: 'success', badgeLabel: '+12.5%' },
    { label: 'Invoices', value: '23', icon: Receipt, badgeVariant: 'info', badgeLabel: 'Today' },
    { label: 'Avg. Invoice', value: '\u20B96,427', icon: TrendingUp, badgeVariant: 'purple', badgeLabel: '+3.2%' },
    { label: 'Returns', value: '\u20B92,400', icon: IndianRupee, badgeVariant: 'destructive', badgeLabel: '2 items' },
  ],
  'product-sales': [
    { label: 'Products Sold', value: '142', icon: Package, badgeVariant: 'info', badgeLabel: '10 SKUs' },
    { label: 'Total Revenue', value: '\u20B99,96,485', icon: IndianRupee, badgeVariant: 'success', badgeLabel: '+8.1%' },
    { label: 'Avg. Margin', value: '27.8%', icon: TrendingUp, badgeVariant: 'warning', badgeLabel: 'Stable' },
    { label: 'Top Category', value: 'Oncology', icon: Package, badgeVariant: 'purple', badgeLabel: '#1' },
  ],
  'stock-valuation': [
    { label: 'Total Items', value: '22', icon: Package, badgeVariant: 'info', badgeLabel: 'In stock' },
    { label: 'Purchase Value', value: '\u20B920,10,000', icon: IndianRupee, badgeVariant: 'warning', badgeLabel: 'Cost' },
    { label: 'MRP Value', value: '\u20B928,45,000', icon: IndianRupee, badgeVariant: 'success', badgeLabel: 'Retail' },
    { label: 'Potential Margin', value: '\u20B98,35,000', icon: TrendingUp, badgeVariant: 'purple', badgeLabel: '41.5%' },
  ],
}

const defaultKpis: KpiDef[] = [
  { label: 'Total Records', value: '156', icon: Receipt, badgeVariant: 'info', badgeLabel: 'All' },
  { label: 'Period', value: 'Mar 2026', icon: Calendar, badgeVariant: 'purple', badgeLabel: 'Current' },
  { label: 'Generated By', value: 'Admin', icon: Package, badgeVariant: 'success', badgeLabel: 'Active' },
  { label: 'Status', value: 'Complete', icon: TrendingUp, badgeVariant: 'success', badgeLabel: 'Done' },
]

// ─────────────────────────────────────────────────────────────
// Title map
// ─────────────────────────────────────────────────────────────

const reportTitleMap: Record<string, string> = {
  'daily-sales': 'Daily Sales Summary',
  'monthly-sales': 'Monthly Sales Summary',
  'product-sales': 'Product-wise Sales',
  'customer-sales': 'Customer-wise Sales',
  'category-sales': 'Category-wise Sales',
  'purchase-summary': 'Purchase Summary',
  'supplier-purchase': 'Supplier-wise Purchase',
  'purchase-vs-sales': 'Purchase vs Sales',
  'current-stock': 'Current Stock',
  'stock-valuation': 'Stock Valuation',
  'stock-movement': 'Stock Movement',
  'dead-stock': 'Dead Stock',
  'abc-analysis': 'ABC Analysis',
  'gstr1-summary': 'GSTR-1 Summary',
  'gstr3b-summary': 'GSTR-3B Summary',
  'hsn-summary': 'HSN-wise Summary',
  'cash-book': 'Cash Book',
  'outstanding-receivables': 'Outstanding Receivables',
  'profit-loss': 'Profit & Loss',
  'expense-report': 'Expense Report',
}

// ─────────────────────────────────────────────────────────────
// Recharts custom tooltip
// ─────────────────────────────────────────────────────────────

const chartTooltipStyle = {
  borderRadius: '12px',
  border: '1px solid hsl(var(--border) / 0.6)',
  background: 'hsl(var(--card))',
  fontSize: '12px',
  boxShadow: '0 4px 12px hsl(var(--foreground) / 0.08)',
}

// ─────────────────────────────────────────────────────────────
// ReportViewPage
// ─────────────────────────────────────────────────────────────

interface ReportViewPageProps {
  reportType: string
  onBack?: () => void
}

export default function ReportViewPage({ reportType, onBack }: ReportViewPageProps) {
  const [dateRange, setDateRange] = useState('today')
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('chart')

  const title = reportTitleMap[reportType] || 'Report'
  const kpis = reportKpiMap[reportType] || defaultKpis

  const dateRangeOptions = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ]

  const handleBack = () => {
    if (onBack) onBack()
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ── Header ── */}
        <motion.div variants={itemVariants}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleBack}
                className="rounded-xl border border-border/60"
              >
                <ArrowLeft />
              </Button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                  <Badge variant="info" size="sm" dot>
                    Live
                  </Badge>
                </div>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Generated on {formatDate(new Date().toISOString())}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-border/60">
                <FileDown className="h-3.5 w-3.5" />
                PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-border/60">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-border/60">
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ── Date Range Selector ── */}
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 w-fit border border-border/60 dark:bg-muted/30">
            {dateRangeOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setDateRange(opt.key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  dateRange === opt.key
                    ? 'bg-background text-foreground shadow-sm dark:bg-card'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── KPI Cards ── */}
        <motion.div className="grid grid-cols-2 gap-4 lg:grid-cols-4" variants={itemVariants}>
          {kpis.map((kpi) => {
            const Icon = kpi.icon
            return (
              <Card key={kpi.label} hover>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/15">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <Badge variant={kpi.badgeVariant} size="sm" dot>
                      {kpi.badgeLabel}
                    </Badge>
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
                    {kpi.value}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </motion.div>

        {/* ── View Toggle ── */}
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 w-fit border border-border/60 dark:bg-muted/30">
            <button
              onClick={() => setViewMode('chart')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                viewMode === 'chart'
                  ? 'bg-background text-foreground shadow-sm dark:bg-card'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              Chart
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                viewMode === 'table'
                  ? 'bg-background text-foreground shadow-sm dark:bg-card'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </button>
          </div>
        </motion.div>

        {/* ── Chart / Table Content ── */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-6">
              {/* ── Daily Sales Report ── */}
              {reportType === 'daily-sales' && (
                <>
                  {viewMode === 'chart' ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={dailySalesChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                          className="text-muted-foreground"
                        />
                        <Tooltip
                          formatter={(value: any, name: any) => [formatCurrency(Number(value)), name === 'amount' ? 'Sales' : String(name)]}
                          contentStyle={chartTooltipStyle}
                        />
                        <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 dark:bg-muted/20">
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Invoice #
                            </TableHead>
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Time
                            </TableHead>
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Customer
                            </TableHead>
                            <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Amount
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailySalesTableData.map((row) => (
                            <TableRow key={row.invoice} className="hover:bg-muted/30 transition-colors">
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {row.invoice}
                              </TableCell>
                              <TableCell className="text-sm">{row.time}</TableCell>
                              <TableCell className="text-sm font-medium">{row.customer}</TableCell>
                              <TableCell className="text-right font-mono font-semibold tabular-nums">
                                {formatCurrency(row.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              {/* ── Product-wise Sales Report ── */}
              {reportType === 'product-sales' && (
                <>
                  {viewMode === 'chart' ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={productSalesChartData} layout="vertical" margin={{ left: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          dataKey="product"
                          type="category"
                          tick={{ fontSize: 10 }}
                          width={140}
                          className="text-muted-foreground"
                        />
                        <Tooltip
                          formatter={(value: any, name: any) => [formatCurrency(Number(value)), name === 'revenue' ? 'Revenue' : String(name)]}
                          contentStyle={chartTooltipStyle}
                        />
                        <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 dark:bg-muted/20">
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Product
                            </TableHead>
                            <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Qty Sold
                            </TableHead>
                            <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Revenue
                            </TableHead>
                            <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Margin %
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {productSalesChartData.map((row) => (
                            <TableRow key={row.product} className="hover:bg-muted/30 transition-colors">
                              <TableCell className="font-medium text-sm">{row.product}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {row.qtySold}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold tabular-nums">
                                {formatCurrency(row.revenue)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={row.margin > 28 ? 'success' : row.margin > 25 ? 'warning' : 'destructive'}
                                  size="sm"
                                  dot
                                >
                                  {row.margin}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              {/* ── Stock Valuation Report ── */}
              {reportType === 'stock-valuation' && (
                <>
                  {viewMode === 'chart' ? (
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={stockValuationPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={130}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="category"
                          strokeWidth={2}
                          className="stroke-background"
                        >
                          {stockValuationPieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
                          contentStyle={chartTooltipStyle}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value: string) => (
                            <span className="text-xs text-foreground">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 dark:bg-muted/20">
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Product
                            </TableHead>
                            <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Batch
                            </TableHead>
                            <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Qty
                            </TableHead>
                            <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Purchase Value
                            </TableHead>
                            <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              MRP Value
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stockValuationTableData.map((row) => (
                            <TableRow key={row.batch} className="hover:bg-muted/30 transition-colors">
                              <TableCell className="font-medium text-sm">{row.product}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {row.batch}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {row.qty}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {formatCurrency(row.purchaseValue)}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold tabular-nums">
                                {formatCurrency(row.mrpValue)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              {/* ── Generic fallback ── */}
              {!['daily-sales', 'product-sales', 'stock-valuation'].includes(reportType) && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60 dark:bg-muted/30">
                    <BarChart3 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
                  <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                    This report is being prepared. The detailed view for this report type will be available soon.
                  </p>
                  <Badge variant="warning" size="sm" dot className="mb-4">
                    Coming Soon
                  </Badge>
                  <Button variant="outline" onClick={handleBack} className="rounded-xl border-border/60">
                    Back to Reports Hub
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
