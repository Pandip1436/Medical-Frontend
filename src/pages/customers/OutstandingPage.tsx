import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Bell,
  CreditCard,
  IndianRupee,
  Clock,
  Send,
  ExternalLink,
  Wallet,
  Receipt,
  User,
} from 'lucide-react'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { EmptyState } from '@/components/shared/EmptyState'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { navigate } from '@/lib/router'

// ─────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────

type OutstandingRow = {
  customerId: string | null
  customer: string
  customerPhone?: string | null
  outstanding: number
  current: number
  '0-30': number
  '31-60': number
  '61-90': number
  '90+': number
  invoiceCount: number
}

type OutstandingInvoice = {
  id: string
  invoiceNumber: string
  date: string
  grandTotal: number
  amountPaid: number
  balance: number
  status: string
  daysOverdue: number
}

const PAGE_SIZE = 15

const BUCKET_OPTIONS = [
  { value: 'all', label: 'All Aging' },
  { value: 'current', label: 'Current (not yet due)' },
  { value: '0-30', label: '0–30 days' },
  { value: '31-60', label: '31–60 days' },
  { value: '61-90', label: '61–90 days' },
  { value: '90+', label: '90+ days' },
] as const

const MIN_OUTSTANDING_OPTIONS = [
  { value: 'all', label: 'Any Amount' },
  { value: '1000', label: '> ₹1,000' },
  { value: '10000', label: '> ₹10,000' },
  { value: '50000', label: '> ₹50,000' },
  { value: '100000', label: '> ₹1,00,000' },
] as const

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

const OUTSTANDING_COLUMNS: ColumnDef[] = [
  { id: 'customer', label: 'Customer', required: true, defaultVisible: true },
  { id: 'invoices', label: 'Invoices', defaultVisible: true },
  { id: 'total', label: 'Total Outstanding', required: true, defaultVisible: true },
  { id: 'age0_30', label: '0–30 Days', defaultVisible: true },
  { id: 'age30_60', label: '30–60 Days', defaultVisible: true },
  { id: 'age60plus', label: '60+ Days', defaultVisible: true },
]

