import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  IndianRupee,
  Clock,
  Wallet,
  User,
  FileText,
} from 'lucide-react'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { usePageSize } from '@/hooks/usePageSize'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EmptyState } from '@/components/shared/EmptyState'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import api from '@/lib/api'
import { usePersistedState } from '@/hooks/usePersistedState'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { clampAmountInput } from '@/lib/amountInput'
import { navigate } from '@/lib/router'

// ─────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────

type Bucket = 'overdue' | 'due-soon' | 'upcoming'
type StatusFilter = 'all' | Bucket

type PaymentDueRow = {
  grnId: string
  grnNumber: string
  supplierId: string
  supplierName: string
  supplierInvoiceNo: string
  grnDate: string
  dueDate: string
  explicitDueDate: boolean
  balance: number
  daysPastDue: number
  status: string // GRN paymentStatus: UNPAID | PARTIAL
  bucket: Bucket
}

type PaymentsDueResponse = {
  summary: {
    overdueAmount: number
    overdueCount: number
    dueSoonAmount: number
    dueSoonCount: number
    upcomingAmount: number
    upcomingCount: number
    totalDue: number
    totalCount: number
  }
  rows: PaymentDueRow[]
}

const EMPTY_SUMMARY: PaymentsDueResponse['summary'] = {
  overdueAmount: 0,
  overdueCount: 0,
  dueSoonAmount: 0,
  dueSoonCount: 0,
  upcomingAmount: 0,
  upcomingCount: 0,
  totalDue: 0,
  totalCount: 0,
}

const PAGE_SIZE = 15

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Due' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due-soon', label: 'Due soon (≤7 days)' },
  { value: 'upcoming', label: 'Upcoming' },
] as const

