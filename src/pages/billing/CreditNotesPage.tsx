import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useSettingsStore } from '@/stores/settingsStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { RETURN_REASONS } from './SalesReturnsPage'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileX2,
  Receipt,
  IndianRupee,
  Printer,
  Download,
  Eye,
  RotateCcw,
  Wallet,
  RefreshCw,
  BadgeCheck,
  Hourglass,
  XCircle,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { PaginatedSelect } from '@/components/shared/PaginatedSelect'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import { exportToCsv } from '@/lib/exportUtils'
import { navigate, useRoute } from '@/lib/router'
import { printCreditNote } from './CreditNoteDetailContent'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CreditNoteItem {
  id: string
  productName: string
  batchNumber: string
  expiryDate: string
  returnedQty: number
  rate: number
  gstPercent: number
  amount: number
}

export type CreditNoteStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'

export interface CreditNote {
  id: string
  creditNoteNo: string
  date: string
  invoiceId: string
  invoiceNumber: string
  customerId?: string
  customerName: string
  customerPhone?: string | null
  reason: string
  items: CreditNoteItem[]
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  totalAmount: number
  settlementMode: 'REFUND' | 'CREDIT' | 'REPLACEMENT'
  // Inspection lifecycle. PENDING_REVIEW = filed but goods not yet inspected;
  // settlement effects (stock restore, balance change, invoice flip) HAVE NOT
  // fired. APPROVED = reviewer signed off, side effects executed. REJECTED =
  // goods didn't match the claim; CN kept as historical record.
  status: CreditNoteStatus
  reviewedById?: string | null
  reviewedAt?: string | null
  reviewNote?: string | null
  reviewedBy?: { id: string; name: string } | null
  notes?: string
  createdAt: string
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
] as const

const SETTLEMENT_OPTIONS = [
  { value: 'all', label: 'All Modes' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'CREDIT', label: 'Adjust Against Outstanding' },
  { value: 'REPLACEMENT', label: 'Store Credit' },
] as const

const settlementConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'info'; icon: typeof Wallet }> = {
  REFUND:      { label: 'Refund',        variant: 'success', icon: Wallet },
  CREDIT:      { label: 'Adjust',        variant: 'warning', icon: BadgeCheck },
  REPLACEMENT: { label: 'Store Credit',  variant: 'info',    icon: RefreshCw },
}

// Status filter options + per-status visual config. Keep the visual variants
// distinct from settlement variants so a "Refund + Pending" row reads at a
// glance.
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const

const statusConfig: Record<CreditNoteStatus, { label: string; variant: 'warning' | 'success' | 'destructive'; icon: typeof Hourglass }> = {
  PENDING_REVIEW: { label: 'Pending Review', variant: 'warning',     icon: Hourglass },
  APPROVED:       { label: 'Approved',       variant: 'success',     icon: CheckCircle2 },
  REJECTED:       { label: 'Rejected',       variant: 'destructive', icon: XCircle },
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

const CREDIT_NOTE_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'customer', label: 'Customer', defaultVisible: true },
  { id: 'creditNote', label: 'Credit Note #', required: true, defaultVisible: true },
  { id: 'invoice', label: 'Against Invoice', defaultVisible: true },
  { id: 'reason', label: 'Reason', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'settlement', label: 'Settlement', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
]

