import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Receipt,
  Printer,
  Download,
  Share2,
  ShoppingCart,
  IndianRupee,
  CheckCircle2,
  Clock,
  FileX2,
  ChevronLeft,
  ChevronRight,
  User,
  Stethoscope,
  CreditCard,
  CalendarDays,
  Wallet,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { downloadInvoicePdf, printInvoicePdf, shareInvoiceViaWhatsApp } from '@/lib/pdf/invoicePdf'
import type { Invoice } from '@/types'

// ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 15

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All Modes' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'SPLIT', label: 'Split' },
] as const

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
] as const

// ─────────────────────────────────────────────────────────────

function periodFilter(invoice: Invoice, period: string, from: string, to: string): boolean {
  const d = new Date(invoice.date)
  const now = new Date()
  if (period === 'today') return d.toDateString() === now.toDateString()
  if (period === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0)
    return d >= start
  }
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (period === 'custom') {
    const f = from ? new Date(from) : null
    const t = to ? new Date(to + 'T23:59:59') : null
    if (f && d < f) return false
    if (t && d > t) return false
  }
  return true
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
}

// ─────────────────────────────────────────────────────────────
// Invoice Detail Dialog Content
// ─────────────────────────────────────────────────────────────

function InvoiceDetailContent({
  invoice,
  onClose,
  onUpdated,
}: {
  invoice: Invoice
  onClose: () => void
  onUpdated: (inv: Invoice) => void
}) {
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMode, setCollectMode] = useState('CASH')
  const [collectSubmitting, setCollectSubmitting] = useState(false)

  const handleCollectPayment = async () => {
    if (!collectAmount) return
    setCollectSubmitting(true)
    try {
      const res = await api.patch(`/billing/${invoice.id}/collect-payment`, {
        amountReceived: parseFloat(collectAmount),
        paymentMode: collectMode,
      })
      toast.success('Payment collected successfully')
      setCollectAmount('')
      onUpdated(res.data)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to collect payment')
    } finally {
      setCollectSubmitting(false)
    }
  }

  const handleRepurchase = () => {
    sessionStorage.setItem(
      'repurchase_items',
      JSON.stringify(
        invoice.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          mrp: item.mrp,
          rate: item.rate,
          discountPercent: item.discountPercent,
          gstPercent: item.gstPercent,
          amount: item.amount,
        }))
      )
    )
    toast.success('Items loaded — redirecting to new sale…')
    onClose()
    setTimeout(() => navigate('/billing/new'), 200)
  }

  const grandTotal = Number(invoice.grandTotal)
  const amountPaid = Number(invoice.amountPaid)
  const outstanding = grandTotal - amountPaid

  return (
    <>
      {/* Meta info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
            <p className="font-medium">{invoice.customerName}</p>
          </div>
        </div>
        {invoice.doctorName && (
          <div className="flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Doctor</p>
              <p className="font-medium">{invoice.doctorName}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment</p>
            <p className="font-medium capitalize">{invoice.paymentMode.toLowerCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Billing Type</p>
            <p className="font-medium capitalize">{invoice.billingType.toLowerCase()}</p>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="overflow-hidden rounded-xl border border-border/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-center">Expiry</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Disc%</TableHead>
              <TableHead className="text-right">GST%</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.items.map((item, idx) => (
              <TableRow key={item.id ?? idx}>
                <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{item.productName}</p>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.batchNumber}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{item.quantity}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">{Number(item.mrp).toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(item.rate)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{Number(item.discountPercent).toFixed(1)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{Number(item.gstPercent).toFixed(1)}%</TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(item.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
        {[
          { label: 'Subtotal', value: invoice.subtotal },
          Number(invoice.productDiscount) > 0 ? { label: 'Discount', value: -Number(invoice.productDiscount) } : null,
          { label: 'Taxable', value: invoice.taxableAmount },
          { label: 'CGST', value: invoice.cgst },
          { label: 'SGST', value: invoice.sgst },
          Number(invoice.igst) > 0 ? { label: 'IGST', value: invoice.igst } : null,
          Math.abs(Number(invoice.roundOff)) > 0 ? { label: 'Round Off', value: invoice.roundOff } : null,
        ].filter(Boolean).map((row) => (
          <div key={row!.label} className="flex justify-between text-muted-foreground">
            <span>{row!.label}</span>
            <span className="font-mono">{formatCurrency(row!.value)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-border/40 pt-2 font-bold">
          <span>Grand Total</span>
          <span className="font-mono text-base text-emerald-600 dark:text-emerald-400">{formatCurrency(grandTotal)}</span>
        </div>
        {amountPaid > 0 && (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>Paid</span>
            <span className="font-mono">{formatCurrency(amountPaid)}</span>
          </div>
        )}
        {outstanding > 0.01 && (
          <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
            <span>Outstanding</span>
            <span className="font-mono">{formatCurrency(outstanding)}</span>
          </div>
        )}
      </div>

      {/* Collect Payment — credit/partial only */}
      {(invoice.status === 'CREDIT' || invoice.status === 'PARTIAL') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Collect Payment — Outstanding: {formatCurrency(outstanding)}
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
              max={outstanding}
            />
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={collectSubmitting || !collectAmount}
              onClick={handleCollectPayment}
            >
              <Wallet className="h-4 w-4" />
              {collectSubmitting ? 'Saving…' : 'Collect'}
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1 gap-2 min-w-24" onClick={() => printInvoicePdf(invoice)}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button variant="outline" className="flex-1 gap-2 min-w-24" onClick={() => downloadInvoicePdf(invoice)}>
          <Download className="h-4 w-4" />
          Download
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => shareInvoiceViaWhatsApp(invoice)}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <Button
          variant="outline"
          className="gap-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40"
          onClick={handleRepurchase}
        >
          <ShoppingCart className="h-4 w-4" />
          Repurchase
        </Button>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function CustomerInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [period, setPeriod] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/billing')
      const data: Invoice[] = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
      setInvoices(data.filter((inv) => inv.type === 'INVOICE'))
    } catch {
      toast.error('Failed to load invoices')
      setInvoices([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useBranchRefresh(fetchInvoices)

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = invoices.length
    const totalAmount = invoices.reduce((s, i) => s + Number(i.grandTotal), 0)
    const paid = invoices.filter((i) => i.status === 'PAID').length
    const credit = invoices.filter((i) => i.status === 'CREDIT' || i.status === 'PARTIAL').length
    const outstanding = invoices
      .filter((i) => i.status === 'CREDIT' || i.status === 'PARTIAL')
      .reduce((s, i) => s + (Number(i.grandTotal) - Number(i.amountPaid)), 0)
    return { total, totalAmount, paid, credit, outstanding }
  }, [invoices])

  // ── Filters ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = invoices
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') result = result.filter((inv) => inv.status === statusFilter)
    if (paymentFilter !== 'all') result = result.filter((inv) => inv.paymentMode === paymentFilter)
    result = result.filter((inv) => periodFilter(inv, period, fromDate, toDate))
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [invoices, searchQuery, statusFilter, paymentFilter, period, fromDate, toDate])

  // ── Pagination ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setPaymentFilter('all')
    setPeriod('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const activeFilterCount = [
    statusFilter !== 'all',
    paymentFilter !== 'all',
    period !== 'all',
  ].filter(Boolean).length

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">

      {/* ── Header ── */}
      <motion.div variants={itemVariants} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">All customer sales invoices</p>
        </div>
      </motion.div>

      {/* ── Summary cards ── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Total',
            value: stats.total.toString(),
            subtitle: 'invoices',
            icon: Receipt,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            accent: 'border-l-blue-500',
          },
          {
            label: 'Amount',
            value: formatCurrency(stats.totalAmount),
            subtitle: 'total billed',
            icon: IndianRupee,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            accent: 'border-l-emerald-500',
          },
          {
            label: 'Paid',
            value: stats.paid.toString(),
            subtitle: 'settled invoices',
            icon: CheckCircle2,
            iconBg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
            accent: 'border-l-teal-500',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(stats.outstanding),
            subtitle: `${stats.credit} pending`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            accent: 'border-l-amber-500',
          },
        ].map((stat) => (
          <Card key={stat.label} hover className={cn('border-l-[3px]', stat.accent)}>
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
        ))}
      </motion.div>

      {/* ── Filters ── */}
      <motion.div variants={itemVariants}>
        <DataTableFilterBar
          searchQuery={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); setPage(1) }}
          searchPlaceholder="Search invoice # or customer…"
          resultsCount={filtered.length}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
        >
          <EnumSelect
            label="Status"
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setPage(1) }}
            onClear={() => { setStatusFilter('all'); setPage(1) }}
            options={STATUS_OPTIONS}
          />
          <EnumSelect
            label="Payment"
            value={paymentFilter}
            onValueChange={(v) => { setPaymentFilter(v); setPage(1) }}
            onClear={() => { setPaymentFilter('all'); setPage(1) }}
            options={PAYMENT_OPTIONS}
          />
          <EnumSelect
            label="Period"
            value={period}
            onValueChange={(v) => { setPeriod(v); setPage(1) }}
            onClear={() => { setPeriod('all'); setPage(1) }}
            options={PERIOD_OPTIONS}
          />
          {period === 'custom' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                <DatePicker value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                <DatePicker value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} />
              </div>
            </>
          )}
        </DataTableFilterBar>
      </motion.div>

      {/* ── Table ── */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-0">

            {/* Mobile card list */}
            <div className="lg:hidden divide-y divide-border/40">
              {isLoading && [...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                </div>
              ))}
              {!isLoading && paginated.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
                  <FileX2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No invoices found</p>
                </div>
              )}
              {!isLoading && paginated.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 active:bg-muted/50"
                  onClick={() => setSelectedInvoice(inv)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 mt-0.5">
                    <Receipt className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{inv.customerName}</p>
                    <p className="text-[11px] text-muted-foreground/70">
                      {formatDate(inv.date)} · {inv.items.length} item{inv.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold">{formatCurrency(Number(inv.grandTotal))}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{inv.paymentMode.toLowerCase()}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && [...Array(6)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(7)].map((__, j) => (
                        <TableCell key={j}><div className="h-4 w-full rounded bg-muted animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!isLoading && paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-14 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileX2 className="h-8 w-8 opacity-30" />
                          <p className="text-sm">No invoices found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && paginated.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setSelectedInvoice(inv)}
                    >
                      <TableCell className="text-muted-foreground text-sm">{formatDate(inv.date)}</TableCell>
                      <TableCell className="font-mono text-sm font-semibold">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm truncate max-w-40">{inv.customerName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground max-w-48">
                          <span className="font-medium text-foreground">{inv.items.length} item{inv.items.length !== 1 ? 's' : ''}</span>
                          {inv.items.length > 0 && (
                            <span className="ml-1 truncate block text-xs">
                              {inv.items.slice(0, 2).map((i) => i.productName).join(', ')}
                              {inv.items.length > 2 && ` +${inv.items.length - 2} more`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(Number(inv.grandTotal))}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {inv.paymentMode.toLowerCase()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t px-4 py-4">
                <DataTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  totalItems={filtered.length}
                  itemsPerPage={PAGE_SIZE}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Invoice Detail Dialog ── */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null) }}>
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-3xl md:w-full md:h-auto md:max-h-[90vh] md:overflow-y-auto overflow-y-auto">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <DialogTitle className="flex items-center gap-2 font-mono text-base">
                      <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                      {selectedInvoice.invoiceNumber}
                    </DialogTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(selectedInvoice.date)}</p>
                  </div>
                  <StatusBadge status={selectedInvoice.status} />
                </div>
              </DialogHeader>
              <InvoiceDetailContent
                invoice={selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                onUpdated={(inv) => {
                  setSelectedInvoice(inv)
                  fetchInvoices()
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
