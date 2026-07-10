import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { motion, type Variants } from 'framer-motion'
import {
  TrendingUp,
  IndianRupee,
  Receipt,
  Users,
  UserCheck,
  Search,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  Printer,
  Trophy,
  Medal,
  Award,
  LayoutGrid,
  Table2,
  Crown,
  Sparkles,
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
  Sector,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/EmptyState'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { cn, formatCurrency, formatCurrencyCompact, formatDate, getInitials } from '@/lib/utils'
import { exportToCsv, exportToPdf, printReport } from '@/lib/exportUtils'
import api from '@/lib/api'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ReportRow {
  salespersonId: string
  name: string
  isActive: boolean
  invoiceCount: number
  totalSales: number
}

type ViewMode = 'table' | 'grid'
type RangePreset = 'today' | '7d' | '30d' | 'month' | 'quarter' | 'year' | 'all' | 'custom'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

const pageVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

// ─────────────────────────────────────────────────────────────
// Visual constants
// ─────────────────────────────────────────────────────────────

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#a855f7', '#f97316']

const chartTooltipStyle = {
  borderRadius: '12px',
  border: '1px solid hsl(var(--border) / 0.6)',
  background: 'hsl(var(--card))',
  fontSize: '12px',
  boxShadow: '0 4px 12px hsl(var(--foreground) / 0.08)',
}

// SVG fill attributes do NOT resolve CSS variables, so use a literal soft
// slate tint that reads well in both light and dark themes for the bar hover.
const BAR_HOVER_FILL = 'rgba(148, 163, 184, 0.14)'

// Outer-ring "halo" highlight rendered when a pie slice is hovered.
type ActiveShapeArgs = {
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  startAngle: number
  endAngle: number
  fill: string
}

function renderPieActiveShape(props: unknown) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props as ActiveShapeArgs
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 13}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.45}
      />
    </g>
  )
}

const PAGE_SIZE = 10

// ─────────────────────────────────────────────────────────────
// Date utilities
// ─────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computeRange(preset: RangePreset): { from: string; to: string } {
  const today = new Date()
  const to = toISO(today)
  switch (preset) {
    case 'today':
      return { from: to, to }
    case '7d': {
      const d = new Date(); d.setDate(d.getDate() - 6)
      return { from: toISO(d), to }
    }
    case '30d': {
      const d = new Date(); d.setDate(d.getDate() - 29)
      return { from: toISO(d), to }
    }
    case 'month': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: toISO(d), to }
    }
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3)
      const d = new Date(today.getFullYear(), q * 3, 1)
      return { from: toISO(d), to }
    }
    case 'year': {
      const d = new Date(today.getFullYear(), 0, 1)
      return { from: toISO(d), to }
    }
    default:
      return { from: '', to: '' }
  }
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
]

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface KpiTileProps {
  icon: React.ElementType
  label: string
  value: string
  subtitle?: string
  accent: 'emerald' | 'blue' | 'purple' | 'amber'
}

const ACCENT_STYLES: Record<KpiTileProps['accent'], { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400' },
  blue: { bg: 'bg-blue-500/10 dark:bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400' },
  purple: { bg: 'bg-purple-500/10 dark:bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' },
  amber: { bg: 'bg-amber-500/10 dark:bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400' },
}

function KpiTile({ icon: Icon, label, value, subtitle, accent }: KpiTileProps) {
  const a = ACCENT_STYLES[accent]
  return (
    <Card hover className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', a.bg)}>
            <Icon className={cn('h-4 w-4', a.text)} />
          </div>
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold font-mono tracking-tight truncate">{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-amber-300 to-amber-500 shadow-sm">
      <Crown className="h-3.5 w-3.5 text-white" />
    </div>
  )
  if (rank === 2) return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-slate-300 to-slate-400 shadow-sm">
      <Medal className="h-3.5 w-3.5 text-white" />
    </div>
  )
  if (rank === 3) return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-orange-400 to-orange-600 shadow-sm">
      <Award className="h-3.5 w-3.5 text-white" />
    </div>
  )
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 text-xs font-semibold text-muted-foreground tabular-nums">
      {rank}
    </div>
  )
}

