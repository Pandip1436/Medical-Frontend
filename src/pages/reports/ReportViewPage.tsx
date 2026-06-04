import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { exportToPdf, printReport } from '@/lib/exportUtils'
import { exportToExcel } from '@/lib/excelUtils'
import { toast } from 'sonner'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowLeft,
  FileDown,
  FileSpreadsheet,
  Printer,
  Table2,
  BarChart2,
  Calendar,
  TrendingUp,
  Package,
  Receipt,
  IndianRupee,
  Loader2,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
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
  LineChart,
  Line,
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
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6']

const chartTooltipStyle = {
  borderRadius: '12px',
  border: '1px solid hsl(var(--border) / 0.6)',
  background: 'hsl(var(--card))',
  fontSize: '12px',
  boxShadow: '0 4px 12px hsl(var(--foreground) / 0.08)',
}

// ─────────────────────────────────────────────────────────────
// Report endpoints map
// ─────────────────────────────────────────────────────────────

const REPORT_ENDPOINTS: Record<string, string> = {
  'daily-sales': '/reports/sales/daily',
  'monthly-sales': '/reports/sales/monthly',
  'yearly-sales': '/reports/sales/yearly',
  'product-sales': '/reports/sales/products',
  'customer-sales': '/reports/sales/customers',
  'category-sales': '/reports/sales/category',
  'purchase-summary': '/reports/purchase/summary',
  'supplier-purchase': '/reports/purchase/by-supplier',
  'purchase-vs-sales': '/reports/purchase/vs-sales',
  'current-stock': '/reports/inventory/current-stock',
  'stock-valuation': '/reports/inventory/valuation',
  'stock-movement': '/reports/inventory/movement',
  'dead-stock': '/reports/inventory/aging',
  'abc-analysis': '/reports/inventory/abc-analysis',
  'gstr1-summary': '/reports/gst/gstr-1',
  'gstr3b-summary': '/reports/gst/gstr-3b',
  'hsn-summary': '/reports/gst/hsn-summary',
  'cash-book': '/reports/financial/cash-book',
  'outstanding-receivables': '/reports/financial/outstanding',
  'profit-loss': '/reports/financial/profit-loss',
  'expense-report': '/reports/financial/expenses',
}

