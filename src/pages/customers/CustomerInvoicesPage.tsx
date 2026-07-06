import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Receipt, IndianRupee, CheckCircle2, Clock, FileX2,
  User, Package, Wallet, Printer, Download, Share2, Pencil,
  Send, QrCode, RefreshCw,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { Card, CardContent } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import { usePersistedState } from '@/hooks/usePersistedState'
import { navigate } from '@/lib/router'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useDeepLinkParam } from '@/hooks/useDeepLinkHighlight'
import {
  downloadInvoicePdf,
  printInvoicePdf,
  shareInvoiceViaWhatsApp,
} from '@/lib/pdf/invoicePdf'
import type { Invoice } from '@/types'

// ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 15

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'PAID', label: 'Paid' },
  { value: 'UNPAID', label: 'Unpaid' },
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

const paymentModeLabels: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  CREDIT: 'Credit',
  SPLIT: 'Split',
}

interface Summary {
  totalInvoices: number
  totalAmount: number
  paidCount: number
  outstandingAmount: number
  outstandingCount: number
}

// Translate the period enum into ISO date strings for the server query.
function periodToRange(period: string, fromDate: string, toDate: string): { from?: string; to?: string } {
  if (period === 'all') return {}
  const today = new Date()
  const toIso = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'today') {
    const day = toIso(today)
    return { from: day, to: day }
  }
  if (period === 'week') {
    return { from: weekStartISO(today), to: toIso(today) }
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: toIso(start), to: toIso(today) }
  }
  if (period === 'custom') {
    return { from: fromDate || undefined, to: toDate || undefined }
  }
  return {}
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
// Main Page
// ─────────────────────────────────────────────────────────────

