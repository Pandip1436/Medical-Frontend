import { useState, useMemo, useEffect } from 'react'
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
import { useIsMobile } from '@/hooks/useMediaQuery'
import { usePageFilter } from '@/hooks/usePageFilter'
import ReportViewPage from './ReportViewPage'

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
  { id: 'yearly-sales', name: 'Yearly Sales', description: 'Year-over-year sales trend across all years', icon: TrendingUp, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales' },
  { id: 'product-sales', name: 'Product-wise Sales', description: 'Revenue and margin breakdown by product', icon: Package, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales', popular: true },
  { id: 'customer-sales', name: 'Customer-wise Sales', description: 'Sales volume and outstanding per customer', icon: Users, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales' },
  { id: 'category-sales', name: 'Category-wise Sales', description: 'Sales distribution across product categories', icon: PieChart, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', category: 'Sales' },
  // Purchase
  { id: 'purchase-summary', name: 'Purchase Summary', description: 'Total purchases and PE reconciliation', icon: ShoppingCart, iconBg: 'bg-purple-500/10', iconColor: 'text-purple-600 dark:text-purple-400', category: 'Purchase', popular: true },
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

// Recently generated reports (localStorage-backed)
interface RecentReport {
  id: string
  name: string
  generatedAt: string
  reportType: string
  category: CategoryKey
}

const RECENT_REPORTS_KEY = 'recentReports'
const MAX_RECENT = 5

function loadRecentReports(): RecentReport[] {
  try {
    const raw = localStorage.getItem(RECENT_REPORTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecentReport(report: ReportDef): RecentReport[] {
  const existing = loadRecentReports().filter((r) => r.reportType !== report.id)
  const entry: RecentReport = {
    id: `RR-${Date.now()}`,
    name: report.name,
    generatedAt: new Date().toISOString(),
    reportType: report.id,
    category: report.category,
  }
  const updated = [entry, ...existing].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_REPORTS_KEY, JSON.stringify(updated))
  return updated
}

// ─────────────────────────────────────────────────────────────
// Reports Hub Page — Fixed Viewport, Two-Column
// ─────────────────────────────────────────────────────────────

export default function ReportsHubPage() {
  const [searchQuery, setSearchQuery] = usePageFilter<string>('reports.hub', 'search', '')
  const [activeFilter, setActiveFilter] = usePageFilter<CategoryKey>('reports.hub', 'category', 'All')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeReport, setActiveReport] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<ReportDef | null>(null)
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])
  const isMobile = useIsMobile()

  useEffect(() => {
    setRecentReports(loadRecentReports())
  }, [])

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
    const report = allReports.find((r) => r.id === reportId)
    if (report) {
      const updated = saveRecentReport(report)
      setRecentReports(updated)
    }
    setActiveReport(reportId)
  }

  // On phones the right-hand detail/Generate panel is hidden, so tapping a
  // report generates it directly. On desktop it selects for the preview panel.
  const openReport = (report: ReportDef) => {
    if (isMobile) handleGenerate(report.id)
    else setSelectedReport(report)
  }

  if (activeReport) {
    return <ReportViewPage reportType={activeReport} onBack={() => setActiveReport(null)} />
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-border/40 bg-background px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-bold tracking-tight">Reports & Analytics</h2>
              {filteredReports.length !== totalReports && (
                <Badge variant="warning" className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground animate-in fade-in slide-in-from-left-1">
                  {filteredReports.length} found
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {totalReports} reports available across {categoryKeys.length - 1} categories
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              icon={<Search />}
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full min-w-0 text-xs sm:w-56 sm:flex-none"
            />
            <div className="flex items-center gap-2">
            <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as CategoryKey)}>
              <SelectTrigger className="h-8 flex-1 rounded-lg text-xs sm:w-32.5 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryKeys.map((key) => (
                  <SelectItem key={key} value={key}>{categoryConfig[key].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="hidden h-5 w-px bg-border/60 sm:block" />
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
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
                          onClick={() => openReport(report)}
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
                            onClick={() => openReport(report)}
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
                        onClick={() => openReport(report)}
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