export default function CreditNotesPage() {
  const cols = useColumnVisibility('billing.creditNotes', CREDIT_NOTE_COLUMNS)
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // period defaults to "today" so the page opens on today's credit notes.
  const [period, setPeriod] = useState('today')
  // Stat-card drill-down: clicking a summary card narrows the list to that
  // subset (pending review / refunds / adjustments) on top of the period.
  // Kept separate from the Status / Settlement enum filters.
  const [cardFilter, setCardFilter] = useState<'all' | 'pending' | 'refund' | 'adjust'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedSettlement, setSelectedSettlement] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedCustomer, setSelectedCustomer] = useState('all')
  const [selectedReason, setSelectedReason] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  const fetchCreditNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/credit-notes')
      setCreditNotes(res.data.data || res.data)
    } catch {
      toast.error('Failed to load credit notes')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchCreditNotes() }, [fetchCreditNotes])
  useBranchRefresh(fetchCreditNotes)

  // Deep-link support: the detail is now its own page. Legacy links that land
  // on the list with `?id=<id>` (Customer Detail → Credit Notes tab,
  // notifications, Approvals) redirect to the standalone detail page.
  // `replace: true` so this intermediate list entry doesn't linger in history —
  // otherwise the detail page's Back lands here and bounces forward again
  // instead of returning to the caller (e.g. the notification folder).
  const { search: routeSearch } = useRoute()
  useEffect(() => {
    const target = new URLSearchParams(routeSearch).get('id')
    if (target) navigate(`/billing/credit-notes/detail?id=${target}`, { replace: true })
  }, [routeSearch])

  // Master data — for filters that should list ALL options
  const { customers, fetchMasterData } = useMasterDataStore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])

  // ── Filtering ──

  // Credit notes within the selected period only — drives both the summary
  // cards and the list (so the cards always reflect the period, independent of
  // the card-click / search / status narrowing applied to the table below).
  const periodNotes = useMemo(() => {
    let result = [...creditNotes]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    switch (period) {
      case 'today':
        result = result.filter(cn => cn.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
        result = result.filter(cn => cn.date.slice(0, 10) >= weekStr)
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter(cn => cn.date.slice(0, 10) >= monthStart)
        break
      }
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        const quarterStart = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`
        result = result.filter(cn => cn.date.slice(0, 10) >= quarterStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter(cn => cn.date.slice(0, 10) >= dateFrom)
        if (dateTo)   result = result.filter(cn => cn.date.slice(0, 10) <= dateTo)
        break
    }
    return result
  }, [creditNotes, period, dateFrom, dateTo])

  const filtered = useMemo(() => {
    let result = [...periodNotes]

    // Stat-card drill-down
    if (cardFilter === 'pending') {
      result = result.filter(cn => cn.status === 'PENDING_REVIEW')
    } else if (cardFilter === 'refund') {
      result = result.filter(cn => cn.settlementMode === 'REFUND')
    } else if (cardFilter === 'adjust') {
      result = result.filter(cn => cn.settlementMode === 'CREDIT')
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(cn =>
        cn.creditNoteNo.toLowerCase().includes(q) ||
        cn.customerName.toLowerCase().includes(q) ||
        cn.invoiceNumber.toLowerCase().includes(q)
      )
    }

    if (selectedSettlement !== 'all') {
      result = result.filter(cn => cn.settlementMode === selectedSettlement)
    }

    // ── Status (Pending Review / Approved / Rejected) ──
    if (selectedStatus !== 'all') {
      result = result.filter(cn => cn.status === selectedStatus)
    }

    if (selectedCustomer !== 'all') {
      result = result.filter(cn => cn.customerName === selectedCustomer)
    }

    if (selectedReason !== 'all') {
      // Case-insensitive prefix match — catches both exact reasons ("Damaged")
      // and free-text variations the user typed ("Damaged packaging — 5 strips returned").
      const sel = selectedReason.toLowerCase()
      result = result.filter(cn => (cn.reason || '').toLowerCase().startsWith(sel))
    }

    return result
  }, [periodNotes, cardFilter, searchQuery, selectedSettlement, selectedStatus, selectedCustomer, selectedReason])

  // Backend-paginated customer fetcher. CreditNotes filter by customerName,
  // so value === name.
  const customerFetcher = useCallback(
    async ({ skip, take, query }: { skip: number; take: number; query: string }) => {
      const params = new URLSearchParams({ skip: String(skip), take: String(take) })
      if (query) params.set('q', query)
      const res = await api.get(`/customers?${params.toString()}`)
      const payload = res.data
      const items = (payload?.data ?? []) as Array<{ id: string; name: string }>
      return {
        data: items.map((c) => ({ value: c.name, label: c.name })),
        hasMore: Boolean(payload?.hasMore),
      }
    },
    [],
  )

  const selectedCustomerLabel =
    selectedCustomer && selectedCustomer !== 'all' ? selectedCustomer : undefined

  // Reason options — sourced from the canonical RETURN_REASONS master list
  // (same list used by the Sales Returns creation form), so the dropdown
  // always shows the full set regardless of which reasons appear on this page.
  const reasonOptions = useMemo(() => [
    { value: 'all', label: 'All Reasons' },
    ...RETURN_REASONS.map(r => ({ value: r, label: r })),
  ], [])

  // ── Stats ──
  // Financial roll-ups (total credit / refunds / adjustments) only count
  // APPROVED CNs — including pending claims would over-state issued credit
  // and confuse anyone reconciling against accounting. Pending count gets
  // its own tile.
  const stats = useMemo(() => {
    const approved = periodNotes.filter(cn => cn.status === 'APPROVED')
    const pendingCount = periodNotes.filter(cn => cn.status === 'PENDING_REVIEW').length
    const total = approved.reduce((s, cn) => s + Number(cn.totalAmount), 0)
    const refunds = approved.filter(cn => cn.settlementMode === 'REFUND').reduce((s, cn) => s + Number(cn.totalAmount), 0)
    const adjustments = approved.filter(cn => cn.settlementMode === 'CREDIT').reduce((s, cn) => s + Number(cn.totalAmount), 0)
    return { count: periodNotes.length, total, refunds, adjustments, pendingCount }
  }, [periodNotes])

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const activeFilterCount = [
    period !== 'today' ? period : '', // "today" is the default baseline
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom, dateTo,
    selectedSettlement !== 'all' ? selectedSettlement : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedCustomer !== 'all' ? selectedCustomer : '',
    selectedReason !== 'all' ? selectedReason : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('today'); setCardFilter('all'); setDateFrom(''); setDateTo('')
    setSelectedSettlement('all')
    setSelectedStatus('all')
    setSelectedCustomer('all')
    setSelectedReason('all')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          {
            label: 'Pending Review',
            value: stats.pendingCount.toString(),
            subtitle: stats.pendingCount === 1 ? 'awaiting inspection' : 'awaiting inspection',
            icon: Hourglass,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
            filterKey: 'pending',
            activeRing: 'ring-2 ring-amber-500/50',
          },
          {
            label: 'Total Notes',
            value: stats.count.toString(),
            subtitle: 'this period',
            icon: Receipt,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            // Financials below count APPROVED only — see stats memo.
            label: 'Total Credit',
            value: formatCurrency(stats.total),
            subtitle: 'approved · issued',
            icon: IndianRupee,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-rose-500/50',
          },
          {
            label: 'Refunds',
            value: formatCurrency(stats.refunds),
            subtitle: 'approved · via original payment',
            icon: Wallet,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: 'refund',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Adjustments',
            value: formatCurrency(stats.adjustments),
            subtitle: 'approved · against outstanding',
            icon: BadgeCheck,
            iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
            borderAccent: 'border-l-violet-500',
            filterKey: 'adjust',
            activeRing: 'ring-2 ring-violet-500/50',
          },
        ] as const).map((stat) => {
          const active = stat.filterKey !== 'all' && cardFilter === stat.filterKey
          return (
          <Card
            key={stat.label}
            hover
            role="button"
            tabIndex={0}
            title={stat.filterKey === 'all' ? 'Show all credit notes in this period' : `Filter list to ${stat.label.toLowerCase()}`}
            onClick={() => { setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.borderAccent, active && stat.activeRing)}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.iconBg)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold font-mono leading-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1) }}
        searchPlaceholder="Search credit note #, customer or invoice..."
        resultsCount={filtered.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        columnsNode={<ColumnsToggle columns={CREDIT_NOTE_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
              onClick={() => {
                if (!filtered.length) { toast.info('No credit notes to export'); return }
                exportToCsv(filtered.map(cn => ({
                  'Credit Note #': cn.creditNoteNo,
                  Date: formatDate(cn.date),
                  Customer: cn.customerName,
                  Phone: cn.customerPhone ?? '',
                  'Invoice #': cn.invoiceNumber,
                  Reason: cn.reason,
                  Status: statusConfig[cn.status]?.label ?? cn.status,
                  Settlement: settlementConfig[cn.settlementMode]?.label ?? cn.settlementMode,
                  Subtotal: cn.subtotal,
                  CGST: cn.cgst,
                  SGST: cn.sgst,
                  Total: cn.totalAmount,
                  'Reviewed By': cn.reviewedBy?.name ?? '',
                  'Reviewed At': cn.reviewedAt ? formatDate(cn.reviewedAt) : '',
                })), 'credit-notes')
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/billing/returns')}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
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
            onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
            onClear={() => { setPeriod('all'); setCurrentPage(1) }}
            options={PERIOD_OPTIONS}
          />

          <EnumSelect
            label="Status"
            value={selectedStatus}
            onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
            onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
            options={STATUS_OPTIONS}
          />

          <EnumSelect
            label="Settlement"
            value={selectedSettlement}
            onValueChange={(val) => { setSelectedSettlement(val); setCurrentPage(1) }}
            onClear={() => { setSelectedSettlement('all'); setCurrentPage(1) }}
            options={SETTLEMENT_OPTIONS}
          />

          <EnumSelect
            label="Reason"
            value={selectedReason}
            onValueChange={(val) => { setSelectedReason(val); setCurrentPage(1) }}
            onClear={() => { setSelectedReason('all'); setCurrentPage(1) }}
            options={reasonOptions}
          />

          <PaginatedSelect
            label="Customer"
            value={selectedCustomer}
            onValueChange={(val) => { setSelectedCustomer(val); setCurrentPage(1) }}
            onClear={() => { setSelectedCustomer('all'); setCurrentPage(1) }}
            fetcher={customerFetcher}
            pinnedOption={{ value: 'all', label: 'All Customers' }}
            selectedLabel={selectedCustomerLabel}
            pageSize={10}
          />

          {/* Custom date range — only when period is 'custom', full-width row below */}
          {period === 'custom' && (
            <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/40 pt-4 mt-1">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setCurrentPage(1) }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setCurrentPage(1) }} />
              </div>
            </div>
          )}
        </div>
      </DataTableFilterBar>

      {/* ── Table ── */}
      <Card>
        {/* Mobile card list */}
        <div className="lg:hidden">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Loading credit notes...</p>
            </div>
          )}
          {!isLoading && paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <FileX2 className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No credit notes found</p>
            </div>
          )}
          <div className="divide-y divide-border/40">
            {!isLoading && paginated.map((cn) => {
              const settlement = settlementConfig[cn.settlementMode]
              const status = statusConfig[cn.status]
              return (
                <div
                  key={cn.id}
                  className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => navigate(`/billing/credit-notes/detail?id=${cn.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold">{cn.creditNoteNo}</p>
                    <CustomerNameLine
                      name={cn.customerName}
                      phone={cn.customerPhone}
                      onNameClick={cn.customerId ? () => navigate(`/customers/detail?customerId=${cn.customerId}`) : undefined}
                    />
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <Badge variant={status?.variant ?? 'secondary'} size="sm" dot>
                        {status?.label ?? cn.status}
                      </Badge>
                      <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
                        {settlement?.label ?? cn.settlementMode}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatDate(cn.date)}</span>
                    </div>
                  </div>
                  <p className="font-mono text-[15px] font-bold text-rose-600 dark:text-rose-400 shrink-0">
                    {formatCurrency(cn.totalAmount)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
        {/* Desktop table */}
        <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.isVisible('date') && <TableHead>Date</TableHead>}
              {cols.isVisible('customer') && <TableHead>Customer</TableHead>}
              {cols.isVisible('creditNote') && <TableHead>Credit Note #</TableHead>}
              {cols.isVisible('invoice') && <TableHead>Against Invoice</TableHead>}
              {cols.isVisible('reason') && <TableHead>Reason</TableHead>}
              {cols.isVisible('status') && <TableHead>Status</TableHead>}
              {cols.isVisible('settlement') && <TableHead>Settlement</TableHead>}
              {cols.isVisible('amount') && <TableHead className="text-right">Amount</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 1} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Loading credit notes...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 1} className="h-48">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                        <FileX2 className="h-7 w-7 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">No credit notes found</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                          {searchQuery || activeFilterCount > 0 ? 'Try adjusting your search or filters' : 'Create your first credit note via Sales Returns'}
                        </p>
                      </div>
                      {!searchQuery && activeFilterCount === 0 && (
                        <Button size="sm" variant="outline" onClick={() => navigate('/billing/returns')}>
                          <RotateCcw className="mr-1.5 h-4 w-4" />
                          Go to Sales Returns
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((cn, idx) => {
                  const settlement = settlementConfig[cn.settlementMode]
                  const SettlementIcon = settlement?.icon ?? Wallet
                  const status = statusConfig[cn.status]
                  const StatusIcon = status?.icon ?? Hourglass
                  return (
                    <motion.tr
                      key={cn.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/billing/credit-notes/detail?id=${cn.id}`)}
                    >
                      {cols.isVisible('date') && (
                      <TableCell className="whitespace-nowrap">
                        <span className="text-[11px] text-muted-foreground">{formatDate(cn.date)}</span>
                      </TableCell>
                      )}
                      {cols.isVisible('customer') && (
                      <TableCell className="max-w-40">
                        <CustomerNameLine
                          name={cn.customerName}
                          phone={cn.customerPhone}
                          onNameClick={cn.customerId ? () => navigate(`/customers/detail?customerId=${cn.customerId}`) : undefined}
                        />
                      </TableCell>
                      )}
                      {cols.isVisible('creditNote') && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Receipt className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="font-mono text-[11px] font-semibold">{cn.creditNoteNo}</span>
                        </div>
                      </TableCell>
                      )}
                      {cols.isVisible('invoice') && (
                      <TableCell>
                        <span className="font-mono text-[11px] text-muted-foreground">{cn.invoiceNumber}</span>
                      </TableCell>
                      )}
                      {cols.isVisible('reason') && (
                      <TableCell className="max-w-35">
                        <p className="truncate text-[11px] text-muted-foreground">{cn.reason}</p>
                      </TableCell>
                      )}
                      {cols.isVisible('status') && (
                      <TableCell>
                        <Badge variant={status?.variant ?? 'secondary'} size="sm" dot>
                          <StatusIcon className="mr-1 h-2.5 w-2.5" />
                          {status?.label ?? cn.status}
                        </Badge>
                      </TableCell>
                      )}
                      {cols.isVisible('settlement') && (
                      <TableCell>
                        <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
                          <SettlementIcon className="mr-1 h-2.5 w-2.5" />
                          {settlement?.label ?? cn.settlementMode}
                        </Badge>
                      </TableCell>
                      )}
                      {cols.isVisible('amount') && (
                      <TableCell className="text-right font-mono text-[15px] font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrency(cn.totalAmount)}
                      </TableCell>
                      )}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/billing/credit-notes/detail?id=${cn.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => printCreditNote(cn, businessProfile)}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  )
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
        </div>

        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>
    </motion.div>
  )
}
