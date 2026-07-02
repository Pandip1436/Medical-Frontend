import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useRoute } from '@/lib/router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Send,
  ArrowRightLeft,
  FileText,
  Download,
  Printer,
  X,
  IndianRupee,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  Share2,
  Filter,
  BarChart3,
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
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { CustomerSearchSelect } from '@/components/shared/CustomerSearchSelect'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import api from '@/lib/api'
import { usePageFilter } from '@/hooks/usePageFilter'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'
import { exportToCsv, printReport } from '@/lib/exportUtils'
import { shareQuotationViaWhatsApp } from '@/lib/pdf/quotationPdf'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { QuotationSplitView } from './components/QuotationSplitView'

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED'

export interface QuotationItem {
  name: string
  qty: number
  rate: number
  // Backend persists per-line discount + GST + a computed amount. Drop those
  // and the line label will be `qty * rate` (the gross), which won't agree
  // with the quotation's `total` whenever a discount or per-line tax was
  // applied — surfacing as a phantom mismatch between the line and the total.
  discountPercent: number
  gstPercent: number
  amount: number
}

export interface Quotation {
  id: string
  quotationNumber: string
  date: string
  customerId?: string
  customerName: string
  customerPhone?: string
  items: QuotationItem[]
  subtotal: number
  cgst: number
  sgst: number
  deliveryCharge: number
  total: number
  status: QuotationStatus
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10
const SPLIT_PAGE_SIZE = 30

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CONVERTED', label: 'Converted' },
] as const

type QuotationTabKey = 'all' | 'DRAFT' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'REJECTED'

const QUOTATION_TABS: Array<{ key: QuotationTabKey; label: string; activeColor: string; badgeColor: string }> = [
  { key: 'all',       label: 'All',       activeColor: 'border-primary text-primary',                                            badgeColor: 'bg-primary/10 text-primary' },
  { key: 'DRAFT',     label: 'Draft',     activeColor: 'border-slate-500 text-slate-600 dark:text-slate-400',                    badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { key: 'SENT',      label: 'Sent',      activeColor: 'border-sky-500 text-sky-600 dark:text-sky-400',                          badgeColor: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  { key: 'ACCEPTED',  label: 'Accepted',  activeColor: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',              badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { key: 'CONVERTED', label: 'Converted', activeColor: 'border-violet-500 text-violet-600 dark:text-violet-400',                 badgeColor: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  { key: 'REJECTED',  label: 'Rejected',  activeColor: 'border-rose-500 text-rose-600 dark:text-rose-400',                       badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
]

function QuotationStatusTabs({ tab, onChange, counts }: {
  tab: QuotationTabKey
  onChange: (t: QuotationTabKey) => void
  counts: Record<QuotationTabKey, number>
}) {
  return (
    <div className="flex gap-1 overflow-x-auto px-3 pb-2 pt-1">
      {QUOTATION_TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
            tab === t.key
              ? `border-b-2 bg-muted/20 ${t.activeColor}`
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
          <span className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            tab === t.key ? t.badgeColor : 'bg-muted text-muted-foreground'
          )}>
            {counts[t.key]}
          </span>
        </button>
      ))}
    </div>
  )
}

const statusBadgeVariant: Record<QuotationStatus, 'success' | 'warning' | 'info' | 'purple' | 'destructive' | 'secondary'> = {
  CONVERTED: 'success',
  ACCEPTED: 'success',
  SENT: 'info',
  DRAFT: 'secondary',
  REJECTED: 'destructive',
}

const statusLabel: Record<QuotationStatus, string> = {
  CONVERTED: 'Converted',
  ACCEPTED: 'Accepted',
  SENT: 'Sent',
  DRAFT: 'Draft',
  REJECTED: 'Rejected',
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

const QUOTATION_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'customer', label: 'Customer', defaultVisible: true },
  { id: 'quotation', label: 'Quotation #', required: true, defaultVisible: true },
  { id: 'items', label: 'Items', defaultVisible: true },
  { id: 'total', label: 'Total', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

const CARD_FIELDS: ColumnDef[] = [
  { id: 'total', label: 'Total', defaultVisible: true },
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'quotationNumber', label: 'Quotation No.', defaultVisible: true },
  { id: 'phone', label: 'Phone', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'items', label: 'Items Count', defaultVisible: true },
]

