import { useState, useCallback, useEffect, useMemo } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import {
  ChevronRight,
  FileText,
  RotateCcw,
  Plus,
  ArrowLeft,
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
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DatePicker } from '@/components/ui/date-picker'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import { printDebitNotePdf, downloadDebitNotePdf } from '@/lib/pdf/notesPdf'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { useSettingsStore } from '@/stores/settingsStore'

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
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')

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
  }, [searchQuery, allReturns, period, dateFrom, dateTo, selectedType, selectedStatus, amountMin, amountMax])

  // Active filters count + clear
  const activeFilterCount = [
    period !== 'all' ? period : '',
    dateFrom, dateTo,
    selectedType !== 'all' ? selectedType : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    amountMin, amountMax,
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    setSelectedType('all')
    setSelectedStatus('all')
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

      {/* ── Header (only shown in detail view — list view header is gone) ── */}
      {selectedReturnDetails && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-background px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSelectedReturnDetails(null)}
              className="text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight font-mono">
                Debit Note — {selectedReturnDetails.noteNo}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Issued to {selectedReturnDetails.partyName}
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => setSelectedReturnDetails(null)}>
            ← Back to List
          </Button>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden bg-muted/20">
        {selectedReturnDetails ? (
          /* ── Detail View ── */
          <ScrollArea className="h-full p-6">
            <div className="mx-auto max-w-4xl space-y-6 pb-12">
              <DebitNoteDetail
                data={selectedReturnDetails}
                onStatusUpdate={handleStatusUpdate}
              />
            </div>
          </ScrollArea>
        ) : (
          /* ── List View ── */
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
                        <TableHead className="w-32.5">GRN</TableHead>
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
                          <TableCell className="font-mono text-xs text-muted-foreground">{pr.grn?.grnNumber ?? '—'}</TableCell>
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
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DEBIT NOTE DETAIL COMPONENT
// ─────────────────────────────────────────────────────────────

function DebitNoteDetail({ data, onStatusUpdate }: { data: ReturnDetail; onStatusUpdate: (s: string) => void }) {
  const businessProfile = useSettingsStore(s => s.businessProfile)

  // settlementMode is a structured field on PurchaseReturn; default to REFUND
  // for legacy rows that predate the column.
  const settlementMode: string = data.settlementMode ?? 'REFUND'

  const isReplacement = settlementMode === 'REPLACEMENT'
  const isSettled = data.status === 'SETTLED'
  const hasReplacementGrn = !!data.replacementGrnId

  const getDisplaySettlement = () => {
    if (isSettled) {
      if (settlementMode === 'REFUND') return 'Money Refunded'
      if (settlementMode === 'REPLACEMENT') return 'Replacement Received'
      return 'Adjusted against Outstanding'
    }
    if (settlementMode === 'REFUND') return 'Pending Refund'
    if (settlementMode === 'REPLACEMENT') return hasReplacementGrn ? 'Replacement GRN Received' : 'Awaiting Replacement'
    if (settlementMode === 'ADJUST') return 'Pending Adjustment'
    return 'Pending'
  }

  const getPdfData = () => ({
    noteNo: data.noteNo,
    date: data.date,
    partyLabel: 'Supplier',
    partyName: data.partyName,
    referenceLabel: 'GRN No',
    referenceValue: data.referenceValue,
    reason: data.reason,
    items: (data.items || []).map((it) => ({
      productName: it.productName,
      batchNumber: it.batchNumber,
      expiryDate: it.expiryDate,
      returnedQty: it.returnedQty,
      rate: Number(it.purchaseRate || it.rate || 0),
      gstPercent: Number(it.gstPercent || 0),
      amount: Number(it.amount || 0)
    })),
    subtotal: Number(data.subtotal),
    cgst: data.cgst != null ? Number(data.cgst) : undefined,
    sgst: data.sgst != null ? Number(data.sgst) : undefined,
    totalAmount: Number(data.totalAmount),
    footerLine: `Settlement: ${getDisplaySettlement()}`,
    company: businessProfile ? {
      name: businessProfile.name,
      address: businessProfile.address,
      phone: businessProfile.phone,
      email: businessProfile.email,
      gstin: businessProfile.gstin,
    } : undefined,
  })

  return (
    <Card className="overflow-x-auto border-border/40 shadow-xl flex flex-col md:flex-row min-h-150">
      {/* Left: Note details */}
      <div className="flex-1 flex flex-col border-r border-border/30">
        <div className="shrink-0 bg-linear-to-br from-primary/10 via-background to-background p-6 border-b border-border/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Debit Note</p>
              <h2 className="mt-1 font-mono text-2xl font-black tracking-tighter">{data.noteNo}</h2>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{formatDate(data.date)}</p>
                <Badge
                  variant={data.status === 'SETTLED' ? 'success' : data.status === 'SENT' ? 'info' : 'secondary'}
                  size="sm"
                  dot
                >
                  {data.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GRN Reference</p>
              <p className="font-mono text-sm font-bold">{data.referenceValue}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Supplier / Payee</p>
              <p className="text-lg font-bold text-foreground/80">{data.partyName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Return Reason</p>
              <p className="text-sm font-medium">{data.reason}</p>
            </div>
            <div>
               <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Settlement</p>
               <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                 {getDisplaySettlement()}
               </p>
             </div>
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-100">
          <div className="p-6">
            <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 rounded-lg bg-muted/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 backdrop-blur-sm">
              <div className="col-span-6">Product</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-4 text-right">Amount</div>
            </div>
            <div className="mt-2 space-y-1">
              {(data.items || []).map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 rounded-lg hover:bg-muted/30 px-4 py-3 items-center text-sm transition-colors border-b border-border/10 last:border-0"
                >
                  <div className="col-span-6">
                    <p className="font-bold text-foreground/80">{it.productName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono opacity-60">Batch: {it.batchNumber}</p>
                  </div>
                  <div className="col-span-2 text-center font-mono font-black text-primary/80 bg-primary/5 rounded py-0.5">
                    {it.returnedQty}
                  </div>
                  <div className="col-span-4 text-right font-mono font-bold tracking-tight">
                    {formatCurrency(Number(it.amount) || (it.returnedQty * Number(it.purchaseRate)))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        <div className="mt-auto p-6 bg-muted/10 border-t border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Subtotal</span>
                <span className="font-mono text-sm">{formatCurrency(data.subtotal)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Taxes (CGST+SGST)</span>
                <span className="font-mono text-sm">{formatCurrency(Number(data.cgst || 0) + Number(data.sgst || 0))}</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total Debit Amount</p>
              <p className="font-mono text-3xl font-black tracking-tighter text-primary">{formatCurrency(data.totalAmount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Actions Sidebar */}
      <div className="w-full md:w-75 bg-muted/20 p-6 flex flex-col gap-6">
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Document Actions</h4>
          <div className="grid gap-2">
            <Button className="w-full shadow-lg shadow-primary/20" onClick={() => downloadDebitNotePdf(getPdfData())}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="outline" className="w-full bg-background" onClick={() => printDebitNotePdf(getPdfData())}>
              <Printer className="mr-2 h-4 w-4" />
              Print Copy
            </Button>
          </div>
        </div>

        <Separator className="bg-border/40" />

        {!isSettled && (
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              {isReplacement ? 'Replacement' : 'Settlement'}
            </h4>
            {isReplacement ? (
              <>
                <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 px-3 py-2.5 mb-3">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Awaiting replacement goods from supplier</p>
                  <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                    Once the supplier sends replacement stock, receive it via a new GRN. The debit note will be marked Settled automatically.
                  </p>
                </div>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
                  onClick={() => {
                    // Navigate to GRN with supplier + items prefilled + returnId to auto-link
                    const params = new URLSearchParams({
                      replacementReturnId: data.id,
                      supplierId: data.supplierId ?? '',
                      supplierName: data.partyName ?? '',
                    })
                    navigate(`/purchase/grn?${params.toString()}`)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Receive Replacement Stock
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  Mark this debit note as settled once {settlementMode === 'REFUND' ? 'refund is received' : 'amount is adjusted'}.
                </p>
                <Button
                  variant="outline"
                  className="w-full bg-background hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 dark:hover:border-emerald-800 transition-all"
                  onClick={() => onStatusUpdate('SETTLED')}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark as Settled
                </Button>
              </>
            )}
          </div>
        )}

        {isSettled && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Settled</p>
            <p className="text-xs text-muted-foreground">
              {isReplacement ? 'Replacement goods received' : 'Credit received from supplier'}
            </p>
            {isReplacement && data.replacementGrnId && (
              <p className="text-[10px] font-mono text-muted-foreground mt-1">GRN: {data.replacementGrnId}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
