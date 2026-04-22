import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Receipt,
  Search,
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
  X,
  Package,
  CalendarDays,
  User,
  CreditCard,
  RefreshCcw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
// Helpers
// ─────────────────────────────────────────────────────────────

const statusVariant: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  PAID: 'success',
  CREDIT: 'warning',
  PARTIAL: 'info',
  DRAFT: 'secondary',
  RETURNED: 'destructive',
  CANCELLED: 'destructive',
}

const paymentIcon: Record<string, React.ReactNode> = {
  CASH: <IndianRupee className="h-3 w-3" />,
  CARD: <CreditCard className="h-3 w-3" />,
  UPI: <RefreshCcw className="h-3 w-3" />,
  CREDIT: <Clock className="h-3 w-3" />,
  SPLIT: <Package className="h-3 w-3" />,
}

function periodFilter(invoice: Invoice, period: string, from: string, to: string): boolean {
  const d = new Date(invoice.date)
  const now = new Date()
  if (period === 'today') {
    return d.toDateString() === now.toDateString()
  }
  if (period === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    return d >= start
  }
  if (period === 'month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }
  if (period === 'custom') {
    const f = from ? new Date(from) : null
    const t = to ? new Date(to + 'T23:59:59') : null
    if (f && d < f) return false
    if (t && d > t) return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────
// Animation
// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
}

// ─────────────────────────────────────────────────────────────
// Invoice Detail / Print View
// ─────────────────────────────────────────────────────────────

function InvoiceDetailView({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
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

  const subtotal = Number(invoice.subtotal)
  const discount = Number(invoice.productDiscount)
  const taxable = Number(invoice.taxableAmount)
  const cgst = Number(invoice.cgst)
  const sgst = Number(invoice.sgst)
  const igst = Number(invoice.igst)
  const roundOff = Number(invoice.roundOff)
  const grandTotal = Number(invoice.grandTotal)
  const amountPaid = Number(invoice.amountPaid)
  const changeReturned = Number(invoice.changeReturned)

  return (
    <div className="flex flex-col gap-0">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3 mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => printInvoicePdf(invoice)}>
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => downloadInvoicePdf(invoice)}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => shareInvoiceViaWhatsApp(invoice)}>
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </div>
        <Button
          size="sm"
          className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleRepurchase}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Repurchase Same Items
        </Button>
      </div>

      {/* ── Invoice document ── */}
      <div className="rounded-xl border border-border/50 bg-white dark:bg-card overflow-hidden text-sm">

        {/* Header */}
        <div className="bg-slate-800 dark:bg-slate-900 text-white px-5 py-4 text-center">
          <p className="text-base font-bold tracking-wide">HOSPITAL SUPPLIERS</p>
          <p className="text-[11px] text-slate-300 mt-0.5">Hospital Suppliers, Madurai, Tamil Nadu</p>
          <p className="text-[11px] text-slate-300">Phone: +91 452 234 5678 · contact@hospitalsuppliers.in</p>
          <p className="text-[11px] text-slate-400 mt-0.5">GSTIN: 33AAAPL1234C1Z5 · DL No: TN-MDU-20B-01234</p>
        </div>

        {/* Title */}
        <div className="border-b border-border/40 bg-muted/30 py-2 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground/70">
            {invoice.type === 'QUOTATION' ? 'Quotation' : 'Tax Invoice'}
          </p>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-3 border-b border-border/40 text-xs">
          <div>
            <span className="text-muted-foreground">Invoice No: </span>
            <span className="font-mono font-semibold">{invoice.invoiceNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Date: </span>
            <span className="font-medium">{formatDate(invoice.date)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Customer: </span>
            <span className="font-medium">{invoice.customerName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Payment: </span>
            <span className="font-medium capitalize">{invoice.paymentMode.toLowerCase()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Billing: </span>
            <span className="font-medium capitalize">{invoice.billingType.toLowerCase()}</span>
          </div>
          {invoice.doctorName && (
            <div>
              <span className="text-muted-foreground">Doctor: </span>
              <span className="font-medium">{invoice.doctorName}</span>
            </div>
          )}
        </div>

        {/* Items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="px-3 py-2 text-left w-6">#</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-center">Batch</th>
                <th className="px-3 py-2 text-center">Expiry</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">MRP</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Disc%</th>
                <th className="px-3 py-2 text-right">GST%</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium max-w-35 truncate">{item.productName}</td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">{item.batchNumber}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{item.quantity}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(item.mrp).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(item.rate).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(item.discountPercent).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(item.gstPercent).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{Number(item.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-border/40 px-5 py-3">
          <div className="ml-auto max-w-xs space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-rose-500">
                <span>Discount</span>
                <span className="font-mono">- {formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable</span>
              <span className="font-mono">{formatCurrency(taxable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CGST</span>
              <span className="font-mono">{formatCurrency(cgst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SGST</span>
              <span className="font-mono">{formatCurrency(sgst)}</span>
            </div>
            {igst > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST</span>
                <span className="font-mono">{formatCurrency(igst)}</span>
              </div>
            )}
            {Math.abs(roundOff) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Round Off</span>
                <span className="font-mono">{roundOff >= 0 ? '+' : '-'}{formatCurrency(Math.abs(roundOff))}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border/60 pt-1.5 text-sm font-bold">
              <span>Grand Total</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(grandTotal)}</span>
            </div>
            {amountPaid > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Paid</span>
                <span className="font-mono">{formatCurrency(amountPaid)}</span>
              </div>
            )}
            {changeReturned > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Change</span>
                <span className="font-mono">{formatCurrency(changeReturned)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/30 bg-muted/20 px-5 py-3 flex items-end justify-between text-[10px] text-muted-foreground">
          <p className="italic max-w-xs">
            Goods once sold will not be taken back or exchanged. Subject to Madurai jurisdiction.
          </p>
          <p className="shrink-0 ml-4">Authorised Signatory</p>
        </div>
      </div>
    </div>
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
      const data: Invoice[] = Array.isArray(res.data) ? res.data : []
      // Only sales invoices (not quotations)
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
    return { total, totalAmount, paid, credit }
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
        <Card hover>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-xl font-bold tabular-nums">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card hover>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <IndianRupee className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</p>
              <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.totalAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card hover>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10">
              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Paid</p>
              <p className="text-xl font-bold tabular-nums">{stats.paid}</p>
            </div>
          </CardContent>
        </Card>
        <Card hover>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Credit/Partial</p>
              <p className="text-xl font-bold tabular-nums">{stats.credit}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Filters ── */}
      <motion.div variants={itemVariants} className="space-y-2">
        <DataTableFilterBar
          searchQuery={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); setPage(1) }}
          searchPlaceholder="Search invoice # or customer…"
          resultsCount={filtered.length}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
        />
        <div className="flex flex-wrap gap-2">
          <EnumSelect
            label="Status"
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setPage(1) }}
            options={STATUS_OPTIONS}
            className="w-36"
          />
          <EnumSelect
            label="Payment"
            value={paymentFilter}
            onValueChange={(v) => { setPaymentFilter(v); setPage(1) }}
            options={PAYMENT_OPTIONS}
            className="w-36"
          />
          <EnumSelect
            label="Period"
            value={period}
            onValueChange={(v) => { setPeriod(v); setPage(1) }}
            options={PERIOD_OPTIONS}
            className="w-36"
          />
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
                className="h-9 w-36 text-xs"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1) }}
                className="h-9 w-36 text-xs"
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Table / Cards ── */}
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
                      <Badge variant={statusVariant[inv.status] || 'secondary'} size="sm" dot>
                        {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                      </Badge>
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && [...Array(6)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(8)].map((__, j) => (
                        <TableCell key={j}><div className="h-4 w-full rounded bg-muted animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!isLoading && paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-14 text-center">
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
                          <span className="text-sm truncate max-w-35">{inv.customerName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground max-w-45">
                          <span className="font-medium text-foreground">{inv.items.length} item{inv.items.length !== 1 ? 's' : ''}</span>
                          {inv.items.length > 0 && (
                            <span className="ml-1 truncate block text-xs">
                              {inv.items.slice(0, 2).map(i => i.productName).join(', ')}
                              {inv.items.length > 2 && ` +${inv.items.length - 2} more`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(Number(inv.grandTotal))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[inv.status] || 'secondary'} size="sm" dot>
                          {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {paymentIcon[inv.paymentMode]}
                          <span className="capitalize">{inv.paymentMode.toLowerCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv) }}
                        >
                          <Receipt className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button size="icon-sm" variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-1">{page} / {totalPages}</span>
                  <Button size="icon-sm" variant="ghost" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Invoice Detail Dialog ── */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null) }}>
        <DialogContent className="w-full max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="mb-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                {selectedInvoice?.invoiceNumber}
                {selectedInvoice && (
                  <Badge variant={statusVariant[selectedInvoice.status] || 'secondary'} size="sm" dot>
                    {selectedInvoice.status.charAt(0) + selectedInvoice.status.slice(1).toLowerCase()}
                  </Badge>
                )}
              </DialogTitle>
            </div>
          </DialogHeader>
          {selectedInvoice && (
            <InvoiceDetailView
              invoice={selectedInvoice}
              onClose={() => setSelectedInvoice(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
