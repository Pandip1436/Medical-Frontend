import { useState, useCallback, useEffect, useMemo } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import { usePersistedState } from '@/hooks/usePersistedState'
import {
  ChevronRight,
  FileText,
  RotateCcw,
  Plus,
  CheckCircle2,
  Receipt,
  IndianRupee,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { PaginatedSelect } from '@/components/shared/PaginatedSelect'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { toast } from 'sonner'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { useMasterDataStore } from '@/stores/masterDataStore'

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
type ApiReturn = {
  id: string; debitNoteNo: string; date: string;
  supplierId: string; supplierName: string;
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

const DEBIT_NOTE_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'supplier', label: 'Supplier', required: true, defaultVisible: true },
  { id: 'noteNumber', label: 'Note Number', defaultVisible: true },
  { id: 'type', label: 'Type', defaultVisible: true },
  { id: 'pe', label: 'PE', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

export default function DebitNotesPage() {
  const cols = useColumnVisibility('purchase.debitNotes', DEBIT_NOTE_COLUMNS)
  const [pastReturns, setPastReturns] = useState<ApiReturn[]>([])
  const [allReturns, setAllReturns] = useState<ApiReturn[]>([])
  const [returnsLoading, setReturnsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = usePersistedState('filters:purchase.debitNotes:search', '')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // ── Filters (period defaults to "today", mirroring the Invoice List).
  // Persisted to sessionStorage so they survive refresh + navigate-back. ──
  const [period, setPeriod] = usePersistedState('filters:purchase.debitNotes:period', 'today')
  const [dateFrom, setDateFrom] = usePersistedState('filters:purchase.debitNotes:dateFrom', '')
  const [dateTo, setDateTo] = usePersistedState('filters:purchase.debitNotes:dateTo', '')
  const [selectedType, setSelectedType] = usePersistedState('filters:purchase.debitNotes:type', 'all')
  const [selectedStatus, setSelectedStatus] = usePersistedState('filters:purchase.debitNotes:status', 'all')
  const [selectedSupplier, setSelectedSupplier] = usePersistedState('filters:purchase.debitNotes:supplier', 'all')
  // Stat-card drill-down: clicking a summary card narrows the list to that
  // subset (short-billing / settled) on top of the period. Kept separate from
  // the Type/Status enum filters so a card click and the dropdowns can coexist.
  const [cardFilter, setCardFilter] = usePersistedState<'all' | 'short-billing' | 'settled'>('filters:purchase.debitNotes:card', 'all')

  // Master data — Supplier filter pulls from the full suppliers list
  const { suppliers, fetchMasterData } = useMasterDataStore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])

  // Deep-link support: the detail is now its own page. Legacy links that land
  // on the list with `?id=<id>` (Supplier Detail → Debit Notes tab,
  // notifications) redirect to the standalone detail page.
  const { search } = useRoute()
  useEffect(() => {
    const target = new URLSearchParams(search).get('id')
    // `replace` so the intermediate `?id=` URL never lands in the back stack —
    // otherwise Back returns here and immediately re-redirects ("press back
    // twice" bug).
    if (target) navigate(`/purchase/debit-notes/detail?id=${target}`, { replace: true })
  }, [search])

  const supplierFetcher = useCallback(
    async ({ skip, take, query }: { skip: number; take: number; query: string }) => {
      const params = new URLSearchParams({ skip: String(skip), take: String(take) })
      if (query) params.set('q', query)
      const res = await api.get(`/suppliers?${params.toString()}`)
      const payload = res.data
      const items = (payload?.data ?? []) as Array<{ id: string; name: string }>
      return {
        data: items.map((s) => ({ value: s.id, label: s.name })),
        hasMore: Boolean(payload?.hasMore),
      }
    },
    [],
  )

  const selectedSupplierLabel = useMemo(() => {
    if (selectedSupplier === 'all' || !selectedSupplier) return undefined
    return suppliers.find((s) => s.id === selectedSupplier)?.name
  }, [selectedSupplier, suppliers])

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
        const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
        result = result.filter(r => r.date?.slice(0, 10) >= weekAgo.toISOString().slice(0, 10))
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

  // Client-side card drill-down + search + filters (on top of the period base)
  useEffect(() => {
    let result = [...periodReturns]

    // Stat-card drill-down
    if (cardFilter === 'short-billing') {
      result = result.filter(r => /short/i.test(r.reason || ''))
    } else if (cardFilter === 'settled') {
      result = result.filter(r => /settl/i.test(r.status || ''))
    }

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

    setPastReturns(result)
    setCurrentPage(1)
  }, [searchQuery, periodReturns, cardFilter, selectedType, selectedStatus, selectedSupplier])

  // Active filters count + clear ("today" is the default baseline)
  const activeFilterCount = [
    period !== 'today' ? period : '',
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom, dateTo,
    selectedType !== 'all' ? selectedType : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedSupplier !== 'all' ? selectedSupplier : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('today')
    setCardFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedType('all')
    setSelectedStatus('all')
    setSelectedSupplier('all')
  }

  const totalPages = Math.max(1, Math.ceil(pastReturns.length / PAGE_SIZE))
  const paginatedReturns = pastReturns.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ── Summary stats ── (reflect the selected period, independent of card/list filters)
  const stats = useMemo(() => {
    const isShortBilling = (r: ApiReturn) => /short/i.test(r.reason || '')
    const isSettled = (r: ApiReturn) => /settl/i.test(r.status || '')
    const totalAmount = periodReturns.reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    const shortBillingCount = periodReturns.filter(isShortBilling).length
    const shortBillingTotal = periodReturns.filter(isShortBilling).reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    const settledCount = periodReturns.filter(isSettled).length
    const settledTotal = periodReturns.filter(isSettled).reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    return {
      totalCount: periodReturns.length,
      totalAmount,
      shortBillingCount,
      shortBillingTotal,
      settledCount,
      settledTotal,
    }
  }, [periodReturns])


  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden bg-muted/20">
        {/* ── List View ── */}
        <div className="flex flex-col h-full">
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
                resultsCount={pastReturns.length}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
                columnsNode={<ColumnsToggle columns={DEBIT_NOTE_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
                actionNode={
                  <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => navigate('/purchase/returns')}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    <span className="hidden sm:inline">New Return</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                  </div>
                }
              >
                {/* Custom equal-width grid that overrides DataTableFilterBar's inner grid */}
                <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <EnumSelect
                    label="Period"
                    value={period}
                    onValueChange={setPeriod}
                    onClear={() => setPeriod('today')}
                    options={PERIOD_OPTIONS}
                  />

                  <EnumSelect
                    label="Type"
                    value={selectedType}
                    onValueChange={setSelectedType}
                    onClear={() => setSelectedType('all')}
                    options={TYPE_OPTIONS}
                  />

                  <EnumSelect
                    label="Status"
                    value={selectedStatus}
                    onValueChange={setSelectedStatus}
                    onClear={() => setSelectedStatus('all')}
                    options={STATUS_OPTIONS}
                  />

                  <PaginatedSelect
                    label="Supplier"
                    value={selectedSupplier}
                    onValueChange={setSelectedSupplier}
                    onClear={() => setSelectedSupplier('all')}
                    fetcher={supplierFetcher}
                    pinnedOption={{ value: 'all', label: 'All Suppliers' }}
                    selectedLabel={selectedSupplierLabel}
                    pageSize={10}
                  />

                  {/* Custom date range — only when period is 'custom' */}
                  {period === 'custom' && (
                    <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/40 pt-4 mt-1">
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
                  )}
                </div>
              </DataTableFilterBar>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {returnsLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <RotateCcw className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Loading debit notes...</p>
                  </div>
                </div>
              ) : pastReturns.length === 0 ? (
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
                            <p className="font-mono text-xs font-bold text-primary">{pr.debitNoteNo}</p>
                            <p
                              role="link"
                              tabIndex={0}
                              title="View supplier details"
                              className="truncate text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${pr.supplierId}`) }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${pr.supplierId}`) } }}
                            >{pr.supplierName}</p>
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              <Badge
                                variant={pr.status === 'SETTLED' ? 'success' : pr.status === 'SENT' ? 'info' : 'secondary'}
                                size="sm"
                                dot
                              >
                                {pr.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatDate(pr.date)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <span className="font-mono font-semibold text-sm text-rose-600 dark:text-rose-400">
                              {formatCurrency(pr.totalAmount)}
                            </span>
                            <span className="text-xs text-muted-foreground">{pr.grn?.grnNumber ?? 'Direct'}</span>
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
                     itemsPerPage={PAGE_SIZE}
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
