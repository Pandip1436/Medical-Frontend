import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PackageCheck,
  AlertTriangle,
  ClipboardList, TrendingUp,
  CheckCircle2, XCircle, ShieldAlert,
  RotateCcw,
  Filter,
  BarChart3,
  X,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import { usePageSize } from '@/hooks/usePageSize'
import type { ColumnDef } from '@/types/table'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { SupplierSearchSelect } from '@/components/shared/SupplierSearchSelect'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { usePageFilter } from '@/hooks/usePageFilter'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'
import api from '@/lib/api'
import type { GRN } from '@/types'
import { GRNSplitView } from './components/GRNSplitView'
import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { resolveListView } from '@/lib/listView'
import { ExportMenu } from '@/components/shared/ExportMenu'

// ─── Helpers ──────────────────────────────────────────────────
function grnBalance(grn: GRN) {
  return Math.max(0, Number(grn.supplierInvoiceAmount || 0) - Number(grn.amountPaid || 0))
}

const grnHasShort = (g: GRN) => g.items.some((i) => i.orderedQty > 0 && i.receivedQty < i.orderedQty)
const grnHasDamage = (g: GRN) => g.items.some((i) => (i.damageQty ?? 0) > 0)
const grnPayStatus = (g: GRN): 'PAID' | 'PARTIAL' | 'UNPAID' =>
  grnBalance(g) <= 0.01 ? 'PAID' : Number(g.amountPaid || 0) > 0 ? 'PARTIAL' : 'UNPAID'

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
] as const

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'direct', label: 'Direct' },
  { value: 'po', label: 'Against PO' },
] as const

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All Payments' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'UNPAID', label: 'Unpaid' },
] as const

// ─── Status Tabs ──────────────────────────────────────────────
type PayTabKey = 'all' | 'PAID' | 'PARTIAL' | 'UNPAID'

