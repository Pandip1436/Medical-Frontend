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
  X,
  Receipt,
  FileX2,
  Clock,
  Wallet,
  Package,
  Pencil,
  Send,
  QrCode,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
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
import { navigate, useRoute } from '@/lib/router'
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
  { value: 'UNPAID', label: 'Unpaid' },
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

  // Look up the customer's phone from the master-data store so the WhatsApp
  // share can target the correct contact. Walk-in/cash sales without a
  // customerId fall through to a generic share (user picks the recipient).
  const phoneFor = useCallback(
    (inv: Invoice): string | undefined =>
      inv.customerId ? customers.find(c => c.id === inv.customerId)?.phone : undefined,
    [customers],
  )

  // Draft invoices have no finalized PDF, no real number to deliver, and no
  // collected payment to return against — so Share/Duplicate/Return don't
  // apply. They get a single "Resume" action that re-opens NewSalePage.
  // Non-DRAFT rows keep the full action set.
  const actionsForInvoice = useCallback((inv: Invoice) => {
    if (inv.status === 'DRAFT') {
      return [
        { label: 'Resume editing', icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/billing/new?draftId=${inv.id}`) },
      ]
    }
    // PAID, UNPAID, and PARTIAL are all editable from this list. CANCELLED
    // and RETURNED are terminal financial states. DRAFT goes through its own
    // "Resume editing" path higher up in this function.
    const canEdit = inv.status === 'PAID' || inv.status === 'UNPAID' || inv.status === 'PARTIAL'
    return [
      ...(canEdit
        ? [{ label: 'Edit invoice', icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/billing/new?editId=${inv.id}`) }]
        : []),
      { label: 'Share', icon: <Share2 className="h-4 w-4" />, onClick: () => shareInvoiceViaWhatsApp(inv, phoneFor(inv)) },
      { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => navigate(`/billing/new?duplicateId=${inv.id}`) },
      { label: 'Return', icon: <RotateCcw className="h-4 w-4" />, onClick: () => navigate(`/billing/returns?invoiceId=${inv.id}&invoiceNumber=${encodeURIComponent(inv.invoiceNumber)}`) },
    ]
  }, [phoneFor])

  // DRAFT rows get a hard-delete (they have no financial impact); finalized
  // rows get a soft "Cancel" (status flip). Both go through the same
  // DataTableRowActions onDelete hook, but the API call differs.
  const removeOrCancel = useCallback(async (inv: Invoice) => {
    if (inv.status === 'DRAFT') {
      const ok = window.confirm(`Discard draft for ${inv.customerName}? This cannot be undone.`)
      if (!ok) return
      try {
        await api.delete(`/billing/${inv.id}`)
        toast.success('Draft discarded')
        fetchInvoices()
      } catch {
        toast.error('Failed to discard draft')
      }
      return
    }
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
  }, [fetchInvoices])

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

  // Auto-open drawer when arriving with ?invoiceId=… (e.g. from a Credit Note's "View Invoice")
  const { search } = useRoute()
  useEffect(() => {
    const params = new URLSearchParams(search)
    const target = params.get('invoiceId')
    if (!target || invoices.length === 0) return
    const match = invoices.find((inv) => inv.id === target)
    if (match) setDetailInvoice(match)
  }, [search, invoices])

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

  // ─── Server-side WhatsApp + Razorpay QR actions ─────────────────
  // Distinct from `shareInvoiceViaWhatsApp` (the wa.me deeplink share). These
  // call the backend, which talks to Meta Cloud API + Razorpay directly.
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [regeneratingQr, setRegeneratingQr] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  const handleSendWhatsApp = async () => {
    if (!detailInvoice) return
    setSendingWhatsApp(true)
    try {
      await api.post(`/billing/${detailInvoice.id}/send-whatsapp`)
      toast.success('Queued — WhatsApp message will be sent shortly')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to queue WhatsApp send')
    } finally {
      setSendingWhatsApp(false)
    }
  }

  const handleRegenerateQr = async () => {
    if (!detailInvoice) return
    setRegeneratingQr(true)
    try {
      const res = await api.post(`/billing/${detailInvoice.id}/payment-link`)
      if (res.data == null) {
        toast.info('Invoice fully paid — no payment QR needed')
      } else {
        toast.success('Payment QR generated')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Failed to generate payment QR'
      toast.error(typeof msg === 'string' ? msg : 'Failed to generate payment QR')
    } finally {
      setRegeneratingQr(false)
    }
  }

  const handleReconcile = async () => {
    if (!detailInvoice) return
    setReconciling(true)
    try {
      const res = await api.post(`/billing/${detailInvoice.id}/reconcile-payment-link`)
      const applied = res.data?.applied ?? []
      const newPayments = applied.filter((a: any) => !a.duplicate)
      if (newPayments.length === 0) {
        toast.info('No new payments found at the gateway')
      } else {
        toast.success(`Reconciled ${newPayments.length} payment(s) from gateway`)
        try {
          const fresh = await api.get(`/billing/${detailInvoice.id}`)
          setDetailInvoice(fresh.data)
          fetchInvoices()
        } catch { /* swallow */ }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to reconcile payment')
    } finally {
      setReconciling(false)
    }
  }

  const clearFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
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
      .filter((inv) => inv.status === 'UNPAID' || inv.status === 'PARTIAL')
      .reduce((sum, inv) => sum + Number(inv.grandTotal), 0)
    return {
      totalSales,
      totalInvoices: invs.length,
      paidCount: invs.filter((inv) => inv.status === 'PAID').length,
      paidTotal,
      creditCount: invs.filter((inv) => inv.status === 'UNPAID' || inv.status === 'PARTIAL').length,
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
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
              onClick={() => {
                if (!filteredInvoices.length) { toast.info('No invoices to export'); return }
                exportToCsv(filteredInvoices.map((inv) => ({
                  Invoice: inv.invoiceNumber,
                  Date: formatDate(inv.date),
                  Customer: inv.customerName,
                  Total: inv.grandTotal,
                  Paid: inv.amountPaid,
                  Status: inv.status,
                })), 'sales-invoices')
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400 dark:border-amber-800/60 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300 dark:hover:border-amber-700"
              onClick={async () => {
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
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Tally XML</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={() => {
                if (filteredInvoices.length === 0) { toast.info('No invoices to print'); return }
                filteredInvoices.forEach((inv) => printInvoicePdf(inv))
              }}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Print All</span>
            </Button>
          </div>
        }
      >
        <EnumSelect
          label="Period"
          value={period}
          onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
          onClear={() => { setPeriod('all'); setCurrentPage(1) }}
          options={PERIOD_OPTIONS}
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

        {/* Custom date range — only when period is 'custom' */}
        {period === 'custom' && (
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-border/40 pt-4 mt-1">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date From
              </Label>
              <DatePicker
                value={dateFrom}
                onChange={(v) => { setDateFrom(v); setCurrentPage(1) }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date To
              </Label>
              <DatePicker
                value={dateTo}
                onChange={(v) => { setDateTo(v); setCurrentPage(1) }}
              />
            </div>
          </div>
        )}
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
                          onPrint={inv.status === 'DRAFT' ? undefined : () => printInvoicePdf(inv)}
                          onDelete={() => removeOrCancel(inv)}
                          deleteLabel={inv.status === 'DRAFT' ? 'Discard' : 'Cancel'}
                          customActions={actionsForInvoice(inv)}
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
              <TableHead>Customer</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
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
                    <TableCell className="max-w-45">
                      <p className="truncate text-sm font-medium">{inv.customerName}</p>
                      {inv.doctorName && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {inv.doctorName}
                        </p>
                      )}
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
                        onPrint={inv.status === 'DRAFT' ? undefined : () => printInvoicePdf(inv)}
                        onDelete={() => removeOrCancel(inv)}
                        deleteLabel={inv.status === 'DRAFT' ? 'Discard' : 'Cancel'}
                        customActions={actionsForInvoice(inv)}
                      />
                    </TableCell>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
        </div>{/* end desktop table */}

        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredInvoices.length}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* ── Invoice Detail Drawer ── */}
      <Sheet open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null) }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-160 lg:max-w-190 p-0 gap-0 flex flex-col"
        >
          {detailInvoice && (() => {
            const balanceDue = detailInvoice.grandTotal - detailInvoice.amountPaid
            return (
              <>
                {/* ── Sticky Header ── */}
                <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                  <div className="flex items-center justify-between gap-3 pr-8">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <SheetTitle className="font-mono text-base font-semibold truncate">
                        {formatInvoiceNumber(detailInvoice)}
                      </SheetTitle>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(detailInvoice.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="info" size="sm" className="gap-1">
                        <Package className="h-3 w-3" />
                        {detailInvoice.items.length} {detailInvoice.items.length === 1 ? 'item' : 'items'}
                      </Badge>
                      <StatusBadge status={detailInvoice.status} />
                    </div>
                  </div>
                </SheetHeader>

                {/* ── Scrollable Body ── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  {/* DRAFT banner — drafts aren't real invoices yet. Skip the
                      usual Print/Share/Collect actions; the only meaningful
                      next step is to reopen the form and finish the bill. */}
                  {detailInvoice.status === 'DRAFT' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                      <div className="flex items-start gap-2.5">
                        <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                            This is a draft
                          </p>
                          <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">
                            Stock isn&apos;t reserved yet. Resume editing to finalize.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() => {
                          setDetailInvoice(null)
                          navigate(`/billing/new?draftId=${detailInvoice.id}`)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Resume editing
                      </Button>
                    </div>
                  )}

                  {/* Meta block — single horizontal row */}
                  <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
                    {([
                      { label: 'Customer', value: detailInvoice.customerName },
                      { label: 'Payment', value: paymentModeLabels[detailInvoice.paymentMode] || detailInvoice.paymentMode },
                      detailInvoice.doctorName ? { label: 'Doctor', value: detailInvoice.doctorName } : null,
                      { label: 'Billing Type', value: detailInvoice.billingType },
                    ].filter(Boolean) as Array<{ label: string; value: string }>).map((cell, i) => (
                      <div
                        key={cell.label}
                        className={cn(
                          'flex min-w-0 flex-1 flex-col justify-center px-4 py-3',
                          i > 0 && 'border-l border-border/40'
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{cell.label}</p>
                        <p className="mt-0.5 text-sm font-medium truncate" title={cell.value}>{cell.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Items — proper table with sticky header, scales for many products */}
                  <div className="overflow-hidden rounded-xl border border-border/40">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                        <TableRow className="border-b border-border/40 hover:bg-transparent">
                          <TableHead className="h-9 w-10 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GST%</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailInvoice.items.map((item, idx) => (
                          <TableRow key={idx} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                            <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="px-3 py-2.5 text-sm font-medium">{item.productName}</TableCell>
                            <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.batchNumber}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{item.quantity}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.rate)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{item.gstPercent}%</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Collect Payment — shown only for unpaid invoices */}
                  {(detailInvoice.status === 'UNPAID' || detailInvoice.status === 'PARTIAL') && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        Collect Payment — Outstanding: {formatCurrency(balanceDue)}
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
                          max={balanceDue}
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
                </div>

                {/* ── Sticky Footer: totals strip + actions ── */}
                <div className="shrink-0 border-t border-border/40 bg-background">
                  {/* Totals strip — single horizontal row */}
                  <div className="flex items-stretch overflow-x-auto border-b border-border/40 bg-muted/20">
                    {([
                      { label: 'Subtotal', value: detailInvoice.subtotal },
                      detailInvoice.productDiscount > 0 ? { label: 'Discount', value: -detailInvoice.productDiscount, tone: 'rose' as const } : null,
                      { label: 'Taxable', value: detailInvoice.taxableAmount },
                      { label: 'CGST', value: detailInvoice.cgst },
                      { label: 'SGST', value: detailInvoice.sgst },
                      detailInvoice.igst > 0 ? { label: 'IGST', value: detailInvoice.igst } : null,
                      Math.abs(detailInvoice.roundOff) > 0 ? { label: 'Round Off', value: detailInvoice.roundOff } : null,
                      { label: 'Grand Total', value: detailInvoice.grandTotal, highlight: true as const },
                      detailInvoice.amountPaid > 0 ? { label: 'Paid', value: detailInvoice.amountPaid, tone: 'emerald' as const } : null,
                    ].filter(Boolean) as Array<{ label: string; value: number; tone?: 'emerald' | 'rose'; highlight?: boolean }>).map((row, i) => (
                      <div
                        key={row.label}
                        className={cn(
                          'flex flex-1 min-w-18 flex-col justify-center whitespace-nowrap px-3 py-2',
                          i > 0 && 'border-l border-border/40',
                          row.highlight && 'bg-primary/5'
                        )}
                      >
                        <p className={cn(
                          'text-[9px] font-semibold uppercase tracking-wider',
                          row.tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
                          row.tone === 'rose' && 'text-rose-700 dark:text-rose-400',
                          !row.tone && 'text-muted-foreground'
                        )}>{row.label}</p>
                        <p className={cn(
                          'mt-0.5 font-mono text-xs',
                          row.highlight && 'text-sm font-bold',
                          row.tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
                          row.tone === 'rose' && 'text-rose-700 dark:text-rose-400'
                        )}>{formatCurrency(row.value)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="px-5 py-3 flex gap-2">
                    <Button className="flex-1 gap-2" onClick={() => printInvoicePdf(detailInvoice)}>
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2" onClick={() => downloadInvoicePdf(detailInvoice)}>
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Download PDF</span>
                      <span className="sm:hidden">PDF</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => shareInvoiceViaWhatsApp(detailInvoice, phoneFor(detailInvoice))}
                      title="Share via WhatsApp"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Server-side WhatsApp + Razorpay QR actions. Distinct
                      row so admins don't confuse them with the wa.me share
                      icon above. These hit the backend, which talks to Meta
                      Cloud API + Razorpay directly. Hidden for draft and
                      cancelled invoices. */}
                  {detailInvoice.status !== 'DRAFT' && detailInvoice.status !== 'CANCELLED' && (
                    <div className="px-5 pb-4 flex flex-wrap gap-2 border-t border-dashed border-border/60 pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/40"
                        onClick={handleSendWhatsApp}
                        disabled={sendingWhatsApp}
                        title="Re-send the invoice PDF + payment QR to the customer's WhatsApp via Meta Cloud API"
                      >
                        <Send className={cn('h-4 w-4', sendingWhatsApp && 'animate-pulse')} />
                        {sendingWhatsApp ? 'Sending…' : 'Send WhatsApp'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/40"
                        onClick={handleRegenerateQr}
                        disabled={regeneratingQr}
                        title="Generate a fresh Razorpay UPI QR for the current outstanding amount. Closes any existing live QR for this invoice first."
                      >
                        <QrCode className={cn('h-4 w-4', regeneratingQr && 'animate-pulse')} />
                        {regeneratingQr ? 'Generating…' : 'Generate QR'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleReconcile}
                        disabled={reconciling}
                        title="Poll Razorpay for payments captured against this invoice's QR. Use if a webhook was missed."
                      >
                        <RefreshCw className={cn('h-4 w-4', reconciling && 'animate-spin')} />
                        {reconciling ? 'Syncing…' : 'Sync Payment'}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