// How the days-past-due count reads in the table for each class.
function daysLabel(row: PaymentDueRow): { text: string; tone: 'rose' | 'amber' | 'muted' } {
  if (row.daysPastDue > 0) return { text: `${row.daysPastDue}d overdue`, tone: 'rose' }
  if (row.daysPastDue === 0) return { text: 'Due today', tone: 'amber' }
  const inDays = Math.abs(row.daysPastDue)
  return { text: `in ${inDays}d`, tone: row.bucket === 'due-soon' ? 'amber' : 'muted' }
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function SupplierPaymentsDuePage() {
  const [rows, setRows] = useState<PaymentDueRow[]>([])
  const [summary, setSummary] = useState<PaymentsDueResponse['summary']>(EMPTY_SUMMARY)
  const [isLoading, setIsLoading] = useState(true)

  // Filters (persisted so they survive refresh + back)
  const [searchQuery, setSearchQuery] = usePersistedState('filters:purchase.paymentsDue:search', '')
  const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>('filters:purchase.paymentsDue:status', 'all')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('pbims.supplierPaymentsDue.pageSize', PAGE_SIZE)

  // Payment sheet — one open GRN at a time (payments reconcile against a
  // specific purchase-entry, mirroring the Supplier Outstanding flow).
  const [selectedRow, setSelectedRow] = useState<PaymentDueRow | null>(null)
  const [payMode, setPayMode] = useState<'CASH' | 'CHEQUE' | 'NEFT_UPI'>('NEFT_UPI')
  const [payAmount, setPayAmount] = useState('')
  const [payReference, setPayReference] = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)

  // ── Query builder ──
  const buildQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (statusFilter !== 'all') params.set('status', statusFilter)
    return params
  }, [searchQuery, statusFilter])

  // ── Fetch (debounced on search) ──
  const fetchAbortRef = useRef<AbortController | null>(null)
  const fetchRows = useCallback(async () => {
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller
    setIsLoading(true)
    try {
      const res = await api.get(`/suppliers/payments-due?${buildQueryParams().toString()}`, { signal: controller.signal })
      const data = res.data as PaymentsDueResponse
      setRows(data?.rows ?? [])
      setSummary(data?.summary ?? EMPTY_SUMMARY)
    } catch (err: unknown) {
      const e = err as { name?: string; code?: string }
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        toast.error('Failed to load payments due')
        setRows([])
        setSummary(EMPTY_SUMMARY)
      }
    } finally {
      setIsLoading(false)
    }
  }, [buildQueryParams])

  useEffect(() => {
    const delay = searchQuery.trim() ? 300 : 0
    const handle = setTimeout(() => { fetchRows() }, delay)
    return () => clearTimeout(handle)
  }, [fetchRows, searchQuery])

  useBranchRefresh(fetchRows)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  // ── Derived ──
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const paginatedRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize],
  )

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0
  const clearFilters = () => setStatusFilter('all')

  // ── Payment sheet flow ──
  const openSheet = (row: PaymentDueRow) => {
    setSelectedRow(row)
    setPayAmount(row.balance > 0 ? row.balance.toFixed(2) : '')
    setPayReference('')
    setPayMode('NEFT_UPI')
  }

  const handleRecordPayment = async () => {
    if (!selectedRow) return
    const amount = parseFloat(payAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (amount > selectedRow.balance + 0.01) {
      toast.error(`Amount exceeds balance (${formatCurrency(selectedRow.balance)})`)
      return
    }
    setPaySubmitting(true)
    try {
      const res = await api.post(`/suppliers/${selectedRow.supplierId}/payment`, {
        amount,
        paymentMode: payMode,
        referenceNumber: payReference || undefined,
        grnIds: [selectedRow.grnId],
      })
      toast.success(`Payment recorded · ${res.data?.paymentNumber ?? ''}`)
      setSelectedRow(null)
      await fetchRows()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ?? 'Failed to record payment'
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setPaySubmitting(false)
    }
  }

  // ── Stat cards (click to filter by class) ──
  const kpiCards = [
    {
      label: 'Overdue',
      value: formatCurrency(summary.overdueAmount),
      subtitle: `${summary.overdueCount} bill${summary.overdueCount !== 1 ? 's' : ''} past due`,
      icon: AlertTriangle,
      iconBg: 'bg-red-500/10 text-red-700 dark:text-red-400',
      accent: 'border-l-red-500',
      filterKey: 'overdue' as StatusFilter,
      activeRing: 'ring-2 ring-red-500/50',
    },
    {
      label: 'Due Soon',
      value: formatCurrency(summary.dueSoonAmount),
      subtitle: 'within 7 days',
      icon: Clock,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      accent: 'border-l-amber-500',
      filterKey: 'due-soon' as StatusFilter,
      activeRing: 'ring-2 ring-amber-500/50',
    },
    {
      label: 'Upcoming',
      value: formatCurrency(summary.upcomingAmount),
      subtitle: 'not yet due',
      icon: CalendarClock,
      iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      accent: 'border-l-sky-500',
      filterKey: 'upcoming' as StatusFilter,
      activeRing: 'ring-2 ring-sky-500/50',
    },
    {
      label: 'Total Due',
      value: formatCurrency(summary.totalDue),
      subtitle: `${summary.totalCount} open bill${summary.totalCount !== 1 ? 's' : ''}`,
      icon: IndianRupee,
      iconBg: 'bg-primary/10 text-primary',
      accent: 'border-l-primary',
      filterKey: 'all' as StatusFilter,
      activeRing: 'ring-2 ring-primary/40',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* ── Summary cards (click to filter by class) ── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {kpiCards.map((kpi) => {
          const active = statusFilter === kpi.filterKey && kpi.filterKey !== 'all'
          return (
          <Card
            key={kpi.label}
            hover
            role="button"
            tabIndex={0}
            title={kpi.filterKey === 'all' ? 'Show all payments due' : `Show only ${kpi.label.toLowerCase()} bills`}
            onClick={() => { setStatusFilter(active ? 'all' : kpi.filterKey); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter(active ? 'all' : kpi.filterKey); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', kpi.accent, active && kpi.activeRing)}
          >
            <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10', kpi.iconBg)}>
                <kpi.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold font-mono leading-tight truncate" title={kpi.value}>{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground">{kpi.subtitle}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* ── Search first, then the quick status filters — all on ONE row. The
             chips sit to the right of the search (actionNode) rather than inside
             the collapsible Filters panel. ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search supplier or invoice #…"
        resultsCount={rows.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        compactActionsRow
        actionNode={
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={statusFilter === opt.value ? 'default' : 'outline'}
                className="h-8 shrink-0 text-xs"
                onClick={() => setStatusFilter(opt.value as StatusFilter)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        }
      />

      {/* ── Body ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarClock}
              title={searchQuery || activeFilterCount > 0 ? 'No matching bills' : 'Nothing due'}
              description={
                searchQuery || activeFilterCount > 0
                  ? 'Try adjusting your search or filters.'
                  : 'No credit purchases are awaiting payment right now.'
              }
              actionLabel={searchQuery || activeFilterCount > 0 ? 'Clear filters' : undefined}
              onAction={
                searchQuery || activeFilterCount > 0
                  ? () => { clearFilters(); setSearchQuery('') }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border/40">
            {paginatedRows.map((row) => {
              const d = daysLabel(row)
              return (
                <div
                  key={row.grnId}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 active:bg-muted/50"
                  onClick={() => openSheet(row)}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      role="link"
                      tabIndex={0}
                      title="View supplier details"
                      className="text-sm font-bold truncate text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${row.supplierId}`) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${row.supplierId}`) } }}
                    >{row.supplierName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Inv {row.supplierInvoiceNo || '—'} · due {formatDate(row.dueDate)}
                    </p>
                    <p className={cn(
                      'text-[10px] font-mono mt-0.5',
                      d.tone === 'rose' && 'text-rose-500 font-semibold',
                      d.tone === 'amber' && 'text-amber-600 dark:text-amber-400',
                      d.tone === 'muted' && 'text-muted-foreground',
                    )}>
                      {d.text}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(row.balance)}</p>
                    <Badge variant={row.status === 'PARTIAL' ? 'warning' : 'secondary'} size="sm" className="mt-1">{row.status}</Badge>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row) => {
                  const d = daysLabel(row)
                  return (
                    <TableRow
                      key={row.grnId}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => openSheet(row)}
                    >
                      <TableCell className="text-sm font-bold">
                        <span
                          role="link"
                          tabIndex={0}
                          title="View supplier details"
                          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${row.supplierId}`) }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${row.supplierId}`) } }}
                        >{row.supplierName}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {row.supplierInvoiceNo || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs">{formatDate(row.dueDate)}</span>
                          <span className={cn(
                            'text-[10px] font-mono',
                            d.tone === 'rose' && 'text-rose-500 font-semibold',
                            d.tone === 'amber' && 'text-amber-600 dark:text-amber-400',
                            d.tone === 'muted' && 'text-muted-foreground',
                          )}>
                            {d.text}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'PARTIAL' ? 'warning' : 'secondary'} size="sm">{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400 text-[15px] whitespace-nowrap">
                        {formatCurrency(row.balance)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-12">
                        <DataTableRowActions
                          onView={() => openSheet(row)}
                          customActions={[
                            {
                              label: 'Record Payment',
                              icon: <Wallet className="h-4 w-4" />,
                              onClick: () => openSheet(row),
                            },
                            {
                              label: 'View Purchase Entry',
                              icon: <FileText className="h-4 w-4" />,
                              onClick: () => navigate(`/purchase/grn/detail?id=${row.grnId}`),
                            },
                            {
                              label: 'View Supplier Profile',
                              icon: <User className="h-4 w-4" />,
                              onClick: () => navigate(`/purchase/suppliers/detail?supplierId=${row.supplierId}`),
                            },
                          ]}
                        />
                      </TableCell>
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
            totalItems={rows.length}
            itemsPerPage={pageSize}
            pageSize={pageSize}
            onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
            className="border-t border-border/40 px-4"
          />
        </Card>
      )}

      {/* ── Payment sheet ── */}
      <Sheet open={!!selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-140 p-0 gap-0 flex flex-col">
          {selectedRow && (
            <>
              <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-semibold truncate">{selectedRow.supplierName}</SheetTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Inv {selectedRow.supplierInvoiceNo || '—'} · {selectedRow.grnNumber}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</p>
                    <p className="font-mono text-base font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {formatCurrency(selectedRow.balance)}
                    </p>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Bill facts */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Received', value: formatDate(selectedRow.grnDate) },
                    {
                      label: selectedRow.explicitDueDate ? 'Due Date' : 'Due Date (est.)',
                      value: formatDate(selectedRow.dueDate),
                    },
                    { label: 'Days', value: daysLabel(selectedRow).text, tone: daysLabel(selectedRow).tone },
                    { label: 'Status', value: selectedRow.status },
                  ].map((f) => (
                    <div key={f.label} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</p>
                      <p className={cn(
                        'mt-0.5 text-sm font-medium',
                        f.tone === 'rose' && 'text-rose-500 font-semibold',
                        f.tone === 'amber' && 'text-amber-600 dark:text-amber-400',
                      )}>
                        {f.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Record payment */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Record Payment
                    </p>
                  </div>
                  <div className={cn(
                    'grid grid-cols-1 gap-2',
                    payMode === 'CASH'
                      ? 'sm:grid-cols-[150px_1fr_auto]'
                      : 'sm:grid-cols-[150px_1fr_160px_auto]',
                  )}>
                    <Select
                      value={payMode}
                      onValueChange={(v) => {
                        const next = v as 'CASH' | 'CHEQUE' | 'NEFT_UPI'
                        setPayMode(next)
                        if (next === 'CASH') setPayReference('')
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="CHEQUE">Cheque</SelectItem>
                        <SelectItem value="NEFT_UPI">NEFT / UPI</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Amount"
                      className="h-9 font-mono text-sm"
                      value={payAmount}
                      onChange={(e) => {
                        // Capped at the row's balance. clampAmountInput writes the
                        // capped value back onto the element too, so a field already
                        // at the balance stops accepting further digits rather than
                        // growing while the state behind it stays put.
                        const { value } = clampAmountInput(e.currentTarget, { min: 0, max: selectedRow.balance })
                        setPayAmount(value === null ? '' : String(value))
                      }}
                      min={0}
                      max={selectedRow.balance}
                    />
                    {payMode !== 'CASH' && (
                      <Input
                        type="text"
                        placeholder={payMode === 'CHEQUE' ? 'Cheque #' : 'UPI / Txn ref'}
                        className="h-9 text-sm"
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                      />
                    )}
                    <Button
                      size="sm"
                      className="gap-1.5 h-9"
                      disabled={paySubmitting || !payAmount}
                      onClick={handleRecordPayment}
                    >
                      <Wallet className="h-4 w-4" />
                      {paySubmitting ? 'Saving…' : 'Pay'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
                    Payment is recorded against this purchase-entry (balance {formatCurrency(selectedRow.balance)}).
                  </p>
                </div>
              </div>

              {/* Sticky footer */}
              <div className="shrink-0 border-t border-border/40 bg-background px-5 py-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => {
                    navigate(`/purchase/grn/detail?id=${selectedRow.grnId}`)
                    setSelectedRow(null)
                  }}
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">View Purchase Entry</span>
                  <span className="sm:hidden">Entry</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => {
                    navigate(`/purchase/suppliers/detail?supplierId=${selectedRow.supplierId}`)
                    setSelectedRow(null)
                  }}
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">View Supplier Profile</span>
                  <span className="sm:hidden">Profile</span>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