export default function OutstandingPage() {
  const cols = useColumnVisibility('customers.outstanding', OUTSTANDING_COLUMNS)
  // List state
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters (persisted to sessionStorage so they survive refresh + back)
  const [searchQuery, setSearchQuery] = usePersistedState('filters:customers.outstanding:search', '')
  const [bucketFilter, setBucketFilter] = usePersistedState<string>('filters:customers.outstanding:bucket', 'all')
  const [minOutstandingFilter, setMinOutstandingFilter] = usePersistedState<string>('filters:customers.outstanding:min', 'all')
  // Stat-card drill-down: clicking an aging card narrows the table to rows that
  // carry a balance in that bucket. Client-side (on top of the server-filtered
  // rows) since the cards are aging aggregates, not a separate query. Kept
  // separate from the Aging Bucket enum filter ('all'/early/mid/late buckets).
  const [cardFilter, setCardFilter] = useState<'all' | 'early' | 'mid' | 'late'>('all')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  // Drawer
  const [selectedRow, setSelectedRow] = useState<OutstandingRow | null>(null)
  const [drawerInvoices, setDrawerInvoices] = useState<OutstandingInvoice[]>([])
  const [drawerInvoicesLoading, setDrawerInvoicesLoading] = useState(false)

  // Inline collect-payment form (lives inside drawer)
  const [collectMode, setCollectMode] = useState<'cash' | 'cheque' | 'neft_upi'>('cash')
  const [collectAmount, setCollectAmount] = useState('')
  const [collectReference, setCollectReference] = useState('')
  const [collectSubmitting, setCollectSubmitting] = useState(false)
  // Pharmacy-floor workflow: one payment is always recorded against exactly
  // one open invoice. Whole-balance / FIFO collection is intentionally not
  // offered — accountants reconcile receipts against specific invoice numbers.
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  // While true, the amount input mirrors the selected invoice's balance. Flips
  // to false once the user manually edits the amount (e.g. partial payment).
  const [amountAutoFilled, setAmountAutoFilled] = useState(true)

  // ── Query builder ──
  const buildQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (bucketFilter !== 'all') params.set('bucket', bucketFilter)
    if (minOutstandingFilter !== 'all') params.set('minOutstanding', minOutstandingFilter)
    return params
  }, [searchQuery, bucketFilter, minOutstandingFilter])

  // ── Fetch list (debounced on search) ──
  const fetchAbortRef = useRef<AbortController | null>(null)
  const fetchRows = useCallback(async () => {
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller
    setIsLoading(true)
    try {
      const res = await api.get(`/customers/outstanding?${buildQueryParams().toString()}`, { signal: controller.signal })
      setRows(res.data?.rows ?? [])
    } catch (err: unknown) {
      const e = err as { name?: string; code?: string }
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        toast.error('Failed to load outstanding data')
        setRows([])
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

  // Reset to page 1 + clear selection when filters change
  useEffect(() => {
    setCurrentPage(1)
    setSelectedIds(new Set())
  }, [searchQuery, bucketFilter, minOutstandingFilter, cardFilter])

  // ── Derived ──
  // Card drill-down narrows the rows to those carrying a balance in the clicked
  // aging band. Applied on top of the server-side rows; the summary cards below
  // keep reflecting the whole dataset.
  const filteredRows = useMemo(() => {
    if (cardFilter === 'early') return rows.filter((r) => r.current + r['0-30'] > 0)
    if (cardFilter === 'mid') return rows.filter((r) => r['31-60'] > 0)
    if (cardFilter === 'late') return rows.filter((r) => r['61-90'] + r['90+'] > 0)
    return rows
  }, [rows, cardFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  )

  // Summary cards reflect the filtered set so the user understands what's on screen.
  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.outstanding, 0)
    const d0_30 = rows.reduce((s, r) => s + r.current + r['0-30'], 0)
    const d31_60 = rows.reduce((s, r) => s + r['31-60'], 0)
    const d60plus = rows.reduce((s, r) => s + r['61-90'] + r['90+'], 0)
    return { total, d0_30, d31_60, d60plus }
  }, [rows])

  const activeFilterCount =
    (bucketFilter !== 'all' ? 1 : 0) +
    (minOutstandingFilter !== 'all' ? 1 : 0) +
    (cardFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setBucketFilter('all')
    setMinOutstandingFilter('all')
    setCardFilter('all')
  }

  // ── Bulk selection helpers ──
  const allOnPageSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every((r) => r.customerId && selectedIds.has(r.customerId))

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        paginatedRows.forEach((r) => { if (r.customerId) next.delete(r.customerId) })
      } else {
        paginatedRows.forEach((r) => { if (r.customerId) next.add(r.customerId) })
      }
      return next
    })
  }

  const toggleSelectOne = (customerId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  const handleBulkReminders = async () => {
    if (selectedIds.size === 0) return
    setBulkSubmitting(true)
    try {
      const res = await api.post('/reminders/bulk', {
        customerIds: Array.from(selectedIds),
      })
      const { created, skipped } = (res.data ?? {}) as { created: number; skipped: number }
      const msg =
        created > 0 && skipped > 0
          ? `${created} reminder${created !== 1 ? 's' : ''} created (${skipped} already existed)`
          : created > 0
            ? `${created} reminder${created !== 1 ? 's' : ''} created`
            : `All ${skipped} customers already had this reminder`
      toast.success(msg)
      setSelectedIds(new Set())
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create bulk reminders'
      toast.error(msg)
    } finally {
      setBulkSubmitting(false)
    }
  }

  // Per-row send: creates a single reminder via the existing /reminders endpoint.
  const handleSendReminder = async (row: OutstandingRow) => {
    if (!row.customerId) return
    try {
      const dayOfMonth = Math.min(new Date().getDate(), 28)
      await api.post('/reminders', {
        customerId: row.customerId,
        dayOfMonth,
        title: 'Payment follow-up',
      })
      toast.success(`Reminder created for ${row.customer}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create reminder'
      toast.error(msg)
    }
  }

  // ── Drawer flow ──
  const openDrawer = (row: OutstandingRow) => {
    if (!row.customerId) return
    setSelectedRow(row)
    setCollectAmount('')
    setCollectReference('')
    setCollectMode('cash')
    setSelectedInvoiceId(null)
    setAmountAutoFilled(true)
  }

  // Balance of the currently selected invoice, used to auto-fill / cap the
  // amount input.
  const selectedInvoiceBalance = useMemo(() => {
    if (!selectedInvoiceId) return 0
    return drawerInvoices.find((inv) => inv.id === selectedInvoiceId)?.balance ?? 0
  }, [drawerInvoices, selectedInvoiceId])

  const selectInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId)
    // Re-arm auto-fill so the amount snaps to the newly-picked invoice's
    // balance even if the user had previously typed a partial amount.
    setAmountAutoFilled(true)
  }

  // Keep the amount input mirroring the selected invoice's balance until the
  // user manually edits it (partial payment).
  useEffect(() => {
    if (!amountAutoFilled) return
    setCollectAmount(selectedInvoiceBalance > 0 ? selectedInvoiceBalance.toFixed(2) : '')
  }, [amountAutoFilled, selectedInvoiceBalance])

  const fetchDrawerInvoices = useCallback(async (customerId: string) => {
    setDrawerInvoicesLoading(true)
    try {
      const res = await api.get(`/customers/${customerId}/outstanding-invoices`)
      setDrawerInvoices(Array.isArray(res.data) ? res.data : [])
    } catch {
      setDrawerInvoices([])
    } finally {
      setDrawerInvoicesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedRow?.customerId) {
      fetchDrawerInvoices(selectedRow.customerId)
    } else {
      setDrawerInvoices([])
    }
  }, [selectedRow, fetchDrawerInvoices])

  const handleCollectPayment = async () => {
    if (!selectedRow?.customerId) return
    const amount = parseFloat(collectAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (!selectedInvoiceId) {
      toast.error('Pick an invoice to collect against')
      return
    }
    if (amount > selectedInvoiceBalance + 0.01) {
      toast.error(`Amount exceeds invoice balance (${formatCurrency(selectedInvoiceBalance)})`)
      return
    }
    setCollectSubmitting(true)
    try {
      const res = await api.post(`/customers/${selectedRow.customerId}/payment`, {
        amount,
        paymentMode: collectMode,
        referenceNumber: collectReference || undefined,
        invoiceIds: [selectedInvoiceId],
      })
      toast.success(`Payment recorded · Receipt ${res.data?.receiptNumber ?? '—'}`)
      setCollectAmount('')
      setCollectReference('')
      setSelectedInvoiceId(null)
      setAmountAutoFilled(true)
      // Refresh list + the drawer's invoice table; row may now be settled.
      await fetchRows()
      if (selectedRow.customerId) {
        await fetchDrawerInvoices(selectedRow.customerId)
      }
      // Re-resolve the selected row from the refreshed list (or close drawer if customer now settled).
      const updated = (await api.get('/customers/outstanding')).data?.rows as OutstandingRow[]
      const stillOutstanding = updated?.find((r) => r.customerId === selectedRow.customerId)
      if (stillOutstanding) setSelectedRow(stillOutstanding)
      else setSelectedRow(null)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to record payment'
      toast.error(msg)
    } finally {
      setCollectSubmitting(false)
    }
  }

  // ── Stat card config ──
  // filterKey drives the click drill-down (Total clears it; aging cards narrow
  // the table to rows with a balance in that band). activeRing matches the
  // card's accent so the selected card reads as "on".
  const kpiCards = [
    {
      label: 'Total Outstanding',
      value: formatCurrency(summary.total),
      subtitle: `${rows.length} customer${rows.length !== 1 ? 's' : ''}`,
      icon: IndianRupee,
      iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      accent: 'border-l-rose-500',
      filterKey: 'all' as const,
      activeRing: 'ring-2 ring-rose-500/50',
    },
    {
      label: '0–30 Days',
      value: formatCurrency(summary.d0_30),
      subtitle: 'current + early',
      icon: Clock,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      accent: 'border-l-amber-500',
      filterKey: 'early' as const,
      activeRing: 'ring-2 ring-amber-500/50',
    },
    {
      label: '30–60 Days',
      value: formatCurrency(summary.d31_60),
      subtitle: 'follow up',
      icon: AlertTriangle,
      iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
      accent: 'border-l-orange-500',
      filterKey: 'mid' as const,
      activeRing: 'ring-2 ring-orange-500/50',
    },
    {
      label: '60+ Days',
      value: formatCurrency(summary.d60plus),
      subtitle: 'overdue · escalate',
      icon: AlertTriangle,
      iconBg: 'bg-red-500/10 text-red-700 dark:text-red-400',
      accent: 'border-l-red-500',
      filterKey: 'late' as const,
      activeRing: 'ring-2 ring-red-500/50',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* ── Summary cards (click to drill the table by aging band) ── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => {
          const active = kpi.filterKey !== 'all' && cardFilter === kpi.filterKey
          return (
          <Card
            key={kpi.label}
            hover
            role="button"
            tabIndex={0}
            title={kpi.filterKey === 'all' ? 'Show all outstanding customers' : `Filter to customers with a balance in ${kpi.label.toLowerCase()}`}
            onClick={() => { setCardFilter(active ? 'all' : kpi.filterKey); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : kpi.filterKey); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', kpi.accent, active && kpi.activeRing)}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', kpi.iconBg)}>
                <kpi.icon className="h-5 w-5" />
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

      {/* ── Filters ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search customer…"
        resultsCount={filteredRows.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        columnsNode={<ColumnsToggle columns={OUTSTANDING_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={handleBulkReminders}
            disabled={selectedIds.size === 0 || bulkSubmitting}
          >
            <Bell className="mr-1.5 h-4 w-4" />
            {bulkSubmitting
              ? 'Sending…'
              : selectedIds.size > 0
                ? `Bulk Reminders (${selectedIds.size})`
                : 'Bulk Reminders'}
          </Button>
          </div>
        }
      >
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EnumSelect
            label="Aging Bucket"
            value={bucketFilter}
            onValueChange={setBucketFilter}
            onClear={() => setBucketFilter('all')}
            options={BUCKET_OPTIONS}
          />
          <EnumSelect
            label="Min Outstanding"
            value={minOutstandingFilter}
            onValueChange={setMinOutstandingFilter}
            onClear={() => setMinOutstandingFilter('all')}
            options={MIN_OUTSTANDING_OPTIONS}
          />
        </div>
      </DataTableFilterBar>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={IndianRupee}
              title={searchQuery || activeFilterCount > 0 ? 'No matching customers' : 'All settled'}
              description={
                searchQuery || activeFilterCount > 0
                  ? 'Try adjusting your search or filters.'
                  : 'No customers have outstanding balances right now.'
              }
              actionLabel={
                searchQuery || activeFilterCount > 0 ? 'Clear filters' : undefined
              }
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
            {paginatedRows.map((row, i) => {
              const overdue60 = row['61-90'] + row['90+']
              const isSelected = !!row.customerId && selectedIds.has(row.customerId)
              return (
                <div
                  key={row.customerId ?? i}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 active:bg-muted/50',
                    isSelected && 'bg-primary/5',
                  )}
                  onClick={() => openDrawer(row)}
                >
                  <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                    {row.customerId && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => row.customerId && toggleSelectOne(row.customerId)}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CustomerNameLine
                      name={row.customer}
                      phone={row.customerPhone}
                      onNameClick={row.customerId ? () => navigate(`/customers/detail?customerId=${row.customerId}`) : undefined}
                    />
                    <p className="text-[11px] text-muted-foreground">{row.invoiceCount} invoice{row.invoiceCount !== 1 ? 's' : ''}</p>
                    {overdue60 > 0 && (
                      <p className="text-[10px] text-rose-500 font-mono mt-0.5">60+ days: {formatCurrency(overdue60)}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400">{formatCurrency(row.outstanding)}</p>
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleSelectAllOnPage}
                    />
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  {cols.isVisible('invoices') && <TableHead className="text-center">Invoices</TableHead>}
                  <TableHead className="text-right">Total Outstanding</TableHead>
                  {cols.isVisible('age0_30') && <TableHead className="text-right">0–30 Days</TableHead>}
                  {cols.isVisible('age30_60') && <TableHead className="text-right">30–60 Days</TableHead>}
                  {cols.isVisible('age60plus') && <TableHead className="text-right">60+ Days</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row, i) => {
                  const isSelected = !!row.customerId && selectedIds.has(row.customerId)
                  return (
                    <TableRow
                      key={row.customerId ?? i}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/30',
                      )}
                      onClick={() => openDrawer(row)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-10">
                        {row.customerId && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => row.customerId && toggleSelectOne(row.customerId)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <CustomerNameLine
                          name={row.customer}
                          phone={row.customerPhone}
                          onNameClick={row.customerId ? () => navigate(`/customers/detail?customerId=${row.customerId}`) : undefined}
                        />
                      </TableCell>
                      {cols.isVisible('invoices') && (
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {row.invoiceCount}
                      </TableCell>
                      )}
                      <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400 text-[15px] whitespace-nowrap">
                        {formatCurrency(row.outstanding)}
                      </TableCell>
                      {cols.isVisible('age0_30') && (
                      <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatCurrency(row.current + row['0-30'])}
                      </TableCell>
                      )}
                      {cols.isVisible('age30_60') && (
                      <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatCurrency(row['31-60'])}
                      </TableCell>
                      )}
                      {cols.isVisible('age60plus') && (
                      <TableCell className="text-right font-mono text-sm font-semibold text-rose-500 whitespace-nowrap">
                        {formatCurrency(row['61-90'] + row['90+'])}
                      </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-12">
                        <DataTableRowActions
                          onView={row.customerId ? () => openDrawer(row) : undefined}
                          customActions={[
                            ...(row.customerId ? [
                              {
                                label: 'View Customer Profile',
                                icon: <User className="h-4 w-4" />,
                                onClick: () => navigate(`/customers/detail?customerId=${row.customerId}`),
                              },
                              {
                                label: 'View Invoices',
                                icon: <Receipt className="h-4 w-4" />,
                                onClick: () => navigate(`/customers/invoices?customerId=${row.customerId}&customerName=${encodeURIComponent(row.customer)}`),
                              },
                              {
                                label: 'Send Reminder',
                                icon: <Send className="h-4 w-4" />,
                                onClick: () => handleSendReminder(row),
                              },
                            ] : []),
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
            totalItems={filteredRows.length}
            itemsPerPage={PAGE_SIZE}
            className="border-t border-border/40 px-4"
          />
        </Card>
      )}

      {/* ── Drawer ── */}
      <Sheet open={!!selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null) }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-160 lg:max-w-190 p-0 gap-0 flex flex-col"
        >
          {selectedRow && (
            <>
              {/* Sticky header */}
              <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-semibold truncate">{selectedRow.customer}</SheetTitle>
                    {selectedRow.customerPhone && selectedRow.customerPhone !== '0000000000' && (
                      <p className="font-mono text-[11px] text-muted-foreground tabular-nums mt-0.5 leading-tight">
                        {selectedRow.customerPhone}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {selectedRow.invoiceCount} unpaid invoice{selectedRow.invoiceCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(selectedRow['61-90'] + selectedRow['90+']) > 0 && (
                      <Badge variant="destructive" size="sm" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        60+ days
                      </Badge>
                    )}
                    <div className="text-right">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</p>
                      <p className="font-mono text-base font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {formatCurrency(selectedRow.outstanding)}
                      </p>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Aging mini-strip */}
                <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
                  {[
                    { label: 'Current', value: selectedRow.current },
                    { label: '0–30', value: selectedRow['0-30'] },
                    { label: '31–60', value: selectedRow['31-60'] },
                    { label: '61–90', value: selectedRow['61-90'] },
                    { label: '90+', value: selectedRow['90+'], tone: 'rose' as const },
                  ].map((cell, i) => (
                    <div
                      key={cell.label}
                      className={cn(
                        'flex flex-1 min-w-20 flex-col justify-center whitespace-nowrap px-3 py-2.5',
                        i > 0 && 'border-l border-border/40',
                      )}
                    >
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{cell.label}</p>
                      <p className={cn(
                        'mt-0.5 font-mono text-xs',
                        cell.value === 0 && 'text-muted-foreground/60',
                        cell.value > 0 && cell.tone === 'rose' && 'text-rose-600 dark:text-rose-400 font-bold',
                      )}>
                        {cell.value > 0 ? formatCurrency(cell.value) : '—'}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Open invoices — click a row to pick the one you're collecting against */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Open Invoices ({drawerInvoices.length})
                    </p>
                    {selectedInvoiceId && (
                      <p className="text-[10px] text-muted-foreground">
                        1 selected · {formatCurrency(selectedInvoiceBalance)}
                      </p>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border/40">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow className="border-b border-border/40 hover:bg-transparent">
                          <TableHead className="h-9 w-9 px-3" aria-label="Pick" />
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice #</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Age</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Paid</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drawerInvoicesLoading ? (
                          <TableRow><TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground animate-pulse">Loading invoices…</TableCell></TableRow>
                        ) : drawerInvoices.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">No open invoices.</TableCell></TableRow>
                        ) : drawerInvoices.map((inv) => {
                          const isInvSelected = selectedInvoiceId === inv.id
                          return (
                            <TableRow
                              key={inv.id}
                              className={cn(
                                'border-b border-border/30 last:border-b-0 hover:bg-muted/20 cursor-pointer',
                                isInvSelected && 'bg-primary/5',
                              )}
                              onClick={() => selectInvoice(inv.id)}
                            >
                              <TableCell className="px-3 py-2.5 w-9" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="radio"
                                  name="payment-invoice"
                                  className="h-3.5 w-3.5 accent-primary"
                                  checked={isInvSelected}
                                  onChange={() => selectInvoice(inv.id)}
                                  aria-label={`Select invoice ${inv.invoiceNumber}`}
                                />
                              </TableCell>
                              <TableCell className="px-3 py-2.5 font-mono text-xs font-semibold">{inv.invoiceNumber}</TableCell>
                              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(inv.date)}</TableCell>
                              <TableCell className={cn('px-3 py-2.5 text-xs font-mono whitespace-nowrap', inv.daysOverdue > 60 && 'text-rose-600 dark:text-rose-400 font-semibold')}>
                                {inv.daysOverdue}d
                              </TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{formatCurrency(inv.grandTotal)}</TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(inv.amountPaid)}</TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">{formatCurrency(inv.balance)}</TableCell>
                              <TableCell className="px-3 py-2.5">
                                <Badge variant={inv.status === 'PARTIAL' ? 'warning' : 'secondary'} size="sm">
                                  {inv.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Record Payment — one invoice at a time, no FIFO / multi-select */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Record Payment
                    </p>
                  </div>
                  <div className={cn(
                    'grid grid-cols-1 gap-2',
                    // Cash receipts don't carry a txn reference, so we collapse
                    // the grid to 3 cols and drop the reference input entirely
                    // for that mode. Cheque needs the cheque #, NEFT/UPI needs
                    // the UTR — both are required-feeling for reconciliation.
                    collectMode === 'cash'
                      ? 'sm:grid-cols-[160px_1fr_auto]'
                      : 'sm:grid-cols-[160px_1fr_180px_auto]',
                  )}>
                    <Select
                      value={collectMode}
                      onValueChange={(v) => {
                        const next = v as 'cash' | 'cheque' | 'neft_upi'
                        setCollectMode(next)
                        // Clear a stale reference when switching to cash so we
                        // don't accidentally send a leftover cheque # to the
                        // backend.
                        if (next === 'cash') setCollectReference('')
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="neft_upi">NEFT / UPI</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Amount"
                      className="h-9 font-mono text-sm"
                      value={collectAmount}
                      onChange={(e) => {
                        const raw = e.target.value
                        // Hard-cap the input at the selected invoice's balance —
                        // backend rejects overpayment, but bouncing it on submit
                        // is poor UX. Allow empty string so the user can clear.
                        if (raw === '' || !selectedInvoiceId) {
                          setCollectAmount(raw)
                        } else {
                          const num = parseFloat(raw)
                          if (Number.isFinite(num) && num > selectedInvoiceBalance) {
                            setCollectAmount(selectedInvoiceBalance.toFixed(2))
                          } else {
                            setCollectAmount(raw)
                          }
                        }
                        setAmountAutoFilled(false)
                      }}
                      max={selectedInvoiceBalance}
                      disabled={!selectedInvoiceId}
                    />
                    {collectMode !== 'cash' && (
                      <Input
                        type="text"
                        placeholder={collectMode === 'cheque' ? 'Cheque #' : 'UPI / Txn ref'}
                        className="h-9 text-sm"
                        value={collectReference}
                        onChange={(e) => setCollectReference(e.target.value)}
                      />
                    )}
                    <Button
                      size="sm"
                      className="gap-1.5 h-9"
                      disabled={collectSubmitting || !collectAmount || !selectedInvoiceId}
                      onClick={handleCollectPayment}
                    >
                      <Wallet className="h-4 w-4" />
                      {collectSubmitting ? 'Saving…' : 'Receive'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70">
                    {selectedInvoiceId
                      ? `Payment will be recorded against the selected invoice (balance ${formatCurrency(selectedInvoiceBalance)}).`
                      : 'Pick one invoice above to collect against. Each receipt is recorded against exactly one invoice.'}
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
                    if (!selectedRow.customerId) return
                    navigate(`/customers/detail?customerId=${selectedRow.customerId}`)
                    setSelectedRow(null)
                  }}
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">View Customer Profile</span>
                  <span className="sm:hidden">Profile</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => {
                    if (!selectedRow.customerId) return
                    navigate(`/customers/invoices?customerId=${selectedRow.customerId}&customerName=${encodeURIComponent(selectedRow.customer)}`)
                    setSelectedRow(null)
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">View Invoices</span>
                  <span className="sm:hidden">Invoices</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => handleSendReminder(selectedRow)}
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">Send Reminder</span>
                  <span className="sm:hidden">Reminder</span>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
