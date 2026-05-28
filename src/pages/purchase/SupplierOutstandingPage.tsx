import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CreditCard,
  IndianRupee,
  Clock,
  Wallet,
  User,
  FileText,
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
  supplierId: string
  supplier: string
  outstanding: number
  current: number
  '0-30': number
  '31-60': number
  '61-90': number
  '90+': number
  grnCount: number
}

type OutstandingGrn = {
  id: string
  grnNumber: string
  date: string
  supplierInvoiceNo: string
  invoiceAmount: number
  amountPaid: number
  balance: number
  status: string
  daysOverdue: number
}

const PAGE_SIZE = 15

const BUCKET_OPTIONS = [
  { value: 'all', label: 'All Aging' },
  { value: 'current', label: 'Current (received today)' },
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

export default function SupplierOutstandingPage() {
  // List state
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [bucketFilter, setBucketFilter] = useState<string>('all')
  const [minOutstandingFilter, setMinOutstandingFilter] = useState<string>('all')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Drawer
  const [selectedRow, setSelectedRow] = useState<OutstandingRow | null>(null)
  const [drawerGrns, setDrawerGrns] = useState<OutstandingGrn[]>([])
  const [drawerGrnsLoading, setDrawerGrnsLoading] = useState(false)

  // Inline record-payment form (lives inside drawer)
  const [payMode, setPayMode] = useState<'CASH' | 'CHEQUE' | 'NEFT_UPI'>('CASH')
  const [payAmount, setPayAmount] = useState('')
  const [payReference, setPayReference] = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)
  // Payment allocation: FIFO across all open GRNs, or only the ones the user picked.
  const [allocationMode, setAllocationMode] = useState<'fifo' | 'specific'>('fifo')
  const [selectedGrnIds, setSelectedGrnIds] = useState<Set<string>>(new Set())
  // True while the amount input mirrors the selected-GRNs sum, so we keep it in sync.
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
      const res = await api.get(`/suppliers/outstanding?${buildQueryParams().toString()}`, { signal: controller.signal })
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
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

  // ── Drawer flow ──
  const openDrawer = (row: OutstandingRow) => {
    setSelectedRow(row)
    setPayAmount('')
    setPayReference('')
    setPayMode('CASH')
    setAllocationMode('fifo')
    setSelectedGrnIds(new Set())
    setAmountAutoFilled(true)
  }

  // Sum of balances for GRNs the user has ticked.
  const selectedGrnsSum = useMemo(() => {
    if (selectedGrnIds.size === 0) return 0
    return drawerGrns
      .filter((g) => selectedGrnIds.has(g.id))
      .reduce((s, g) => s + g.balance, 0)
  }, [drawerGrns, selectedGrnIds])

  const toggleGrnSelection = (grnId: string) => {
    setSelectedGrnIds((prev) => {
      const next = new Set(prev)
      if (next.has(grnId)) next.delete(grnId)
      else next.add(grnId)
      return next
    })
    setAmountAutoFilled(true)
  }

  const allGrnsSelected =
    drawerGrns.length > 0 && drawerGrns.every((g) => selectedGrnIds.has(g.id))

  const toggleAllGrns = () => {
    setSelectedGrnIds((prev) => {
      if (drawerGrns.length > 0 && drawerGrns.every((g) => prev.has(g.id))) {
        return new Set()
      }
      return new Set(drawerGrns.map((g) => g.id))
    })
    setAmountAutoFilled(true)
  }

  // Keep the amount input mirroring the selected-GRN total while the user is in
  // "specific" mode and hasn't manually edited the amount yet.
  useEffect(() => {
    if (allocationMode !== 'specific') return
    if (!amountAutoFilled) return
    setPayAmount(selectedGrnsSum > 0 ? selectedGrnsSum.toFixed(2) : '')
  }, [allocationMode, amountAutoFilled, selectedGrnsSum])

  const switchAllocationMode = (mode: 'fifo' | 'specific') => {
    setAllocationMode(mode)
    setAmountAutoFilled(true)
    setSelectedGrnIds(new Set())
    setPayAmount('')
  }

  const fetchDrawerGrns = useCallback(async (supplierId: string) => {
    setDrawerGrnsLoading(true)
    try {
      const res = await api.get(`/suppliers/${supplierId}/outstanding-grns`)
      setDrawerGrns(Array.isArray(res.data) ? res.data : [])
    } catch {
      setDrawerGrns([])
    } finally {
      setDrawerGrnsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedRow?.supplierId) {
      fetchDrawerGrns(selectedRow.supplierId)
    } else {
      setDrawerGrns([])
    }
  }, [selectedRow, fetchDrawerGrns])

  const handleRecordPayment = async () => {
    if (!selectedRow?.supplierId) return
    const amount = parseFloat(payAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    if (allocationMode === 'specific') {
      if (selectedGrnIds.size === 0) {
        toast.error('Pick at least one GRN')
        return
      }
      if (amount > selectedGrnsSum + 0.01) {
        toast.error(`Amount exceeds selected GRNs (${formatCurrency(selectedGrnsSum)})`)
        return
      }
    } else if (amount > selectedRow.outstanding + 0.01) {
      toast.error(`Amount exceeds outstanding (${formatCurrency(selectedRow.outstanding)})`)
      return
    }
    setPaySubmitting(true)
    try {
      const res = await api.post(`/suppliers/${selectedRow.supplierId}/payment`, {
        amount,
        paymentMode: payMode,
        referenceNumber: payReference || undefined,
        ...(allocationMode === 'specific'
          ? { grnIds: Array.from(selectedGrnIds) }
          : {}),
      })
      toast.success(`Payment recorded · ${res.data?.paymentNumber ?? ''}`)
      setPayAmount('')
      setPayReference('')
      setSelectedGrnIds(new Set())
      setAmountAutoFilled(true)
      // Refresh list + the drawer's GRN table; supplier may now be settled.
      await fetchRows()
      await fetchDrawerGrns(selectedRow.supplierId)
      // Re-resolve the selected row from the refreshed list (or close if settled).
      const updated = (await api.get('/suppliers/outstanding')).data?.rows as OutstandingRow[]
      const stillOutstanding = updated?.find((r) => r.supplierId === selectedRow.supplierId)
      if (stillOutstanding) setSelectedRow(stillOutstanding)
      else setSelectedRow(null)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message ?? 'Failed to record payment'
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setPaySubmitting(false)
    }
  }

  // ── Stat card config ──
  const kpiCards = [
    {
      label: 'Total Outstanding',
      value: formatCurrency(summary.total),
      subtitle: `${rows.length} supplier${rows.length !== 1 ? 's' : ''}`,
      icon: IndianRupee,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      accent: 'border-l-amber-500',
    },
    {
      label: '0–30 Days',
      value: formatCurrency(summary.d0_30),
      subtitle: 'current + early',
      icon: Clock,
      iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      accent: 'border-l-sky-500',
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
      subtitle: 'overdue · settle',
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
        searchPlaceholder="Search supplier…"
        resultsCount={rows.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
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
              title={searchQuery || activeFilterCount > 0 ? 'No matching suppliers' : 'All settled'}
              description={
                searchQuery || activeFilterCount > 0
                  ? 'Try adjusting your search or filters.'
                  : 'No suppliers have outstanding balances right now.'
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
              return (
                <div
                  key={row.supplierId ?? i}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 active:bg-muted/50"
                  onClick={() => openDrawer(row)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{row.supplier}</p>
                    <p className="text-[11px] text-muted-foreground">{row.grnCount} PR{row.grnCount !== 1 ? 's' : ''}</p>
                    {overdue60 > 0 && (
                      <p className="text-[10px] text-rose-500 font-mono mt-0.5">60+ days: {formatCurrency(overdue60)}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(row.outstanding)}</p>
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
                  <TableHead className="text-center">PRs</TableHead>
                  <TableHead className="text-right">Total Outstanding</TableHead>
                  <TableHead className="text-right">0–30 Days</TableHead>
                  <TableHead className="text-right">30–60 Days</TableHead>
                  <TableHead className="text-right">60+ Days</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row, i) => (
                  <TableRow
                    key={row.supplierId ?? i}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => openDrawer(row)}
                  >
                    <TableCell className="font-medium">{row.supplier}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {row.grnCount}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-amber-600 dark:text-amber-400 text-sm whitespace-nowrap">
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
                        onView={() => openDrawer(row)}
                        customActions={[
                          {
                            label: 'View Supplier Profile',
                            icon: <User className="h-4 w-4" />,
                            onClick: () => navigate(`/purchase/suppliers/detail?supplierId=${row.supplierId}`),
                          },
                        ]}
                      />
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
                    <SheetTitle className="text-base font-semibold truncate">{selectedRow.supplier}</SheetTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {selectedRow.grnCount} open PR{selectedRow.grnCount !== 1 ? 's' : ''}
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
                      <p className="font-mono text-base font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
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

                {/* Open GRNs */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Open PRs ({drawerGrns.length})
                    </p>
                    {allocationMode === 'specific' && drawerGrns.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {selectedGrnIds.size} selected · {formatCurrency(selectedGrnsSum)}
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
                                checked={allGrnsSelected}
                                onCheckedChange={toggleAllGrns}
                                aria-label="Select all PRs"
                              />
                            </TableHead>
                          )}
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PR #</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Age</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Paid</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drawerGrnsLoading ? (
                          <TableRow><TableCell colSpan={allocationMode === 'specific' ? 8 : 7} className="py-6 text-center text-xs text-muted-foreground animate-pulse">Loading PRs…</TableCell></TableRow>
                        ) : drawerGrns.length === 0 ? (
                          <TableRow><TableCell colSpan={allocationMode === 'specific' ? 8 : 7} className="py-6 text-center text-xs text-muted-foreground">No open PRs.</TableCell></TableRow>
                        ) : drawerGrns.map((g) => {
                          const isSelected = selectedGrnIds.has(g.id)
                          const rowClickable = allocationMode !== 'specific'
                          return (
                            <TableRow
                              key={g.id}
                              className={cn(
                                'border-b border-border/30 last:border-b-0 hover:bg-muted/20',
                                rowClickable && 'cursor-pointer',
                                allocationMode === 'specific' && isSelected && 'bg-primary/5',
                              )}
                              onClick={() => {
                                if (allocationMode === 'specific') {
                                  toggleGrnSelection(g.id)
                                  return
                                }
                                navigate(`/purchase/grn-list?grnId=${g.id}`)
                                setSelectedRow(null)
                              }}
                            >
                              {allocationMode === 'specific' && (
                                <TableCell className="px-3 py-2.5 w-9" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleGrnSelection(g.id)}
                                    aria-label={`Select PR ${g.grnNumber}`}
                                  />
                                </TableCell>
                              )}
                              <TableCell className="px-3 py-2.5 font-mono text-xs font-semibold">{g.grnNumber}</TableCell>
                              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(g.date)}</TableCell>
                              <TableCell className={cn('px-3 py-2.5 text-xs font-mono whitespace-nowrap', g.daysOverdue > 60 && 'text-rose-600 dark:text-rose-400 font-semibold')}>
                                {g.daysOverdue}d
                              </TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{formatCurrency(g.invoiceAmount)}</TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(g.amountPaid)}</TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">{formatCurrency(g.balance)}</TableCell>
                              <TableCell className="px-3 py-2.5">
                                <Badge variant={g.status === 'PARTIAL' ? 'warning' : 'secondary'} size="sm">
                                  {g.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Inline Record Payment form — FIFO or GRN-specific */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Record Payment
                      </p>
                    </div>
                    <div className="inline-flex rounded-md border border-emerald-300/60 bg-white/60 p-0.5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
                      <button
                        type="button"
                        onClick={() => switchAllocationMode('fifo')}
                        className={cn(
                          'h-7 rounded px-2.5 text-[11px] font-medium transition-colors',
                          allocationMode === 'fifo'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-800 hover:bg-emerald-100/60 dark:text-emerald-300 dark:hover:bg-emerald-900/30',
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
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-emerald-800 hover:bg-emerald-100/60 dark:text-emerald-300 dark:hover:bg-emerald-900/30',
                        )}
                      >
                        Specific PR(s)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_180px_auto] gap-2">
                    <Select value={payMode} onValueChange={(v) => setPayMode(v as 'CASH' | 'CHEQUE' | 'NEFT_UPI')}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
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
                      onChange={(e) => { setPayAmount(e.target.value); setAmountAutoFilled(false) }}
                      max={allocationMode === 'specific' ? selectedGrnsSum : selectedRow.outstanding}
                      disabled={allocationMode === 'specific' && selectedGrnIds.size === 0}
                    />
                    <Input
                      type="text"
                      placeholder={payMode === 'CHEQUE' ? 'Cheque #' : payMode === 'NEFT_UPI' ? 'UPI / Txn ref' : 'Reference (optional)'}
                      className="h-9 text-sm"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                    />
                    <Button
                      size="sm"
                      className="gap-1.5 h-9"
                      disabled={
                        paySubmitting ||
                        !payAmount ||
                        (allocationMode === 'specific' && selectedGrnIds.size === 0)
                      }
                      onClick={handleRecordPayment}
                    >
                      <Wallet className="h-4 w-4" />
                      {paySubmitting ? 'Saving…' : 'Pay'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
                    {allocationMode === 'fifo'
                      ? 'Payment will be allocated to oldest open PR(s) first.'
                      : selectedGrnIds.size === 0
                        ? 'Tick one or more PRs above to pay against them.'
                        : `Payment will be allocated to the ${selectedGrnIds.size} selected PR${selectedGrnIds.size !== 1 ? 's' : ''} (oldest-first within selection).`}
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
                    navigate(`/purchase/suppliers/detail?supplierId=${selectedRow.supplierId}`)
                    setSelectedRow(null)
                  }}
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">View Supplier Profile</span>
                  <span className="sm:hidden">Profile</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => {
                    navigate('/purchase/grn-list')
                    setSelectedRow(null)
                  }}
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">View Purchase Received</span>
                  <span className="sm:hidden">PRs</span>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
