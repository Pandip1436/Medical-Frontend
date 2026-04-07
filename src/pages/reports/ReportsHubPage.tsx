import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  BarChart3,
  TrendingUp,
  Package,
  Users,
  PieChart,
  ShoppingCart,
  Truck,
  ArrowLeftRight,
  IndianRupee,
  ArrowUpDown,
  PackageX,
  FileText,
  Hash,
  BookOpen,
  Clock,
  Receipt,
  Play,
  RotateCcw,
  Star,
  Sparkles,
  ChevronRight,
  LayoutGrid,
  List,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatDate } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Report definitions
// ─────────────────────────────────────────────────────────────

type CategoryKey = 'All' | 'Sales' | 'Purchase' | 'Inventory' | 'Accounting' | 'Customers'

interface ReportDef {
  id: string
  name: string
  description: string
  icon: LucideIcon
  iconBg: string
  iconColor: string
  category: CategoryKey
  popular?: boolean
}

const allReports: ReportDef[] = [
  // Sales
  { id: 'daily-sales', name: 'Daily Sales Summary', description: 'Hourly breakdown of today\'s sales performance', icon: BarChart3, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales', popular: true },
  { id: 'monthly-sales', name: 'Monthly Sales Summary', description: 'Month-over-month sales trend analysis', icon: TrendingUp, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales' },
  { id: 'product-sales', name: 'Product-wise Sales', description: 'Revenue and margin breakdown by product', icon: Package, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales', popular: true },
  { id: 'customer-sales', name: 'Customer-wise Sales', description: 'Sales volume and outstanding per customer', icon: Users, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales' },
  { id: 'category-sales', name: 'Category-wise Sales', description: 'Sales distribution across product categories', icon: PieChart, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales' },
  // Purchase
  { id: 'purchase-summary', name: 'Purchase Summary', description: 'Total purchases and GRN reconciliation', icon: ShoppingCart, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-600 dark:text-purple-400', category: 'Purchase', popular: true },
  { id: 'supplier-purchase', name: 'Supplier-wise Purchase', description: 'Purchase volumes and payables per supplier', icon: Truck, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-600 dark:text-purple-400', category: 'Purchase' },
  { id: 'purchase-vs-sales', name: 'Purchase vs Sales', description: 'Comparative analysis of inflow and outflow', icon: ArrowLeftRight, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-600 dark:text-purple-400', category: 'Purchase' },
  // Inventory
  { id: 'current-stock', name: 'Current Stock', description: 'Live inventory levels across all products', icon: Package, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', category: 'Inventory', popular: true },
  { id: 'stock-valuation', name: 'Stock Valuation', description: 'Inventory value at purchase and MRP rates', icon: IndianRupee, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', category: 'Inventory', popular: true },
  { id: 'stock-movement', name: 'Stock Movement', description: 'Inward, outward, and adjustment history', icon: ArrowUpDown, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', category: 'Inventory' },
  { id: 'dead-stock', name: 'Dead Stock', description: 'Products with no movement in 90+ days', icon: PackageX, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', category: 'Inventory' },
  { id: 'abc-analysis', name: 'ABC Analysis', description: 'Classify inventory by revenue contribution', icon: BarChart3, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', category: 'Inventory' },
  // Accounting / Tax
  { id: 'gstr1-summary', name: 'GSTR-1 Summary', description: 'Outward supply summary for GST filing', icon: FileText, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', category: 'Accounting', popular: true },
  { id: 'gstr3b-summary', name: 'GSTR-3B Summary', description: 'Monthly return summary with ITC details', icon: FileText, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', category: 'Accounting' },
  { id: 'hsn-summary', name: 'HSN-wise Summary', description: 'Tax summary grouped by HSN codes', icon: Hash, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', category: 'Accounting' },
  // Financial / Customers
  { id: 'cash-book', name: 'Cash Book', description: 'Daily cash receipts and payments ledger', icon: BookOpen, iconBg: 'bg-rose-500/10', iconColor: 'text-rose-600 dark:text-rose-400', category: 'Customers' },
  { id: 'outstanding-receivables', name: 'Outstanding Receivables', description: 'Pending customer payments and aging', icon: Clock, iconBg: 'bg-rose-500/10', iconColor: 'text-rose-600 dark:text-rose-400', category: 'Customers', popular: true },
  { id: 'profit-loss', name: 'Profit & Loss', description: 'Revenue, cost, and net profit summary', icon: TrendingUp, iconBg: 'bg-rose-500/10', iconColor: 'text-rose-600 dark:text-rose-400', category: 'Customers', popular: true },
  { id: 'expense-report', name: 'Expense Report', description: 'Category-wise operational expenses', icon: Receipt, iconBg: 'bg-rose-500/10', iconColor: 'text-rose-600 dark:text-rose-400', category: 'Customers' },
]

const categoryConfig: Record<CategoryKey, { label: string; color: string; badge: 'info' | 'purple' | 'success' | 'warning' | 'default' | 'secondary' }> = {
  All: { label: 'All Reports', color: 'text-foreground', badge: 'secondary' },
  Sales: { label: 'Sales', color: 'text-blue-600 dark:text-blue-400', badge: 'info' },
  Purchase: { label: 'Purchase', color: 'text-purple-600 dark:text-purple-400', badge: 'purple' },
  Inventory: { label: 'Inventory', color: 'text-emerald-600 dark:text-emerald-400', badge: 'success' },
  Accounting: { label: 'Tax / GST', color: 'text-amber-600 dark:text-amber-400', badge: 'warning' },
  Customers: { label: 'Financial', color: 'text-rose-600 dark:text-rose-400', badge: 'default' },
}

const categoryKeys: CategoryKey[] = ['All', 'Sales', 'Purchase', 'Inventory', 'Accounting', 'Customers']

// Recently generated reports (mock)
interface RecentReport {
  id: string
  name: string
  generatedAt: string
  reportType: string
  category: CategoryKey
}

const recentReports: RecentReport[] = [
  { id: 'RR-001', name: 'Daily Sales Summary', generatedAt: '2026-03-21T10:30:00Z', reportType: 'daily-sales', category: 'Sales' },
  { id: 'RR-002', name: 'Stock Valuation', generatedAt: '2026-03-21T09:15:00Z', reportType: 'stock-valuation', category: 'Inventory' },
  { id: 'RR-003', name: 'GSTR-1 Summary', generatedAt: '2026-03-20T16:45:00Z', reportType: 'gstr1-summary', category: 'Accounting' },
  { id: 'RR-004', name: 'Product-wise Sales', generatedAt: '2026-03-20T14:20:00Z', reportType: 'product-sales', category: 'Sales' },
  { id: 'RR-005', name: 'Outstanding Receivables', generatedAt: '2026-03-19T11:00:00Z', reportType: 'outstanding-receivables', category: 'Customers' },
]

// ─────────────────────────────────────────────────────────────
// Inline ReportViewPage
// ─────────────────────────────────────────────────────────────

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  ArrowLeft,
  FileDown,
  FileSpreadsheet,
  Printer,
  Table2,
  BarChart2,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

const dailySalesData = [
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

const dailySalesTable = [
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

const productSalesData = [
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

const stockValuationData = [
  { category: 'Nephrology', value: 485000 },
  { category: 'Oncology', value: 1250000 },
  { category: 'General', value: 180000 },
  { category: 'OTC', value: 95000 },
]

const stockValuationTable = [
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

interface KpiDef { label: string; value: string }

const reportKpis: Record<string, KpiDef[]> = {
  'daily-sales': [
    { label: 'Total Sales', value: '\u20B91,47,832' },
    { label: 'Invoices', value: '23' },
    { label: 'Avg. Invoice', value: '\u20B96,427' },
    { label: 'Returns', value: '\u20B92,400' },
  ],
  'product-sales': [
    { label: 'Products Sold', value: '142' },
    { label: 'Total Revenue', value: '\u20B99,96,485' },
    { label: 'Avg. Margin', value: '27.8%' },
    { label: 'Top Category', value: 'Oncology' },
  ],
  'stock-valuation': [
    { label: 'Total Items', value: '22' },
    { label: 'Purchase Value', value: '\u20B920,10,000' },
    { label: 'MRP Value', value: '\u20B928,45,000' },
    { label: 'Potential Margin', value: '\u20B98,35,000' },
  ],
}

const defaultKpis: KpiDef[] = [
  { label: 'Total Records', value: '156' },
  { label: 'Period', value: 'Mar 2026' },
  { label: 'Generated By', value: 'Admin' },
  { label: 'Status', value: 'Complete' },
]

const reportTitleMap: Record<string, string> = {}
allReports.forEach((r) => { reportTitleMap[r.id] = r.name })

// ─────────────────────────────────────────────────────────────
// Report View Page (embedded)
// ─────────────────────────────────────────────────────────────

function ReportViewPage({ reportType, onBack }: { reportType: string; onBack: () => void }) {
  const [dateRange, setDateRange] = useState('today')
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('chart')

  const title = reportTitleMap[reportType] || 'Report'
  const kpis = reportKpis[reportType] || defaultKpis

  const dateRangeOptions = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-border/40 bg-background px-6 py-2.5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onBack} className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
            <p className="text-[11px] text-muted-foreground">
              Generated on {formatDate(new Date().toISOString())}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
            {dateRangeOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setDateRange(opt.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                  dateRange === opt.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="h-5 w-px bg-border/60" />
          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              onClick={() => setViewMode('chart')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                viewMode === 'chart' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BarChart2 className="h-3 w-3" />
              Chart
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all',
                viewMode === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Table2 className="h-3 w-3" />
              Table
            </button>
          </div>
          <div className="h-5 w-px bg-border/60" />
          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] gap-1">
            <FileDown className="h-3 w-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] gap-1">
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] gap-1">
            <Printer className="h-3 w-3" /> Print
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="shrink-0 border-b border-border/40 bg-muted/10 px-6 py-3 dark:bg-muted/5">
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-border/40 bg-background px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          {reportType === 'daily-sales' && (
            <>
              {viewMode === 'chart' ? (
                <div className="rounded-xl border border-border/40 bg-background p-5">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={dailySalesData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(Number(value)), 'Sales']}
                        contentStyle={{ borderRadius: '10px', border: '1px solid hsl(var(--border) / 0.6)', fontSize: '12px' }}
                      />
                      <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-border/40 bg-background overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Invoice #</TableHead><TableHead>Time</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailySalesTable.map((row) => (
                        <TableRow key={row.invoice}>
                          <TableCell className="font-mono text-xs">{row.invoice}</TableCell>
                          <TableCell>{row.time}</TableCell>
                          <TableCell>{row.customer}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(row.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {reportType === 'product-sales' && (
            <>
              {viewMode === 'chart' ? (
                <div className="rounded-xl border border-border/40 bg-background p-5">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={productSalesData} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" axisLine={false} tickLine={false} />
                      <YAxis dataKey="product" type="category" tick={{ fontSize: 10 }} width={140} className="text-muted-foreground" axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(Number(value)), 'Revenue']}
                        contentStyle={{ borderRadius: '10px', border: '1px solid hsl(var(--border) / 0.6)', fontSize: '12px' }}
                      />
                      <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-border/40 bg-background overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty Sold</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Margin %</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {productSalesData.map((row) => (
                        <TableRow key={row.product}>
                          <TableCell className="font-medium">{row.product}</TableCell>
                          <TableCell className="text-right">{row.qtySold}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={row.margin > 28 ? 'success' : 'warning'} size="sm">{row.margin}%</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {reportType === 'stock-valuation' && (
            <>
              {viewMode === 'chart' ? (
                <div className="rounded-xl border border-border/40 bg-background p-5">
                  <ResponsiveContainer width="100%" height={400}>
                    <RechartsPieChart>
                      <Pie data={stockValuationData} cx="50%" cy="50%" innerRadius={80} outerRadius={130} paddingAngle={3} dataKey="value" nameKey="category">
                        {stockValuationData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(Number(value)), 'Value']}
                        contentStyle={{ borderRadius: '10px', border: '1px solid hsl(var(--border) / 0.6)', fontSize: '12px' }}
                      />
                      <Legend verticalAlign="bottom" height={36} formatter={(value: string) => (<span className="text-xs text-foreground">{value}</span>)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-border/40 bg-background overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Purchase Value</TableHead><TableHead className="text-right">MRP Value</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockValuationTable.map((row) => (
                        <TableRow key={row.batch}>
                          <TableCell className="font-medium">{row.product}</TableCell>
                          <TableCell className="font-mono text-xs">{row.batch}</TableCell>
                          <TableCell className="text-right">{row.qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.purchaseValue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.mrpValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {!['daily-sales', 'product-sales', 'stock-valuation'].includes(reportType) && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <BarChart3 className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <h3 className="mb-1 text-base font-semibold">{title}</h3>
              <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                This report is being prepared. Detailed view coming soon.
              </p>
              <Button variant="outline" size="sm" onClick={onBack}>Back to Reports</Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Reports Hub Page — Fixed Viewport, Two-Column
// ─────────────────────────────────────────────────────────────

export default function ReportsHubPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<CategoryKey>('All')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeReport, setActiveReport] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<ReportDef | null>(null)

  const totalReports = allReports.length
  const popularReports = allReports.filter((r) => r.popular)

  const filteredReports = useMemo(() => {
    let reports = allReports
    if (activeFilter !== 'All') {
      reports = reports.filter((r) => r.category === activeFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      reports = reports.filter(
        (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      )
    }
    return reports
  }, [searchQuery, activeFilter])

  // Group by category for grid view
  const groupedReports = useMemo(() => {
    const groups: Record<string, ReportDef[]> = {}
    for (const r of filteredReports) {
      const cat = r.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(r)
    }
    return groups
  }, [filteredReports])

  const handleGenerate = (reportId: string) => {
    setActiveReport(reportId)
  }

  if (activeReport) {
    return <ReportViewPage reportType={activeReport} onBack={() => setActiveReport(null)} />
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-border/40 bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Reports & Analytics</h1>
            <p className="text-[11px] text-muted-foreground">
              {totalReports} reports available across {categoryKeys.length - 1} categories
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              icon={<Search />}
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 h-8 text-xs"
              suffix={filteredReports.length !== totalReports ? (
                <span className="tabular-nums whitespace-nowrap text-[11px]">{filteredReports.length} found</span>
              ) : undefined}
            />
            <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as CategoryKey)}>
              <SelectTrigger className="h-8 w-[130px] rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryKeys.map((key) => (
                  <SelectItem key={key} value={key}>{categoryConfig[key].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="h-5 w-px bg-border/60" />
            <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'rounded-md p-1.5 transition-all',
                  viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'rounded-md p-1.5 transition-all',
                  viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MAIN WORKSPACE — Two-column                               */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Reports Catalog (65%) ───────────────────── */}
        <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[65%]">
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-5 space-y-5">
              {/* Popular / Quick Access strip */}
              {activeFilter === 'All' && !searchQuery && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Popular Reports
                    </span>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                    {popularReports.map((report) => {
                      const Icon = report.icon
                      return (
                        <motion.button
                          key={report.id}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedReport(report)}
                          className={cn(
                            'group flex items-center gap-2.5 rounded-xl border border-border/40 bg-background p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm',
                            selectedReport?.id === report.id && 'border-primary/50 bg-primary/5 shadow-sm'
                          )}
                        >
                          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', report.iconBg)}>
                            <Icon className={cn('h-4 w-4', report.iconColor)} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                              {report.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{report.description}</p>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Reports — Grid or List view */}
              {viewMode === 'grid' ? (
                // Grouped grid view
                Object.entries(groupedReports).map(([category, reports]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {categoryConfig[category as CategoryKey]?.label || category}
                      </span>
                      <Badge variant={categoryConfig[category as CategoryKey]?.badge || 'secondary'} size="sm">
                        {reports.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                      {reports.map((report) => {
                        const Icon = report.icon
                        const isSelected = selectedReport?.id === report.id
                        return (
                          <motion.button
                            key={report.id}
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => setSelectedReport(report)}
                            className={cn(
                              'group flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-all',
                              isSelected
                                ? 'border-primary/50 bg-primary/5 shadow-sm'
                                : 'border-border/40 bg-background hover:border-border/60 hover:shadow-sm'
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', report.iconBg)}>
                                <Icon className={cn('h-4.5 w-4.5', report.iconColor)} />
                              </div>
                              {report.popular && (
                                <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                                {report.name}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                                {report.description}
                              </p>
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                ))
              ) : (
                // List view
                <div className="space-y-1">
                  {filteredReports.map((report) => {
                    const Icon = report.icon
                    const isSelected = selectedReport?.id === report.id
                    return (
                      <button
                        key={report.id}
                        onClick={() => setSelectedReport(report)}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-all',
                          isSelected
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-transparent hover:border-border/40 hover:bg-muted/30'
                        )}
                      >
                        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', report.iconBg)}>
                          <Icon className={cn('h-4 w-4', report.iconColor)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                            {report.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{report.description}</p>
                        </div>
                        <Badge variant={categoryConfig[report.category]?.badge || 'secondary'} size="sm">
                          {categoryConfig[report.category]?.label}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}

              {filteredReports.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                    <Search className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No reports found</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/60">Try a different search or category</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ─── RIGHT: Detail & Recent (35%) ──────────────────── */}
        <div className="hidden lg:flex lg:w-[35%] flex-col overflow-hidden">
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-5 space-y-5">
              {/* Selected report detail */}
              <AnimatePresence mode="wait">
                {selectedReport ? (
                  <motion.div
                    key={selectedReport.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="rounded-xl border border-border/40 bg-background overflow-hidden"
                  >
                    {/* Report preview card */}
                    <div className={cn('px-5 py-4 border-b border-border/30', selectedReport.iconBg.replace('/10', '/5'))}>
                      <div className="flex items-start justify-between">
                        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', selectedReport.iconBg)}>
                          <selectedReport.icon className={cn('h-5 w-5', selectedReport.iconColor)} />
                        </div>
                        <Badge variant={categoryConfig[selectedReport.category]?.badge || 'secondary'} size="sm">
                          {categoryConfig[selectedReport.category]?.label}
                        </Badge>
                      </div>
                      <h3 className="mt-3 text-base font-bold">{selectedReport.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedReport.description}</p>
                    </div>

                    {/* Quick info */}
                    <div className="px-5 py-3 space-y-2">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Format</span>
                        <span className="font-medium">Table + Chart</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Export</span>
                        <span className="font-medium">PDF, Excel</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Period</span>
                        <span className="font-medium">Configurable</span>
                      </div>
                    </div>

                    {/* Generate button */}
                    <div className="px-5 pb-4 pt-1">
                      <Button
                        className="w-full gap-2 rounded-xl"
                        onClick={() => handleGenerate(selectedReport.id)}
                      >
                        <Play className="h-4 w-4" />
                        Generate Report
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center dark:bg-muted/5"
                  >
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30">
                      <FileText className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Select a report</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      Click any report from the catalog to see details and generate it
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Category quick stats */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  By Category
                </span>
                <div className="mt-2 space-y-1.5">
                  {categoryKeys.filter((k) => k !== 'All').map((key) => {
                    const count = allReports.filter((r) => r.category === key).length
                    const config = categoryConfig[key]
                    return (
                      <button
                        key={key}
                        onClick={() => { setActiveFilter(key); setSelectedReport(null) }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-all hover:bg-muted/30',
                          activeFilter === key && 'bg-muted/40'
                        )}
                      >
                        <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{count} reports</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Recently generated */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Recently Generated
                </span>
                <div className="mt-2 space-y-1.5">
                  {recentReports.map((rr) => (
                    <button
                      key={rr.id}
                      onClick={() => handleGenerate(rr.reportType)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-border/30 bg-background px-3 py-2.5 text-left transition-all hover:border-border/60 hover:shadow-sm"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                          {rr.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(rr.generatedAt)}</p>
                      </div>
                      <RotateCcw className="h-3 w-3 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
