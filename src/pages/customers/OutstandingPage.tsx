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
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
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
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'

// ─────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────

type OutstandingRow = {
  customerId: string | null
  customer: string
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

export default function OutstandingPage() {
  // List state
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [bucketFilter, setBucketFilter] = useState<string>('all')
  const [minOutstandingFilter, setMinOutstandingFilter] = useState<string>('all')

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
  // Payment allocation strategy: FIFO across all open invoices, or only the ones the user picked.
  const [allocationMode, setAllocationMode] = useState<'fifo' | 'specific'>('fifo')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  // True while the amount input mirrors the selected-invoices sum, so we keep it in sync.
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
  }, [searchQuery, bucketFilter, minOutstandingFilter])

  // ── Derived ──
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const paginatedRows = useMemo(
    () => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [rows, currentPage],
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
    (minOutstandingFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setBucketFilter('all')
    setMinOutstandingFilter('all')
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
    setAllocationMode('fifo')
    setSelectedInvoiceIds(new Set())
    setAmountAutoFilled(true)
  }

  // Sum of balances for invoices the user has ticked.
  const selectedInvoicesSum = useMemo(() => {
    if (selectedInvoiceIds.size === 0) return 0
    return drawerInvoices
      .filter((inv) => selectedInvoiceIds.has(inv.id))
      .reduce((s, inv) => s + inv.balance, 0)
  }, [drawerInvoices, selectedInvoiceIds])

  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev)
      if (next.has(invoiceId)) next.delete(invoiceId)
      else next.add(invoiceId)
      return next
    })
    setAmountAutoFilled(true)
  }

  const allInvoicesSelected =
    drawerInvoices.length > 0 && drawerInvoices.every((inv) => selectedInvoiceIds.has(inv.id))

  const toggleAllInvoices = () => {
    setSelectedInvoiceIds((prev) => {
      if (drawerInvoices.length > 0 && drawerInvoices.every((inv) => prev.has(inv.id))) {
        return new Set()
      }
      return new Set(drawerInvoices.map((inv) => inv.id))
    })
    setAmountAutoFilled(true)
  }

  // Keep the amount input mirroring the selected-invoice total while the user
  // is in "specific" mode and hasn't manually edited the amount yet.
  useEffect(() => {
    if (allocationMode !== 'specific') return
    if (!amountAutoFilled) return
    setCollectAmount(selectedInvoicesSum > 0 ? selectedInvoicesSum.toFixed(2) : '')
  }, [allocationMode, amountAutoFilled, selectedInvoicesSum])

  const switchAllocationMode = (mode: 'fifo' | 'specific') => {
    setAllocationMode(mode)
    setAmountAutoFilled(true)
    if (mode === 'fifo') {
      setSelectedInvoiceIds(new Set())
      setCollectAmount('')
    } else {
      setCollectAmount('')
    }
  }

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
    if (allocationMode === 'specific') {
      if (selectedInvoiceIds.size === 0) {
        toast.error('Pick at least one invoice')
        return
      }
      if (amount > selectedInvoicesSum + 0.01) {
        toast.error(`Amount exceeds selected invoices (${formatCurrency(selectedInvoicesSum)})`)
        return
      }
    } else if (amount > selectedRow.outstanding) {
      toast.error(`Amount exceeds outstanding (${formatCurrency(selectedRow.outstanding)})`)
      return
    }
    setCollectSubmitting(true)
    try {
      const res = await api.post(`/customers/${selectedRow.customerId}/payment`, {
        amount,
        paymentMode: collectMode,
        referenceNumber: collectReference || undefined,
        ...(allocationMode === 'specific'
          ? { invoiceIds: Array.from(selectedInvoiceIds) }
          : {}),
      })
      toast.success(`Payment recorded · Receipt ${res.data?.receiptNumber ?? '—'}`)
      setCollectAmount('')
      setCollectReference('')
      setSelectedInvoiceIds(new Set())
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
  const kpiCards = [
    {
      label: 'Total Outstanding',
      value: formatCurrency(summary.total),
      subtitle: `${rows.length} customer${rows.length !== 1 ? 's' : ''}`,
      icon: IndianRupee,
      iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      accent: 'border-l-rose-500',
    },
    {
      label: '0–30 Days',
      value: formatCurrency(summary.d0_30),
      subtitle: 'current + early',
      icon: Clock,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      accent: 'border-l-amber-500',
    },
    {
      label: '30–60 Days',
      value: formatCurrency(summary.d31_60),
      subtitle: 'follow up',
      icon: AlertTriangle,
      iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
      accent: 'border-l-orange-500',
    },
    {
      label: '60+ Days',
      value: formatCurrency(summary.d60plus),
      subtitle: 'overdue · escalate',
      icon: AlertTriangle,
      iconBg: 'bg-red-500/10 text-red-700 dark:text-red-400',
      accent: 'border-l-red-500',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* ── Summary cards ── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} hover className={cn('border-l-[3px]', kpi.accent)}>
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
        ))}
      </div>

      {/* ── Filters ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search customer…"
        resultsCount={rows.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        actionNode={
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
      ) : rows.length === 0 ? (
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
                    <p className="text-sm font-medium truncate">{row.customer}</p>
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
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead className="text-right">Total Outstanding</TableHead>
                  <TableHead className="text-right">0–30 Days</TableHead>
                  <TableHead className="text-right">30–60 Days</TableHead>
                  <TableHead className="text-right">60+ Days</TableHead>
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
                      <TableCell className="font-medium">{row.customer}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {row.invoiceCount}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400 text-sm whitespace-nowrap">
                        {formatCurrency(row.outstanding)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatCurrency(row.current + row['0-30'])}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatCurrency(row['31-60'])}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-rose-500 whitespace-nowrap">
                        {formatCurrency(row['61-90'] + row['90+'])}
                      </TableCell>
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
            totalItems={rows.length}
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
                        'flex flex-1 min-w-[80px] flex-col justify-center whitespace-nowrap px-3 py-2.5',
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

                {/* Overdue invoices */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Open Invoices ({drawerInvoices.length})
                    </p>
                    {allocationMode === 'specific' && drawerInvoices.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {selectedInvoiceIds.size} selected · {formatCurrency(selectedInvoicesSum)}
                      </p>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border/40">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow className="border-b border-border/40 hover:bg-transparent">
                          {allocationMode === 'specific' && (
                            <TableHead className="h-9 w-9 px-3">
                              <Checkbox
                                checked={allInvoicesSelected}
                                onCheckedChange={toggleAllInvoices}
                                aria-label="Select all invoices"
                              />
                            </TableHead>
                          )}
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
                          <TableRow><TableCell colSpan={allocationMode === 'specific' ? 8 : 7} className="py-6 text-center text-xs text-muted-foreground animate-pulse">Loading invoices…</TableCell></TableRow>
                        ) : drawerInvoices.length === 0 ? (
                          <TableRow><TableCell colSpan={allocationMode === 'specific' ? 8 : 7} className="py-6 text-center text-xs text-muted-foreground">No open invoices.</TableCell></TableRow>
                        ) : drawerInvoices.map((inv) => {
                          const isInvSelected = selectedInvoiceIds.has(inv.id)
                          const rowClickable = allocationMode !== 'specific'
                          return (
                            <TableRow
                              key={inv.id}
                              className={cn(
                                'border-b border-border/30 last:border-b-0 hover:bg-muted/20',
                                rowClickable && 'cursor-pointer',
                                allocationMode === 'specific' && isInvSelected && 'bg-primary/5',
                              )}
                              onClick={() => {
                                if (allocationMode === 'specific') {
                                  toggleInvoiceSelection(inv.id)
                                  return
                                }
                                if (!selectedRow?.customerId) return
                                navigate(`/customers/invoices?customerId=${selectedRow.customerId}&customerName=${encodeURIComponent(selectedRow.customer)}`)
                                setSelectedRow(null)
                              }}
                            >
                              {allocationMode === 'specific' && (
                                <TableCell className="px-3 py-2.5 w-9" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isInvSelected}
                                    onCheckedChange={() => toggleInvoiceSelection(inv.id)}
                                    aria-label={`Select invoice ${inv.invoiceNumber}`}
                                  />
                                </TableCell>
                              )}
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

                {/* Inline Record Payment form — FIFO or invoice-specific */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        Record Payment
                      </p>
                    </div>
                    <div className="inline-flex rounded-md border border-amber-300/60 bg-white/60 p-0.5 dark:border-amber-900/60 dark:bg-amber-950/40">
                      <button
                        type="button"
                        onClick={() => switchAllocationMode('fifo')}
                        className={cn(
                          'h-7 rounded px-2.5 text-[11px] font-medium transition-colors',
                          allocationMode === 'fifo'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-amber-800 hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-900/30',
                        )}
                      >
                        FIFO (oldest first)
                      </button>
                      <button
                        type="button"
                        onClick={() => switchAllocationMode('specific')}
                        className={cn(
                          'h-7 rounded px-2.5 text-[11px] font-medium transition-colors',
                          allocationMode === 'specific'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-amber-800 hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-900/30',
                        )}
                      >
                        Specific invoice(s)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_180px_auto] gap-2">
                    <Select value={collectMode} onValueChange={(v) => setCollectMode(v as 'cash' | 'cheque' | 'neft_upi')}>
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
                      onChange={(e) => { setCollectAmount(e.target.value); setAmountAutoFilled(false) }}
                      max={allocationMode === 'specific' ? selectedInvoicesSum : selectedRow.outstanding}
                      disabled={allocationMode === 'specific' && selectedInvoiceIds.size === 0}
                    />
                    <Input
                      type="text"
                      placeholder={collectMode === 'cheque' ? 'Cheque #' : collectMode === 'neft_upi' ? 'UPI / Txn ref' : 'Reference (optional)'}
                      className="h-9 text-sm"
                      value={collectReference}
                      onChange={(e) => setCollectReference(e.target.value)}
                    />
                    <Button
                      size="sm"
                      className="gap-1.5 h-9"
                      disabled={
                        collectSubmitting ||
                        !collectAmount ||
                        (allocationMode === 'specific' && selectedInvoiceIds.size === 0)
                      }
                      onClick={handleCollectPayment}
                    >
                      <Wallet className="h-4 w-4" />
                      {collectSubmitting ? 'Saving…' : 'Receive'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70">
                    {allocationMode === 'fifo'
                      ? 'Payment will be allocated to oldest unpaid invoice(s) first.'
                      : selectedInvoiceIds.size === 0
                        ? 'Tick one or more invoices above to collect against them.'
                        : `Payment will be allocated to the ${selectedInvoiceIds.size} selected invoice${selectedInvoiceIds.size !== 1 ? 's' : ''} (oldest-first within selection).`}
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
