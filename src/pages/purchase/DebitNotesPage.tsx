import { useState, useCallback, useEffect, useMemo } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import {
  ChevronRight,
  FileText,
  RotateCcw,
  Plus,
  Printer,
  Download,
  CheckCircle2,
  Receipt,
  IndianRupee,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
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
import { printDebitNotePdf, downloadDebitNotePdf } from '@/lib/pdf/notesPdf'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { useSettingsStore } from '@/stores/settingsStore'
import { useMasterDataStore } from '@/stores/masterDataStore'

// ─────────────────────────────────────────────────────────────
// DEBIT NOTES HISTORY PAGE
// ─────────────────────────────────────────────────────────────

// Minimal API row + UI detail shape — kept loose because the API returns a
// nested object graph we don't fully type elsewhere.
type ApiReturnItem = {
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
type ReturnDetail = {
  id: string; noteNo: string; date: string;
  partyName: string; supplierId: string;
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

export default function DebitNotesPage() {
  const businessProfile = useSettingsStore(s => s.businessProfile)
  const [pastReturns, setPastReturns] = useState<ApiReturn[]>([])
  const [allReturns, setAllReturns] = useState<ApiReturn[]>([])
  const [returnsLoading, setReturnsLoading] = useState(true)
  const [selectedReturnDetails, setSelectedReturnDetails] = useState<ReturnDetail | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // ── Filters ──
  const [period, setPeriod] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')

  // Master data — Supplier filter pulls from the full suppliers list
  const { suppliers, fetchMasterData } = useMasterDataStore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])

  // Deep-link support: open the debit-note drawer when arrived with `?id=<id>`
  // (e.g. from the Supplier Detail page's Debit Notes tab). Builds the same
  // ReturnDetail shape used by the row click handler so the drawer fields all
  // populate identically.
  const { search } = useRoute()
  useEffect(() => {
    const params = new URLSearchParams(search)
    const target = params.get('id')
    if (!target || allReturns.length === 0) return
    if (selectedReturnDetails?.id === target) return
    const pr = allReturns.find((r) => r.id === target)
    if (!pr) return
    setSelectedReturnDetails({
      id: pr.id,
      noteNo: pr.debitNoteNo,
      date: pr.date,
      partyName: pr.supplierName,
      supplierId: pr.supplierId,
      referenceValue: pr.grn?.grnNumber ?? 'Direct',
      reason: pr.reason,
      items: pr.items,
      grnItems: pr.grn?.items ?? [],
      subtotal: pr.subtotal,
      cgst: pr.cgst,
      sgst: pr.sgst,
      totalAmount: pr.totalAmount,
      status: pr.status,
      settlementMode: pr.settlementMode ?? 'REFUND',
      replacementGrnId: pr.replacementGrnId ?? null,
      notes: pr.notes,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, allReturns])

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

  // Client-side search + filters
  useEffect(() => {
    let result = [...allReturns]

    // Period filter
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

    // Amount range
    if (amountMin) result = result.filter(r => Number(r.totalAmount || 0) >= parseFloat(amountMin))
    if (amountMax) result = result.filter(r => Number(r.totalAmount || 0) <= parseFloat(amountMax))

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
  }, [searchQuery, allReturns, period, dateFrom, dateTo, selectedType, selectedStatus, selectedSupplier, amountMin, amountMax])

  // Active filters count + clear
  const activeFilterCount = [
    period !== 'all' ? period : '',
    dateFrom, dateTo,
    selectedType !== 'all' ? selectedType : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedSupplier !== 'all' ? selectedSupplier : '',
    amountMin, amountMax,
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    setSelectedType('all')
    setSelectedStatus('all')
    setSelectedSupplier('all')
    setAmountMin('')
    setAmountMax('')
  }

  const totalPages = Math.max(1, Math.ceil(pastReturns.length / PAGE_SIZE))
  const paginatedReturns = pastReturns.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ── Summary stats ──
  const stats = useMemo(() => {
    const isShortBilling = (r: ApiReturn) => /short/i.test(r.reason || '')
    const isSettled = (r: ApiReturn) => /settl/i.test(r.status || '')
    const totalAmount = allReturns.reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    const shortBillingCount = allReturns.filter(isShortBilling).length
    const shortBillingTotal = allReturns.filter(isShortBilling).reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    const settledCount = allReturns.filter(isSettled).length
    const settledTotal = allReturns.filter(isSettled).reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    return {
      totalCount: allReturns.length,
      totalAmount,
      shortBillingCount,
      shortBillingTotal,
      settledCount,
      settledTotal,
    }
  }, [allReturns])

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedReturnDetails) return
    try {
      await api.patch(`/purchase-returns/${selectedReturnDetails.id}`, { status: newStatus })
      toast.success(`Debit Note marked as ${newStatus}`)
      setSelectedReturnDetails((prev) => prev ? { ...prev, status: newStatus } : prev)
      fetchReturns()
    } catch {
      toast.error('Failed to update status')
    }
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden bg-muted/20">
        {/* ── List View ── */}
        <div className="flex flex-col h-full">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 border-b border-border/40 bg-background px-4 py-4 sm:px-6 lg:grid-cols-4">
              {[
                {
                  label: 'Total Notes',
                  value: stats.totalCount.toString(),
                  subtitle: 'all time',
                  icon: Receipt,
                  iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                  borderAccent: 'border-l-blue-500',
                },
                {
                  label: 'Total Debit',
                  value: formatCurrency(stats.totalAmount),
                  subtitle: 'issued to suppliers',
                  icon: IndianRupee,
                  iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                  borderAccent: 'border-l-rose-500',
                },
                {
                  label: 'Short-Billing',
                  value: formatCurrency(stats.shortBillingTotal),
                  subtitle: `${stats.shortBillingCount} note${stats.shortBillingCount !== 1 ? 's' : ''}`,
                  icon: AlertTriangle,
                  iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  borderAccent: 'border-l-amber-500',
                },
                {
                  label: 'Settled',
                  value: formatCurrency(stats.settledTotal),
                  subtitle: `${stats.settledCount} settled`,
                  icon: CheckCircle2,
                  iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  borderAccent: 'border-l-emerald-500',
                },
              ].map((s) => (
                <Card key={s.label} hover className={cn('border-l-[3px]', s.borderAccent)}>
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
              ))}
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
                actionNode={
                  <Button
                    size="sm"
                    className="shrink-0 bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
                    onClick={() => navigate('/purchase/returns')}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    <span className="hidden sm:inline">New Return</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                }
              >
                {/* Custom equal-width grid that overrides DataTableFilterBar's inner grid */}
                <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <EnumSelect
                    label="Period"
                    value={period}
                    onValueChange={setPeriod}
                    onClear={() => setPeriod('all')}
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

                  {/* Amount range */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Amount Range
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={amountMin}
                        onChange={(e) => setAmountMin(e.target.value)}
                        className="w-full"
                      />
                      <span className="text-muted-foreground text-xs">-</span>
                      <Input
                        type="number"
                        placeholder="Max"
                        value={amountMax}
                        onChange={(e) => setAmountMax(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

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
                          onClick={() => setSelectedReturnDetails({
                            id: pr.id,
                            noteNo: pr.debitNoteNo,
                            date: pr.date,
                            partyName: pr.supplierName,
                            supplierId: pr.supplierId,
                            referenceValue: pr.grn?.grnNumber ?? 'Direct',
                            reason: pr.reason,
                            items: pr.items,
                            grnItems: pr.grn?.items ?? [],
                            subtotal: pr.subtotal,
                            cgst: pr.cgst,
                            sgst: pr.sgst,
                            totalAmount: pr.totalAmount,
                            status: pr.status,
                            settlementMode: pr.settlementMode ?? 'REFUND',
                            replacementGrnId: pr.replacementGrnId ?? null,
                            notes: pr.notes,
                          })}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="font-mono text-xs font-bold text-primary">{pr.debitNoteNo}</p>
                            <p className="truncate text-sm font-medium">{pr.supplierName}</p>
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
                        <TableHead className="w-47.5">Note Number</TableHead>
                        <TableHead className="w-30">Type</TableHead>
                        <TableHead className="w-27.5">Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="whitespace-nowrap">GRN</TableHead>
                        <TableHead className="text-right w-30">Amount</TableHead>
                        <TableHead className="w-25">Status</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-background">
                      {paginatedReturns.map((pr) => (
                        <TableRow
                          key={pr.id}
                          className="group cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => setSelectedReturnDetails({
                            id: pr.id,
                            noteNo: pr.debitNoteNo,
                            date: pr.date,
                            partyName: pr.supplierName,
                            supplierId: pr.supplierId,
                            referenceValue: pr.grn?.grnNumber ?? 'Direct',
                            reason: pr.reason,
                            items: pr.items,
                            grnItems: pr.grn?.items ?? [],
                            subtotal: pr.subtotal,
                            cgst: pr.cgst,
                            sgst: pr.sgst,
                            totalAmount: pr.totalAmount,
                            status: pr.status,
                            settlementMode: pr.settlementMode ?? 'REFUND',
                            replacementGrnId: pr.replacementGrnId ?? null,
                            notes: pr.notes,
                          })}
                        >
                          <TableCell className="font-mono text-xs font-bold text-primary">{pr.debitNoteNo}</TableCell>
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
                          <TableCell className="text-xs text-muted-foreground">{formatDate(pr.date)}</TableCell>
                          <TableCell className="font-medium text-sm">{pr.supplierName}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{pr.grn?.grnNumber ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                            {formatCurrency(pr.totalAmount)}
                          </TableCell>
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

      {/* ── Detail Drawer ── */}
      <Sheet open={!!selectedReturnDetails} onOpenChange={(open) => { if (!open) setSelectedReturnDetails(null) }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-160 lg:max-w-190 p-0 gap-0 flex flex-col"
        >
          {selectedReturnDetails && (() => {
            const d = selectedReturnDetails
            const settlementMode = d.settlementMode ?? 'REFUND'
            const isReplacement = settlementMode === 'REPLACEMENT'
            const isSettled = d.status === 'SETTLED'
            const hasReplacementGrn = !!d.replacementGrnId
            const displaySettlement = isSettled
              ? settlementMode === 'REFUND'
                ? 'Money Refunded'
                : settlementMode === 'REPLACEMENT'
                  ? 'Replacement Received'
                  : 'Adjusted against Outstanding'
              : settlementMode === 'REFUND'
                ? 'Pending Refund'
                : settlementMode === 'REPLACEMENT'
                  ? (hasReplacementGrn ? 'Replacement GRN Received' : 'Awaiting Replacement')
                  : settlementMode === 'ADJUST'
                    ? 'Pending Adjustment'
                    : 'Pending'

            const pdfData = {
              noteNo: d.noteNo,
              date: d.date,
              partyLabel: 'Supplier',
              partyName: d.partyName,
              referenceLabel: 'GRN No',
              referenceValue: d.referenceValue,
              reason: d.reason,
              items: (d.items || []).map((it) => ({
                productName: it.productName,
                batchNumber: it.batchNumber,
                expiryDate: it.expiryDate,
                returnedQty: it.returnedQty,
                rate: Number(it.purchaseRate || it.rate || 0),
                gstPercent: Number(it.gstPercent || 0),
                amount: Number(it.amount || 0),
              })),
              subtotal: Number(d.subtotal),
              cgst: d.cgst != null ? Number(d.cgst) : undefined,
              sgst: d.sgst != null ? Number(d.sgst) : undefined,
              totalAmount: Number(d.totalAmount),
              footerLine: `Settlement: ${displaySettlement}`,
              company: businessProfile ? {
                name: businessProfile.name,
                address: businessProfile.address,
                phone: businessProfile.phone,
                email: businessProfile.email,
                gstin: businessProfile.gstin,
              } : undefined,
            }

            return (
              <>
                {/* ── Sticky Header ── */}
                <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                  <div className="flex items-center justify-between gap-3 pr-8">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <SheetTitle className="font-mono text-base font-semibold truncate">
                        {d.noteNo}
                      </SheetTitle>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(d.date)}
                      </span>
                    </div>
                    <Badge
                      variant={d.status === 'SETTLED' ? 'success' : d.status === 'SENT' ? 'info' : 'secondary'}
                      size="sm"
                      dot
                    >
                      {d.status}
                    </Badge>
                  </div>
                </SheetHeader>

                {/* ── Scrollable Body ── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  {/* Supplier / GRN / Reason / Settlement — single row info strip */}
                  <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Supplier</p>
                      <p className="mt-0.5 text-sm font-medium truncate" title={d.partyName}>{d.partyName}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">GRN Reference</p>
                      <p className="mt-0.5 font-mono text-xs font-medium truncate" title={d.referenceValue}>{d.referenceValue}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Return Reason</p>
                      <p className="mt-0.5 text-sm font-medium truncate" title={d.reason}>{d.reason}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Settlement</p>
                      <p className={cn(
                        'mt-0.5 text-sm font-medium truncate',
                        isSettled ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                      )} title={displaySettlement}>
                        {displaySettlement}
                      </p>
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="overflow-x-auto rounded-xl border border-border/40">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                        <TableRow className="border-b border-border/40 hover:bg-transparent">
                          <TableHead className="h-9 w-10 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Expiry</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">GST%</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(d.items || []).map((it, idx) => {
                          const rate = Number(it.purchaseRate || it.rate || 0)
                          const gst = Number(it.gstPercent || 0)
                          const amount = Number(it.amount) || it.returnedQty * rate
                          return (
                            <TableRow key={idx} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                              <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="px-3 py-2.5 text-sm font-medium">{it.productName}</TableCell>
                              <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{it.batchNumber || '—'}</TableCell>
                              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                {it.expiryDate ? formatDate(it.expiryDate) : '—'}
                              </TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{it.returnedQty}</TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(rate)}</TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{gst}%</TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">
                                {formatCurrency(amount)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* ── Sticky Footer: total + actions ── */}
                <div className="shrink-0 border-t border-border/40 bg-background">
                  <div className="flex items-center justify-between border-b border-border/40 bg-primary/5 px-5 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Debit Amount</p>
                    <p className="font-mono text-base font-bold text-primary">{formatCurrency(d.totalAmount)}</p>
                  </div>
                  <div className="px-5 py-3 flex gap-2">
                    {!isSettled && isReplacement && (
                      <Button
                        className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          const params = new URLSearchParams({
                            replacementReturnId: d.id,
                            supplierId: d.supplierId ?? '',
                            supplierName: d.partyName ?? '',
                          })
                          navigate(`/purchase/grn?${params.toString()}`)
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Receive Replacement
                      </Button>
                    )}
                    {!isSettled && !isReplacement && (
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => handleStatusUpdate('SETTLED')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark as Settled
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => printDebitNotePdf(pdfData)}
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => downloadDebitNotePdf(pdfData)}
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
