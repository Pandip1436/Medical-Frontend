import { useState, useCallback, useEffect, useMemo } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import { usePageFilter } from '@/hooks/usePageFilter'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  FileText,
  RotateCcw,
  Plus,
  CheckCircle2,
  Receipt,
  IndianRupee,
  AlertTriangle,
  Filter,
  BarChart3,
  X,
  SlidersHorizontal,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import { usePageSize } from '@/hooks/usePageSize'
import type { ColumnDef } from '@/types/table'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { SupplierSearchSelect } from '@/components/shared/SupplierSearchSelect'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { resolveListView } from '@/lib/listView'
import { navigate, useRoute } from '@/lib/router'
import { toast } from 'sonner'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { DebitNoteSplitView } from './components/DebitNoteSplitView'
import { ExportMenu } from '@/components/shared/ExportMenu'

// ─────────────────────────────────────────────────────────────
// DEBIT NOTES HISTORY PAGE
// ─────────────────────────────────────────────────────────────

// Minimal API row + UI detail shape — kept loose because the API returns a
// nested object graph we don't fully type elsewhere.
export type ApiReturnItem = {
  id: string; productId: string; productName: string;
  batchNumber: string; expiryDate: string; returnedQty: number;
  purchaseRate: number | string; rate?: number | string;
  gstPercent: number | string; amount: number | string;
}
export type ApiReturn = {
  id: string; debitNoteNo: string; date: string;
  supplierId: string; supplierName: string; supplierPhone?: string | null;
  reason: string; items: ApiReturnItem[];
  subtotal: number | string; cgst?: number | string; sgst?: number | string;
  totalAmount: number | string; status: string;
  settlementMode?: 'REFUND' | 'REPLACEMENT' | 'ADJUST';
  replacementGrnId?: string | null; notes?: string;
  grn?: { grnNumber: string; items: ApiReturnItem[] };
}
export type ReturnDetail = {
  id: string; noteNo: string; date: string;
  partyName: string; supplierId: string;
  supplierPhone?: string | null; supplierAddress?: string | null;
  referenceValue: string; reason: string;
  items: ApiReturnItem[]; grnItems: ApiReturnItem[];
  subtotal: number | string; cgst?: number | string; sgst?: number | string;
  totalAmount: number | string; status: string;
  settlementMode: 'REFUND' | 'REPLACEMENT' | 'ADJUST';
  replacementGrnId: string | null; notes?: string;
}

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
] as const

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'goods-returned', label: 'Goods Returned' },
  { value: 'short-billing', label: 'Short-Billing' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SETTLED', label: 'Settled' },
] as const