export default function QuotationsPage() {
  const cols = useColumnVisibility('billing.quotations', QUOTATION_COLUMNS)
  const cardCols = useColumnVisibility('billing.quotations.card', CARD_FIELDS)
  const { path, search: routeSearch } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch])

  // Split is default; ?view=table → table view
  const effectiveView = urlParams.get('view') === 'table' ? 'table' : 'split'
  const selectedQuotationId = urlParams.get('quotationId')

  const selectQuotation = useCallback((id: string | null) => {
    if (window.location.pathname !== '/billing/quotations') return
    const params = new URLSearchParams()
    if (id) params.set('quotationId', id)
    navigate(`/billing/quotations${params.toString() ? `?${params.toString()}` : ''}`)
  }, [])

  const exitSplitView = useCallback(() => {
    navigate('/billing/quotations?view=table')
  }, [])

  // Filters — usePageFilter for persistence
  const [searchQuery, setSearchQuery] = usePageFilter<string>('billing.quotations', 'search', '')
  const [period, setPeriod] = usePageFilter<string>('billing.quotations', 'period', 'today')
  const [dateFrom, setDateFrom] = usePageFilter<string>('billing.quotations', 'dateFrom', '')
  const [dateTo, setDateTo] = usePageFilter<string>('billing.quotations', 'dateTo', '')
  const [selectedStatus, setSelectedStatus] = usePageFilter<string>('billing.quotations', 'status', 'all')
  const [selectedCustomer, setSelectedCustomer] = usePageFilter<string>('billing.quotations', 'customer', 'all')
  const [selectedCustomerName, setSelectedCustomerName] = usePageFilter<string>('billing.quotations', 'customerName', '')
  const [splitShowStats, setSplitShowStats] = usePageFilter<boolean>('billing.quotations', 'splitShowStats', true)
  const [statusTab, setStatusTab] = usePageFilter<QuotationTabKey>('billing.quotations', 'statusTab', 'all')

  // Stat-card drill-down — not persisted (intentional)
  const [cardFilter, setCardFilter] = useState<'all' | 'converted' | 'pending' | 'rejected'>('all')
  const [splitShowFilters, setSplitShowFilters] = useState(false)

  const loadFilterPrefs = useFilterPrefsStore((s) => s.loadFromServer)
  useEffect(() => { loadFilterPrefs() }, [loadFilterPrefs])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Real data
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [detailQt, setDetailQt] = useState<Quotation | null>(null)

  // Master data — needed for filter dropdowns AND to resolve customerId →
  // phone for WhatsApp share.
  const { customers, fetchMasterData } = useMasterDataStore()
  useEffect(() => { fetchMasterData() }, [fetchMasterData])

  const phoneFor = useCallback(
    (qt: Quotation): string | undefined =>
      qt.customerId ? customers.find(c => c.id === qt.customerId)?.phone : undefined,
    [customers],
  )

  const fetchQuotations = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/quotations')
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
      const mapped: Quotation[] = raw.map((qt: any) => ({
        id: qt.id,
        quotationNumber: qt.quotationNumber ?? '',
        date: qt.date ?? qt.createdAt ?? new Date().toISOString(),
        customerId: qt.customerId ?? undefined,
        customerName: qt.customerName ?? '',
        customerPhone: qt.customerPhone ?? undefined,
        items: (qt.items ?? []).map((it: any) => ({
          name: it.productName ?? '',
          qty: Number(it.quantity) || 0,
          rate: Number(it.rate) || 0,
          discountPercent: Number(it.discountPercent) || 0,
          gstPercent: Number(it.gstPercent) || 0,
          // `amount` is the backend's authoritative per-line value (already
          // includes per-line discount + GST). Display it instead of
          // recomputing qty*rate so the line total can never disagree with
          // the quotation's grand total.
          amount: Number(it.amount) || 0,
        })),
        subtotal: Number(qt.subtotal) || 0,
        cgst: Number(qt.cgst) || 0,
        sgst: Number(qt.sgst) || 0,
        deliveryCharge: Number(qt.deliveryCharge) || 0,
        total: Number(qt.total) || 0,
        status: qt.status as QuotationStatus,
      }))
      setQuotations(mapped)
    } catch {
      // keep empty on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Re-fetch whenever this page becomes active (e.g. after creating a quotation)
  useEffect(() => { fetchQuotations() }, [fetchQuotations, path])
  useBranchRefresh(fetchQuotations)


  // Deep-link support: open the quotation drawer when arrived with
  // `?quotationId=<id>` in TABLE view. In split view `?quotationId=` selects the
  // quotation in the split panel instead, so the drawer must stay closed —
  // otherwise its state lingers and pops open when toggling to table view.
  useEffect(() => {
    if (effectiveView !== 'table') {
      setDetailQt(null)
      return
    }
    const params = new URLSearchParams(routeSearch)
    const target = params.get('quotationId')
    if (!target || quotations.length === 0) return
    if (detailQt?.id === target) return
    const match = quotations.find((q) => q.id === target)
    if (match) setDetailQt(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch, quotations, effectiveView])

  const handleUpdateStatus = async (qt: Quotation, status: QuotationStatus) => {
    try {
      await api.patch(`/quotations/${qt.id}/status`, { status })
      toast.success(`Quotation ${qt.quotationNumber} marked as ${status.toLowerCase()}`)
      fetchQuotations()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Status update failed')
    }
  }

  const handleConvert = (qt: Quotation) => {
    sessionStorage.setItem('quotation_prefill', JSON.stringify({
      quotationId: qt.id,
      quotationNumber: qt.quotationNumber,
      customerId: qt.customerId ?? '',
      customerName: qt.customerName,
      customerPhone: qt.customerPhone ?? '',
      deliveryCharge: Number(qt.deliveryCharge) || 0,
      items: qt.items.map((it) => ({
        productName: it.name,
        quantity: it.qty,
        rate: it.rate,
        amount: it.qty * it.rate,
      })),
    }))
    // Use a timestamp param so NewSalePage always remounts fresh
    navigate(`/billing/new?from=quotation&t=${Date.now()}`)
  }

  const clearFilters = () => {
    setPeriod('today')
    setCardFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedStatus('all')
    setSelectedCustomer('all')
    setSelectedCustomerName('')
    setStatusTab('all')
  }

  // ── Filtering logic ──

  // Quotations within the selected period only — drives both the summary cards
  // and the list (so the cards always reflect the period, independent of the
  // card-click / search / status narrowing applied to the table below).
  const periodQuotations = useMemo(() => {
    let result = [...quotations]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((qt) => qt.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
        result = result.filter((qt) => qt.date.slice(0, 10) >= weekStr)
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter((qt) => qt.date.slice(0, 10) >= monthStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter((qt) => qt.date.slice(0, 10) >= dateFrom)
        if (dateTo) result = result.filter((qt) => qt.date.slice(0, 10) <= dateTo)
        break
    }
    return result
  }, [quotations, period, dateFrom, dateTo])

  // Quotations after every filter EXCEPT the stat-card drill-down (period +
  // search + status + customer). Drives the stat cards so they reflect the
  // active filters; the table layers the card drill-down on top.
  const statsBaseQuotations = useMemo(() => {
    let result = [...periodQuotations]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (qt) =>
          qt.quotationNumber.toLowerCase().includes(q) ||
          qt.customerName.toLowerCase().includes(q)
      )
    }

    // Status
    if (selectedStatus && selectedStatus !== 'all') {
      result = result.filter((qt) => qt.status === selectedStatus)
    }

    // Customer (by id — set via the picker)
    if (selectedCustomer && selectedCustomer !== 'all') {
      result = result.filter((qt) => qt.customerId === selectedCustomer)
    }

    return result
  }, [periodQuotations, searchQuery, selectedStatus, selectedCustomer])

  const preTabQuotations = useMemo(() => {
    let result = statsBaseQuotations
    // Stat-card drill-down (layered on top of the other filters)
    if (cardFilter === 'converted') {
      result = result.filter((qt) => qt.status === 'CONVERTED')
    } else if (cardFilter === 'pending') {
      result = result.filter((qt) => qt.status === 'DRAFT' || qt.status === 'SENT' || qt.status === 'ACCEPTED')
    } else if (cardFilter === 'rejected') {
      result = result.filter((qt) => qt.status === 'REJECTED')
    }
    return result
  }, [statsBaseQuotations, cardFilter])

  const tabCounts = useMemo(() => {
    const counts: Record<QuotationTabKey, number> = { all: preTabQuotations.length, DRAFT: 0, SENT: 0, ACCEPTED: 0, CONVERTED: 0, REJECTED: 0 }
    for (const qt of preTabQuotations) {
      if (qt.status in counts) counts[qt.status as QuotationTabKey]++
    }
    return counts
  }, [preTabQuotations])

  const filteredQuotations = useMemo(
    () => statusTab === 'all' ? preTabQuotations : preTabQuotations.filter((qt) => qt.status === statusTab),
    [preTabQuotations, statusTab]
  )

  // ── Stats ── (reflect period + search + status + customer, but NOT the card
  // drill-down — so clicking a card never rewrites its own total)

  const stats = useMemo(() => {
    const total = statsBaseQuotations.reduce((sum, qt) => sum + qt.total, 0)
    const convertedCount = statsBaseQuotations.filter((qt) => qt.status === 'CONVERTED').length
    const convertedTotal = statsBaseQuotations.filter((qt) => qt.status === 'CONVERTED').reduce((sum, qt) => sum + qt.total, 0)
    const pendingCount = statsBaseQuotations.filter((qt) => qt.status === 'DRAFT' || qt.status === 'SENT' || qt.status === 'ACCEPTED').length
    const pendingTotal = statsBaseQuotations.filter((qt) => qt.status === 'DRAFT' || qt.status === 'SENT' || qt.status === 'ACCEPTED').reduce((sum, qt) => sum + qt.total, 0)
    const rejectedCount = statsBaseQuotations.filter((qt) => qt.status === 'REJECTED').length
    return {
      total,
      totalCount: statsBaseQuotations.length,
      convertedCount,
      convertedTotal,
      pendingCount,
      pendingTotal,
      rejectedCount,
    }
  }, [statsBaseQuotations])

  // ── Pagination ──

  const totalPages = Math.ceil(filteredQuotations.length / PAGE_SIZE)
  const paginatedQuotations = filteredQuotations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )


  // ── Bulk select ──

  const allOnPageSelected =
    paginatedQuotations.length > 0 &&
    paginatedQuotations.every((qt) => selectedIds.has(qt.id))

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const newSet = new Set(selectedIds)
      paginatedQuotations.forEach((qt) => newSet.delete(qt.id))
      setSelectedIds(newSet)
    } else {
      const newSet = new Set(selectedIds)
      paginatedQuotations.forEach((qt) => newSet.add(qt.id))
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

  // ── Active filters count ──
  const activeFilterCount = [
    period !== 'today' ? period : '', // "today" is the default baseline
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom,
    dateTo,
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedCustomer !== 'all' ? selectedCustomer : '',
    statusTab !== 'all' ? statusTab : '',
  ].filter(Boolean).length

  if (effectiveView === 'split') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
        {/* Collapsible stats */}
        <AnimatePresence>
          {splitShowStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { label: 'Total', value: formatCurrency(stats.total), sub: `${stats.totalCount} quotations`, borderAccent: 'border-l-blue-500' },
                  { label: 'Converted', value: formatCurrency(stats.convertedTotal), sub: `${stats.convertedCount} converted`, borderAccent: 'border-l-emerald-500' },
                  { label: 'Pending', value: formatCurrency(stats.pendingTotal), sub: `${stats.pendingCount} pending`, borderAccent: 'border-l-amber-500' },
                  { label: 'Rejected', value: stats.rejectedCount.toString(), sub: 'this period', borderAccent: 'border-l-rose-500' },
                ] as const).map((s) => (
                  <Card key={s.label} className={cn('border-l-[3px]', s.borderAccent)}>
                    <CardContent className="flex items-center gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                        <p className="font-mono text-sm font-bold leading-tight">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-end justify-end gap-1.5">
          <div className="mr-auto w-40 min-w-35">
            <EnumSelect label="Period" value={period} onValueChange={(v) => { setPeriod(v); setCurrentPage(1) }} onClear={() => setPeriod('all')} options={PERIOD_OPTIONS} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!filteredQuotations.length) { toast.info('No quotations to export'); return }
              exportToCsv(filteredQuotations.map((qt) => ({
                'Quotation #': qt.quotationNumber,
                Date: qt.date?.slice(0, 10) ?? '',
                Customer: qt.customerName,
                Total: qt.total,
                Status: qt.status,
              })), 'quotations')
            }}
          >
            <Download className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Toggle filters"
            onClick={() => setSplitShowFilters(!splitShowFilters)}
            className={cn(splitShowFilters && 'border-primary/50 bg-primary/5')}
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            title={splitShowStats ? 'Hide stats' : 'Show stats'}
            onClick={() => setSplitShowStats(!splitShowStats)}
            className={cn(splitShowStats && 'border-primary/50 bg-primary/5')}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => navigate('/billing/new?type=quotation')}>
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Create Quotation</span>
          </Button>
          <ViewModeToggle view="split" onViewChange={(v) => { if (v === 'table') exitSplitView() }} />
        </div>

        {/* Collapsible filter panel */}
        <AnimatePresence>
          {splitShowFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                <div className="flex items-end gap-3 *:flex-1 *:min-w-35">
                  <EnumSelect label="Status" value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setCurrentPage(1) }} onClear={() => setSelectedStatus('all')} options={STATUS_OPTIONS} />
                  <CustomerSearchSelect value={selectedCustomer} selectedName={selectedCustomerName} onChange={(val, name) => { setSelectedCustomer(val); setSelectedCustomerName(name); setCurrentPage(1) }} />
                  <div className="flex-none! min-w-0! flex items-end gap-2">
                    <ColumnsToggle
                      columns={CARD_FIELDS}
                      visible={cardCols.visible}
                      onToggle={cardCols.toggle}
                      onReset={cardCols.reset}
                    />
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => clearFilters()}>
                        <X className="mr-1 h-3.5 w-3.5" />Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Split view */}
        <div className="min-h-0 flex-1">
          <QuotationSplitView
            quotations={filteredQuotations}
            loading={isLoading}
            selectedQuotationId={selectedQuotationId}
            onSelectQuotation={selectQuotation}
            onExitSplitView={exitSplitView}
            onRefresh={fetchQuotations}
            isCardFieldVisible={cardCols.isVisible}
            tabsNode={
              <QuotationStatusTabs
                tab={statusTab}
                onChange={(t) => { setStatusTab(t); setCurrentPage(1) }}
                counts={tabCounts}
              />
            }
          />
        </div>
      </div>
    )
  }

  return (
    <>
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
            label: 'Total Quotations',
            value: formatCurrency(stats.total),
            subtitle: `${stats.totalCount} quotations`,
            icon: IndianRupee,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            label: 'Converted',
            value: formatCurrency(stats.convertedTotal),
            subtitle: `${stats.convertedCount} converted`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: 'converted',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Pending',
            value: formatCurrency(stats.pendingTotal),
            subtitle: `${stats.pendingCount} draft/sent/accepted`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
            filterKey: 'pending',
            activeRing: 'ring-2 ring-amber-500/50',
          },
          {
            label: 'Rejected',
            value: stats.rejectedCount.toString(),
            subtitle: 'this period',
            icon: XCircle,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            filterKey: 'rejected',
            activeRing: 'ring-2 ring-rose-500/50',
          },
        ] as const).map((stat) => {
          const active = stat.filterKey !== 'all' && cardFilter === stat.filterKey
          return (
          <Card
            key={stat.label}
            hover
            role="button"
            tabIndex={0}
            title={stat.filterKey === 'all' ? 'Show all quotations in this period' : `Filter list to ${stat.label.toLowerCase()}`}
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
        searchPlaceholder="Search quotation# or customer..."
        resultsCount={filteredQuotations.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        leadingNode={
          <div className="w-40">
            <EnumSelect
              label="Period"
              value={period}
              onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
              onClear={() => { setPeriod('all'); setCurrentPage(1) }}
              options={PERIOD_OPTIONS}
            />
          </div>
        }
        columnsNode={<ColumnsToggle columns={QUOTATION_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => navigate('/billing/new?type=quotation')}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Create Quotation</span>
              <span className="sm:hidden">Create</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={() => navigate('/billing/sales')}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Invoice List</span>
            </Button>
            <ViewModeToggle view="table" onViewChange={(v) => { if (v === 'split') navigate('/billing/quotations') }} />
          </div>
        }
      >
        {/* Custom 4-col grid that overrides DataTableFilterBar's inner grid for equal-width filters */}
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EnumSelect
            label="Status"
            value={selectedStatus}
            onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
            onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
            options={STATUS_OPTIONS}
          />

          <CustomerSearchSelect
            value={selectedCustomer}
            selectedName={selectedCustomerName}
            onChange={(val, name) => { setSelectedCustomer(val); setSelectedCustomerName(name); setCurrentPage(1) }}
          />

          {/* Custom date range — only when period is 'custom', full-width row below */}
          {period === 'custom' && (
            <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/40 pt-4 mt-1">
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
        </div>
      </DataTableFilterBar>

      {/* ── Status Tabs ── */}
      <div className="rounded-lg border border-border/40 bg-background">
        <QuotationStatusTabs
          tab={statusTab}
          onChange={(t) => { setStatusTab(t); setCurrentPage(1) }}
          counts={tabCounts}
        />
      </div>

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
                  const selected = filteredQuotations.filter((qt) => selectedIds.has(qt.id))
                  const lines = selected.map((qt) => `${qt.quotationNumber} | ${qt.customerName} | ${formatCurrency(qt.total)}`).join('%0a')
                  window.open(`https://wa.me/?text=${encodeURIComponent('Quotations:%0a' + lines)}`, '_blank')
                }}>
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Send
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = filteredQuotations.filter((qt) => selectedIds.has(qt.id))
                  exportToCsv(selected.map((qt) => ({
                    'Quotation #': qt.quotationNumber,
                    Date: qt.date?.slice(0, 10) ?? '',
                    Customer: qt.customerName,
                    Total: qt.total,
                    Status: qt.status,
                  })), 'quotations-selected')
                }}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = filteredQuotations.filter((qt) => selectedIds.has(qt.id))
                  printReport(selected.map((qt) => ({
                    'Quotation #': qt.quotationNumber,
                    Date: qt.date?.slice(0, 10) ?? '',
                    Customer: qt.customerName,
                    Total: formatCurrency(qt.total),
                    Status: qt.status,
                  })), 'Quotations')
                }}>
                  <Printer className="mr-1 h-3.5 w-3.5" />
                  Print
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

      {/* ── Table ── */}
      <Card>
        {/* Mobile card list */}
        <div className="lg:hidden">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Fetching quotations...</p>
            </div>
          )}
          {!isLoading && paginatedQuotations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <FileText className="h-6 w-6 text-muted-foreground/60" />
              <p className="text-sm font-medium text-muted-foreground">No quotations found</p>
            </div>
          )}
          <div className="divide-y divide-border/40">
            {!isLoading && paginatedQuotations.map((qt) => (
              <div
                key={qt.id}
                className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setDetailQt(qt)}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] font-medium">{qt.quotationNumber}</p>
                  <CustomerNameLine
                    name={qt.customerName}
                    phone={qt.customerPhone}
                    onNameClick={qt.customerId ? () => navigate(`/customers/detail?customerId=${qt.customerId}`) : undefined}
                  />
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant={statusBadgeVariant[qt.status]} size="sm" dot>
                      {statusLabel[qt.status]}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{formatDate(qt.date)}</span>
                  </div>
                </div>
                <p className="font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(qt.total)}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Desktop table */}
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
              {cols.isVisible('quotation') && <TableHead>Quotation #</TableHead>}
              {cols.isVisible('items') && <TableHead className="text-center">Items</TableHead>}
              {cols.isVisible('total') && <TableHead className="text-right">Total</TableHead>}
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
                      <p className="text-sm text-muted-foreground animate-pulse">Fetching quotations...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedQuotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 2} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                        <FileText className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          No quotations found
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                          Try adjusting your search or filters
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedQuotations.map((qt, idx) => (
                  <motion.tr
                    key={qt.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, delay: idx * 0.02 }}
                    className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                    onClick={() => setDetailQt(qt)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(qt.id)}
                        onCheckedChange={() => toggleSelectOne(qt.id)}
                      />
                    </TableCell>
                    {cols.isVisible('date') && (
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(qt.date)}
                      </span>
                    </TableCell>
                    )}
                    {cols.isVisible('customer') && (
                    <TableCell className="max-w-50">
                      <CustomerNameLine
                        name={qt.customerName}
                        phone={qt.customerPhone}
                        onNameClick={qt.customerId ? () => navigate(`/customers/detail?customerId=${qt.customerId}`) : undefined}
                      />
                    </TableCell>
                    )}
                    {cols.isVisible('quotation') && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="font-mono text-[11px] font-medium">
                          {qt.quotationNumber}
                        </span>
                      </div>
                    </TableCell>
                    )}
                    {cols.isVisible('items') && (
                    <TableCell className="text-center">
                      <Badge variant="secondary" size="sm">
                        {qt.items.length}
                      </Badge>
                    </TableCell>
                    )}
                    {cols.isVisible('total') && (
                    <TableCell className="text-right font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(qt.total)}
                    </TableCell>
                    )}
                    {cols.isVisible('status') && (
                    <TableCell>
                      <Badge
                        variant={statusBadgeVariant[qt.status]}
                        size="sm"
                        dot
                      >
                        {statusLabel[qt.status]}
                      </Badge>
                    </TableCell>
                    )}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => setDetailQt(qt)}
                        onDelete={async () => {
                          try {
                            await api.delete(`/quotations/${qt.id}`)
                            toast.success(`Quotation ${qt.quotationNumber} deleted`)
                            fetchQuotations()
                          } catch {
                            toast.error('Failed to delete quotation')
                          }
                        }}
                        customActions={[
                          {
                            label: 'Mark as Sent',
                            icon: <Send className="h-4 w-4" />,
                            onClick: () => handleUpdateStatus(qt, 'SENT'),
                            disabled: qt.status !== 'DRAFT'
                          },
                          {
                            label: 'Mark as Accepted',
                            icon: <CheckCircle2 className="h-4 w-4" />,
                            onClick: () => handleUpdateStatus(qt, 'ACCEPTED'),
                            disabled: qt.status !== 'DRAFT' && qt.status !== 'SENT'
                          },
                          {
                            label: 'Mark as Rejected',
                            icon: <XCircle className="h-4 w-4" />,
                            onClick: () => handleUpdateStatus(qt, 'REJECTED'),
                            disabled: qt.status !== 'DRAFT' && qt.status !== 'SENT' && qt.status !== 'ACCEPTED'
                          },
                          {
                            label: 'Convert to Invoice',
                            icon: <ArrowRightLeft className="h-4 w-4" />,
                            onClick: () => handleConvert(qt),
                            disabled: qt.status === 'CONVERTED' || qt.status === 'REJECTED'
                          },
                          {
                            label: 'Send via WhatsApp',
                            icon: <Send className="h-4 w-4" />,
                            onClick: () => shareQuotationViaWhatsApp(qt, phoneFor(qt)),
                            disabled: qt.status === 'REJECTED'
                          },
                        ]}
                      />
                    </TableCell>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
        </div>

        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredQuotations.length}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>
    </motion.div>

    {/* ── Quotation Detail Drawer ── */}
    <Sheet open={!!detailQt} onOpenChange={(open) => !open && setDetailQt(null)}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-160 lg:max-w-190 p-0 gap-0 flex flex-col"
      >
        {detailQt && (() => {
          const canMarkSent = detailQt.status === 'DRAFT'
          const canAccept = detailQt.status === 'DRAFT' || detailQt.status === 'SENT'
          const canReject = detailQt.status === 'DRAFT' || detailQt.status === 'SENT' || detailQt.status === 'ACCEPTED'
          const canConvert = detailQt.status !== 'CONVERTED' && detailQt.status !== 'REJECTED'
          return (
            <>
              {/* ── Sticky Header ── */}
              <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                <div className="flex items-center justify-between gap-3 pr-8">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <SheetTitle className="font-mono text-base font-semibold truncate">
                      {detailQt.quotationNumber}
                    </SheetTitle>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(detailQt.date)}
                    </span>
                  </div>
                </div>
              </SheetHeader>

              {/* ── Scrollable Body ── */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Customer / Items / Status — single row, equal width */}
                <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
                  <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Customer</p>
                    <CustomerNameLine name={detailQt.customerName} phone={detailQt.customerPhone} className="mt-0.5" />
                  </div>
                  <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Items</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium whitespace-nowrap">
                      <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                      {detailQt.items.length} {detailQt.items.length === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Status</p>
                    <div className="mt-0.5">
                      <Badge variant={statusBadgeVariant[detailQt.status]} size="sm" dot>
                        {statusLabel[detailQt.status]}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Items — proper table with sticky header */}
                <div className="overflow-hidden rounded-xl border border-border/40">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                      <TableRow className="border-b border-border/40 hover:bg-transparent">
                        <TableHead className="h-9 w-10 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                        <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailQt.items.map((item, idx) => (
                        <TableRow key={idx} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                          <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="px-3 py-2.5 text-sm font-medium">
                            {item.name}
                            {(item.discountPercent > 0 || item.gstPercent > 0) && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                                {item.discountPercent > 0 && <span>−{item.discountPercent}% disc</span>}
                                {item.discountPercent > 0 && item.gstPercent > 0 && <span className="text-border">·</span>}
                                {item.gstPercent > 0 && <span>+{item.gstPercent}% GST</span>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{item.qty}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.rate)}</TableCell>
                          {/* Use the backend-persisted `amount` (already includes
                              per-line discount + GST) so the line totals add up
                              to the quotation's grand total without phantom
                              gaps. Bug #4 was displaying qty*rate here, which
                              hid line-level discounts. */}
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ── Sticky Footer: total + actions ── */}
              <div className="shrink-0 border-t border-border/40 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
                {/* Subtotal / tax / delivery breakdown — populated when the
                    quotation has tax or delivery. Surfaces the same numbers
                    the backend rolled into `total`, so a reviewer can audit
                    the math without opening the row in DB. */}
                {/* Single-line tax breakdown */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/40 px-5 py-2">
                  {([
                    Number(detailQt.subtotal) > 0 ? { label: 'Subtotal', value: Number(detailQt.subtotal) } : null,
                    (Number(detailQt.cgst) > 0 || Number(detailQt.sgst) > 0) ? { label: 'Taxable', value: Number(detailQt.subtotal) - Number(detailQt.cgst) - Number(detailQt.sgst) } : null,
                    (Number(detailQt.cgst) > 0 || Number(detailQt.sgst) > 0) ? { label: 'CGST + SGST', value: Number(detailQt.cgst) + Number(detailQt.sgst) } : null,
                    Number(detailQt.deliveryCharge) > 0 ? { label: 'Delivery', value: Number(detailQt.deliveryCharge) } : null,
                  ].filter(Boolean) as Array<{ label: string; value: number }>).map((row) => (
                    <div key={row.label} className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">{row.label}</span>
                      <span className="font-mono text-sm tabular-nums">{formatCurrency(row.value)}</span>
                    </div>
                  ))}
                  <div className="ml-auto flex items-center gap-2 border-l border-border/40 pl-4">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-primary">Total</span>
                    <span className="font-mono text-base font-black tabular-nums text-primary">{formatCurrency(detailQt.total)}</span>
                  </div>
                </div>

                {/* Action buttons — vary by status */}
                <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
                  {!canMarkSent && !canAccept && !canReject && !canConvert && (
                    <p className="text-xs text-muted-foreground italic">
                      No further actions for {statusLabel[detailQt.status].toLowerCase()} quotations.
                    </p>
                  )}
                  {canReject && (
                    <Button
                      variant="outline"
                      className="gap-2 text-rose-700 hover:text-rose-700 dark:text-rose-400"
                      onClick={() => { handleUpdateStatus(detailQt, 'REJECTED'); setDetailQt(null) }}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  )}
                  {canAccept && (
                    <Button
                      variant="outline"
                      className="gap-2 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
                      onClick={() => { handleUpdateStatus(detailQt, 'ACCEPTED'); setDetailQt(null) }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Accept
                    </Button>
                  )}
                  {canMarkSent && (
                    <Button
                      className="gap-2"
                      onClick={() => { handleUpdateStatus(detailQt, 'SENT'); setDetailQt(null) }}
                    >
                      <Send className="h-4 w-4" />
                      Mark as Sent
                    </Button>
                  )}
                  {canConvert && (
                    <Button
                      variant={canMarkSent || canAccept ? 'outline' : 'default'}
                      className="gap-2"
                      onClick={() => { handleConvert(detailQt); setDetailQt(null) }}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Convert to Invoice</span>
                      <span className="sm:hidden">Convert</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => shareQuotationViaWhatsApp(detailQt, phoneFor(detailQt))}
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>
            </>
          )
        })()}
      </SheetContent>
    </Sheet>
    </>
  )
}
