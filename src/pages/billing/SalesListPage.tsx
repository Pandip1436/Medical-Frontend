import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Printer,
  Share2,
  Copy,
  RotateCcw,
  IndianRupee,
  CheckCircle2,
  Undo2,
  ChevronLeft,
  ChevronRight,
  X,
  Receipt,
  FileX2,
  Clock,
  User,
  Stethoscope,
  CalendarDays,
  CreditCard,
  Wallet,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import type { Invoice } from '@/types'
import {
  downloadInvoicePdf,
  printInvoicePdf,
  shareInvoiceViaWhatsApp,
} from '@/lib/pdf/invoicePdf'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { navigate } from '@/lib/router'
import { exportToCsv, printReport } from '@/lib/exportUtils'

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

const PAYMENT_MODE_OPTIONS = [
  { value: 'all', label: 'All Modes' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'SPLIT', label: 'Split' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

const paymentModeLabels: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CREDIT: 'Credit',
  SPLIT: 'Split',
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function SalesListPage() {
  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [period, setPeriod] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string>('all')
  const [salespersonsList, setSalespersonsList] = useState<{ id: string; name: string }[]>([])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Real Data State
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { customers, fetchMasterData } = useMasterDataStore()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchMasterData()
  }, [])

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/billing')
      setInvoices(res.data.data || res.data)
    } catch (error) {
      toast.error('Failed to load invoices')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchInvoices() }, [])
  useBranchRefresh(fetchInvoices)

  useEffect(() => {
    api.get('/salespersons').then((res) => {
      setSalespersonsList(Array.isArray(res.data) ? res.data.map((s: any) => ({ id: s.id, name: s.name })) : [])
    }).catch(() => setSalespersonsList([]))
  }, [])

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Detail dialog
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)

  // Collect payment
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMode, setCollectMode] = useState('CASH')
  const [collectSubmitting, setCollectSubmitting] = useState(false)

  const handleCollectPayment = async () => {
    if (!detailInvoice || !collectAmount) return
    setCollectSubmitting(true)
    try {
      const res = await api.patch(`/billing/${detailInvoice.id}/collect-payment`, {
        amountReceived: parseFloat(collectAmount),
        paymentMode: collectMode,
      })
      toast.success('Payment collected successfully')
      setCollectAmount('')
      setDetailInvoice(res.data)
      fetchInvoices()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to collect payment')
    } finally {
      setCollectSubmitting(false)
    }
  }

  const clearFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    setSelectedCustomer('all')
    setSelectedPaymentMode('all')
    setSelectedStatus('all')
    setAmountMin('')
    setAmountMax('')
    setSelectedSalespersonId('all')
  }

  // ── Filtering logic ──

  const filteredInvoices = useMemo(() => {
    let result = [...invoices]

    // Period filter
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((inv) => inv.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        const weekStr = weekAgo.toISOString().slice(0, 10)
        result = result.filter((inv) => inv.date.slice(0, 10) >= weekStr)
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter((inv) => inv.date.slice(0, 10) >= monthStart)
        break
      }
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        const quarterStart = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`
        result = result.filter((inv) => inv.date.slice(0, 10) >= quarterStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter((inv) => inv.date.slice(0, 10) >= dateFrom)
        if (dateTo) result = result.filter((inv) => inv.date.slice(0, 10) <= dateTo)
        break
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q)
      )
    }

    // Customer
    if (selectedCustomer && selectedCustomer !== 'all') {
      result = result.filter((inv) => inv.customerId === selectedCustomer)
    }

    // Payment mode
    if (selectedPaymentMode && selectedPaymentMode !== 'all') {
      result = result.filter((inv) => inv.paymentMode === selectedPaymentMode)
    }

    // Status
    if (selectedStatus && selectedStatus !== 'all') {
      result = result.filter((inv) => inv.status === selectedStatus)
    }

    // Salesperson
    if (selectedSalespersonId && selectedSalespersonId !== 'all') {
      result = result.filter((inv) => inv.salespersonId === selectedSalespersonId)
    }

    // Amount range
    if (amountMin) {
      result = result.filter((inv) => inv.grandTotal >= parseFloat(amountMin))
    }
    if (amountMax) {
      result = result.filter((inv) => inv.grandTotal <= parseFloat(amountMax))
    }

    return result
  }, [
    invoices,
    searchQuery,
    period,
    dateFrom,
    dateTo,
    selectedCustomer,
    selectedPaymentMode,
    selectedStatus,
    amountMin,
    amountMax,
    selectedSalespersonId,
  ])

  // ── Stats ──

  const stats = useMemo(() => {
    const invs = invoices.filter((inv) => inv.type === 'INVOICE')
    const totalSales = invs.reduce((sum, inv) => sum + Number(inv.grandTotal), 0)
    const paidTotal = invs
      .filter((inv) => inv.status === 'PAID')
      .reduce((sum, inv) => sum + Number(inv.grandTotal), 0)
    const pendingTotal = invs
      .filter((inv) => inv.status === 'CREDIT' || inv.status === 'PARTIAL')
      .reduce((sum, inv) => sum + Number(inv.grandTotal), 0)
    return {
      totalSales,
      totalInvoices: invs.length,
      paidCount: invs.filter((inv) => inv.status === 'PAID').length,
      paidTotal,
      creditCount: invs.filter((inv) => inv.status === 'CREDIT' || inv.status === 'PARTIAL').length,
      pendingTotal,
      returnsCount: invs.filter((inv) => inv.status === 'RETURNED').length,
    }
  }, [invoices])

  // ── Pagination ──

  const totalPages = Math.ceil(filteredInvoices.length / PAGE_SIZE)
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const rangeStart = filteredInvoices.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredInvoices.length)

  // ── Bulk select ──

  const allOnPageSelected =
    paginatedInvoices.length > 0 &&
    paginatedInvoices.every((inv) => selectedIds.has(inv.id))

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const newSet = new Set(selectedIds)
      paginatedInvoices.forEach((inv) => newSet.delete(inv.id))
      setSelectedIds(newSet)
    } else {
      const newSet = new Set(selectedIds)
      paginatedInvoices.forEach((inv) => newSet.add(inv.id))
      setSelectedIds(newSet)
    }
  }

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  // ── Format invoice number ──
  // Backend now generates atomic, FY-aware numbers like INV/26-27/00001 via
  // DocumentNumberingService, so display them as-is. Hardcoded org prefix
  // belongs in print/PDF templates (driven by business profile), not here.
  const formatInvoiceNumber = (inv: Invoice) => inv.invoiceNumber

  // ── Active filters count ──
  const activeFilterCount = [
    period !== 'all' ? period : '',
    dateFrom,
    dateTo,
    selectedCustomer !== 'all' ? selectedCustomer : '',
    selectedPaymentMode !== 'all' ? selectedPaymentMode : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    amountMin,
    amountMax,
    selectedSalespersonId !== 'all' ? selectedSalespersonId : '',
  ].filter(Boolean).length

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales & Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage all sales transactions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            if (!filteredInvoices.length) { toast.info('No invoices to export'); return }
            exportToCsv(filteredInvoices.map((inv) => ({
              Invoice: inv.invoiceNumber,
              Date: formatDate(inv.date),
              Customer: inv.customerName,
              Total: inv.grandTotal,
              Paid: inv.amountPaid,
              Status: inv.status,
            })), 'sales-invoices')
          }}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const token = localStorage.getItem('auth_token')
              const res = await fetch('/api/v1/billing/export/tally-xml', {
                headers: { Authorization: `Bearer ${token}` },
              })
              if (!res.ok) throw new Error('Export failed')
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'tally-export.xml'
              a.click()
              URL.revokeObjectURL(url)
              toast.success('Tally XML downloaded')
            } catch {
              toast.error('Failed to export Tally XML')
            }
          }}>
            <Download className="mr-1.5 h-4 w-4" />
            Tally XML
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (filteredInvoices.length === 0) { toast.info('No invoices to print'); return }
              filteredInvoices.forEach((inv) => printInvoicePdf(inv))
            }}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print All
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Sales',
            value: formatCurrency(stats.totalSales),
            subtitle: `${stats.totalInvoices} invoices`,
            icon: IndianRupee,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Collected',
            value: formatCurrency(stats.paidTotal),
            subtitle: `${stats.paidCount} paid`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(stats.pendingTotal),
            subtitle: `${stats.creditCount} pending`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
          },
          {
            label: 'Returns',
            value: stats.returnsCount.toString(),
            subtitle: 'this period',
            icon: Undo2,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
          },
        ].map((stat) => (
          <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.iconBg)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-lg font-bold font-mono leading-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1) }}
        searchPlaceholder="Search invoice# or customer..."
        resultsCount={filteredInvoices.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
      >
        <EnumSelect
          label="Period"
          value={period}
          onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
          onClear={() => { setPeriod('all'); setCurrentPage(1) }}
          options={PERIOD_OPTIONS}
        />

        {/* Custom date range — only when period is 'custom' */}
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date From
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date To
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
              />
            </div>
          </>
        )}

        <EnumSelect
          label="Customer"
          value={selectedCustomer}
          onValueChange={(val) => { setSelectedCustomer(val); setCurrentPage(1) }}
          onClear={() => { setSelectedCustomer('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Customers' },
            ...customers.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />

        <EnumSelect
          label="Payment Mode"
          value={selectedPaymentMode}
          onValueChange={(val) => { setSelectedPaymentMode(val); setCurrentPage(1) }}
          onClear={() => { setSelectedPaymentMode('all'); setCurrentPage(1) }}
          options={PAYMENT_MODE_OPTIONS}
        />

        <EnumSelect
          label="Status"
          value={selectedStatus}
          onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
          onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
          options={STATUS_OPTIONS}
        />

        {salespersonsList.length > 0 && (
          <EnumSelect
            label="Salesperson"
            value={selectedSalespersonId}
            onValueChange={(val) => { setSelectedSalespersonId(val); setCurrentPage(1) }}
            onClear={() => { setSelectedSalespersonId('all'); setCurrentPage(1) }}
            options={[
              { value: 'all', label: 'All Salespersons' },
              ...salespersonsList.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        )}

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
              onChange={(e) => { setAmountMin(e.target.value); setCurrentPage(1) }}
              className="w-full"
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              type="number"
              placeholder="Max"
              value={amountMax}
              onChange={(e) => { setAmountMax(e.target.value); setCurrentPage(1) }}
              className="w-full"
            />
          </div>
        </div>
      </DataTableFilterBar>

      {/* ── Bulk actions bar ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 dark:bg-primary/10">
              <Badge variant="default" size="sm" dot>
                {selectedIds.size} selected
              </Badge>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = filteredInvoices.filter((inv) => selectedIds.has(inv.id))
                  printReport(selected.map((inv) => ({
                    Invoice: inv.invoiceNumber,
                    Date: inv.date?.slice(0, 10) ?? '',
                    Customer: inv.customerName,
                    Amount: inv.grandTotal,
                    Status: inv.status,
                  })), 'Sales Invoices')
                }}>
                  <Printer className="mr-1 h-3.5 w-3.5" />
                  Print
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = filteredInvoices.filter((inv) => selectedIds.has(inv.id))
                  exportToCsv(selected.map((inv) => ({
                    Invoice: inv.invoiceNumber,
                    Date: inv.date?.slice(0, 10) ?? '',
                    Customer: inv.customerName,
                    Amount: inv.grandTotal,
                    'Payment Mode': inv.paymentMode,
                    Status: inv.status,
                  })), 'sales-invoices-selected')
                }}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                onClick={() => setSelectedIds(new Set())}
              >
                <X />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mobile Cards / Desktop Table ── */}
      <Card>
        {/* ── MOBILE CARD LIST (hidden on md+) ── */}
        <div className="lg:hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Fetching invoices...</p>
            </div>
          ) : paginatedInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                <FileX2 className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No invoices found</p>
              <p className="text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {paginatedInvoices.map((inv, idx) => (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: idx * 0.02 }}
                  className="flex flex-col gap-2 p-4 cursor-pointer active:bg-muted/30"
                  onClick={() => setDetailInvoice(inv)}
                >
                  {/* Row 1: Invoice # + Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      <span className="font-mono text-[11px] font-semibold">{formatInvoiceNumber(inv)}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(inv.date)}</span>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                  {/* Row 2: Customer + Doctor */}
                  <div>
                    <p className="text-sm font-medium leading-tight">{inv.customerName}</p>
                    {inv.doctorName && (
                      <p className="text-[11px] text-muted-foreground">{inv.doctorName}</p>
                    )}
                  </div>
                  {/* Row 3: Items + Payment + Total + Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" size="sm">{inv.items?.length ?? 0} items</Badge>
                      <Badge
                        variant={inv.paymentMode === 'CREDIT' ? 'warning' : 'outline'}
                        size="sm"
                        dot={inv.paymentMode === 'CREDIT'}
                        className="capitalize"
                      >
                        {paymentModeLabels[inv.paymentMode] || inv.paymentMode}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{formatCurrency(inv.grandTotal)}</span>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DataTableRowActions
                          onView={() => setDetailInvoice(inv)}
                          onPrint={() => printInvoicePdf(inv)}
                          onDelete={async () => {
                            const ok = window.confirm(
                              `Cancel invoice ${inv.invoiceNumber} for ${inv.customerName}? This is irreversible — the invoice will stay on record but be marked CANCELLED. Stock will not be restored automatically.`,
                            )
                            if (!ok) return
                            try {
                              await api.patch(`/billing/${inv.id}`, { status: 'CANCELLED' })
                              toast.success('Invoice cancelled')
                              fetchInvoices()
                            } catch {
                              toast.error('Failed to cancel invoice')
                            }
                          }}
                          deleteLabel="Cancel"
                          customActions={[
                            { label: 'Share', icon: <Share2 className="h-4 w-4" />, onClick: () => shareInvoiceViaWhatsApp(inv) },
                            { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => navigate(`/billing/new?duplicateId=${inv.id}`) },
                            { label: 'Return', icon: <RotateCcw className="h-4 w-4" />, onClick: () => navigate(`/billing/returns?invoiceId=${inv.id}&invoiceNumber=${encodeURIComponent(inv.invoiceNumber)}`) },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* ── DESKTOP TABLE (hidden on mobile) ── */}
        <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Fetching invoices...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                        <FileX2 className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          No invoices found
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                          Try adjusting your search or filters
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedInvoices.map((inv, idx) => (
                  <motion.tr
                    key={inv.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, delay: idx * 0.02 }}
                    className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                    onClick={() => setDetailInvoice(inv)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(inv.id)}
                        onCheckedChange={() => toggleSelectOne(inv.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Receipt className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="font-mono text-[11px] font-medium">
                          {formatInvoiceNumber(inv)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(inv.date)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-45">
                      <p className="truncate text-sm font-medium">{inv.customerName}</p>
                      {inv.doctorName && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {inv.doctorName}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" size="sm">
                        {inv.items?.length ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatCurrency(inv.grandTotal)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={inv.paymentMode === 'CREDIT' ? 'warning' : 'outline'}
                        size="sm"
                        dot={inv.paymentMode === 'CREDIT'}
                        className="capitalize"
                      >
                        {paymentModeLabels[inv.paymentMode] || inv.paymentMode}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => setDetailInvoice(inv)}
                        onPrint={() => printInvoicePdf(inv)}
                        onDelete={async () => {
                          const ok = window.confirm(
                            `Cancel invoice ${inv.invoiceNumber} for ${inv.customerName}? This is irreversible — the invoice will stay on record but be marked CANCELLED. Stock will not be restored automatically.`,
                          )
                          if (!ok) return
                          try {
                            await api.patch(`/billing/${inv.id}`, { status: 'CANCELLED' })
                            toast.success('Invoice cancelled')
                            fetchInvoices()
                          } catch {
                            toast.error('Failed to cancel invoice')
                          }
                        }}
                        deleteLabel="Cancel"
                        customActions={[
                          {
                            label: 'Share',
                            icon: <Share2 className="h-4 w-4" />,
                            onClick: () => shareInvoiceViaWhatsApp(inv)
                          },
                          {
                            label: 'Duplicate',
                            icon: <Copy className="h-4 w-4" />,
                            onClick: () => navigate(`/billing/new?duplicateId=${inv.id}`)
                          },
                          {
                            label: 'Return',
                            icon: <RotateCcw className="h-4 w-4" />,
                            onClick: () => navigate(`/billing/returns?invoiceId=${inv.id}&invoiceNumber=${encodeURIComponent(inv.invoiceNumber)}`)
                          }
                        ]}
                      />
                    </TableCell>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
        </div>{/* end desktop table */}

        {/* Pagination — shared */}
        <div className="flex flex-col items-center gap-2 border-t border-border/40 px-4 py-3 sm:flex-row sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of{' '}
            <span className="font-medium text-foreground">{filteredInvoices.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Prev</span>
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {currentPage} / {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <span className="hidden sm:inline mr-1">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Invoice Detail Dialog ── */}
      <Dialog open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null) }}>
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-2xl md:w-full md:h-auto md:max-h-[90vh] md:overflow-y-auto overflow-y-auto">
          {detailInvoice && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <DialogTitle className="font-mono text-base">
                      {formatInvoiceNumber(detailInvoice)}
                    </DialogTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(detailInvoice.date)}
                    </p>
                  </div>
                  <StatusBadge status={detailInvoice.status} />
                </div>
              </DialogHeader>

              {/* Meta info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
                    <p className="font-medium">{detailInvoice.customerName}</p>
                  </div>
                </div>
                {detailInvoice.doctorName && (
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Doctor</p>
                      <p className="font-medium">{detailInvoice.doctorName}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment</p>
                    <p className="font-medium">{detailInvoice.paymentMode}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Billing Type</p>
                    <p className="font-medium">{detailInvoice.billingType}</p>
                  </div>
                </div>
              </div>

              {/* Items table */}
              <div className="overflow-hidden rounded-xl border border-border/40">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">GST%</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailInvoice.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{item.productName}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{item.batchNumber}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(item.rate)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{item.gstPercent}%</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
                {[
                  { label: 'Subtotal', value: detailInvoice.subtotal },
                  detailInvoice.productDiscount > 0 ? { label: 'Discount', value: -detailInvoice.productDiscount } : null,
                  { label: 'Taxable', value: detailInvoice.taxableAmount },
                  { label: 'CGST', value: detailInvoice.cgst },
                  { label: 'SGST', value: detailInvoice.sgst },
                  detailInvoice.igst > 0 ? { label: 'IGST', value: detailInvoice.igst } : null,
                  Math.abs(detailInvoice.roundOff) > 0 ? { label: 'Round Off', value: detailInvoice.roundOff } : null,
                ].filter(Boolean).map((row) => (
                  <div key={row!.label} className="flex justify-between text-muted-foreground">
                    <span>{row!.label}</span>
                    <span className="font-mono">{formatCurrency(row!.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border/40 pt-2 font-bold">
                  <span>Grand Total</span>
                  <span className="font-mono text-base">{formatCurrency(detailInvoice.grandTotal)}</span>
                </div>
                {detailInvoice.amountPaid > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Paid</span>
                    <span className="font-mono">{formatCurrency(detailInvoice.amountPaid)}</span>
                  </div>
                )}
              </div>

              {/* Collect Payment — shown only for unpaid invoices */}
              {(detailInvoice.status === 'CREDIT' || detailInvoice.status === 'PARTIAL') && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Collect Payment — Outstanding: {formatCurrency(detailInvoice.grandTotal - detailInvoice.amountPaid)}
                  </p>
                  <div className="flex gap-2">
                    <Select value={collectMode} onValueChange={setCollectMode}>
                      <SelectTrigger className="w-32 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['CASH', 'CARD', 'UPI', 'CHEQUE'].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Amount"
                      className="h-9 text-sm"
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      max={detailInvoice.grandTotal - detailInvoice.amountPaid}
                    />
                    <Button
                      size="sm"
                      className="gap-1.5 shrink-0"
                      disabled={collectSubmitting || !collectAmount}
                      onClick={handleCollectPayment}
                    >
                      <Wallet className="h-4 w-4" />
                      {collectSubmitting ? 'Saving...' : 'Collect'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" onClick={() => printInvoicePdf(detailInvoice)}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button variant="outline" className="flex-1 gap-2" onClick={() => downloadInvoicePdf(detailInvoice)}>
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => shareInvoiceViaWhatsApp(detailInvoice)}>
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