type StatusTabKey = 'all' | 'PENDING' | 'SETTLED'
const STATUS_TABS: { key: StatusTabKey; label: string; activeClass: string; countClass: string }[] = [
  { key: 'all',     label: 'All',     activeClass: 'border-foreground text-foreground',                               countClass: 'bg-foreground/10 text-foreground' },
  { key: 'PENDING', label: 'Pending', activeClass: 'border-amber-500 text-amber-600 dark:text-amber-400',            countClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { key: 'SETTLED', label: 'Settled', activeClass: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',      countClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
]

function DebitNoteStatusTabs({ tab, onChange, counts }: {
  tab: StatusTabKey
  onChange: (t: StatusTabKey) => void
  counts: Record<string, number>
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1 shadow-sm shadow-black/[0.02]">
      {STATUS_TABS.map((t) => {
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

const DEBIT_NOTE_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'supplier', label: 'Supplier', required: true, defaultVisible: true },
  { id: 'noteNumber', label: 'Note Number', defaultVisible: true },
  { id: 'type', label: 'Type', defaultVisible: true },
  { id: 'pe', label: 'PE', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

const CARD_FIELDS: ColumnDef[] = [
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'debitNoteNo', label: 'Debit Note No.', defaultVisible: true },
  { id: 'phone', label: 'Phone', defaultVisible: true },
  { id: 'type', label: 'Type', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

const SPLIT_PAGE_SIZE = 30

export default function DebitNotesPage() {
  const cols = useColumnVisibility('purchase.debitNotes', DEBIT_NOTE_COLUMNS)
  const cardCols = useColumnVisibility('purchase.debitNotes.card', CARD_FIELDS)
  const [pastReturns, setPastReturns] = useState<ApiReturn[]>([])
  const [allReturns, setAllReturns] = useState<ApiReturn[]>([])
  const [returnsLoading, setReturnsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10
  const [pageSize, setPageSize] = usePageSize('pbims.debitNotes.pageSize', PAGE_SIZE)

  // Filters — usePageFilter for persistence across sessions
  const [searchQuery, setSearchQuery] = usePageFilter<string>('purchase.debitNotes', 'search', '')
  const [period, setPeriod] = usePageFilter<string>('purchase.debitNotes', 'period', 'all')
  const [dateFrom, setDateFrom] = usePageFilter<string>('purchase.debitNotes', 'dateFrom', '')
  const [dateTo, setDateTo] = usePageFilter<string>('purchase.debitNotes', 'dateTo', '')
  const [selectedType, setSelectedType] = usePageFilter<string>('purchase.debitNotes', 'type', 'all')
  const [selectedStatus, setSelectedStatus] = usePageFilter<string>('purchase.debitNotes', 'status', 'all')
  const [selectedSupplier, setSelectedSupplier] = usePageFilter<string>('purchase.debitNotes', 'supplier', 'all')
  const [selectedSupplierName, setSelectedSupplierName] = usePageFilter<string>('purchase.debitNotes', 'supplierName', '')
  const [splitShowStats, setSplitShowStats] = usePageFilter<boolean>('purchase.debitNotes', 'splitShowStats', true)

  const [cardFilter, setCardFilter] = usePageFilter<'all' | 'short-billing' | 'settled'>('purchase.debitNotes', 'cardFilter', 'all')
  // Split-view filter panel visibility — not persisted (intentional)
  const [splitShowFilters, setSplitShowFilters] = useState(false)
  // Table-view filters panel — controlled so picking "Custom Range" can auto-open it.
  const [tableFiltersOpen, setTableFiltersOpen] = useState(false)
  const [statusTab, setStatusTab] = usePageFilter<StatusTabKey>('purchase.debitNotes', 'statusTab', 'all')

  // Selecting "Custom Range" opens the filters panel that holds the date pickers.
  const onPeriodChange = useCallback((val: string) => {
    setPeriod(val)
    if (val === 'custom') { setTableFiltersOpen(true); setSplitShowFilters(true) }
    else if (period === 'custom') { setTableFiltersOpen(false); setSplitShowFilters(false) }
  }, [period, setPeriod])

  const loadFilterPrefs = useFilterPrefsStore((s) => s.loadFromServer)
  useEffect(() => { loadFilterPrefs() }, [loadFilterPrefs])

  // Master data — Supplier filter pulls from the full suppliers list
  const { suppliers, fetchMasterData } = useMasterDataStore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])

  // Deep-link support: the detail is now its own page. Legacy links that land
  // on the list with `?id=<id>` (Supplier Detail → Debit Notes tab,
  // notifications) redirect to the standalone detail page.
  const { search } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(search), [search])

  useEffect(() => {
    const target = urlParams.get('id')
    // `replace` so the intermediate `?id=` URL never lands in the back stack —
    // otherwise Back returns here and immediately re-redirects ("press back
    // twice" bug).
    if (target) navigate(`/purchase/debit-notes/detail?id=${target}`, { replace: true })
  }, [urlParams])

  // Split is default; ?view=table → table view
  const effectiveView = resolveListView(urlParams.get('view'))
  const selectedDebitNoteId = urlParams.get('debitNoteId')

  const selectDebitNote = useCallback((id: string | null) => {
    if (window.location.pathname !== '/purchase/debit-notes') return
    const params = new URLSearchParams()
    if (id) params.set('debitNoteId', id)
    navigate(`/purchase/debit-notes${params.toString() ? `?${params.toString()}` : ''}`)
  }, [])

  const exitSplitView = useCallback(() => {
    navigate('/purchase/debit-notes?view=table')
  }, [])


  const fetchReturns = useCallback(async () => {
    setReturnsLoading(true)
    try {
      const res = await api.get('/purchase-returns')
      const data = res.data.data || res.data || []
      setAllReturns(data)
      setPastReturns(data)
    } catch {
      toast.error('Failed to load debit notes history')
    } finally {
      setReturnsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReturns() }, [fetchReturns])
  useBranchRefresh(fetchReturns)


  // Debit notes within the selected period only — drives both the summary
  // cards and the list, so the cards always reflect the period independent of
  // the card-click / search / type / status narrowing applied below.
  const periodReturns = useMemo(() => {
    let result = [...allReturns]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter(r => r.date?.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
        result = result.filter(r => r.date?.slice(0, 10) >= weekStr)
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter(r => r.date?.slice(0, 10) >= monthStart)
        break
      }
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        const quarterStart = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`
        result = result.filter(r => r.date?.slice(0, 10) >= quarterStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter(r => r.date?.slice(0, 10) >= dateFrom)
        if (dateTo)   result = result.filter(r => r.date?.slice(0, 10) <= dateTo)
        break
    }
    return result
  }, [allReturns, period, dateFrom, dateTo])

  // Returns after every filter EXCEPT the stat-card drill-down (period + type +
  // status + supplier + search). Drives the stat cards so they reflect the
  // active filters; the list layers the card drill-down on top.
  const statsBaseReturns = useMemo(() => {
    let result = [...periodReturns]

    // Type filter (matched against `reason`)
    if (selectedType === 'short-billing') {
      result = result.filter(r => /short/i.test(r.reason || ''))
    } else if (selectedType === 'goods-returned') {
      result = result.filter(r => !/short/i.test(r.reason || ''))
    }

    // Status filter
    if (selectedStatus !== 'all') {
      result = result.filter(r => (r.status || '').toUpperCase() === selectedStatus)
    }

    // Supplier filter (matched by supplierId from master data)
    if (selectedSupplier !== 'all') {
      result = result.filter(r => r.supplierId === selectedSupplier)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p =>
        p.debitNoteNo?.toLowerCase().includes(q) ||
        p.supplierName?.toLowerCase().includes(q)
      )
    }

    return result
  }, [periodReturns, selectedType, selectedStatus, selectedSupplier, searchQuery])

  // Card drill-down layered on top of the filtered base, then committed to the
  // paginated list state.
  useEffect(() => {
    let result = [...statsBaseReturns]
    if (cardFilter === 'short-billing') {
      result = result.filter(r => /short/i.test(r.reason || ''))
    } else if (cardFilter === 'settled') {
      result = result.filter(r => /settl/i.test(r.status || ''))
    }
    setPastReturns(result)
    setCurrentPage(1)
  }, [statsBaseReturns, cardFilter])

  // Active filters count + clear ("all" / All Time is the default baseline)
  const activeFilterCount = [
    period !== 'all' ? period : '',
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom, dateTo,
    selectedType !== 'all' ? selectedType : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedSupplier !== 'all' ? selectedSupplier : '',
    statusTab !== 'all' ? statusTab : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('all')
    setCardFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedType('all')
    setSelectedStatus('all')
    setSelectedSupplier('all')
    setSelectedSupplierName('')
    setStatusTab('all')
  }

  const tabCounts = useMemo(() => ({
    all: pastReturns.length,
    PENDING: pastReturns.filter(r => (r.status || '').toUpperCase() !== 'SETTLED').length,
    SETTLED: pastReturns.filter(r => (r.status || '').toUpperCase() === 'SETTLED').length,
  }), [pastReturns])

  const tabFilteredReturns = useMemo(() => {
    if (statusTab === 'all') return pastReturns
    if (statusTab === 'PENDING') return pastReturns.filter(r => (r.status || '').toUpperCase() !== 'SETTLED')
    return pastReturns.filter(r => (r.status || '').toUpperCase() === statusTab)
  }, [pastReturns, statusTab])

  const totalPages = Math.max(1, Math.ceil(tabFilteredReturns.length / pageSize))
  const paginatedReturns = tabFilteredReturns.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // ── Summary stats ── (reflect period + type + status + supplier + search, but
  // NOT the card drill-down — so clicking a card never rewrites its own total)
  const stats = useMemo(() => {
    const isShortBilling = (r: ApiReturn) => /short/i.test(r.reason || '')
    const isSettled = (r: ApiReturn) => /settl/i.test(r.status || '')
    const totalAmount = statsBaseReturns.reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    const shortBillingCount = statsBaseReturns.filter(isShortBilling).length
    const shortBillingTotal = statsBaseReturns.filter(isShortBilling).reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    const settledCount = statsBaseReturns.filter(isSettled).length
    const settledTotal = statsBaseReturns.filter(isSettled).reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    return {
      totalCount: statsBaseReturns.length,
      totalAmount,
      shortBillingCount,
      shortBillingTotal,
      settledCount,
      settledTotal,
    }
  }, [statsBaseReturns])


  if (effectiveView === 'split') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
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
                  { label: 'Total Notes', value: stats.totalCount.toString(), borderAccent: 'border-l-blue-500' },
                  { label: 'Total Debit', value: formatCurrency(stats.totalAmount), borderAccent: 'border-l-rose-500' },
                  { label: 'Short-Billing', value: formatCurrency(stats.shortBillingTotal), borderAccent: 'border-l-amber-500' },
                  { label: 'Settled', value: formatCurrency(stats.settledTotal), borderAccent: 'border-l-emerald-500' },
                ] as const).map((s) => (
                  <Card key={s.label} className={cn('border-l-[3px]', s.borderAccent)}>
                    <CardContent className="flex items-center gap-2 px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                        <p className="font-mono text-sm font-bold leading-tight">{s.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="w-40 min-w-35">
            <EnumSelect value={period} onValueChange={onPeriodChange} onClear={() => onPeriodChange('all')} options={PERIOD_OPTIONS} />
          </div>
          <ExportMenu
            title="Debit Notes"
            filename="debit-notes"
            noun="debit note"
            rows={() => pastReturns.map(dn => ({
              'Note #': dn.debitNoteNo,
              Date: formatDate(dn.date),
              Supplier: dn.supplierName,
              Type: /short/i.test(dn.reason || '') ? 'Short-Billing' : 'Goods Returned',
              PE: dn.grn?.grnNumber ?? '',
              Amount: Number(dn.totalAmount),
              Status: dn.status,
            }))}
          />
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
              title={splitShowStats ? 'Hide stats' : 'Show stats'}
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
          <Button size="sm" onClick={() => navigate('/purchase/returns')}>
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">New Return</span>
          </Button>
          <ViewModeToggle view="split" onViewChange={(v) => { if (v === 'table') exitSplitView() }} />
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
                  <EnumSelect label="Type" value={selectedType} onValueChange={setSelectedType} onClear={() => setSelectedType('all')} options={TYPE_OPTIONS} />
                  <EnumSelect label="Status" value={selectedStatus} onValueChange={setSelectedStatus} onClear={() => setSelectedStatus('all')} options={STATUS_OPTIONS} />
                  <SupplierSearchSelect value={selectedSupplier} selectedName={selectedSupplierName} onChange={(val, name) => { setSelectedSupplier(val); setSelectedSupplierName(name) }} />
                  {period === 'custom' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                        <DatePicker value={dateFrom} onChange={setDateFrom} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                        <DatePicker value={dateTo} onChange={setDateTo} />
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
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="mr-1 h-3.5 w-3.5" />Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Split view */}
        <div className="min-h-0 flex-1">
          <DebitNoteSplitView
            debitNotes={tabFilteredReturns}
            loading={returnsLoading}
            selectedDebitNoteId={selectedDebitNoteId}
            onSelectDebitNote={selectDebitNote}
            onExitSplitView={exitSplitView}
            onRefresh={fetchReturns}
            isCardFieldVisible={cardCols.isVisible}
            tabsNode={
              <DebitNoteStatusTabs
                tab={statusTab}
                onChange={(t) => { setStatusTab(t); setCurrentPage(1) }}
                counts={tabCounts}
              />
            }
          />
        </div>
      </div>
    )
  }

  // On mobile the whole page scrolls naturally (cards flow full-length); from
  // md+ it's a fixed-height "compact shell" whose table body scrolls internally
  // while the summary / filter / tabs stay pinned.
  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex flex-col md:h-content-viewport md:overflow-hidden">

      {/* ── Content ── */}
      <div className="flex-1 bg-muted/20 md:overflow-hidden">
        {/* ── List View ── */}
        <div className="flex flex-col md:h-full">
            {/* Summary cards — click Short-Billing / Settled to drill the list */}
            <div className="grid grid-cols-2 gap-3 border-b border-border/40 bg-background px-4 py-4 sm:px-6 lg:grid-cols-4">
              {([
                {
                  label: 'Total Notes',
                  value: stats.totalCount.toString(),
                  subtitle: 'this period',
                  icon: Receipt,
                  iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                  borderAccent: 'border-l-blue-500',
                  filterKey: 'all',
                  activeRing: 'ring-2 ring-blue-500/50',
                },
                {
                  label: 'Total Debit',
                  value: formatCurrency(stats.totalAmount),
                  subtitle: 'issued to suppliers',
                  icon: IndianRupee,
                  iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                  borderAccent: 'border-l-rose-500',
                  filterKey: 'all',
                  activeRing: 'ring-2 ring-rose-500/50',
                },
                {
                  label: 'Short-Billing',
                  value: formatCurrency(stats.shortBillingTotal),
                  subtitle: `${stats.shortBillingCount} note${stats.shortBillingCount !== 1 ? 's' : ''}`,
                  icon: AlertTriangle,
                  iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  borderAccent: 'border-l-amber-500',
                  filterKey: 'short-billing',
                  activeRing: 'ring-2 ring-amber-500/50',
                },
                {
                  label: 'Settled',
                  value: formatCurrency(stats.settledTotal),
                  subtitle: `${stats.settledCount} settled`,
                  icon: CheckCircle2,
                  iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  borderAccent: 'border-l-emerald-500',
                  filterKey: 'settled',
                  activeRing: 'ring-2 ring-emerald-500/50',
                },
              ] as const).map((s) => {
                const active = s.filterKey !== 'all' && cardFilter === s.filterKey
                return (
                <Card
                  key={s.label}
                  hover
                  role="button"
                  tabIndex={0}
                  title={s.filterKey === 'all' ? 'Show all debit notes in this period' : `Filter list to ${s.label.toLowerCase()}`}
                  onClick={() => { setCardFilter(active ? 'all' : (s.filterKey as 'all' | 'short-billing' | 'settled')); setCurrentPage(1) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : (s.filterKey as 'all' | 'short-billing' | 'settled')); setCurrentPage(1) } }}
                  className={cn('border-l-[3px] cursor-pointer transition-shadow', s.borderAccent, active && s.activeRing)}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.iconBg)}>
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                      <p className="text-base font-bold font-mono leading-tight">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.subtitle}</p>
                    </div>
                  </CardContent>
                </Card>
                )
              })}
            </div>

            {/* Search bar + filters + actions */}
            <div className="border-b border-border/40 bg-background/60 px-4 py-3 sm:px-6 backdrop-blur-sm">
              <DataTableFilterBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search by note number or supplier..."
                resultsCount={tabFilteredReturns.length}
                activeFilterCount={activeFilterCount}
                open={tableFiltersOpen}
                onOpenChange={setTableFiltersOpen}
                onClearFilters={clearFilters}
                leadingNode={
                  <div className="w-full sm:w-40">
                    <EnumSelect
                      value={period}
                      onValueChange={onPeriodChange}
                      // Clear = remove the date restriction → All Time (was resetting
                      // to the same 'today' value, so the X did nothing).
                      onClear={() => onPeriodChange('all')}
                      options={PERIOD_OPTIONS}
                    />
                  </div>
                }
                actionNode={
                  <div className="flex w-full items-center gap-1.5 sm:w-auto">
                  <ExportMenu
                    className="flex-1 sm:w-auto sm:flex-none"
                    title="Debit Notes"
                    filename="debit-notes"
                    noun="debit note"
                    rows={() => tabFilteredReturns.map(dn => ({
                      'Note #': dn.debitNoteNo,
                      Date: formatDate(dn.date),
                      Supplier: dn.supplierName,
                      Type: /short/i.test(dn.reason || '') ? 'Short-Billing' : 'Goods Returned',
                      PE: dn.grn?.grnNumber ?? '',
                      Amount: Number(dn.totalAmount),
                      Status: dn.status,
                    }))}
                  />
                  <ViewModeToggle view="table" onViewChange={(v) => { if (v === 'split') navigate('/purchase/debit-notes') }} />
                  <Button
                    size="sm"
                    className="flex-1 sm:w-auto sm:flex-none"
                    onClick={() => navigate('/purchase/returns')}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    <span className="hidden sm:inline">New Return</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                  </div>
                }
              >
                {/* All filters + custom date pickers on one flex-wrap row */}
                <div className="col-span-full flex flex-wrap items-end gap-4">
                  <div className="min-w-40 flex-1">
                    <EnumSelect
                      label="Type"
                      value={selectedType}
                      onValueChange={setSelectedType}
                      onClear={() => setSelectedType('all')}
                      options={TYPE_OPTIONS}
                    />
                  </div>

                  <div className="min-w-40 flex-1">
                    <EnumSelect
                      label="Status"
                      value={selectedStatus}
                      onValueChange={setSelectedStatus}
                      onClear={() => setSelectedStatus('all')}
                      options={STATUS_OPTIONS}
                    />
                  </div>

                  <div className="w-full sm:w-auto sm:min-w-40 sm:flex-1">
                    <SupplierSearchSelect
                      value={selectedSupplier}
                      selectedName={selectedSupplierName}
                      onChange={(val, name) => { setSelectedSupplier(val); setSelectedSupplierName(name) }}
                    />
                  </div>

                  {/* Custom date range — full width below sm forces its own dedicated row (never squeezed alongside another field) so both pickers stay usable; sm+ reverts to flex-1 so desktop layout is unchanged */}
                  {period === 'custom' && (
                    <div className="w-full sm:w-auto sm:min-w-40 sm:flex-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Date From
                          </Label>
                          <DatePicker value={dateFrom} onChange={setDateFrom} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Date To
                          </Label>
                          <DatePicker value={dateTo} onChange={setDateTo} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Columns — kept inside this flex row so it sits inline with the
                      filters instead of wrapping to a second line (the shared
                      columnsNode slot would land in a new grid row). */}
                  <div className="flex shrink-0 flex-col justify-end gap-1.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</Label>
                    <ColumnsToggle columns={DEBIT_NOTE_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />
                  </div>
                </div>
              </DataTableFilterBar>
            </div>

            {/* ── Status Tabs ── */}
            <DebitNoteStatusTabs
              tab={statusTab}
              onChange={(t) => { setStatusTab(t); setCurrentPage(1) }}
              counts={tabCounts}
            />

            <div className="p-3 md:flex-1 md:overflow-auto md:p-6">
              {returnsLoading ? (
                <div className="flex h-64 items-center justify-center md:h-full">
                  <div className="flex flex-col items-center gap-2">
                    <RotateCcw className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Loading debit notes...</p>
                  </div>
                </div>
              ) : tabFilteredReturns.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center bg-background/50">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">
                    {searchQuery ? 'No results found' : 'No debit notes yet'}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {searchQuery
                      ? `No notes match "${searchQuery}"`
                      : "Create a purchase return to generate your first debit note."}
                  </p>
                  {!searchQuery && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/purchase/returns')}>
                      Create Purchase Return
                    </Button>
                  )}
                </div>
              ) : (
                <Card className="overflow-x-auto border-border/40 shadow-sm">
                  {/* Mobile card list */}
                  <div className="md:hidden">
                    <div className="divide-y divide-border/40">
                      {paginatedReturns.map((pr) => (
                        <div
                          key={pr.id}
                          className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => navigate(`/purchase/debit-notes/detail?id=${pr.id}`)}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            {cols.isVisible('noteNumber') && <p className="font-mono text-xs font-bold text-primary">{pr.debitNoteNo}</p>}
                            <p
                              role="link"
                              tabIndex={0}
                              title="View supplier details"
                              className="truncate text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${pr.supplierId}`) }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${pr.supplierId}`) } }}
                            >{pr.supplierName}</p>
                            {cols.isVisible('type') && (
                              <div className="pt-0.5">
                                {/short.*delivery|short.*supply/i.test(pr.reason ?? '') ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/70 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                    Short-Billing
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    Goods returned
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {cols.isVisible('status') && (
                                <Badge
                                  variant={pr.status === 'SETTLED' ? 'success' : pr.status === 'SENT' ? 'info' : 'secondary'}
                                  size="sm"
                                  dot
                                >
                                  {pr.status}
                                </Badge>
                              )}
                              {cols.isVisible('date') && <span className="text-xs text-muted-foreground">{formatDate(pr.date)}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            {cols.isVisible('amount') && (
                              <span className="font-mono font-semibold text-sm text-rose-600 dark:text-rose-400">
                                {formatCurrency(pr.totalAmount)}
                              </span>
                            )}
                            {cols.isVisible('pe') && <span className="text-xs text-muted-foreground">{pr.grn?.grnNumber ?? 'Direct'}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        {cols.isVisible('date') && <TableHead className="w-27.5">Date</TableHead>}
                        <TableHead>Supplier</TableHead>
                        {cols.isVisible('noteNumber') && <TableHead className="w-47.5">Note Number</TableHead>}
                        {cols.isVisible('type') && <TableHead className="w-30">Type</TableHead>}
                        {cols.isVisible('pe') && <TableHead className="whitespace-nowrap">PE</TableHead>}
                        {cols.isVisible('amount') && <TableHead className="text-right w-30">Amount</TableHead>}
                        {cols.isVisible('status') && <TableHead className="w-25">Status</TableHead>}
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-background">
                      {paginatedReturns.map((pr) => (
                        <TableRow
                          key={pr.id}
                          className="group cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => navigate(`/purchase/debit-notes/detail?id=${pr.id}`)}
                        >
                          {cols.isVisible('date') && <TableCell className="text-xs text-muted-foreground">{formatDate(pr.date)}</TableCell>}
                          <TableCell className="text-sm font-bold">
                            <span
                              role="link"
                              tabIndex={0}
                              title="View supplier details"
                              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${pr.supplierId}`) }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${pr.supplierId}`) } }}
                            >{pr.supplierName}</span>
                          </TableCell>
                          {cols.isVisible('noteNumber') && <TableCell className="font-mono text-xs font-bold text-primary">{pr.debitNoteNo}</TableCell>}
                          {cols.isVisible('type') && (
                          <TableCell>
                            {/short.*delivery|short.*supply/i.test(pr.reason ?? '') ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/70 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                Short-Billing
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                Goods returned
                              </span>
                            )}
                          </TableCell>
                          )}
                          {cols.isVisible('pe') && <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{pr.grn?.grnNumber ?? '—'}</TableCell>}
                          {cols.isVisible('amount') && (
                          <TableCell className="text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                            {formatCurrency(pr.totalAmount)}
                          </TableCell>
                          )}
                          {cols.isVisible('status') && (
                          <TableCell>
                            <Badge
                              variant={
                                pr.status === 'SETTLED' ? 'success' :
                                pr.status === 'SENT' ? 'info' :
                                'secondary'
                              }
                              size="sm"
                              dot
                            >
                              {pr.status}
                            </Badge>
                          </TableCell>
                          )}
                          <TableCell className="text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  <DataTablePagination
                     currentPage={currentPage}
                     totalPages={totalPages}
                     onPageChange={setCurrentPage}
                     totalItems={pastReturns.length}
                     itemsPerPage={pageSize}
                     pageSize={pageSize}
                     onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
                     className="border-t border-border/40 px-4"
                   />
                </Card>
              )}
            </div>
          </div>
      </div>

    </div>
  )
}