const reportTitleMap: Record<string, string> = {
  'daily-sales': 'Daily Sales Summary',
  'monthly-sales': 'Monthly Sales Summary',
  'yearly-sales': 'Yearly Sales',
  'product-sales': 'Product-wise Sales',
  'customer-sales': 'Customer-wise Sales',
  'category-sales': 'Category-wise Sales',
  'purchase-summary': 'Purchase Summary',
  'supplier-purchase': 'Supplier-wise Purchase',
  'purchase-vs-sales': 'Purchase vs Sales',
  'current-stock': 'Current Stock',
  'stock-valuation': 'Stock Valuation',
  'stock-movement': 'Stock Movement',
  'dead-stock': 'Dead Stock / Aging',
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
// KPI Cards
// ─────────────────────────────────────────────────────────────

const KPI_ICONS = [IndianRupee, Receipt, TrendingUp, Package, Calendar]

function KpiCards({ kpis }: { kpis: { label: string; value: string }[] }) {
  return (
    <div className={cn('grid gap-4', kpis.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4')}>
      {kpis.map((kpi, i) => {
        const Icon = KPI_ICONS[i % KPI_ICONS.length]
        return (
          <Card key={kpi.label} hover>
            <CardContent className="p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/15 mb-3">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-xl font-bold font-mono tracking-tight">{kpi.value}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Table wrapper
// ─────────────────────────────────────────────────────────────

function ReportTable({ headers, rows, totalItems, onPageChange, currentPage, pageSize }: { 
  headers: string[]; 
  rows: (string | number)[][];
  totalItems?: number;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  pageSize?: number;
}) {
  if (!rows.length) return (
    <p className="py-12 text-center text-sm text-muted-foreground">No data for this period</p>
  )
  
  const totalPages = totalItems && pageSize ? Math.ceil(totalItems / pageSize) : 0

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 dark:bg-muted/20">
              {headers.map((h) => (
                <TableHead key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri} className="hover:bg-muted/30 transition-colors">
                {row.map((cell, ci) => (
                  <TableCell key={ci} className="text-sm">{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && onPageChange && currentPage && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ReportViewPage
// ─────────────────────────────────────────────────────────────

interface ReportViewPageProps {
  reportType: string
  onBack?: () => void
}

export default function ReportViewPage({ reportType, onBack }: ReportViewPageProps) {
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('chart')
  const [liveData, setLiveData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20

  useEffect(() => { setCurrentPage(1) }, [reportType, liveData])

  const paginate = (data: any[]) => {
    if (!data) return []
    return data.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  }

  const renderPagination = (totalItems: number) => {
    const totalPages = Math.ceil(totalItems / PAGE_SIZE)
    if (totalPages <= 1) return null
    return (
      <div className="mt-4">
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    )
  }

  const title = reportTitleMap[reportType] || 'Report'

  const fetchReport = useCallback(() => {
    const endpoint = REPORT_ENDPOINTS[reportType]
    if (!endpoint) { setLiveData(null); return }
    setIsLoading(true)
    api.get(endpoint)
      .then((res) => setLiveData(res.data))
      .catch(() => setLiveData(null))
      .finally(() => setIsLoading(false))
  }, [reportType])

  useEffect(() => { fetchReport() }, [fetchReport])
  useBranchRefresh(fetchReport)

  const kpis: { label: string; value: string }[] = liveData?.kpis ?? []
  const exportRows: Record<string, unknown>[] = liveData?.tableData ?? liveData?.chartData ?? []

  const handleExportPdf = () => {
    if (!exportRows.length) { toast.info('No data to export'); return }
    exportToPdf(exportRows, title, `${reportType}-report`)
  }
  const handleExportExcel = () => {
    if (!exportRows.length) { toast.info('No data to export'); return }
    exportToExcel(exportRows, `${reportType}-report`)
  }
  const handlePrint = () => {
    if (!exportRows.length) { toast.info('No data to print'); return }
    printReport(exportRows, title)
  }

  const renderContent = () => {
    if (isLoading) return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading report data…</p>
      </div>
    )

    if (!liveData) return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">No data available for this report.</p>
      </div>
    )

    // ── Daily Sales ──
    if (reportType === 'daily-sales') {
      const chart = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Sales']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Invoice #', 'Time', 'Customer', 'Amount']} 
          rows={paginate(table).map((r: any) => [r.invoice, r.time, r.customer, formatCurrency(r.amount)])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Monthly Sales ──
    if (reportType === 'monthly-sales') {
      const chart = liveData.chartData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return <ReportTable headers={['Month', 'Revenue', 'Invoices']} rows={chart.map((r: any) => [r.month, formatCurrency(r.amount), r.invoices])} />
    }

    // ── Yearly Sales ──
    if (reportType === 'yearly-sales') {
      const chart = liveData.chartData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return <ReportTable headers={['Year', 'Total Sales', 'Invoices']} rows={chart.map((r: any) => [r.year, formatCurrency(r.total), r.invoiceCount])} />
    }

    // ── Product-wise Sales ──
    if (reportType === 'product-sales') {
      const data = liveData.chartData ?? []
      if (viewMode === 'chart') return (
        <div className="h-70 sm:h-85 lg:h-100"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis dataKey="product" type="category" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Product', 'Qty Sold', 'Revenue', 'Margin %']} 
          rows={paginate(data).map((r: any) => [r.product, r.qtySold, formatCurrency(r.revenue), `${r.margin?.toFixed(1)}%`])} 
          totalItems={data.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Customer-wise Sales ──
    if (reportType === 'customer-sales') {
      const data = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis dataKey="customer" type="category" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="revenue" fill="#10b981" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Customer', 'Invoices', 'Revenue']} 
          rows={paginate(table).map((r: any) => [r.customer, r.invoices, formatCurrency(r.revenue)])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Category-wise Sales ──
    if (reportType === 'category-sales') {
      const data = liveData.chartData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-90"><ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={80} outerRadius={130} paddingAngle={3} dataKey="revenue" nameKey="category" strokeWidth={2} className="stroke-background">
              {data.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Revenue']} contentStyle={chartTooltipStyle} />
            <Legend formatter={(v: string) => <span className="text-xs text-foreground">{v}</span>} />
          </PieChart>
        </ResponsiveContainer></div>
      )
      return <ReportTable headers={['Category', 'Qty Sold', 'Revenue']} rows={data.map((r: any) => [r.category, r.qty, formatCurrency(r.revenue)])} />
    }

    // ── Purchase Summary ──
    if (reportType === 'purchase-summary') {
      const chart = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Amount']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="amount" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Date', 'GRN #', 'Supplier', 'Items', 'Amount']}
          rows={paginate(table).map((r: any) => [formatDate(r.date), r.grnNumber, r.supplier, r.items, formatCurrency(r.amount)])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Supplier-wise Purchase ──
    if (reportType === 'supplier-purchase') {
      const data = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis dataKey="supplier" type="category" tick={{ fontSize: 10 }} width={140} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Amount']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="amount" fill="#f59e0b" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Supplier', 'PEs', 'Total Amount']}
          rows={paginate(table).map((r: any) => [r.supplier, r.grns, formatCurrency(r.amount)])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Purchase vs Sales ──
    if (reportType === 'purchase-vs-sales') {
      const data = liveData.chartData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any, n: any) => [formatCurrency(Number(v)), n === 'sales' ? 'Sales' : 'Purchases']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="sales" fill="#3b82f6" radius={[6, 6, 0, 0]} name="sales" />
            <Bar dataKey="purchases" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="purchases" />
            <Legend />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return <ReportTable headers={['Month', 'Sales', 'Purchases']} rows={data.map((r: any) => [r.month, formatCurrency(r.sales), formatCurrency(r.purchases)])} />
    }

    // ── Current Stock ──
    if (reportType === 'current-stock') {
      const table = liveData.tableData ?? []
      const chart = liveData.chartData ?? []
      if (viewMode === 'chart') return (
        <div className="h-70 sm:h-85 lg:h-100"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis dataKey="product" type="category" tick={{ fontSize: 10 }} width={150} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Bar dataKey="stock" fill="#10b981" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 dark:bg-muted/20">
                  {['Product', 'Category', 'Stock', 'Min Stock', 'MRP', 'Status'].map((h) => (
                    <TableHead key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(table).map((r: any, i: number) => (
                  <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-sm">{r.product}</TableCell>
                    <TableCell className="text-sm">{r.category}</TableCell>
                    <TableCell className="font-mono text-sm">{r.totalStock}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{r.minStock}</TableCell>
                    <TableCell className="font-mono text-sm">{formatCurrency(r.mrp)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'OUT' ? 'destructive' : r.status === 'LOW' ? 'warning' : 'success'} size="sm" dot>
                        {r.status === 'OUT' ? 'Out of Stock' : r.status === 'LOW' ? 'Low Stock' : 'OK'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {renderPagination(table.length)}
        </div>
      )
    }

    // ── Stock Valuation ──
    if (reportType === 'stock-valuation') {
      const chart = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chart} cx="50%" cy="50%" innerRadius={80} outerRadius={130} paddingAngle={3} dataKey="value" nameKey="category" strokeWidth={2} className="stroke-background">
              {chart.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Value']} contentStyle={chartTooltipStyle} />
            <Legend formatter={(v: string) => <span className="text-xs text-foreground">{v}</span>} />
          </PieChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Product', 'Batch', 'Qty', 'Purchase Value', 'MRP Value']} 
          rows={paginate(table).map((r: any) => [r.product, r.batch, r.qty, formatCurrency(r.purchaseValue), formatCurrency(r.mrpValue)])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Stock Movement ──
    if (reportType === 'stock-movement') {
      const table = liveData.tableData ?? []
      const kpiData = liveData.kpis ?? []
      if (viewMode === 'chart') {
        const chartData = [
          { label: 'Purchases In', value: Number(kpiData[0]?.value ?? 0) },
          { label: 'Sales Out', value: Number(kpiData[1]?.value ?? 0) },
          { label: 'Sales Returns', value: Number(kpiData[2]?.value ?? 0) },
          { label: 'Purchase Returns', value: Number(kpiData[3]?.value ?? 0) },
        ]
        return (
          <div className="h-60 sm:h-72 lg:h-80"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer></div>
        )
      }
      return (
        <ReportTable 
          headers={['Product', 'In Qty', 'Out Qty', 'Net']} 
          rows={paginate(table).map((r: any) => [r.product, r.inQty, r.outQty, r.net > 0 ? `+${r.net}` : r.net])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Dead Stock / Aging ──
    if (reportType === 'dead-stock') {
      const chart = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-60 sm:h-75 lg:h-85"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Value']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {chart.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Product', 'Batch', 'Qty', 'Age (Days)', 'Bucket', 'Value']} 
          rows={paginate(table).map((r: any) => [r.product, r.batch, r.qty, r.ageDays, r.bucket, formatCurrency(r.value)])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── ABC Analysis ──
    if (reportType === 'abc-analysis') {
      const chart = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-60 sm:h-75 lg:h-85"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="category" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: any, n: any) => [n === 'revenue' ? formatCurrency(Number(v)) : v, n === 'revenue' ? 'Revenue' : 'SKUs']} contentStyle={chartTooltipStyle} />
            <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} name="revenue" />
            <Bar yAxisId="right" dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} name="count" />
            <Legend />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 dark:bg-muted/20">
                  {['Product', 'Revenue', 'Cum %', 'Class'].map((h) => (
                    <TableHead key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(table).map((r: any, i: number) => (
                  <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-sm">{r.product}</TableCell>
                    <TableCell className="font-mono text-sm">{formatCurrency(r.revenue)}</TableCell>
                    <TableCell className="font-mono text-sm">{r.cumPct}%</TableCell>
                    <TableCell>
                      <Badge variant={r.abc === 'A' ? 'success' : r.abc === 'B' ? 'warning' : 'secondary'} size="sm">{r.abc}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {renderPagination(table.length)}
        </div>
      )
    }

    // ── GSTR-1 ──
    if (reportType === 'gstr1-summary') {
      const table = liveData.tableData ?? []
      const totals = liveData.totals ?? {}
      if (viewMode === 'chart') return (
        <div className="h-60 sm:h-75 lg:h-85"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={table}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="gstRate" tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any, n: any) => [formatCurrency(Number(v)), n === 'taxable' ? 'Taxable' : n === 'cgst' ? 'CGST' : 'SGST']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="taxable" fill="#3b82f6" radius={[6, 6, 0, 0]} name="taxable" />
            <Bar dataKey="cgst" fill="#10b981" radius={[6, 6, 0, 0]} name="cgst" />
            <Bar dataKey="sgst" fill="#f59e0b" radius={[6, 6, 0, 0]} name="sgst" />
            <Legend />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <>
          <ReportTable
            headers={['GST Rate', 'Taxable Value', 'CGST', 'SGST', 'IGST']}
            rows={paginate(table).map((r: any) => [`${r.gstRate}%`, formatCurrency(r.taxable), formatCurrency(r.cgst), formatCurrency(r.sgst), formatCurrency(r.igst)])}
            totalItems={table.length}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            pageSize={PAGE_SIZE}
          />
          {totals.taxable !== undefined && (
            <div className="mt-4 flex gap-6 rounded-xl border border-border/60 bg-muted/30 px-5 py-3 text-sm">
              <span>Total Taxable: <strong className="font-mono">{formatCurrency(totals.taxable)}</strong></span>
              <span>CGST: <strong className="font-mono">{formatCurrency(totals.cgst)}</strong></span>
              <span>SGST: <strong className="font-mono">{formatCurrency(totals.sgst)}</strong></span>
            </div>
          )}
        </>
      )
    }

    // ── GSTR-3B ──
    if (reportType === 'gstr3b-summary') {
      const out = liveData.outwardSupplies ?? {}
      const inw = liveData.inwardSupplies ?? {}
      const rows = [
        ['Outward Taxable Value', formatCurrency(out.taxableValue ?? 0)],
        ['CGST', formatCurrency(out.cgst ?? 0)],
        ['SGST', formatCurrency(out.sgst ?? 0)],
        ['IGST', formatCurrency(out.igst ?? 0)],
        ['Total Tax Payable', formatCurrency(out.totalTax ?? 0)],
        ['Inward Supplies (Purchases)', formatCurrency(inw.totalValue ?? 0)],
      ]
      return (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 dark:bg-muted/20">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Particulars</TableHead>
                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([label, value]) => (
                <TableRow key={label} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-sm">{label}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )
    }

    // ── HSN Summary ──
    if (reportType === 'hsn-summary') {
      const table = liveData.tableData ?? []
      const totals = liveData.totals ?? {}
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-95"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={table.slice(0, 12)} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis dataKey="hsn" type="category" tick={{ fontSize: 10 }} width={90} />
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Taxable']} contentStyle={chartTooltipStyle} />
            <Bar dataKey="taxable" fill="#f59e0b" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      )
      return (
        <>
          <ReportTable
            headers={['HSN Code', 'UQC', 'Qty', 'GST Rate', 'Taxable', 'Tax']}
            rows={paginate(table).map((r: any) => [r.hsn, r.uqc, r.qty, `${r.gstRate}%`, formatCurrency(r.taxable), formatCurrency(r.tax)])}
            totalItems={table.length}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            pageSize={PAGE_SIZE}
          />
          {totals.taxable !== undefined && (
            <div className="mt-4 flex gap-6 rounded-xl border border-border/60 bg-muted/30 px-5 py-3 text-sm">
              <span>Total Qty: <strong className="font-mono">{totals.qty}</strong></span>
              <span>Taxable: <strong className="font-mono">{formatCurrency(totals.taxable)}</strong></span>
              <span>Tax: <strong className="font-mono">{formatCurrency(totals.tax)}</strong></span>
            </div>
          )}
        </>
      )
    }

    // ── Cash Book ──
    if (reportType === 'cash-book') {
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') {
        const grouped = table.reduce((acc: { date: string; receipts: number; payments: number }[], r: any) => {
          const d = r.date ? String(r.date).slice(0, 10) : ''
          const ex = acc.find((a) => a.date === d)
          if (ex) { if (r.type === 'RECEIPT') ex.receipts += r.amount; else ex.payments += r.amount }
          else acc.push({ date: d, receipts: r.type === 'RECEIPT' ? r.amount : 0, payments: r.type === 'PAYMENT' ? r.amount : 0 })
          return acc
        }, [])
        return (
          <div className="h-65 sm:h-80 lg:h-90"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={grouped}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any, n: any) => [formatCurrency(Number(v)), n === 'receipts' ? 'Receipts' : 'Payments']} contentStyle={chartTooltipStyle} />
              <Line type="monotone" dataKey="receipts" stroke="#10b981" strokeWidth={2} dot={false} name="receipts" />
              <Line type="monotone" dataKey="payments" stroke="#ef4444" strokeWidth={2} dot={false} name="payments" />
              <Legend />
            </LineChart>
          </ResponsiveContainer></div>
        )
      }
      return (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 dark:bg-muted/20">
                  {['Date', 'Ref', 'Description', 'Receipt', 'Payment', 'Balance'].map((h) => (
                    <TableHead key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(table).map((r: any, i: number) => (
                  <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.ref}</TableCell>
                    <TableCell className="text-sm">{r.description}</TableCell>
                    <TableCell className="font-mono text-sm text-green-600 dark:text-green-400">{r.type === 'RECEIPT' ? formatCurrency(r.amount) : '—'}</TableCell>
                    <TableCell className="font-mono text-sm text-red-600 dark:text-red-400">{r.type === 'PAYMENT' ? formatCurrency(r.amount) : '—'}</TableCell>
                    <TableCell className="font-mono text-sm font-semibold">{formatCurrency(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {renderPagination(table.length)}
        </div>
      )
    }

    // ── Outstanding Receivables ──
    if (reportType === 'outstanding-receivables') {
      const table = liveData.tableData ?? []
      const aging = liveData.agingSummary ?? {}
      if (viewMode === 'chart') {
        const bucketData = Object.entries(aging).map(([k, v]) => ({ bucket: k, amount: Number(v) }))
        return (
          <div className="h-60 sm:h-75 lg:h-85"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={bucketData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Outstanding']} contentStyle={chartTooltipStyle} />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {bucketData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer></div>
        )
      }
      return (
        <ReportTable
          headers={['Customer', 'Phone', 'Outstanding', 'Credit Limit', 'Current', '0-30', '31-60', '61-90', '90+']}
          rows={paginate(table).map((r: any) => [r.customer, r.phone, formatCurrency(r.outstanding), formatCurrency(r.creditLimit), formatCurrency(r.current), formatCurrency(r['0-30']), formatCurrency(r['31-60']), formatCurrency(r['61-90']), formatCurrency(r['90+'])])}
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    // ── Profit & Loss ──
    if (reportType === 'profit-loss') {
      const lineItems = liveData.lineItems ?? []
      return (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 dark:bg-muted/20">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Particulars</TableHead>
                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item: any, i: number) => (
                <TableRow key={i} className={cn('hover:bg-muted/30 transition-colors', item.emphasis && 'bg-muted/20 font-semibold')}>
                  <TableCell className={cn('text-sm', item.emphasis && 'font-semibold')}>{item.label}</TableCell>
                  <TableCell className={cn('text-right font-mono text-sm', item.amount < 0 ? 'text-red-600 dark:text-red-400' : item.emphasis ? 'text-foreground font-bold' : '')}>
                    {formatCurrency(Math.abs(item.amount))}
                    {item.amount < 0 && <span className="ml-1 text-xs">(Dr)</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )
    }

    // ── Expense Report ──
    if (reportType === 'expense-report') {
      const chart = liveData.chartData ?? []
      const table = liveData.tableData ?? []
      if (viewMode === 'chart') return (
        <div className="h-65 sm:h-80 lg:h-90"><ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chart} cx="50%" cy="50%" innerRadius={80} outerRadius={130} paddingAngle={3} dataKey="amount" nameKey="category" strokeWidth={2} className="stroke-background">
              {chart.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => [formatCurrency(Number(v)), 'Amount']} contentStyle={chartTooltipStyle} />
            <Legend formatter={(v: string) => <span className="text-xs text-foreground">{v}</span>} />
          </PieChart>
        </ResponsiveContainer></div>
      )
      return (
        <ReportTable 
          headers={['Date', 'Category', 'Description', 'Amount', 'Payment Mode']} 
          rows={paginate(table).map((r: any) => [formatDate(r.date), r.category, r.description, formatCurrency(r.amount), r.paymentMode])} 
          totalItems={table.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={PAGE_SIZE}
        />
      )
    }

    return (
      <div className="py-12 text-center text-sm text-muted-foreground">No renderer for this report type.</div>
    )
  }

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible">
      <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">

        {/* ── Header ── */}
        <motion.div variants={itemVariants}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon-sm" onClick={onBack} className="rounded-xl border border-border/60">
                <ArrowLeft />
              </Button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                  <Badge variant="info" size="sm" dot>Live</Badge>
                </div>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Generated on {formatDate(new Date().toISOString())}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-border/60" onClick={handleExportPdf}>
                <FileDown className="h-3.5 w-3.5" />PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-border/60" onClick={handleExportExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" />Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-border/60" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5" />Print
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ── KPI Cards ── */}
        {kpis.length > 0 && (
          <motion.div variants={itemVariants}>
            <KpiCards kpis={kpis} />
          </motion.div>
        )}

        {/* ── View Toggle ── */}
        {reportType !== 'profit-loss' && reportType !== 'gstr3b-summary' && (
          <motion.div variants={itemVariants}>
            <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 w-fit border border-border/60 dark:bg-muted/30">
              <button
                onClick={() => setViewMode('chart')}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  viewMode === 'chart' ? 'bg-background text-foreground shadow-sm dark:bg-card' : 'text-muted-foreground hover:text-foreground')}
              >
                <BarChart2 className="h-3.5 w-3.5" />Chart
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  viewMode === 'table' ? 'bg-background text-foreground shadow-sm dark:bg-card' : 'text-muted-foreground hover:text-foreground')}
              >
                <Table2 className="h-3.5 w-3.5" />Table
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Content ── */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-6">
              {renderContent()}
            </CardContent>
          </Card>
        </motion.div>

      </motion.div>
    </motion.div>
  )
}