function Avatar({ name, colorIndex }: { name: string; colorIndex: number }) {
  const bg = CHART_COLORS[colorIndex % CHART_COLORS.length]
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-semibold text-white shadow-sm"
      style={{ backgroundColor: bg }}
    >
      {getInitials(name)}
    </div>
  )
}

function ShareBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted/60">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-primary to-blue-500"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

function SalespersonPerformanceCard({
  row, rank, sharePct, colorIndex,
}: { row: ReportRow; rank: number; sharePct: number; colorIndex: number }) {
  const avgPerInvoice = row.invoiceCount > 0 ? row.totalSales / row.invoiceCount : 0
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card hover className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={row.name} colorIndex={colorIndex} />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm leading-tight">{row.name}</p>
                  <RankMedal rank={rank} />
                </div>
                <Badge variant={row.isActive ? 'success' : 'secondary'} size="sm" dot className="mt-1.5">
                  {row.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Sales</p>
              <p className="mt-1 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrencyCompact(row.totalSales)}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoices</p>
              <p className="mt-1 font-mono text-base font-bold">{row.invoiceCount}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Share of Total</span>
              <span className="font-mono font-semibold tabular-nums">{sharePct.toFixed(1)}%</span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-primary to-blue-500"
                style={{ width: `${Math.min(sharePct, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">Avg / Invoice</span>
              <span className="font-mono font-semibold tabular-nums">{formatCurrency(avgPerInvoice)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function SalespersonReportPage() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [activePreset, setActivePreset] = useState<RangePreset>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [generatedAt, setGeneratedAt] = useState<string>('')
  // Optional drill-down from the Salespersons list page (?salespersonId=...).
  // Read once on mount; cleared via the chip rendered next to the search box.
  const [focusedSalespersonId, setFocusedSalespersonId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('salespersonId') ?? ''
  })
  const [topN, setTopN] = useState<5 | 10 | 20>(10)
  const [activeSliceIdx, setActiveSliceIdx] = useState<number | undefined>(undefined)

  const fetchReport = useCallback(async (f?: string, t?: string) => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      const fromVal = f !== undefined ? f : from
      const toVal = t !== undefined ? t : to
      if (fromVal) params.from = fromVal
      if (toVal) params.to = toVal
      const { data } = await api.get('/salespersons/report', { params })
      setRows(data)
      setGeneratedAt(new Date().toISOString())
    } catch {
      toast.error('Failed to load report')
    } finally {
      setIsLoading(false)
    }
  }, [from, to])

  useEffect(() => { fetchReport() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useBranchRefresh(() => fetchReport())

  useEffect(() => { setCurrentPage(1) }, [search, rows])

  // ── Derived metrics ────────────────────────────────────────
  const totalSales = useMemo(() => rows.reduce((s, r) => s + r.totalSales, 0), [rows])
  const totalInvoices = useMemo(() => rows.reduce((s, r) => s + r.invoiceCount, 0), [rows])
  const activeCount = useMemo(() => rows.filter((r) => r.isActive).length, [rows])
  const avgSaleValue = totalInvoices > 0 ? totalSales / totalInvoices : 0

  // ── Filtered + sorted (already sorted by API DESC totalSales) ──
  const sorted = useMemo(() => [...rows].sort((a, b) => b.totalSales - a.totalSales), [rows])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = sorted
    if (focusedSalespersonId) list = list.filter((r) => r.salespersonId === focusedSalespersonId)
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q))
    return list
  }, [sorted, search, focusedSalespersonId])

  const focusedSalespersonName = useMemo(
    () => focusedSalespersonId
      ? (rows.find((r) => r.salespersonId === focusedSalespersonId)?.name ?? null)
      : null,
    [rows, focusedSalespersonId]
  )

  const clearFocus = useCallback(() => {
    setFocusedSalespersonId('')
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('salespersonId')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ── Chart data ──────────────────────────────────────────────
  const chartData = useMemo(
    () => sorted.slice(0, topN).map((r) => ({ name: r.name, value: r.totalSales, invoices: r.invoiceCount })),
    [sorted, topN],
  )
  const remainingCount = Math.max(0, sorted.length - chartData.length)

  const pieData = useMemo(() => {
    if (!sorted.length) return []
    // Top 5 + "Others (N)" bucket so the donut stays legible even with many salespersons
    const top = sorted.slice(0, 5)
    const othersList = sorted.slice(5)
    const othersTotal = othersList.reduce((s, r) => s + r.totalSales, 0)
    const data: { name: string; value: number }[] = top.map((r) => ({ name: r.name, value: r.totalSales }))
    if (othersTotal > 0) data.push({ name: `Others (${othersList.length})`, value: othersTotal })
    return data.filter((d) => d.value > 0)
  }, [sorted])

  // ── Handlers ────────────────────────────────────────────────
  const handlePreset = (preset: RangePreset) => {
    setActivePreset(preset)
    const { from: f, to: t } = computeRange(preset)
    setFrom(f)
    setTo(t)
    fetchReport(f, t)
  }

  const handleManualChange = (key: 'from' | 'to', val: string) => {
    setActivePreset('custom')
    const nextFrom = key === 'from' ? val : from
    const nextTo = key === 'to' ? val : to
    if (key === 'from') setFrom(val)
    else setTo(val)
    // Auto-apply once a valid date is picked — drops the need for an explicit Apply button
    fetchReport(nextFrom, nextTo)
  }

  const handleClear = () => {
    setFrom(''); setTo(''); setActivePreset('all')
    fetchReport('', '')
  }

  const exportRows = useMemo(
    () => sorted.map((r, idx) => ({
      Rank: idx + 1,
      Name: r.name,
      Status: r.isActive ? 'Active' : 'Inactive',
      Invoices: r.invoiceCount,
      'Total Sales': r.totalSales.toFixed(2),
      'Avg per Invoice': r.invoiceCount > 0 ? (r.totalSales / r.invoiceCount).toFixed(2) : '0.00',
      'Share %': totalSales > 0 ? ((r.totalSales / totalSales) * 100).toFixed(2) : '0.00',
    })),
    [sorted, totalSales],
  )

  const handleExportPdf = () => {
    if (!exportRows.length) { toast.info('No data to export'); return }
    exportToPdf(exportRows, 'Salesperson Performance Report', 'salesperson-report')
  }
  const handleExportCsv = () => {
    if (!exportRows.length) { toast.info('No data to export'); return }
    exportToCsv(exportRows, 'salesperson-report')
  }
  const handlePrint = () => {
    if (!exportRows.length) { toast.info('No data to print'); return }
    printReport(exportRows, 'Salesperson Performance Report')
  }

  // Active filter count for the FilterBar badge
  const isCustomRangeActive = activePreset === 'custom' && (from !== '' || to !== '')
  const activeFilterCount = isCustomRangeActive ? 1 : 0

  // ── Render ──────────────────────────────────────────────────
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible">
      <motion.div className="space-y-5" variants={containerVariants} initial="hidden" animate="visible">

        {/* ── Filter bar: search + filters button + actions row ── */}
        <motion.div variants={itemVariants}>
          <DataTableFilterBar
            searchQuery={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search salesperson by name…"
            searchClassName="w-full sm:w-72"
            resultsCount={filtered.length}
            activeFilterCount={activeFilterCount}
            onClearFilters={handleClear}
            midNode={
              <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5 dark:bg-muted/20">
                <button
                  onClick={() => setViewMode('table')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
                    viewMode === 'table' ? 'bg-background text-foreground shadow-sm dark:bg-card' : 'text-muted-foreground hover:text-foreground',
                  )}
                  title="Table view"
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span>Table</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
                    viewMode === 'grid' ? 'bg-background text-foreground shadow-sm dark:bg-card' : 'text-muted-foreground hover:text-foreground',
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Grid</span>
                </button>
              </div>
            }
            actionNode={
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fetchReport()}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPdf}>
                  <FileDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Print</span>
                </Button>
              </div>
            }
          >
            <div className="col-span-full">
              <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                {/* From */}
                <div className="flex w-44 flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</p>
                  <DatePicker
                    value={from}
                    onChange={(v) => handleManualChange('from', v)}
                    className="h-9 text-sm"
                    placeholder="Start date"
                  />
                </div>
                {/* To */}
                <div className="flex w-44 flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</p>
                  <DatePicker
                    value={to}
                    onChange={(v) => handleManualChange('to', v)}
                    className="h-9 text-sm"
                    placeholder="End date"
                  />
                </div>
                {/* Preset chips fill remaining width */}
                <div className="flex min-w-70 flex-1 flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Range</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => handlePreset(p.value)}
                        className={cn(
                          'rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
                          activePreset === p.value
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {generatedAt && (
                <p className="mt-3 text-[10px] text-muted-foreground/70">
                  Last updated {formatDate(generatedAt)}
                </p>
              )}
            </div>
          </DataTableFilterBar>
        </motion.div>

        {/* ── Focused-salesperson alert (drill-down from list) ── */}
        {focusedSalespersonId && (
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-muted-foreground">Focused on:</span>
                <span className="font-medium">{focusedSalespersonName ?? '—'}</span>
              </div>
              <button
                type="button"
                onClick={clearFocus}
                className="rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                Clear ×
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Leaderboard (flat single-card pattern matching other listing pages) ── */}
        <motion.div variants={itemVariants}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Users}
                  title="No data for this period"
                  description="No salespersons recorded any sales in the selected date range. Try expanding the filter or selecting a different preset."
                />
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Search}
                  title="No matches"
                  description={`No salesperson matches "${search}". Try a different search term.`}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {viewMode === 'table' ? (
                <>
                  {/* responsive: compact leaderboard cards on phones, table at md+ */}
                  <div className="divide-y divide-border/40 md:hidden">
                    {paged.map((row) => {
                      const absoluteIdx = sorted.findIndex((r) => r.salespersonId === row.salespersonId)
                      const rank = absoluteIdx + 1
                      const share = totalSales > 0 ? (row.totalSales / totalSales) * 100 : 0
                      const avgPer = row.invoiceCount > 0 ? row.totalSales / row.invoiceCount : 0
                      return (
                        <div key={row.salespersonId} className="flex items-center gap-3 px-4 py-3">
                          <RankMedal rank={rank} />
                          <Avatar name={row.name} colorIndex={absoluteIdx} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium">{row.name}</p>
                              <Badge variant={row.isActive ? 'success' : 'secondary'} size="sm" dot className="shrink-0">
                                {row.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span>{row.invoiceCount} inv</span>
                              <span>Avg {formatCurrency(avgPer)}</span>
                              <span>{share.toFixed(1)}% share</span>
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {formatCurrency(row.totalSales)}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="hidden md:block">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Total Sales</TableHead>
                      <TableHead>Share</TableHead>
                      <TableHead className="text-right">Avg / Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((row) => {
                      const absoluteIdx = sorted.findIndex((r) => r.salespersonId === row.salespersonId)
                      const rank = absoluteIdx + 1
                      const share = totalSales > 0 ? (row.totalSales / totalSales) * 100 : 0
                      const avgPer = row.invoiceCount > 0 ? row.totalSales / row.invoiceCount : 0
                      return (
                        <TableRow key={row.salespersonId} className="hover:bg-muted/30 transition-colors">
                          <TableCell><RankMedal rank={rank} /></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={row.name} colorIndex={absoluteIdx} />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-sm">{row.name}</p>
                                <Badge variant={row.isActive ? 'success' : 'secondary'} size="sm" dot className="mt-0.5">
                                  {row.isActive ? 'Active' : 'Inactive'}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">{row.invoiceCount}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                            {formatCurrency(row.totalSales)}
                          </TableCell>
                          <TableCell><ShareBar pct={share} /></TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums whitespace-nowrap">{formatCurrency(avgPer)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                  </div>
                </>
              ) : (
                <div className="p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {paged.map((row) => {
                      const absoluteIdx = sorted.findIndex((r) => r.salespersonId === row.salespersonId)
                      const rank = absoluteIdx + 1
                      const share = totalSales > 0 ? (row.totalSales / totalSales) * 100 : 0
                      return (
                        <SalespersonPerformanceCard
                          key={row.salespersonId}
                          row={row}
                          rank={rank}
                          sharePct={share}
                          colorIndex={absoluteIdx}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filtered.length}
                itemsPerPage={PAGE_SIZE}
                className="border-t border-border/40 px-4"
              />
            </Card>
          )}
        </motion.div>

        {/* ── KPI grid ── */}
        <motion.div variants={itemVariants}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              icon={IndianRupee}
              label="Total Sales"
              value={formatCurrencyCompact(totalSales)}
              subtitle={totalSales > 0 ? formatCurrency(totalSales) : 'No sales yet'}
              accent="emerald"
            />
            <KpiTile
              icon={Receipt}
              label="Total Invoices"
              value={String(totalInvoices)}
              subtitle={`across ${rows.length} salesperson${rows.length === 1 ? '' : 's'}`}
              accent="blue"
            />
            <KpiTile
              icon={UserCheck}
              label="Active"
              value={String(activeCount)}
              subtitle={`of ${rows.length} total`}
              accent="purple"
            />
            <KpiTile
              icon={TrendingUp}
              label="Avg Sale Value"
              value={formatCurrencyCompact(avgSaleValue)}
              subtitle={avgSaleValue > 0 ? 'per invoice' : '—'}
              accent="amber"
            />
          </div>
        </motion.div>

        {/* ── Charts grid ── */}
        {!isLoading && rows.length > 0 && (
          <motion.div variants={itemVariants}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              {/* Top performers bar chart */}
              <Card className="lg:col-span-3">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <h3 className="text-sm font-semibold">Top Performers</h3>
                      {remainingCount > 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground/80">
                          +{remainingCount} more in leaderboard
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5 dark:bg-muted/20">
                      {([5, 10, 20] as const).map((n) => (
                        <button
                          key={n}
                          onClick={() => setTopN(n)}
                          disabled={sorted.length === 0}
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all tabular-nums',
                            topN === n
                              ? 'bg-background text-foreground shadow-sm dark:bg-card'
                              : 'text-muted-foreground hover:text-foreground disabled:opacity-50',
                          )}
                        >
                          Top {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={Math.min(440, Math.max(220, chartData.length * 32))}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => formatCurrencyCompact(v).replace('₹', '')}
                      />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} interval={0} />
                      <Tooltip
                        formatter={(v) => [formatCurrency(Number(v)), 'Sales']}
                        contentStyle={chartTooltipStyle}
                        cursor={{ fill: BAR_HOVER_FILL }}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Sales distribution donut */}
              <Card className="lg:col-span-2">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <h3 className="text-sm font-semibold">Sales Distribution</h3>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Share %
                    </span>
                  </div>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                          strokeWidth={2}
                          className="stroke-background"
                          onMouseEnter={(_, idx) => setActiveSliceIdx(idx)}
                          onMouseLeave={() => setActiveSliceIdx(undefined)}
                          // Recharts v3 dropped these from the public types but still honors them at runtime
                          {...({ activeIndex: activeSliceIdx, activeShape: renderPieActiveShape } as Record<string, unknown>)}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label — switches between Total and the hovered slice */}
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center text-center px-6">
                      {activeSliceIdx !== undefined && pieData[activeSliceIdx] ? (
                        <>
                          <span className="max-w-35 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {pieData[activeSliceIdx].name}
                          </span>
                          <span className="font-mono text-base font-bold" style={{ color: CHART_COLORS[activeSliceIdx % CHART_COLORS.length] }}>
                            {formatCurrencyCompact(pieData[activeSliceIdx].value)}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {totalSales > 0 ? ((pieData[activeSliceIdx].value / totalSales) * 100).toFixed(1) : '0'}%
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
                          <span className="font-mono text-base font-bold">{formatCurrencyCompact(totalSales)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

      </motion.div>
    </motion.div>
  )
}