export default function CustomerInvoicesPage() {
  // ── Server-driven list ──
  const [pageRows, setPageRows] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // ── Global summary (stable as filters change) ──
  const [summary, setSummary] = useState<Summary>({
    totalInvoices: 0,
    totalAmount: 0,
    paidCount: 0,
    outstandingAmount: 0,
    outstandingCount: 0,
  })

  // ── Filters + pagination. Filters persisted to sessionStorage so they
  // survive refresh + navigate-back. ──
  const [searchQuery, setSearchQuery] = usePersistedState('filters:customers.invoices:search', '')
  const [statusFilter, setStatusFilter] = usePersistedState('filters:customers.invoices:status', 'all')
  const [paymentFilter, setPaymentFilter] = usePersistedState('filters:customers.invoices:payment', 'all')
  const [salespersonFilter, setSalespersonFilter] = usePersistedState('filters:customers.invoices:salesperson', 'all')
  // Period defaults to "today" so the page opens on today's invoices.
  const [period, setPeriod] = usePersistedState('filters:customers.invoices:period', 'today')
  const [fromDate, setFromDate] = usePersistedState('filters:customers.invoices:fromDate', '')
  const [toDate, setToDate] = usePersistedState('filters:customers.invoices:toDate', '')
  const [currentPage, setCurrentPage] = useState(1)
  // Filters panel — controlled so picking "Custom Range" can auto-open the
  // panel that holds the custom From/To date pickers.
  const [tableFiltersOpen, setTableFiltersOpen] = useState(false)

  // Selecting "Custom Range" opens the filters panel where the date pickers live.
  const onPeriodChange = useCallback((val: string) => {
    if (val === 'custom') setTableFiltersOpen(true)
    else if (period === 'custom') setTableFiltersOpen(false)
    setPeriod(val)
  }, [period, setPeriod])

  // Optional drill-down from the Outstanding Receivables page (or any other page)
  // via ?customerId=…&customerName=…. Read once on mount; user can clear via the chip.
  const [customerFocusId, setCustomerFocusId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('customerId') ?? ''
  })
  const [customerFocusName, setCustomerFocusName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('customerName') ?? ''
  })

  // ── Drawer + collect-payment state ──
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMode, setCollectMode] = useState('CASH')
  const [collectSubmitting, setCollectSubmitting] = useState(false)

  // ── Salesperson options (fetched once) ──
  const [salespersonOptions, setSalespersonOptions] = useState<{ value: string; label: string }[]>([
    { value: 'all', label: 'All Salespersons' },
  ])
  useEffect(() => {
    api.get('/salespersons', { params: { branchId: undefined } })
      .then((res) => {
        const list = (res.data || []) as { id: string; name: string; isActive: boolean }[]
        const opts = list
          .filter((s) => s.isActive)
          .map((s) => ({ value: s.id, label: s.name }))
        setSalespersonOptions([{ value: 'all', label: 'All Salespersons' }, ...opts])
      })
      .catch(() => { /* keep just the All option */ })
  }, [])

  // ── Query builder ──
  const buildQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams()
    params.set('type', 'INVOICE')
    params.set('skip', String((currentPage - 1) * PAGE_SIZE))
    params.set('take', String(PAGE_SIZE))
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (paymentFilter !== 'all') params.set('paymentMode', paymentFilter)
    if (salespersonFilter !== 'all') params.set('salespersonId', salespersonFilter)
    if (customerFocusId) params.set('customerId', customerFocusId)
    const { from, to } = periodToRange(period, fromDate, toDate)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return params
  }, [currentPage, searchQuery, statusFilter, paymentFilter, salespersonFilter, customerFocusId, period, fromDate, toDate])

  // Strip the focus from state + URL so the list returns to all customers.
  const clearCustomerFocus = useCallback(() => {
    setCustomerFocusId('')
    setCustomerFocusName('')
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('customerId')
      url.searchParams.delete('customerName')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // ── Fetch list (debounced on search) ──
  const fetchAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const delay = searchQuery.trim() ? 300 : 0
    const handle = setTimeout(async () => {
      fetchAbortRef.current?.abort()
      const controller = new AbortController()
      fetchAbortRef.current = controller
      setIsLoading(true)
      try {
        const res = await api.get(`/billing?${buildQueryParams().toString()}`, { signal: controller.signal })
        const payload = res.data
        const items = (payload?.data ?? payload ?? []) as Invoice[]
        setPageRows(items)
        setTotal(typeof payload?.total === 'number' ? payload.total : items.length)
      } catch (err: unknown) {
        const e = err as { name?: string; code?: string }
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
          toast.error('Failed to load invoices')
          setPageRows([])
          setTotal(0)
        }
      } finally {
        setIsLoading(false)
      }
    }, delay)
    return () => clearTimeout(handle)
  }, [buildQueryParams, searchQuery])

  // ── Fetch summary (does NOT depend on filters) ──
  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/billing/summary')
      const data = res.data?.data ?? res.data
      if (data) setSummary(data)
    } catch { /* leaves last good values */ }
  }, [])
  useEffect(() => { fetchSummary() }, [fetchSummary])
  useBranchRefresh(fetchSummary)

  // Manual refetch used by the drawer after Collect Payment.
  const refetchList = useCallback(async () => {
    try {
      const res = await api.get(`/billing?${buildQueryParams().toString()}`)
      const payload = res.data
      const items = (payload?.data ?? payload ?? []) as Invoice[]
      setPageRows(items)
      setTotal(typeof payload?.total === 'number' ? payload.total : items.length)
    } catch { /* drawer keeps its own state; the next page interaction will retry */ }
  }, [buildQueryParams])

  const handleCollectPayment = async () => {
    if (!detailInvoice || !collectAmount) return
    const raw = parseFloat(collectAmount)
    const balanceDue = Number(detailInvoice.grandTotal) - Number(detailInvoice.amountPaid)
    if (isNaN(raw) || raw <= 0) return
    // The shown balance is rounded to the rupee, so the operator may type a
    // value a few paise over the true balance. Reject only a real over-payment
    // (>₹1), then cap to the exact balance so it settles cleanly.
    if (raw > balanceDue + 1) {
      toast.error(`Payment cannot exceed the outstanding amount of ${formatCurrency(balanceDue)}`)
      return
    }
    const amount = Math.min(raw, balanceDue)
    setCollectSubmitting(true)
    try {
      const res = await api.patch(`/billing/${detailInvoice.id}/collect-payment`, {
        amountReceived: amount,
        paymentMode: collectMode,
      })
      toast.success('Payment collected successfully')
      setCollectAmount('')
      setDetailInvoice(res.data)
      refetchList()
      fetchSummary()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to collect payment'
      toast.error(msg)
    } finally {
      setCollectSubmitting(false)
    }
  }

  // ─── Server-side WhatsApp + Razorpay QR actions ─────────────────
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [regeneratingQr, setRegeneratingQr] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  const handleSendWhatsApp = async () => {
    if (!detailInvoice) return
    setSendingWhatsApp(true)
    try {
      await api.post(`/billing/${detailInvoice.id}/send-whatsapp`)
      toast.success('Queued — WhatsApp message will be sent shortly')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to queue WhatsApp send'
      toast.error(msg)
    } finally {
      setSendingWhatsApp(false)
    }
  }

  const handleRegenerateQr = async () => {
    if (!detailInvoice) return
    setRegeneratingQr(true)
    try {
      const res = await api.post(`/billing/${detailInvoice.id}/payment-link`)
      if (res.data == null) toast.info('Invoice fully paid — no payment QR needed')
      else toast.success('Payment QR generated')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to generate payment QR'
      toast.error(msg)
    } finally {
      setRegeneratingQr(false)
    }
  }

  const handleReconcile = async () => {
    if (!detailInvoice) return
    setReconciling(true)
    try {
      const res = await api.post(`/billing/${detailInvoice.id}/reconcile-payment-link`)
      const applied = (res.data?.applied ?? []) as Array<{ duplicate?: boolean }>
      const newPayments = applied.filter((a) => !a.duplicate)
      if (newPayments.length === 0) {
        toast.info('No new payments found at the gateway')
      } else {
        toast.success(`Reconciled ${newPayments.length} payment(s) from gateway`)
        try {
          const fresh = await api.get(`/billing/${detailInvoice.id}`)
          setDetailInvoice(fresh.data)
          refetchList()
          fetchSummary()
        } catch { /* swallow */ }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to reconcile payment'
      toast.error(msg)
    } finally {
      setReconciling(false)
    }
  }

  // Reset to page 1 whenever a filter or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, paymentFilter, salespersonFilter, customerFocusId, period, fromDate, toDate])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Deep-link entry: when the URL has ?invoiceId=…, open the row's detail
  // Sheet inline instead of bouncing to the old full-page detail. Keep the
  // pending id around until the invoice list arrives, then look it up and
  // call setDetailInvoice. Falls back to a single-invoice GET if it isn't
  // on the current page.
  const { targetId: deepLinkInvoiceId, clearParam: clearDeepLink } =
    useDeepLinkParam('invoiceId', '/customers/invoices')
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null)
  useEffect(() => {
    if (!deepLinkInvoiceId) return
    setPendingInvoiceId(deepLinkInvoiceId)
    clearDeepLink()
    // Clear filters so the invoice isn't hidden — guarantees visibility
    // alongside the Sheet open.
    setSearchQuery('')
    setStatusFilter('all')
    setPaymentFilter('all')
    setSalespersonFilter('all')
    setPeriod('all')
    setFromDate('')
    setToDate('')
  }, [deepLinkInvoiceId, clearDeepLink])

  useEffect(() => {
    if (!pendingInvoiceId || detailInvoice) return
    const inMemory = pageRows.find((i) => i.id === pendingInvoiceId)
    if (inMemory) {
      setDetailInvoice(inMemory)
      setPendingInvoiceId(null)
      return
    }
    // Not on current page — fetch directly so the Sheet opens regardless of pagination.
    let cancelled = false
    api.get(`/billing/${pendingInvoiceId}`)
      .then((res) => {
        if (cancelled) return
        if (res.data) setDetailInvoice(res.data)
        setPendingInvoiceId(null)
      })
      .catch(() => {
        if (!cancelled) setPendingInvoiceId(null)
      })
    return () => { cancelled = true }
  }, [pendingInvoiceId, pageRows, detailInvoice])

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setPaymentFilter('all')
    setSalespersonFilter('all')
    setPeriod('today')
    setFromDate('')
    setToDate('')
  }

  const activeFilterCount = [
    statusFilter !== 'all',
    paymentFilter !== 'all',
    salespersonFilter !== 'all',
    period !== 'today', // "today" is the default baseline
  ].filter(Boolean).length

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">

      {/* ── Summary cards ──
          Clicking a card drives the SERVER `status` query param (via
          statusFilter) so the drill-down stays consistent with pagination.
          Total/Amount are aggregates → clear status to 'all' (no ring).
          Paid → PAID; Outstanding → UNPAID (the server `status` param accepts
          a single value, so PARTIAL invoices aren't included in that view —
          the card count still totals UNPAID + PARTIAL). */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          {
            label: 'Total',
            value: summary.totalInvoices.toString(),
            subtitle: 'invoices',
            icon: Receipt,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            accent: 'border-l-blue-500',
            statusKey: 'all' as const,
            activeRing: '',
          },
          {
            label: 'Amount',
            value: formatCurrency(summary.totalAmount),
            subtitle: 'total billed',
            icon: IndianRupee,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            accent: 'border-l-emerald-500',
            statusKey: 'all' as const,
            activeRing: '',
          },
          {
            label: 'Paid',
            value: summary.paidCount.toString(),
            subtitle: 'settled invoices',
            icon: CheckCircle2,
            iconBg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
            accent: 'border-l-teal-500',
            statusKey: 'PAID' as const,
            activeRing: 'ring-2 ring-teal-500/50',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(summary.outstandingAmount),
            subtitle: `${summary.outstandingCount} pending`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            accent: 'border-l-amber-500',
            statusKey: 'UNPAID' as const,
            activeRing: 'ring-2 ring-amber-500/50',
          },
        ]).map((stat) => {
          // "all" cards (Total/Amount) toggle the status filter off; the
          // others toggle their status on/off. Active ring only on the
          // actionable cards while their status is selected.
          const active = stat.statusKey !== 'all' && statusFilter === stat.statusKey
          const handleClick = () => setStatusFilter(active ? 'all' : stat.statusKey)
          return (
          <Card
            key={stat.label}
            hover
            role="button"
            tabIndex={0}
            title={stat.statusKey === 'all' ? 'Clear status filter' : `Filter to ${stat.label.toLowerCase()} invoices`}
            onClick={handleClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.accent, active && stat.activeRing)}
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
      </motion.div>

      {/* ── Filters ── */}
      <motion.div variants={itemVariants} className="space-y-2">
        {customerFocusId && (
          <div className="flex items-center gap-2">
            <Badge variant="info" size="sm" className="gap-1.5 pl-2.5 pr-1.5">
              <User className="h-3 w-3" />
              <span>Filtered to: {customerFocusName || 'this customer'}</span>
              <button
                type="button"
                onClick={clearCustomerFocus}
                className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-foreground/10 transition-colors"
                aria-label="Clear customer filter"
              >
                <span className="text-[12px] leading-none">×</span>
              </button>
            </Badge>
          </div>
        )}
        <DataTableFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search invoice # or customer…"
          resultsCount={total}
          activeFilterCount={activeFilterCount}
          open={tableFiltersOpen}
          onOpenChange={setTableFiltersOpen}
          onClearFilters={clearFilters}
          leadingNode={
            <div className="w-40">
              <EnumSelect
                value={period}
                onValueChange={onPeriodChange}
                onClear={() => onPeriodChange('all')}
                options={PERIOD_OPTIONS}
              />
            </div>
          }
        >
          {/* All filters on one flex-wrap row so Status/Payment/Salesperson +
              the custom date pickers align on a single line (wrap only when the
              window is too narrow to fit them). */}
          <div className="col-span-full flex flex-wrap items-end gap-4">
            <div className="min-w-40 flex-1">
              <EnumSelect
                label="Status"
                value={statusFilter}
                onValueChange={setStatusFilter}
                onClear={() => setStatusFilter('all')}
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="min-w-40 flex-1">
              <EnumSelect
                label="Payment"
                value={paymentFilter}
                onValueChange={setPaymentFilter}
                onClear={() => setPaymentFilter('all')}
                options={PAYMENT_OPTIONS}
              />
            </div>
            <div className="min-w-40 flex-1">
              <EnumSelect
                label="Salesperson"
                value={salespersonFilter}
                onValueChange={setSalespersonFilter}
                onClear={() => setSalespersonFilter('all')}
                options={salespersonOptions}
              />
            </div>
            {period === 'custom' && (
              <>
                <div className="min-w-40 flex-1 space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                  <DatePicker value={fromDate} onChange={setFromDate} />
                </div>
                <div className="min-w-40 flex-1 space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                  <DatePicker value={toDate} onChange={setToDate} />
                </div>
              </>
            )}
          </div>
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
              {!isLoading && pageRows.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
                  <FileX2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No invoices found</p>
                </div>
              )}
              {!isLoading && pageRows.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 active:bg-muted/50"
                  onClick={() => setDetailInvoice(inv)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 mt-0.5">
                    <Receipt className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                    {inv.customerId ? (
                      <p
                        role="link"
                        tabIndex={0}
                        title="View customer details"
                        className="text-sm font-bold truncate text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); navigate(`/customers/detail?customerId=${inv.customerId}`) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/customers/detail?customerId=${inv.customerId}`) } }}
                      >{inv.customerName}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground truncate">{inv.customerName}</p>
                    )}
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
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice #</TableHead>
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
                  {!isLoading && pageRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-14 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <FileX2 className="h-8 w-8 opacity-30" />
                          <p className="text-sm">No invoices found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && pageRows.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setDetailInvoice(inv)}
                    >
                      <TableCell className="text-muted-foreground text-sm">{formatDate(inv.date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {inv.customerId ? (
                            <span
                              role="link"
                              tabIndex={0}
                              title="View customer details"
                              className="text-sm font-bold truncate max-w-40 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigate(`/customers/detail?customerId=${inv.customerId}`) }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/customers/detail?customerId=${inv.customerId}`) } }}
                            >{inv.customerName}</span>
                          ) : (
                            <span className="text-sm truncate max-w-40">{inv.customerName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-semibold">{inv.invoiceNumber}</TableCell>
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
              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={total}
                itemsPerPage={PAGE_SIZE}
                className="border-t border-border/40 px-4"
              />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Invoice Detail Drawer ── */}
      <Sheet open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null) }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-190 p-0 gap-0 flex flex-col"
        >
          {detailInvoice && (() => {
            const balanceDue = Number(detailInvoice.grandTotal) - Number(detailInvoice.amountPaid)
            // Typed collect amount overshoots the balance due — drives the
            // inline error + disabled Collect button below.
            const collectNum = parseFloat(collectAmount)
            // ₹1 tolerance so typing the rupee-rounded displayed balance doesn't
            // read as an over-payment.
            const collectExceeds = !isNaN(collectNum) && collectNum > balanceDue + 1
            return (
              <>
                {/* Sticky Header */}
                <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                  <div className="flex items-center justify-between gap-3 pr-8">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <SheetTitle className="font-mono text-base font-semibold truncate">
                        {detailInvoice.invoiceNumber}
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

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
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
                          i > 0 && 'border-l border-border/40',
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{cell.label}</p>
                        <p className="mt-0.5 text-sm font-medium truncate" title={cell.value}>{cell.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Items table */}
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
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(Number(item.rate))}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{item.gstPercent}%</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(Number(item.amount))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Collect Payment — only for unpaid invoices */}
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
                          className={cn(
                            'h-9 text-sm',
                            collectExceeds && 'border-rose-400 focus-visible:ring-rose-400',
                          )}
                          value={collectAmount}
                          onChange={(e) => setCollectAmount(e.target.value)}
                          min={0}
                          max={balanceDue}
                        />
                        <Button
                          size="sm"
                          className="gap-1.5 shrink-0"
                          disabled={collectSubmitting || !collectAmount || collectExceeds}
                          onClick={handleCollectPayment}
                        >
                          <Wallet className="h-4 w-4" />
                          {collectSubmitting ? 'Saving…' : 'Collect'}
                        </Button>
                      </div>
                      {collectExceeds && (
                        <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                          Amount can't exceed the outstanding {formatCurrency(balanceDue)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Sticky Footer: totals strip + actions */}
                <div className="shrink-0 border-t border-border/40 bg-background">
                  {/* Balance Due hero strip — only when there's outstanding.
                      Rendered ABOVE the totals breakdown so it's the first
                      thing a customer's eye lands on when reviewing what
                      they still owe. Amber-tinted, large currency, takes
                      the full width. */}
                  {balanceDue > 0.01 && (
                    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                          Balance Due
                        </span>
                        <span className="text-[10px] text-amber-700/70 dark:text-amber-400/70">
                          {formatCurrency(Number(detailInvoice.amountPaid))} paid of {formatCurrency(Number(detailInvoice.grandTotal))}
                        </span>
                      </div>
                      <span className="font-mono text-2xl font-black tabular-nums text-amber-700 dark:text-amber-400">
                        {formatCurrency(balanceDue)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-stretch overflow-x-auto border-b border-border/40 bg-muted/20">
                    {([
                      { label: 'Subtotal', value: Number(detailInvoice.subtotal) },
                      detailInvoice.productDiscount > 0 ? { label: 'Discount', value: -Number(detailInvoice.productDiscount), tone: 'rose' as const } : null,
                      { label: 'Taxable', value: Number(detailInvoice.taxableAmount) },
                      { label: 'CGST', value: Number(detailInvoice.cgst) },
                      { label: 'SGST', value: Number(detailInvoice.sgst) },
                      Number(detailInvoice.igst) > 0 ? { label: 'IGST', value: Number(detailInvoice.igst) } : null,
                      Number(detailInvoice.deliveryCharge) > 0 ? { label: 'Delivery', value: Number(detailInvoice.deliveryCharge) } : null,
                      Math.abs(Number(detailInvoice.roundOff)) > 0 ? { label: 'Round Off', value: Number(detailInvoice.roundOff) } : null,
                      { label: 'Grand Total', value: Number(detailInvoice.grandTotal), highlight: true as const },
                      Number(detailInvoice.amountPaid) > 0 ? { label: 'Paid', value: Number(detailInvoice.amountPaid), tone: 'emerald' as const } : null,
                    ].filter(Boolean) as Array<{ label: string; value: number; tone?: 'emerald' | 'rose'; highlight?: boolean }>).map((row, i) => (
                      <div
                        key={row.label}
                        className={cn(
                          'flex flex-1 min-w-18 flex-col justify-center whitespace-nowrap px-3 py-2',
                          i > 0 && 'border-l border-border/40',
                          row.highlight && 'bg-primary/5',
                        )}
                      >
                        <p className={cn(
                          'text-[9px] font-semibold uppercase tracking-wider',
                          row.tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
                          row.tone === 'rose' && 'text-rose-700 dark:text-rose-400',
                          !row.tone && 'text-muted-foreground',
                        )}>{row.label}</p>
                        <p className={cn(
                          'mt-0.5 font-mono text-xs',
                          row.highlight && 'text-sm font-bold',
                          row.tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
                          row.tone === 'rose' && 'text-rose-700 dark:text-rose-400',
                        )}>{formatCurrency(row.value)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="px-5 py-3 flex gap-2">
                    {(detailInvoice.status === 'UNPAID' || detailInvoice.status === 'PARTIAL') && (
                      <Button
                        variant="outline"
                        className="gap-2 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40"
                        onClick={() => navigate(`/billing/new?editId=${detailInvoice.id}`)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
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
                      onClick={() => shareInvoiceViaWhatsApp(detailInvoice)}
                      title="Share via WhatsApp"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Server-side WhatsApp + Razorpay QR actions (Meta Cloud
                      API + Razorpay backend). Hidden for draft/cancelled. */}
                  {detailInvoice.status !== 'DRAFT' && detailInvoice.status !== 'CANCELLED' && (
                    <div className="px-5 pb-4 flex flex-wrap gap-2 border-t border-dashed border-border/60 pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/40"
                        onClick={handleSendWhatsApp}
                        disabled={sendingWhatsApp}
                        title="Re-send the invoice PDF + payment QR via Meta Cloud API"
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
                        title="Generate a fresh Razorpay UPI QR for the current outstanding amount"
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
                        title="Poll Razorpay for missed webhook payments"
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