const PAY_TABS: { key: PayTabKey; label: string; activeClass: string; countClass: string }[] = [
  { key: 'all', label: 'All', activeClass: 'border-foreground text-foreground', countClass: 'bg-foreground/10 text-foreground' },
  { key: 'PAID', label: 'Paid', activeClass: 'border-emerald-500 text-emerald-600 dark:text-emerald-400', countClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { key: 'PARTIAL', label: 'Partial', activeClass: 'border-amber-500 text-amber-600 dark:text-amber-400', countClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { key: 'UNPAID', label: 'Unpaid', activeClass: 'border-rose-500 text-rose-600 dark:text-rose-400', countClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
]

function PaymentTabs({ tab, onChange, counts }: {
  tab: PayTabKey
  onChange: (t: PayTabKey) => void
  counts: Record<string, number>
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1 shadow-sm shadow-black/[0.02]">
      {PAY_TABS.map((t) => {
        const active = tab === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
              active
                ? cn('bg-background shadow-sm', t.activeClass)
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors',
                active ? t.countClass : 'bg-foreground/[0.06] text-muted-foreground',
              )}
            >
              {counts[t.key] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Column Defs ──────────────────────────────────────────────
const PAGE_SIZE = 15
const SPLIT_PAGE_SIZE = 30

const GRN_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'supplier', label: 'Supplier', required: true, defaultVisible: true },
  { id: 'invoice', label: 'Invoice #', defaultVisible: true },
  { id: 'source', label: 'Source', defaultVisible: true },
  { id: 'products', label: 'Products', defaultVisible: true },
  { id: 'received', label: 'Received', defaultVisible: true },
  { id: 'damaged', label: 'Damaged', defaultVisible: true },
  { id: 'short', label: 'Short', defaultVisible: true },
  { id: 'value', label: 'Value', defaultVisible: true },
  { id: 'payment', label: 'Payment', defaultVisible: true },
]

const CARD_FIELDS: ColumnDef[] = [
  { id: 'supplier', label: 'Supplier Name', required: true, defaultVisible: true },
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'grnNumber', label: 'PE Number', defaultVisible: true },
  { id: 'supplierInvoice', label: 'Supplier Invoice', defaultVisible: false },
  { id: 'source', label: 'Source Badge', defaultVisible: false },
  { id: 'value', label: 'Total Value', defaultVisible: true },
  { id: 'status', label: 'Payment Status', defaultVisible: true },
  { id: 'issues', label: 'Issues Badge', defaultVisible: true },
]

export default function GRNListPage() {
  const cols = useColumnVisibility('purchase.grnList', GRN_COLUMNS)
  const cardCols = useColumnVisibility('purchase.grnList.card', CARD_FIELDS)

  const [grns, setGrns] = useState<GRN[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('pbims.grnList.pageSize', PAGE_SIZE)


  // Filters — persisted to server via usePageFilter
  const [search, setSearch] = usePageFilter<string>('purchase.grnList', 'search', '')
  const [period, setPeriod] = usePageFilter<string>('purchase.grnList', 'period', 'all')
  const [dateFrom, setDateFrom] = usePageFilter<string>('purchase.grnList', 'dateFrom', '')
  const [dateTo, setDateTo] = usePageFilter<string>('purchase.grnList', 'dateTo', '')
  const [selectedSupplier, setSelectedSupplier] = usePageFilter<string>('purchase.grnList', 'supplier', 'all')
  const [selectedSupplierName, setSelectedSupplierName] = usePageFilter<string>('purchase.grnList', 'supplierName', '')
  const [selectedSource, setSelectedSource] = usePageFilter<string>('purchase.grnList', 'source', 'all')
  const [selectedPayment, setSelectedPayment] = usePageFilter<string>('purchase.grnList', 'payment', 'all')
  const [cardFilter, setCardFilter] = usePageFilter<'all' | 'short' | 'damaged'>('purchase.grnList', 'card', 'all')
  const [payTab, setPayTab] = usePageFilter<PayTabKey>('purchase.grnList', 'payTab', 'all')
  const [splitShowStats, setSplitShowStats] = usePageFilter<boolean>('purchase.grnList', 'splitShowStats', true)

  // Server does not filter by payTab — apply the same client-side filter
  // here that the table view uses (grnPayStatus-based).
  const [splitShowFilters, setSplitShowFilters] = useState(false)
  // Table-view filters panel — controlled so picking "Custom Range" can auto-open it.
  const [tableFiltersOpen, setTableFiltersOpen] = useState(false)

  // Payment-status tabs (table view): this page's <main> scrolls the whole
  // window rather than an internal panel (see AppLayout's tableViewActive
  // comment), and CSS `position: sticky` computes against the nearest
  // ancestor with a non-visible overflow — that's <main> itself here, which
  // never actually scrolls, so sticky silently never engages. Fall back to a
  // manual fixed-position pin once a sentinel placed just above the tabs
  // scrolls under the header (h-14 = 56px). The sidebar can occupy anywhere
  // from 0 (touch/mobile) to 16rem (expanded desktop) of the left edge, so
  // rather than guess a breakpoint, capture the bar's own on-screen left/width
  // right as it un-docks — that already reflects however much room the
  // sidebar is currently leaving, whatever the viewport.
  const tabsSentinelRef = useRef<HTMLDivElement>(null)
  const tabsBarRef = useRef<HTMLDivElement>(null)
  const [tabsPinned, setTabsPinned] = useState(false)
  const [tabsMetrics, setTabsMetrics] = useState({ height: 0, left: 0, width: 0 })

  useEffect(() => {
    const sentinel = tabsSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && tabsBarRef.current) {
          const rect = tabsBarRef.current.getBoundingClientRect()
          setTabsMetrics({ height: rect.height, left: rect.left, width: rect.width })
        }
        setTabsPinned(!entry.isIntersecting)
      },
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // Selecting "Custom Range" opens the filters panel that holds the date pickers.
  const onPeriodChange = useCallback((val: string) => {
    setPeriod(val)
    setCurrentPage(1)
    if (val === 'custom') { setTableFiltersOpen(true); setSplitShowFilters(true) }
    else if (period === 'custom') { setTableFiltersOpen(false); setSplitShowFilters(false) }
  }, [period, setPeriod])

  const loadFilterPrefs = useFilterPrefsStore((s) => s.loadFromServer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFilterPrefs() }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/grn')
      setGrns(res.data)
    } catch {
      toast.error('Failed to load purchase entries')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { search: routeSearch } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch])

  // List (table) is the default on narrow screens; split is the default on
  // desktop. Explicit ?view=table / ?view=split always wins.
  const effectiveView = resolveListView(urlParams.get('view'))
  const selectedGrnId = urlParams.get('grnId')


  const selectGrn = useCallback((id: string | null) => {
    if (window.location.pathname !== '/purchase/grn-list') return
    const params = new URLSearchParams()
    if (id) params.set('grnId', id)
    navigate(`/purchase/grn-list?${params.toString()}`)
  }, [])

  const exitSplitView = useCallback(() => {
    navigate('/purchase/grn-list?view=table')
  }, [])

  // ── Filtering logic ──

  const periodGrns = useMemo(() => {
    let result = [...grns]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((g) => g.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
        result = result.filter((g) => g.date.slice(0, 10) >= weekStr)
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter((g) => g.date.slice(0, 10) >= monthStart)
        break
      }
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        const quarterStart = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`
        result = result.filter((g) => g.date.slice(0, 10) >= quarterStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter((g) => g.date.slice(0, 10) >= dateFrom)
        if (dateTo) result = result.filter((g) => g.date.slice(0, 10) <= dateTo)
        break
    }
    return result
  }, [grns, period, dateFrom, dateTo])

  const statsBaseGrns = useMemo(() => {
    let result = [...periodGrns]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        (g.supplierInvoiceNo ?? '').toLowerCase().includes(q)
      )
    }
    if (selectedSupplier !== 'all') result = result.filter((g) => g.supplierId === selectedSupplier)
    if (selectedSource === 'direct') result = result.filter((g) => !g.poId)
    else if (selectedSource === 'po') result = result.filter((g) => !!g.poId)
    if (selectedPayment !== 'all') result = result.filter((g) => grnPayStatus(g) === selectedPayment)
    return result
  }, [periodGrns, search, selectedSupplier, selectedSource, selectedPayment])

  // After card drill-down but before pay tab — used to compute per-tab counts
  const preTabGrns = useMemo(() => {
    let result = statsBaseGrns
    if (cardFilter === 'short') result = result.filter(grnHasShort)
    else if (cardFilter === 'damaged') result = result.filter(grnHasDamage)
    return result
  }, [statsBaseGrns, cardFilter])

  const tabCounts = useMemo(() => ({
    all: preTabGrns.length,
    PAID: preTabGrns.filter((g) => grnPayStatus(g) === 'PAID').length,
    PARTIAL: preTabGrns.filter((g) => grnPayStatus(g) === 'PARTIAL').length,
    UNPAID: preTabGrns.filter((g) => grnPayStatus(g) === 'UNPAID').length,
  }), [preTabGrns])

  const filtered = useMemo(() => {
    if (payTab === 'all') return preTabGrns
    return preTabGrns.filter((g) => grnPayStatus(g) === payTab)
  }, [preTabGrns, payTab])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Per-row derived values for the mobile card list (mirrors the table row logic).
  const pagedEnriched = useMemo(() => paged.map((grn) => {
    const totalRcv = grn.items.reduce((s, i) => s + i.receivedQty + (i.freeQty ?? 0), 0)
    const dmg = grn.items.reduce((s, i) => s + (i.damageQty ?? 0), 0)
    const shortItemsRow = grn.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty)
    const shortCnt = shortItemsRow.length
    const laterGrnsRow = grn.poId
      ? grns.filter(g => g.poId === grn.poId && g.id !== grn.id && new Date(g.date).getTime() >= new Date(grn.date).getTime())
      : []
    const shortageDNsRow = (grn.purchaseReturns ?? []).filter(pr => /short|excess/i.test(pr.reason ?? ''))
    const resolvedCount = shortItemsRow.filter(it => {
      const missing = it.orderedQty - it.receivedQty
      const fulfilled = laterGrnsRow.reduce((s, g) => {
        const m = g.items.find(gi => gi.productId === it.productId)
        return s + (m ? m.receivedQty + (m.freeQty ?? 0) : 0)
      }, 0)
      const debited = shortageDNsRow.reduce((s, pr) => {
        const m = pr.items.find(pi => pi.productId === it.productId)
        return s + (m ? m.returnedQty : 0)
      }, 0)
      return (fulfilled + debited) >= missing
    }).length
    const allResolved = shortCnt > 0 && resolvedCount === shortCnt
    const hasPO = !!grn.poId
    const bal = grnBalance(grn)
    const status: 'PAID' | 'PARTIAL' | 'UNPAID' = bal <= 0.01 ? 'PAID' : Number(grn.amountPaid || 0) > 0 ? 'PARTIAL' : 'UNPAID'
    return { grn, totalRcv, dmg, shortCnt, allResolved, hasPO, bal, status }
  }), [paged, grns])

  const stats = useMemo(() => {
    const totalReceived = statsBaseGrns.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.receivedQty + (i.freeQty ?? 0), 0), 0)
    const totalDamaged  = statsBaseGrns.reduce((s, g) => s + g.items.reduce((ss, i) => ss + (i.damageQty ?? 0), 0), 0)
    const totalShort    = statsBaseGrns.reduce((s, g) => s + g.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty).length, 0)
    return { totalReceived, totalDamaged, totalShort }
  }, [statsBaseGrns])

  const activeFilterCount = [
    period !== 'all' ? period : '',
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom,
    dateTo,
    selectedSupplier !== 'all' ? selectedSupplier : '',
    selectedSource !== 'all' ? selectedSource : '',
    selectedPayment !== 'all' ? selectedPayment : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('all')
    setCardFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedSupplier('all')
    setSelectedSupplierName('')
    setSelectedSource('all')
    setSelectedPayment('all')
    setPayTab('all')
  }

  // ── Split view (default) ──
  if (effectiveView === 'split') {
    const splitExportMenu = (
      <ExportMenu
        title="Purchase Entries"
        filename="purchase-entries"
        noun="PE"
        showCountInHeader
        rows={filtered.map((g) => ({
          'PE #': g.grnNumber,
          Date: formatDate(g.date),
          Supplier: g.supplierName,
          'Supplier Invoice': g.supplierInvoiceNo ?? '',
          Products: g.items.length,
          Value: formatCurrency(g.supplierInvoiceAmount || g.totalAmount),
          Status: grnPayStatus(g),
        }))}
        excelRows={filtered.map((g) => ({
          'PE #': g.grnNumber,
          Date: formatDate(g.date),
          Supplier: g.supplierName,
          'Supplier Invoice': g.supplierInvoiceNo ?? '',
          Products: g.items.length,
          Value: Number(g.supplierInvoiceAmount || g.totalAmount),
          'Amount Paid': Number(g.amountPaid || 0),
          Status: grnPayStatus(g),
        }))}
      />
    )

    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {/* Collapsible stats */}
        <AnimatePresence>
          {splitShowStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-4 p-1 sm:grid-cols-4">
                {([
                  { label: 'Total Entries', value: statsBaseGrns.length.toString(), subtitle: 'purchase entries', icon: ClipboardList, iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', borderAccent: 'border-l-blue-500', filterKey: 'all' as const, activeRing: 'ring-2 ring-blue-500/50' },
                  { label: 'Units Received', value: stats.totalReceived.toString(), subtitle: 'units received', icon: TrendingUp, iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', borderAccent: 'border-l-emerald-500', filterKey: 'all' as const, activeRing: 'ring-2 ring-emerald-500/50' },
                  { label: 'Short Items', value: stats.totalShort.toString(), subtitle: 'shortage items', icon: AlertTriangle, iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', borderAccent: 'border-l-amber-500', filterKey: 'short' as const, activeRing: 'ring-2 ring-amber-500/50' },
                  { label: 'Damaged Units', value: stats.totalDamaged.toString(), subtitle: 'damaged units', icon: ShieldAlert, iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', borderAccent: 'border-l-rose-500', filterKey: 'damaged' as const, activeRing: 'ring-2 ring-rose-500/50' },
                ] as const).map((stat) => {
                  const active = stat.filterKey !== 'all' && cardFilter === stat.filterKey
                  return (
                    <Card
                      key={stat.label}
                      hover
                      role="button"
                      tabIndex={0}
                      onClick={() => { setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) } }}
                      className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.borderAccent, active && stat.activeRing)}
                    >
                      <CardContent className="flex items-center gap-2.5 px-2.5 py-2">
                        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', stat.iconBg)}>
                          <stat.icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                          <p className="text-sm font-bold font-mono leading-tight">{stat.value}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar row */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="w-40 min-w-35">
            <EnumSelect
              value={period}
              onValueChange={onPeriodChange}
              onClear={() => onPeriodChange('all')}
              options={PERIOD_OPTIONS}
            />
          </div>
          {splitExportMenu}
          {/* Segmented utility toggles (Filter · Summary) — same language as the
              view switcher: one bordered pill, active item lifts on a surface. */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Toggle filters"
              onClick={() => setSplitShowFilters(!splitShowFilters)}
              className={cn(
                'relative h-7 w-7 rounded-md transition-all',
                splitShowFilters && 'bg-background text-foreground shadow-sm',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={splitShowStats ? 'Hide summary stats' : 'Show summary stats'}
              onClick={() => setSplitShowStats(!splitShowStats)}
              className={cn(
                'h-7 w-7 rounded-md transition-all',
                splitShowStats && 'bg-background text-foreground shadow-sm',
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Hairline divider separating utilities from primary actions */}
          <div className="mx-0.5 hidden h-6 w-px bg-border/60 sm:block" />
          <Button size="sm" onClick={() => navigate('/purchase/grn')}>
            <PackageCheck className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">New PE</span>
          </Button>
          <ViewModeToggle
            view="split"
            onViewChange={(v) => { if (v === 'table') exitSplitView() }}
          />
        </div>

        {/* Collapsible filter panel */}
        <AnimatePresence>
          {splitShowFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                <div className="flex flex-wrap items-end gap-3 *:flex-1 *:min-w-35">
                  <SupplierSearchSelect
                    value={selectedSupplier}
                    selectedName={selectedSupplierName}
                    onChange={(val, name) => { setSelectedSupplier(val); setSelectedSupplierName(name); setCurrentPage(1) }}
                  />
                  <EnumSelect
                    label="Source"
                    value={selectedSource}
                    onValueChange={(val) => { setSelectedSource(val); setCurrentPage(1) }}
                    onClear={() => { setSelectedSource('all'); setCurrentPage(1) }}
                    options={SOURCE_OPTIONS}
                  />
                  <EnumSelect
                    label="Payment"
                    value={selectedPayment}
                    onValueChange={(val) => { setSelectedPayment(val); setCurrentPage(1) }}
                    onClear={() => { setSelectedPayment('all'); setCurrentPage(1) }}
                    options={PAYMENT_OPTIONS}
                  />
                  {period === 'custom' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                        <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setCurrentPage(1) }} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                        <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setCurrentPage(1) }} />
                      </div>
                    </>
                  )}
                  <div className="flex-none! min-w-0! flex items-end gap-2">
                    <ColumnsToggle
                      columns={CARD_FIELDS}
                      visible={cardCols.visible}
                      onToggle={cardCols.toggle}
                      onReset={cardCols.reset}
                    />
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => { clearFilters(); setCurrentPage(1) }}>
                        <X className="mr-1 h-3.5 w-3.5" />
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-0 flex-1">
          <GRNSplitView
            grns={filtered}
            allGrns={grns}
            loading={loading}
            selectedGrnId={selectedGrnId}
            onSelectGrn={selectGrn}
            onExitSplitView={exitSplitView}
            onRefresh={load}
            isCardFieldVisible={cardCols.isVisible}
            tabsNode={
              <PaymentTabs
                tab={payTab}
                onChange={(t) => { setPayTab(t); setCurrentPage(1) }}
                counts={tabCounts}
              />
            }
          />
        </div>
      </div>
    )
  }

  // ── Table view ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          { label: 'Total Entries', value: statsBaseGrns.length, icon: ClipboardList, color: 'text-primary',                              bg: 'bg-primary/10',         border: 'border-l-primary',      filterKey: 'all',     activeRing: 'ring-2 ring-primary/40' },
          { label: 'Units Received',value: stats.totalReceived, icon: TrendingUp,    color: 'text-emerald-600 dark:text-emerald-400',    bg: 'bg-emerald-500/10',     border: 'border-l-emerald-500',  filterKey: 'all',     activeRing: 'ring-2 ring-emerald-500/50' },
          { label: 'Short Items',   value: stats.totalShort,    icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400',         bg: 'bg-amber-500/10',       border: 'border-l-amber-500',    filterKey: 'short',   activeRing: 'ring-2 ring-amber-500/50' },
          { label: 'Damaged Units', value: stats.totalDamaged,  icon: ShieldAlert,   color: 'text-rose-600 dark:text-rose-400',           bg: 'bg-rose-500/10',        border: 'border-l-rose-500',     filterKey: 'damaged', activeRing: 'ring-2 ring-rose-500/50' },
        ] as const).map(s => {
          const active = s.filterKey !== 'all' && cardFilter === s.filterKey
          return (
          <Card
            key={s.label}
            hover
            role="button"
            tabIndex={0}
            title={s.filterKey === 'all' ? 'Show all purchases in this period' : `Filter to ${s.label.toLowerCase()}`}
            onClick={() => { setCardFilter(active ? 'all' : (s.filterKey as 'all' | 'short' | 'damaged')); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : (s.filterKey as 'all' | 'short' | 'damaged')); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', s.border, active && s.activeRing)}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.bg)}>
                <s.icon className={cn('h-4 w-4', s.color)} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className={cn('text-xl font-bold font-mono leading-tight', s.color)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* Search + actions */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={(val) => { setSearch(val); setCurrentPage(1) }}
        searchPlaceholder="Search PE #, supplier or invoice..."
        resultsCount={filtered.length}
        activeFilterCount={activeFilterCount}
        open={tableFiltersOpen}
        onOpenChange={setTableFiltersOpen}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        leadingNode={
          <div className="w-full sm:w-40">
            <EnumSelect
              value={period}
              onValueChange={onPeriodChange}
              onClear={() => onPeriodChange('all')}
              options={PERIOD_OPTIONS}
            />
          </div>
        }
        columnsNode={<ColumnsToggle columns={GRN_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <ViewModeToggle view="table" onViewChange={(v) => { if (v === 'split') navigate('/purchase/grn-list') }} />
            <ExportMenu
              className="flex-1 sm:w-auto sm:flex-none"
              title="Purchase Entries"
              filename="purchase-entries"
              noun="PE"
              showCountInHeader
              rows={filtered.map((g) => ({
                'PE #': g.grnNumber,
                Date: formatDate(g.date),
                Supplier: g.supplierName,
                'Supplier Invoice': g.supplierInvoiceNo ?? '',
                Products: g.items.length,
                Value: formatCurrency(g.supplierInvoiceAmount || g.totalAmount),
                Status: grnPayStatus(g),
              }))}
              excelRows={filtered.map((g) => ({
                'PE #': g.grnNumber,
                Date: formatDate(g.date),
                Supplier: g.supplierName,
                'Supplier Invoice': g.supplierInvoiceNo ?? '',
                Products: g.items.length,
                Value: Number(g.supplierInvoiceAmount || g.totalAmount),
                'Amount Paid': Number(g.amountPaid || 0),
                Status: grnPayStatus(g),
              }))}
            />
            <Button
              size="sm"
              className="flex-1 sm:w-auto sm:flex-none"
              onClick={() => navigate('/purchase/grn')}
            >
              <PackageCheck className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">New PE</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        }
      >
        {/* All filters + custom date pickers on one flex-wrap row */}
        <div className="col-span-full flex flex-wrap items-end gap-4">
          <div className="min-w-40 flex-1">
            <SupplierSearchSelect
              value={selectedSupplier}
              selectedName={selectedSupplierName}
              onChange={(val, name) => { setSelectedSupplier(val); setSelectedSupplierName(name); setCurrentPage(1) }}
            />
          </div>
          <div className="min-w-40 flex-1">
            <EnumSelect
              label="Source"
              value={selectedSource}
              onValueChange={(val) => { setSelectedSource(val); setCurrentPage(1) }}
              onClear={() => { setSelectedSource('all'); setCurrentPage(1) }}
              options={SOURCE_OPTIONS}
            />
          </div>
          <div className="min-w-40 flex-1">
            <EnumSelect
              label="Payment"
              value={selectedPayment}
              onValueChange={(val) => { setSelectedPayment(val); setCurrentPage(1) }}
              onClear={() => { setSelectedPayment('all'); setCurrentPage(1) }}
              options={PAYMENT_OPTIONS}
            />
          </div>
          {/* Custom date range — full width below sm forces its own dedicated row (never squeezed alongside another field) so both pickers stay usable; sm+ reverts to flex-1 so desktop layout is unchanged */}
          {period === 'custom' && (
            <div className="w-full sm:w-auto sm:min-w-40 sm:flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                  <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setCurrentPage(1) }} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                  <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setCurrentPage(1) }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </DataTableFilterBar>

      {/* Payment-status tabs — pinned so they stay visible while the list below scrolls */}
      <div ref={tabsSentinelRef} />
      {tabsPinned && <div style={{ height: tabsMetrics.height }} />}
      <div
        ref={tabsBarRef}
        style={tabsPinned ? { left: tabsMetrics.left, width: tabsMetrics.width } : undefined}
        className={cn(
          'z-20 bg-background py-1.5',
          tabsPinned && 'fixed top-14 px-1 shadow-sm',
        )}
      >
        <PaymentTabs
          tab={payTab}
          onChange={(t) => { setPayTab(t); setCurrentPage(1) }}
          counts={tabCounts}
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <CardContent className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
          </CardContent>
        ) : paged.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <PackageCheck className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {search ? 'No entries match your search' : 'No purchase entries yet'}
            </p>
            {!search && <Button size="sm" onClick={() => navigate('/purchase/grn')}>Create First Entry</Button>}
          </CardContent>
        ) : (
          <>
            {/* responsive: card list on phones, table at md+ */}
            <div className="divide-y divide-border/40 md:hidden">
              {pagedEnriched.map(({ grn, totalRcv, dmg, shortCnt, allResolved, hasPO, bal, status }) => (
                <div
                  key={grn.id}
                  className="flex flex-col gap-2 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/30"
                  onClick={() => navigate(`/purchase/grn/detail?id=${grn.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        role="link"
                        tabIndex={0}
                        title="View supplier details"
                        className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${grn.supplierId}`) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${grn.supplierId}`) } }}
                      >{grn.supplierName}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground/70">
                        {grn.grnNumber}
                        {cols.isVisible('date') && ` · ${formatDate(grn.date)}`}
                        {cols.isVisible('invoice') && grn.supplierInvoiceNo && ` · ${grn.supplierInvoiceNo}`}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {cols.isVisible('value') && (
                        <span className="font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(grn.supplierInvoiceAmount || grn.totalAmount)}
                        </span>
                      )}
                      {cols.isVisible('payment') && (grn.isReplacement ? (
                        <Badge variant="outline" size="sm" className="border-sky-200 bg-sky-50 font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400">
                          Replacement
                        </Badge>
                      ) : (
                        <StatusBadge status={status} />
                      ))}
                      {cols.isVisible('payment') && !grn.isReplacement && bal > 0.01 && (
                        <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">{formatCurrency(bal)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {cols.isVisible('source') && <Badge variant={hasPO ? 'info' : 'secondary'} size="sm">{hasPO ? 'Against PO' : 'Direct'}</Badge>}
                    {cols.isVisible('products') && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">{grn.items.length} product{grn.items.length !== 1 ? 's' : ''}</span>}
                    {cols.isVisible('received') && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 tabular-nums">+{totalRcv} recv</span>}
                    {cols.isVisible('damaged') && dmg > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                        <XCircle className="h-2.5 w-2.5" />{dmg} damaged
                      </span>
                    )}
                    {cols.isVisible('short') && shortCnt > 0 && (
                      allResolved ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <RotateCcw className="h-2.5 w-2.5" />Resolved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <AlertTriangle className="h-2.5 w-2.5" />{shortCnt} short
                        </span>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    {cols.isVisible('date') && <TableHead className="pl-5">Date</TableHead>}
                    <TableHead>Supplier</TableHead>
                    {cols.isVisible('invoice') && <TableHead>Invoice #</TableHead>}
                    {cols.isVisible('source') && <TableHead>Source</TableHead>}
                    {cols.isVisible('products') && <TableHead className="text-center">Products</TableHead>}
                    {cols.isVisible('received') && <TableHead className="text-right">Received</TableHead>}
                    {cols.isVisible('damaged') && <TableHead className="text-center">Damaged</TableHead>}
                    {cols.isVisible('short') && <TableHead className="text-center">Short</TableHead>}
                    {cols.isVisible('value') && <TableHead className="text-right">Value</TableHead>}
                    {cols.isVisible('payment') && <TableHead className="text-center pr-5">Payment</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(grn => {
                    const totalRcv  = grn.items.reduce((s, i) => s + i.receivedQty + (i.freeQty ?? 0), 0)
                    const dmg       = grn.items.reduce((s, i) => s + (i.damageQty ?? 0), 0)
                    const shortItemsRow = grn.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty)
                    const shortCnt  = shortItemsRow.length
                    const laterGrnsRow = grn.poId
                      ? grns.filter(g => g.poId === grn.poId && g.id !== grn.id && new Date(g.date).getTime() >= new Date(grn.date).getTime())
                      : []
                    const shortageDNsRow = (grn.purchaseReturns ?? []).filter(pr =>
                      /short|excess/i.test(pr.reason ?? '')
                    )
                    const resolvedCount = shortItemsRow.filter(it => {
                      const missing = it.orderedQty - it.receivedQty
                      const fulfilled = laterGrnsRow.reduce((s, g) => {
                        const m = g.items.find(gi => gi.productId === it.productId)
                        return s + (m ? m.receivedQty + (m.freeQty ?? 0) : 0)
                      }, 0)
                      const debited = shortageDNsRow.reduce((s, pr) => {
                        const m = pr.items.find(pi => pi.productId === it.productId)
                        return s + (m ? m.returnedQty : 0)
                      }, 0)
                      return (fulfilled + debited) >= missing
                    }).length
                    const allResolved = shortCnt > 0 && resolvedCount === shortCnt
                    const hasPO     = !!grn.poId
                    const hasIssues = dmg > 0 || (shortCnt > 0 && !allResolved)
                    return (
                      <TableRow
                        key={grn.id}
                        className={cn(
                          'cursor-pointer transition-colors',
                          hasIssues ? 'hover:bg-amber-50/30 dark:hover:bg-amber-950/10' : 'hover:bg-muted/30'
                        )}
                        onClick={() => navigate(`/purchase/grn/detail?id=${grn.id}`)}
                      >
                        {cols.isVisible('date') && (
                        <TableCell className="pl-5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(grn.date)}
                        </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                              {grn.supplierName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span
                                role="link"
                                tabIndex={0}
                                title="View supplier details"
                                className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${grn.supplierId}`) }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${grn.supplierId}`) } }}
                              >{grn.supplierName}</span>
                              <span className="block font-mono text-[10px] text-muted-foreground/70">{grn.grnNumber}</span>
                            </div>
                          </div>
                        </TableCell>
                        {cols.isVisible('invoice') && (
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {grn.supplierInvoiceNo || <span className="opacity-40">—</span>}
                        </TableCell>
                        )}
                        {cols.isVisible('source') && (
                        <TableCell>
                          <Badge variant={hasPO ? 'info' : 'secondary'} size="sm">
                            {hasPO ? 'Against PO' : 'Direct'}
                          </Badge>
                        </TableCell>
                        )}
                        {cols.isVisible('products') && <TableCell className="text-center text-xs font-mono font-semibold">{grn.items.length}</TableCell>}
                        {cols.isVisible('received') && (
                        <TableCell className="text-right">
                          <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">+{totalRcv}</span>
                        </TableCell>
                        )}
                        {cols.isVisible('damaged') && (
                        <TableCell className="text-center">
                          {dmg > 0
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-0.5 text-[10px] font-bold">
                                <XCircle className="h-2.5 w-2.5" />{dmg}
                              </span>
                            : <span className="text-muted-foreground/40 text-xs">—</span>
                          }
                        </TableCell>
                        )}
                        {cols.isVisible('short') && (
                        <TableCell className="text-center">
                          {shortCnt > 0
                            ? allResolved
                              ? <span
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold"
                                  title="Shortage resolved by later supplementary delivery"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />Resolved
                                </span>
                              : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold">
                                  <AlertTriangle className="h-2.5 w-2.5" />{shortCnt}
                                </span>
                            : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[10px]">
                                <CheckCircle2 className="h-3 w-3" />Full
                              </span>
                          }
                        </TableCell>
                        )}
                        {cols.isVisible('value') && (
                        <TableCell className="text-right">
                          <span className="text-[15px] font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(grn.supplierInvoiceAmount || grn.totalAmount)}</span>
                        </TableCell>
                        )}
                        {cols.isVisible('payment') && (
                        <TableCell className="text-center pr-5">
                          {grn.isReplacement ? (
                            <Badge
                              variant="outline"
                              size="sm"
                              className="border-sky-200 bg-sky-50 font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400"
                            >
                              Replacement
                            </Badge>
                          ) : (
                            (() => {
                              const bal = grnBalance(grn)
                              const status = bal <= 0.01 ? 'PAID' : Number(grn.amountPaid || 0) > 0 ? 'PARTIAL' : 'UNPAID'
                              return (
                                <div className="flex flex-col items-center gap-0.5">
                                  <StatusBadge status={status} />
                                  {bal > 0.01 && (
                                    <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                                      {formatCurrency(bal)}
                                    </span>
                                  )}
                                </div>
                              )
                            })()
                          )}
                        </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              itemsPerPage={pageSize}
              pageSize={pageSize}
              onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
              className="border-t border-border/40 px-5"
            />
          </>
        )}
      </Card>
    </motion.div>
  )
}