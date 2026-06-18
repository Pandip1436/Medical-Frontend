import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
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
  ChevronDown,
  Plus,
  FileSpreadsheet,
  FileCode2,
  Eye,
  ArrowLeft,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { Invoice } from '@/types'
import {
  downloadInvoicePdf,
  printInvoicePdf,
  shareInvoiceViaWhatsApp,
} from '@/lib/pdf/invoicePdf'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { navigate, useRoute } from '@/lib/router'
import { exportToCsv, csvText, printReport } from '@/lib/exportUtils'

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

const SALES_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'customer', label: 'Customer', defaultVisible: true },
  { id: 'invoice', label: 'Invoice #', required: true, defaultVisible: true },
  { id: 'items', label: 'Items', defaultVisible: true },
  { id: 'total', label: 'Total', defaultVisible: true },
  { id: 'paid', label: 'Paid', defaultVisible: true },
  { id: 'balance', label: 'Balance', defaultVisible: true },
  { id: 'dueDate', label: 'Due Date', defaultVisible: true },
  { id: 'payment', label: 'Payment', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

export default function SalesListPage() {
  const cols = useColumnVisibility('billing.sales', SALES_COLUMNS)
  // Search
  const [searchQuery, setSearchQuery] = usePersistedState('filters:billing.sales:search', '')

  // Filters — period defaults to "today" so the page opens on today's sales.
  // Persisted to sessionStorage so they survive refresh + navigate-back.
  const [period, setPeriod] = usePersistedState('filters:billing.sales:period', 'today')
  // Stat-card drill-down: clicking a summary card narrows the list to that
  // subset (all sales / collected / outstanding / returns) on top of the
  // period. Kept separate from the Status enum filter because "outstanding"
  // spans two statuses (UNPAID + PARTIAL).
  const [cardFilter, setCardFilter] = usePersistedState<'all' | 'paid' | 'pending' | 'returns'>('filters:billing.sales:card', 'all')
  const [dateFrom, setDateFrom] = usePersistedState('filters:billing.sales:dateFrom', '')
  const [dateTo, setDateTo] = usePersistedState('filters:billing.sales:dateTo', '')
  const [selectedPaymentMode, setSelectedPaymentMode] = usePersistedState<string>('filters:billing.sales:paymentMode', 'all')
  const [selectedStatus, setSelectedStatus] = usePersistedState<string>('filters:billing.sales:status', 'all')
  const [selectedSalespersonId, setSelectedSalespersonId] = usePersistedState<string>('filters:billing.sales:salesperson', 'all')
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
    // Only UNPAID and PARTIAL invoices are editable. PAID invoices are locked
    // (fully settled — editing them would desync collected payment). CANCELLED
    // and RETURNED are terminal financial states. DRAFT goes through its own
    // "Resume editing" path higher up in this function.
    const canEdit = inv.status === 'UNPAID' || inv.status === 'PARTIAL'
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
  // rows get a soft "Cancel" (status flip). Both open the premium confirm
  // dialog; the actual API call (in confirmRemoveOrCancel) differs by status.
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null)
  const removeOrCancel = useCallback((inv: Invoice) => setCancelTarget(inv), [])

  const confirmRemoveOrCancel = useCallback(async () => {
    const inv = cancelTarget
    if (!inv) return
    try {
      if (inv.status === 'DRAFT') {
        await api.delete(`/billing/${inv.id}`)
        toast.success('Draft discarded')
      } else {
        await api.patch(`/billing/${inv.id}`, { status: 'CANCELLED' })
        toast.success('Invoice cancelled')
      }
      setCancelTarget(null)
      fetchInvoices()
    } catch {
      toast.error(cancelTarget?.status === 'DRAFT' ? 'Failed to discard draft' : 'Failed to cancel invoice')
    }
  }, [cancelTarget, fetchInvoices])

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

  // Legacy deep-links (?invoiceId=…, from notifications / credit notes / other
  // pages) now redirect to the standalone invoice detail page instead of
  // opening an in-list drawer.
  const { search } = useRoute()
  useEffect(() => {
    const target = new URLSearchParams(search).get('invoiceId')
    // Replace (not push) so this redirecting URL never enters the back stack —
    // back from the detail page returns to wherever the user came from
    // (notification, reminder, etc.) instead of bouncing back here.
    if (target) navigate(`/customers/invoices/detail?id=${target}`, { replace: true })
  }, [search])

  const clearFilters = () => {
    setPeriod('today')
    setCardFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedPaymentMode('all')
    setSelectedStatus('all')
    setSelectedSalespersonId('all')
  }

  // ── Filtering logic ──

  // Invoices within the selected period only — drives both the summary cards
  // and the list (so the cards always reflect the period, independent of the
  // card-click / search / status narrowing applied to the table below).
  const periodInvoices = useMemo(() => {
    let result = [...invoices]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((inv) => inv.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
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
    return result
  }, [invoices, period, dateFrom, dateTo])

  const filteredInvoices = useMemo(() => {
    let result = [...periodInvoices]

    // Stat-card drill-down
    if (cardFilter === 'paid') {
      result = result.filter((inv) => inv.status === 'PAID')
    } else if (cardFilter === 'pending') {
      result = result.filter((inv) => inv.status === 'UNPAID' || inv.status === 'PARTIAL')
    } else if (cardFilter === 'returns') {
      result = result.filter((inv) => inv.status === 'RETURNED')
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

    return result
  }, [
    periodInvoices,
    cardFilter,
    searchQuery,
    selectedPaymentMode,
    selectedStatus,
    selectedSalespersonId,
  ])

  // ── Stats ── (reflect the selected period, independent of card/table filters)

  const stats = useMemo(() => {
    // Real, posted sales only — DRAFT (never posted) and CANCELLED (voided)
    // must not count toward sales / collection / outstanding totals.
    const invs = periodInvoices.filter(
      (inv) => inv.type === 'INVOICE' && inv.status !== 'DRAFT' && inv.status !== 'CANCELLED',
    )
    const totalSales = invs.reduce((sum, inv) => sum + Number(inv.grandTotal), 0)
    // Collected = actual cash received across every invoice, including
    // part-payments on PARTIAL invoices (not just fully-paid ones).
    const paidTotal = invs.reduce((sum, inv) => sum + Number(inv.amountPaid ?? 0), 0)
    // Outstanding = the unpaid balance (grandTotal − amountPaid) on open
    // invoices, NOT the full invoice value — a PARTIAL invoice only owes its
    // remaining balance.
    const pendingTotal = invs
      .filter((inv) => inv.status === 'UNPAID' || inv.status === 'PARTIAL')
      .reduce((sum, inv) => sum + Math.max(0, Number(inv.grandTotal) - Number(inv.amountPaid ?? 0)), 0)
    return {
      totalSales,
      totalInvoices: invs.length,
      paidCount: invs.filter((inv) => inv.status === 'PAID').length,
      paidTotal,
      creditCount: invs.filter((inv) => inv.status === 'UNPAID' || inv.status === 'PARTIAL').length,
      pendingTotal,
      returnsCount: invs.filter((inv) => inv.status === 'RETURNED').length,
    }
  }, [periodInvoices])

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
    period !== 'today' ? period : '', // "today" is the default baseline
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom,
    dateTo,
    selectedPaymentMode !== 'all' ? selectedPaymentMode : '',
    selectedStatus !== 'all' ? selectedStatus : '',
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
        {([
          {
            label: 'Total Sales',
            value: formatCurrency(stats.totalSales),
            subtitle: `${stats.totalInvoices} invoices`,
            icon: IndianRupee,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            label: 'Collected',
            value: formatCurrency(stats.paidTotal),
            subtitle: `${stats.paidCount} paid`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: 'paid',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Outstanding',
            value: formatCurrency(stats.pendingTotal),
            subtitle: `${stats.creditCount} pending`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
            filterKey: 'pending',
            activeRing: 'ring-2 ring-amber-500/50',
          },
          {
            label: 'Returns',
            value: stats.returnsCount.toString(),
            subtitle: 'this period',
            icon: Undo2,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            filterKey: 'returns',
            activeRing: 'ring-2 ring-rose-500/50',
          },
        ] as const).map((stat) => {
          const active = cardFilter === stat.filterKey
          return (
          <Card
            key={stat.label}
            hover
            role="button"
            tabIndex={0}
            title={stat.filterKey === 'all' ? 'Show all sales in this period' : `Filter list to ${stat.label.toLowerCase()}`}
            onClick={() => { setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.borderAccent, active && stat.activeRing)}
          >
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
          )
        })}
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1) }}
        searchPlaceholder="Search invoice# or customer..."
        resultsCount={filteredInvoices.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        columnsNode={<ColumnsToggle columns={SALES_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-1.5">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Export {filteredInvoices.length} {filteredInvoices.length === 1 ? 'invoice' : 'invoices'}
                </p>
                <DropdownMenuItem
                  className="gap-3 rounded-md py-2 cursor-pointer focus:bg-sky-500/10"
                  onClick={() => {
                    if (filteredInvoices.length === 0) { toast.info('No invoices to print'); return }
                    // Prints the on-screen sales LIST as a report table (not each
                    // invoice individually). Mirrors the CSV column set.
                    printReport(filteredInvoices.map((inv) => ({
                      Invoice: inv.invoiceNumber,
                      Date: formatDate(inv.date),
                      Customer: inv.customerName,
                      Phone: inv.customerPhone ?? '',
                      Items: inv.items?.length ?? 0,
                      Total: formatCurrency(inv.grandTotal),
                      Paid: formatCurrency(inv.amountPaid),
                      Balance: formatCurrency(Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0)),
                      'Due Date': inv.dueDate ? formatDate(inv.dueDate) : '—',
                      'Payment Mode': paymentModeLabels[inv.paymentMode] || inv.paymentMode,
                      Status: inv.status,
                    })), 'Sales Invoices')
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Printer className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">Print List</span>
                    <span className="text-[11px] text-muted-foreground">Printable table of this view</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem
                  className="gap-3 rounded-md py-2 cursor-pointer focus:bg-emerald-500/10"
                  onClick={() => {
                    if (!filteredInvoices.length) { toast.info('No invoices to export'); return }
                    const exported = exportToCsv(filteredInvoices.map((inv) => ({
                      Invoice: inv.invoiceNumber,
                      Date: csvText(formatDate(inv.date)),
                      Customer: inv.customerName,
                      Phone: csvText(inv.customerPhone ?? ''),
                      Items: inv.items?.length ?? 0,
                      Total: inv.grandTotal,
                      Paid: inv.amountPaid,
                      Balance: Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0),
                      'Due Date': inv.dueDate ? csvText(formatDate(inv.dueDate)) : '',
                      'Payment Mode': paymentModeLabels[inv.paymentMode] || inv.paymentMode,
                      Status: inv.status,
                    })), 'sales-invoices')
                    // Bug #6: surface the row count so the user can reconcile
                    // the file vs the on-screen list. The list filter is whatever
                    // is currently active — if it's narrower than the dataset,
                    // make that visible rather than silently dropping rows.
                    toast.success(`Exported ${exported} invoice${exported === 1 ? '' : 's'} to sales-invoices.csv`)
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <FileSpreadsheet className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">CSV</span>
                    <span className="text-[11px] text-muted-foreground">Spreadsheet (Excel / Sheets)</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-3 rounded-md py-2 cursor-pointer focus:bg-amber-500/10"
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
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <FileCode2 className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">Tally XML</span>
                    <span className="text-[11px] text-muted-foreground">Import file for Tally</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => navigate('/billing/new')}>
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">New Sale</span>
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
                    Date: csvText(formatDate(inv.date)),
                    Customer: inv.customerName,
                    Phone: csvText(inv.customerPhone ?? ''),
                    Items: inv.items?.length ?? 0,
                    Total: inv.grandTotal,
                    Paid: inv.amountPaid,
                    Balance: Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0),
                    'Due Date': inv.dueDate ? csvText(formatDate(inv.dueDate)) : '',
                    'Payment Mode': paymentModeLabels[inv.paymentMode] || inv.paymentMode,
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
                  onClick={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
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
                    <CustomerNameLine
                      name={inv.customerName}
                      phone={inv.customerPhone}
                      onNameClick={inv.customerId ? () => navigate(`/customers/detail?customerId=${inv.customerId}`) : undefined}
                    />
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
                      <div className="flex flex-col items-end leading-tight">
                        <span className="font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(inv.grandTotal)}</span>
                        {Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0) > 0.01 && (
                          <span className="font-mono text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            Bal {formatCurrency(Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0))}
                          </span>
                        )}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DataTableRowActions
                          onView={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
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
              {cols.isVisible('date') && <TableHead>Date</TableHead>}
              {cols.isVisible('customer') && <TableHead>Customer</TableHead>}
              {cols.isVisible('invoice') && <TableHead>Invoice #</TableHead>}
              {cols.isVisible('items') && <TableHead className="text-center">Items</TableHead>}
              {cols.isVisible('total') && <TableHead className="text-right">Total</TableHead>}
              {cols.isVisible('paid') && <TableHead className="text-right">Paid</TableHead>}
              {cols.isVisible('balance') && <TableHead className="text-right">Balance</TableHead>}
              {cols.isVisible('dueDate') && <TableHead>Due Date</TableHead>}
              {cols.isVisible('payment') && <TableHead>Payment</TableHead>}
              {cols.isVisible('status') && <TableHead>Status</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 2} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Fetching invoices...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 2} className="h-40">
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
                    onClick={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(inv.id)}
                        onCheckedChange={() => toggleSelectOne(inv.id)}
                      />
                    </TableCell>
                    {cols.isVisible('date') && (
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(inv.date)}
                      </span>
                    </TableCell>
                    )}
                    {cols.isVisible('customer') && (
                    <TableCell className="max-w-45">
                      <CustomerNameLine
                        name={inv.customerName}
                        phone={inv.customerPhone}
                        onNameClick={inv.customerId ? () => navigate(`/customers/detail?customerId=${inv.customerId}`) : undefined}
                      />
                      {inv.doctorName && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {inv.doctorName}
                        </p>
                      )}
                    </TableCell>
                    )}
                    {cols.isVisible('invoice') && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Receipt className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="font-mono text-[11px] font-medium">
                          {formatInvoiceNumber(inv)}
                        </span>
                      </div>
                    </TableCell>
                    )}
                    {cols.isVisible('items') && (
                    <TableCell className="text-center">
                      <Badge variant="secondary" size="sm">
                        {inv.items?.length ?? 0}
                      </Badge>
                    </TableCell>
                    )}
                    {cols.isVisible('total') && (
                    <TableCell className="text-right font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(inv.grandTotal)}
                    </TableCell>
                    )}
                    {cols.isVisible('paid') && (
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(inv.amountPaid)}
                    </TableCell>
                    )}
                    {cols.isVisible('balance') && (() => {
                      const balance = Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0)
                      return (
                        <TableCell className={`text-right font-mono text-sm font-semibold ${balance > 0.01 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                          {formatCurrency(balance)}
                        </TableCell>
                      )
                    })()}
                    {cols.isVisible('dueDate') && (
                    <TableCell className="whitespace-nowrap">
                      {inv.dueDate ? (() => {
                        const overdue =
                          new Date(inv.dueDate) < new Date() &&
                          (inv.status === 'UNPAID' || inv.status === 'PARTIAL')
                        return (
                          <span className={cn('text-[11px]', overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                            {formatDate(inv.dueDate)}
                          </span>
                        )
                      })() : (
                        <span className="text-[11px] text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    )}
                    {cols.isVisible('payment') && (
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
                    )}
                    {cols.isVisible('status') && (
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    )}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
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

      {/* Discard-draft / cancel-invoice confirmation (premium dialog). */}
      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) setCancelTarget(null) }}
        title={cancelTarget?.status === 'DRAFT' ? 'Discard draft?' : 'Cancel invoice?'}
        description={cancelTarget?.status === 'DRAFT' ? (
          <>This permanently discards the draft for <span className="font-semibold text-foreground">{cancelTarget?.customerName}</span>. This cannot be undone.</>
        ) : (
          <>Invoice <span className="font-mono font-semibold text-foreground">{cancelTarget?.invoiceNumber}</span> for <span className="font-semibold text-foreground">{cancelTarget?.customerName}</span> will be marked <span className="font-semibold">CANCELLED</span>. It stays on record, but stock is <span className="font-semibold">not</span> restored automatically. This is irreversible.</>
        )}
        confirmLabel={cancelTarget?.status === 'DRAFT' ? 'Discard' : 'Cancel Invoice'}
        onConfirm={confirmRemoveOrCancel}
      />
    </motion.div>
  )
}
