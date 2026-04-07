import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  FileDown,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Receipt,
  Wallet,
  ChevronDown,
  ChevronRight,
  Minus,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatCurrency } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Period definitions
// ─────────────────────────────────────────────────────────────

type Period = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom'

const periodLabels: Record<Period, string> = {
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  this_year: 'This Year',
  custom: 'Custom',
}

// ─────────────────────────────────────────────────────────────
// Mock P&L data
// ─────────────────────────────────────────────────────────────

interface PLData {
  salesRevenue: number
  salesReturns: number
  netRevenue: number
  openingStock: number
  purchases: number
  purchaseReturns: number
  closingStock: number
  cogs: number
  grossProfit: number
  grossProfitPercent: number
  expenses: Record<string, number>
  totalExpenses: number
  netProfit: number
  netProfitPercent: number
}

function computePLData(period: Period): PLData {
  const multipliers: Record<Period, number> = {
    this_month: 1,
    last_month: 0.92,
    this_quarter: 3.1,
    this_year: 12.5,
    custom: 1,
  }

  const m = multipliers[period]

  const salesRevenue = Math.round(1845320 * m)
  const salesReturns = Math.round(42100 * m)
  const netRevenue = salesRevenue - salesReturns

  const openingStock = Math.round(1250000 * (period === 'this_year' ? 1 : m * 0.4))
  const purchases = Math.round(1420000 * m)
  const purchaseReturns = Math.round(35000 * m)
  const closingStock = Math.round(1380000 * (period === 'this_year' ? 1 : m * 0.4))
  const cogs = openingStock + purchases - purchaseReturns - closingStock

  const grossProfit = netRevenue - cogs
  const grossProfitPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

  const expenseMultiplier = period === 'this_month' ? 1 : period === 'last_month' ? 0.95 : period === 'this_quarter' ? 2.8 : 11.5
  const expenses: Record<string, number> = period === 'this_month'
    ? { Rent: 25000, Salaries: 120000, Electricity: 8500, Transport: 12000, Others: 15200 }
    : {
        Rent: Math.round(25000 * expenseMultiplier),
        Salaries: Math.round(120000 * expenseMultiplier),
        Electricity: Math.round(8500 * expenseMultiplier),
        Transport: Math.round(12000 * expenseMultiplier),
        Others: Math.round(15200 * expenseMultiplier),
      }

  const totalExpenses = Object.values(expenses).reduce((s, v) => s + v, 0)
  const netProfit = grossProfit - totalExpenses
  const netProfitPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0

  return {
    salesRevenue, salesReturns, netRevenue,
    openingStock, purchases, purchaseReturns, closingStock, cogs,
    grossProfit, grossProfitPercent,
    expenses, totalExpenses,
    netProfit, netProfitPercent,
  }
}

// Previous period % change (mock)
function getPrevChange(period: Period) {
  const changes: Record<Period, { revenue: number; gross: number; expenses: number; net: number }> = {
    this_month: { revenue: 8.2, gross: 6.5, expenses: 3.1, net: 12.4 },
    last_month: { revenue: -2.1, gross: -3.4, expenses: 1.8, net: -5.6 },
    this_quarter: { revenue: 12.5, gross: 10.2, expenses: 5.6, net: 18.3 },
    this_year: { revenue: 15.8, gross: 14.1, expenses: 8.3, net: 22.7 },
    custom: { revenue: 0, gross: 0, expenses: 0, net: 0 },
  }
  return changes[period]
}

// Monthly trend data
const monthlyTrend = [
  { month: 'Apr', revenue: 1520000, expenses: 1235000, profit: 285000 },
  { month: 'May', revenue: 1680000, expenses: 1360000, profit: 320000 },
  { month: 'Jun', revenue: 1590000, expenses: 1292000, profit: 298000 },
  { month: 'Jul', revenue: 1740000, expenses: 1400000, profit: 340000 },
  { month: 'Aug', revenue: 1650000, expenses: 1340000, profit: 310000 },
  { month: 'Sep', revenue: 1820000, expenses: 1464000, profit: 356000 },
  { month: 'Oct', revenue: 1780000, expenses: 1435000, profit: 345000 },
  { month: 'Nov', revenue: 1690000, expenses: 1365000, profit: 325000 },
  { month: 'Dec', revenue: 1900000, expenses: 1520000, profit: 380000 },
  { month: 'Jan', revenue: 1750000, expenses: 1402000, profit: 348000 },
  { month: 'Feb', revenue: 1800000, expenses: 1440000, profit: 360000 },
  { month: 'Mar', revenue: 1845320, expenses: 1477800, profit: 367520 },
]

// Expense colors for donut
const expenseColors = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#94a3b8']

// Waterfall data
function getWaterfallData(pl: PLData) {
  return [
    { name: 'Revenue', value: pl.netRevenue, fill: '#10b981', type: 'positive' },
    { name: 'COGS', value: -pl.cogs, fill: '#ef4444', type: 'negative' },
    { name: 'Gross Profit', value: pl.grossProfit, fill: '#6366f1', type: 'subtotal' },
    { name: 'Expenses', value: -pl.totalExpenses, fill: '#f59e0b', type: 'negative' },
    { name: 'Net Profit', value: pl.netProfit, fill: pl.netProfit >= 0 ? '#10b981' : '#ef4444', type: 'total' },
  ]
}

// ─────────────────────────────────────────────────────────────
// Collapsible P&L Section
// ─────────────────────────────────────────────────────────────

function PLSection({
  title,
  totalAmount,
  isNegative = false,
  children,
  defaultOpen = true,
}: {
  title: string
  totalAmount: number
  isNegative?: boolean
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </span>
        </div>
        <span
          className={cn(
            'font-mono text-sm font-bold tabular-nums',
            isNegative ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
          )}
        >
          {formatCurrency(Math.abs(totalAmount))}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PLRow({
  label,
  amount,
  isNegative = false,
  isBold = false,
  indent = 1,
}: {
  label: string
  amount: number
  isNegative?: boolean
  isBold?: boolean
  indent?: number
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-1',
        isBold && 'font-semibold'
      )}
      style={{ paddingLeft: `${indent * 16 + 16}px` }}
    >
      <div className="flex items-center gap-2">
        <Minus className="h-2.5 w-2.5 text-border" />
        <span className={cn('text-[13px]', isBold ? 'font-semibold' : 'text-muted-foreground')}>
          {label}
        </span>
      </div>
      <span
        className={cn(
          'font-mono text-[13px] tabular-nums',
          isNegative ? 'text-rose-500 dark:text-rose-400' : '',
          isBold && 'font-semibold'
        )}
      >
        {isNegative && amount > 0 && '-'}
        {formatCurrency(Math.abs(amount))}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  change,
  icon: Icon,
  iconColor,
  iconBg,
}: {
  label: string
  value: number
  change: number
  icon: typeof DollarSign
  iconColor: string
  iconBg: string
}) {
  const isUp = change >= 0
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-background px-4 py-3">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconBg)}>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-mono text-lg font-bold tabular-nums leading-tight">{formatCurrency(value)}</p>
      </div>
      {change !== 0 && (
        <div className={cn(
          'flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
          isUp ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
        )}>
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(change).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('this_month')
  const [rightTab, setRightTab] = useState<'trend' | 'breakdown'>('trend')

  const plData = useMemo(() => computePLData(selectedPeriod), [selectedPeriod])
  const prevChange = useMemo(() => getPrevChange(selectedPeriod), [selectedPeriod])
  const waterfallData = useMemo(() => getWaterfallData(plData), [plData])

  const expenseDonutData = useMemo(
    () =>
      Object.entries(plData.expenses).map(([name, value], i) => ({
        name,
        value,
        color: expenseColors[i % expenseColors.length],
      })),
    [plData.expenses]
  )

  const handleExport = (format: string) => {
    toast.info(`${format} export — coming soon`)
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-border/40 bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Profit & Loss Statement</h1>
            <p className="text-[11px] text-muted-foreground">Revenue, expenses, and profitability analysis</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Period selector */}
            <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as Period)}>
              <SelectTrigger className="h-8 w-[140px] rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(periodLabels) as [Period, string][]).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="h-5 w-px bg-border/60" />

            <Button variant="outline" size="sm" onClick={() => handleExport('PDF')} className="h-8 rounded-lg text-xs">
              <FileDown className="mr-1 h-3.5 w-3.5" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('Excel')} className="h-8 rounded-lg text-xs">
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
              Excel
            </Button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* KPI STRIP                                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-border/40 bg-muted/10 px-6 py-3 dark:bg-muted/5">
        <div className="grid grid-cols-4 gap-3">
          <KPICard
            label="Net Revenue"
            value={plData.netRevenue}
            change={prevChange.revenue}
            icon={DollarSign}
            iconColor="text-blue-600 dark:text-blue-400"
            iconBg="bg-blue-500/10 dark:bg-blue-500/20"
          />
          <KPICard
            label="Gross Profit"
            value={plData.grossProfit}
            change={prevChange.gross}
            icon={TrendingUp}
            iconColor="text-emerald-600 dark:text-emerald-400"
            iconBg="bg-emerald-500/10 dark:bg-emerald-500/20"
          />
          <KPICard
            label="Total Expenses"
            value={plData.totalExpenses}
            change={prevChange.expenses}
            icon={Receipt}
            iconColor="text-amber-600 dark:text-amber-400"
            iconBg="bg-amber-500/10 dark:bg-amber-500/20"
          />
          <KPICard
            label="Net Profit"
            value={plData.netProfit}
            change={prevChange.net}
            icon={Wallet}
            iconColor={plData.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
            iconBg={plData.netProfit >= 0 ? 'bg-emerald-500/10 dark:bg-emerald-500/20' : 'bg-rose-500/10 dark:bg-rose-500/20'}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MAIN WORKSPACE — Two-column                               */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: P&L Statement (55%) ─────────────────────── */}
        <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[55%]">
          {/* Statement header */}
          <div className="shrink-0 flex items-center justify-between border-b border-border/40 bg-muted/5 px-5 py-2 dark:bg-muted/[0.02]">
            <span className="text-xs font-semibold text-muted-foreground">
              P&L Statement — {periodLabels[selectedPeriod]}
            </span>
            <Badge variant="outline" size="sm" className="font-mono text-[10px]">
              FY 2025-26
            </Badge>
          </div>

          {/* Statement body — scrollable */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="py-2">
              {/* REVENUE SECTION */}
              <PLSection title="Revenue" totalAmount={plData.netRevenue}>
                <PLRow label="Sales Revenue" amount={plData.salesRevenue} />
                <PLRow label="Less: Sales Returns" amount={plData.salesReturns} isNegative />
                <PLRow label="Net Revenue" amount={plData.netRevenue} isBold />
              </PLSection>

              {/* COST OF GOODS SOLD */}
              <PLSection title="Cost of Goods Sold" totalAmount={plData.cogs} isNegative>
                <PLRow label="Opening Stock" amount={plData.openingStock} />
                <PLRow label="Purchases" amount={plData.purchases} />
                <PLRow label="Less: Purchase Returns" amount={plData.purchaseReturns} isNegative />
                <PLRow label="Less: Closing Stock" amount={plData.closingStock} isNegative />
                <PLRow label="COGS" amount={plData.cogs} isBold />
              </PLSection>

              {/* ── GROSS PROFIT HIGHLIGHT ── */}
              <div className="mx-4 my-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-indigo-500/5 via-indigo-500/10 to-purple-500/5 border border-indigo-500/20 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    plData.grossProfit >= 0
                      ? 'bg-emerald-500/15 dark:bg-emerald-500/25'
                      : 'bg-rose-500/15 dark:bg-rose-500/25'
                  )}>
                    {plData.grossProfit >= 0
                      ? <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      : <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    }
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Gross Profit</p>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'font-mono text-base font-bold tabular-nums',
                        plData.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      )}>
                        {formatCurrency(plData.grossProfit)}
                      </span>
                      <Badge variant={plData.grossProfit >= 0 ? 'success' : 'destructive'} size="sm">
                        {plData.grossProfitPercent.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                </div>
                {/* Mini waterfall visual */}
                <div className="flex items-end gap-1">
                  <div className="w-3 rounded-t bg-emerald-400/60" style={{ height: '28px' }} />
                  <div className="w-3 rounded-t bg-rose-400/60" style={{ height: `${Math.round((plData.cogs / plData.netRevenue) * 28)}px` }} />
                  <div className="w-3 rounded-t bg-indigo-400/60" style={{ height: `${Math.round((plData.grossProfit / plData.netRevenue) * 28)}px` }} />
                </div>
              </div>

              {/* OPERATING EXPENSES */}
              <PLSection title="Operating Expenses" totalAmount={plData.totalExpenses} isNegative>
                {Object.entries(plData.expenses).map(([cat, amt]) => (
                  <PLRow key={cat} label={cat} amount={amt} isNegative />
                ))}
                <PLRow label="Total Expenses" amount={plData.totalExpenses} isBold isNegative />
              </PLSection>

              {/* ── NET PROFIT HIGHLIGHT ── */}
              <div className={cn(
                'mx-4 my-3 flex items-center justify-between rounded-xl border-2 px-4 py-4',
                plData.netProfit >= 0
                  ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 via-emerald-500/10 to-teal-500/5'
                  : 'border-rose-500/30 bg-gradient-to-r from-rose-500/5 via-rose-500/10 to-red-500/5'
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    plData.netProfit >= 0
                      ? 'bg-emerald-500/15 dark:bg-emerald-500/25'
                      : 'bg-rose-500/15 dark:bg-rose-500/25'
                  )}>
                    {plData.netProfit >= 0
                      ? <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      : <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    }
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Net Profit</p>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'font-mono text-xl font-bold tabular-nums',
                        plData.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      )}>
                        {formatCurrency(plData.netProfit)}
                      </span>
                      <Badge variant={plData.netProfit >= 0 ? 'success' : 'destructive'} size="sm" dot>
                        {plData.netProfitPercent.toFixed(1)}% margin
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">vs prev period</p>
                  <div className={cn(
                    'flex items-center justify-end gap-0.5 text-sm font-semibold',
                    prevChange.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  )}>
                    {prevChange.net >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {Math.abs(prevChange.net).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* ── Quick Breakdown — receipt-style ── */}
              <div className="mx-4 mb-4 mt-2 rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 dark:bg-muted/5">
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Quick Summary
                </p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Net Revenue</span>
                    <span className="font-mono tabular-nums">{formatCurrency(plData.netRevenue)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-rose-500">(-) Cost of Goods</span>
                    <span className="font-mono tabular-nums text-rose-500">{formatCurrency(plData.cogs)}</span>
                  </div>
                  <div className="border-t border-dashed border-border/60 pt-1.5 flex justify-between text-[13px]">
                    <span className="font-medium">= Gross Profit</span>
                    <span className="font-mono font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(plData.grossProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-rose-500">(-) Operating Expenses</span>
                    <span className="font-mono tabular-nums text-rose-500">{formatCurrency(plData.totalExpenses)}</span>
                  </div>
                  <div className="border-t-2 border-border/60 pt-2 flex justify-between">
                    <span className="text-sm font-bold">= Net Profit</span>
                    <span className={cn(
                      'font-mono text-sm font-bold tabular-nums',
                      plData.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    )}>
                      {formatCurrency(plData.netProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* ─── RIGHT: Visualizations (45%) ───────────────────── */}
        <div className="hidden lg:flex lg:w-[45%] flex-col overflow-hidden">
          {/* Tab switcher */}
          <div className="shrink-0 flex items-center gap-1 border-b border-border/40 bg-muted/5 px-4 py-2 dark:bg-muted/[0.02]">
            <button
              onClick={() => setRightTab('trend')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                rightTab === 'trend'
                  ? 'bg-background text-foreground shadow-sm border border-border/40'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Trend & Waterfall
            </button>
            <button
              onClick={() => setRightTab('breakdown')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                rightTab === 'breakdown'
                  ? 'bg-background text-foreground shadow-sm border border-border/40'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <PieChartIcon className="h-3.5 w-3.5" />
              Expense Breakdown
            </button>
          </div>

          {/* Chart panels — scrollable */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 space-y-4">
              <AnimatePresence mode="wait">
                {rightTab === 'trend' && (
                  <motion.div
                    key="trend"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    {/* Waterfall Chart */}
                    <div className="rounded-xl border border-border/40 bg-background p-4">
                      <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Revenue to Profit Waterfall
                      </p>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={waterfallData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 10 }}
                              className="text-muted-foreground"
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v: number) => `${(Math.abs(v) / 100000).toFixed(0)}L`}
                              className="text-muted-foreground"
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(value: any) => [formatCurrency(Math.abs(Number(value))), 'Amount']}
                              contentStyle={{
                                borderRadius: '10px',
                                fontSize: '12px',
                                border: '1px solid hsl(var(--border) / 0.6)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                              }}
                            />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                              {waterfallData.map((entry, index) => (
                                <Cell key={index} fill={entry.fill} opacity={0.85} />
                              ))}
                            </Bar>
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Monthly Trend */}
                    <div className="rounded-xl border border-border/40 bg-background p-4">
                      <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Monthly P&L Trend (FY 2025-26)
                      </p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={monthlyTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" vertical={false} />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 10 }}
                              className="text-muted-foreground"
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v: number) => `${(v / 100000).toFixed(0)}L`}
                              className="text-muted-foreground"
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(value: any, name: any) => [
                                formatCurrency(Number(value)),
                                name === 'revenue' ? 'Revenue' : name === 'expenses' ? 'Expenses' : 'Profit',
                              ]}
                              contentStyle={{
                                borderRadius: '10px',
                                fontSize: '12px',
                                border: '1px solid hsl(var(--border) / 0.6)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                              }}
                            />
                            <Bar
                              dataKey="revenue"
                              fill="hsl(var(--primary))"
                              radius={[4, 4, 0, 0]}
                              opacity={0.15}
                              name="revenue"
                            />
                            <Line
                              type="monotone"
                              dataKey="revenue"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              dot={false}
                              name="revenue"
                            />
                            <Line
                              type="monotone"
                              dataKey="profit"
                              stroke="#10b981"
                              strokeWidth={2.5}
                              dot={{ r: 3, fill: '#10b981' }}
                              name="profit"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Legend */}
                      <div className="mt-2 flex items-center justify-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-4 rounded-full bg-primary" />
                          <span className="text-[10px] text-muted-foreground">Revenue</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-4 rounded-full bg-emerald-500" />
                          <span className="text-[10px] text-muted-foreground">Net Profit</span>
                        </div>
                      </div>
                    </div>

                    {/* Margin trend mini-cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border/40 bg-background p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Gross Margin</p>
                        <p className="mt-1 font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400">
                          {plData.grossProfitPercent.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">of net revenue</p>
                      </div>
                      <div className="rounded-xl border border-border/40 bg-background p-3 text-center">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Net Margin</p>
                        <p className={cn(
                          'mt-1 font-mono text-lg font-bold',
                          plData.netProfitPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        )}>
                          {plData.netProfitPercent.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">of net revenue</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {rightTab === 'breakdown' && (
                  <motion.div
                    key="breakdown"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    {/* Expense Donut */}
                    <div className="rounded-xl border border-border/40 bg-background p-4">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Expense Distribution
                      </p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={expenseDonutData}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={85}
                              paddingAngle={3}
                              dataKey="value"
                              strokeWidth={0}
                            >
                              {expenseDonutData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: any) => [formatCurrency(Number(value))]}
                              contentStyle={{
                                borderRadius: '10px',
                                fontSize: '12px',
                                border: '1px solid hsl(var(--border) / 0.6)',
                              }}
                            />
                            <text
                              x="50%"
                              y="46%"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="fill-foreground"
                            >
                              <tspan x="50%" dy="-6" fontSize="9" className="fill-muted-foreground">
                                Total
                              </tspan>
                              <tspan x="50%" dy="16" fontSize="13" fontWeight="700">
                                {formatCurrency(plData.totalExpenses)}
                              </tspan>
                            </text>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Expense breakdown list */}
                    <div className="rounded-xl border border-border/40 bg-background p-4">
                      <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Expense Breakdown
                      </p>
                      <div className="space-y-2.5">
                        {expenseDonutData
                          .sort((a, b) => b.value - a.value)
                          .map((item) => {
                            const pct = plData.totalExpenses > 0
                              ? ((item.value / plData.totalExpenses) * 100).toFixed(1)
                              : '0'
                            return (
                              <div key={item.name}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-[13px]">{item.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[13px] tabular-nums">
                                      {formatCurrency(item.value)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground w-8 text-right">
                                      {pct}%
                                    </span>
                                  </div>
                                </div>
                                {/* Progress bar */}
                                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                    className="h-full rounded-full"
                                    style={{ backgroundColor: item.color }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>

                    {/* Revenue vs Expenses comparison */}
                    <div className="rounded-xl border border-border/40 bg-background p-4">
                      <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Revenue vs Costs
                      </p>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] text-muted-foreground">Net Revenue</span>
                            <span className="font-mono text-xs tabular-nums">{formatCurrency(plData.netRevenue)}</span>
                          </div>
                          <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500/70" style={{ width: '100%' }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] text-muted-foreground">COGS</span>
                            <span className="font-mono text-xs tabular-nums">{formatCurrency(plData.cogs)}</span>
                          </div>
                          <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-rose-500/70"
                              style={{ width: `${(plData.cogs / plData.netRevenue * 100).toFixed(1)}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] text-muted-foreground">Operating Expenses</span>
                            <span className="font-mono text-xs tabular-nums">{formatCurrency(plData.totalExpenses)}</span>
                          </div>
                          <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500/70"
                              style={{ width: `${(plData.totalExpenses / plData.netRevenue * 100).toFixed(1)}%` }}
                            />
                          </div>
                        </div>
                        <div className="border-t border-dashed border-border/40 pt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-semibold">Net Profit</span>
                            <span className={cn(
                              'font-mono text-xs font-semibold tabular-nums',
                              plData.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            )}>
                              {formatCurrency(plData.netProfit)}
                            </span>
                          </div>
                          <div className="h-3 rounded-full bg-muted/20 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                plData.netProfit >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'
                              )}
                              style={{ width: `${Math.abs((plData.netProfit / plData.netRevenue * 100)).toFixed(1)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
