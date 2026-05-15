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
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { PaginatedSelect } from '@/components/shared/PaginatedSelect'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import api from '@/lib/api'
import { exportToCsv, printReport } from '@/lib/exportUtils'
import { shareQuotationViaWhatsApp } from '@/lib/pdf/quotationPdf'
import { useMasterDataStore } from '@/stores/masterDataStore'

type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED'

interface QuotationItem {
  name: string
  qty: number
  rate: number
}

interface Quotation {
  id: string
  quotationNumber: string
  date: string
  customerId?: string
  customerName: string
  items: QuotationItem[]
  total: number
  status: QuotationStatus
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

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

export default function QuotationsPage() {
  const { path, search: routeSearch } = useRoute()

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [period, setPeriod] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')

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
        items: (qt.items ?? []).map((it: any) => ({
          name: it.productName ?? '',
          qty: Number(it.quantity) || 0,
          rate: Number(it.rate) || 0,
        })),
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
  // `?quotationId=<id>` (e.g. from the Customer Detail page's Quotations tab).
  useEffect(() => {
    const params = new URLSearchParams(routeSearch)
    const target = params.get('quotationId')
    if (!target || quotations.length === 0) return
    if (detailQt?.id === target) return
    const match = quotations.find((q) => q.id === target)
    if (match) setDetailQt(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch, quotations])

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
      customerName: qt.customerName,
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
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    setSelectedStatus('all')
    setSelectedCustomer('all')
    setAmountMin('')
    setAmountMax('')
  }

  // ── Filtering logic ──

  const filteredQuotations = useMemo(() => {
    let result = [...quotations]

    // Period filter
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((qt) => qt.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        const weekStr = weekAgo.toISOString().slice(0, 10)
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

    // Customer
    if (selectedCustomer && selectedCustomer !== 'all') {
      result = result.filter((qt) => qt.customerName === selectedCustomer)
    }

    // Amount range
    if (amountMin) {
      result = result.filter((qt) => qt.total >= parseFloat(amountMin))
    }
    if (amountMax) {
      result = result.filter((qt) => qt.total <= parseFloat(amountMax))
    }

    return result
  }, [quotations, searchQuery, period, dateFrom, dateTo, selectedStatus, selectedCustomer, amountMin, amountMax])

  // Backend-paginated customer fetcher. Quotations match by customerName,
  // so we keep value === name for compatibility with the existing filter.
  const customerFetcher = useCallback(
    async ({ skip, take, query }: { skip: number; take: number; query: string }) => {
      const params = new URLSearchParams({ skip: String(skip), take: String(take) })
      if (query) params.set('q', query)
      const res = await api.get(`/customers?${params.toString()}`)
      const payload = res.data
      const items = (payload?.data ?? []) as Array<{ id: string; name: string }>
      return {
        data: items.map((c) => ({ value: c.name, label: c.name })),
        hasMore: Boolean(payload?.hasMore),
      }
    },
    [],
  )

  const selectedCustomerLabel =
    selectedCustomer && selectedCustomer !== 'all' ? selectedCustomer : undefined

  // ── Stats ──

  const stats = useMemo(() => {
    const total = quotations.reduce((sum, qt) => sum + qt.total, 0)
    const convertedCount = quotations.filter((qt) => qt.status === 'CONVERTED').length
    const convertedTotal = quotations.filter((qt) => qt.status === 'CONVERTED').reduce((sum, qt) => sum + qt.total, 0)
    const pendingCount = quotations.filter((qt) => qt.status === 'DRAFT' || qt.status === 'SENT' || qt.status === 'ACCEPTED').length
    const pendingTotal = quotations.filter((qt) => qt.status === 'DRAFT' || qt.status === 'SENT' || qt.status === 'ACCEPTED').reduce((sum, qt) => sum + qt.total, 0)
    const rejectedCount = quotations.filter((qt) => qt.status === 'REJECTED').length
    return {
      total,
      totalCount: quotations.length,
      convertedCount,
      convertedTotal,
      pendingCount,
      pendingTotal,
      rejectedCount,
    }
  }, [quotations])

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
    period !== 'all' ? period : '',
    dateFrom,
    dateTo,
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedCustomer !== 'all' ? selectedCustomer : '',
    amountMin,
    amountMax,
  ].filter(Boolean).length

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
        {[
          {
            label: 'Total Quotations',
            value: formatCurrency(stats.total),
            subtitle: `${stats.totalCount} quotations`,
            icon: IndianRupee,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Converted',
            value: formatCurrency(stats.convertedTotal),
            subtitle: `${stats.convertedCount} converted`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Pending',
            value: formatCurrency(stats.pendingTotal),
            subtitle: `${stats.pendingCount} draft/sent/accepted`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
          },
          {
            label: 'Rejected',
            value: stats.rejectedCount.toString(),
            subtitle: 'this period',
            icon: XCircle,
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
        searchPlaceholder="Search quotation# or customer..."
        resultsCount={filteredQuotations.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
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
              <span className="hidden sm:inline">Sales List</span>
            </Button>
          </div>
        }
      >
        {/* Custom 4-col grid that overrides DataTableFilterBar's inner grid for equal-width filters */}
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EnumSelect
            label="Period"
            value={period}
            onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
            onClear={() => { setPeriod('all'); setCurrentPage(1) }}
            options={PERIOD_OPTIONS}
          />

          <EnumSelect
            label="Status"
            value={selectedStatus}
            onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
            onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
            options={STATUS_OPTIONS}
          />

          <PaginatedSelect
            label="Customer"
            value={selectedCustomer}
            onValueChange={(val) => { setSelectedCustomer(val); setCurrentPage(1) }}
            onClear={() => { setSelectedCustomer('all'); setCurrentPage(1) }}
            fetcher={customerFetcher}
            pinnedOption={{ value: 'all', label: 'All Customers' }}
            selectedLabel={selectedCustomerLabel}
            pageSize={10}
          />

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
                  <p className="text-sm font-medium truncate">{qt.customerName}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant={statusBadgeVariant[qt.status]} size="sm" dot>
                      {statusLabel[qt.status]}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{formatDate(qt.date)}</span>
                  </div>
                </div>
                <p className="font-mono text-sm font-semibold shrink-0">{formatCurrency(qt.total)}</p>
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
              <TableHead>Quotation #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Fetching quotations...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedQuotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
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
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="font-mono text-[11px] font-medium">
                          {qt.quotationNumber}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(qt.date)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-50">
                      <p className="truncate text-sm font-medium">{qt.customerName}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" size="sm">
                        {qt.items.length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatCurrency(qt.total)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusBadgeVariant[qt.status]}
                        size="sm"
                        dot
                      >
                        {statusLabel[qt.status]}
                      </Badge>
                    </TableCell>
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
        className="w-full sm:max-w-190 p-0 gap-0 flex flex-col"
      >
        {detailQt && (() => {
          const canMarkSent = detailQt.status === 'DRAFT'
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
                    <p className="mt-0.5 text-sm font-medium truncate" title={detailQt.customerName}>{detailQt.customerName}</p>
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
                          <TableCell className="px-3 py-2.5 text-sm font-medium">{item.name}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{item.qty}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.rate)}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.qty * item.rate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ── Sticky Footer: total + actions ── */}
              <div className="shrink-0 border-t border-border/40 bg-background">
                {/* Total strip — single cell */}
                <div className="flex items-center justify-between border-b border-border/40 bg-primary/5 px-5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                  <p className="font-mono text-base font-bold">{formatCurrency(detailQt.total)}</p>
                </div>

                {/* Action buttons — vary by status */}
                <div className="px-5 py-3 flex gap-2">
                  {canMarkSent && (
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => { handleUpdateStatus(detailQt, 'SENT'); setDetailQt(null) }}
                    >
                      <Send className="h-4 w-4" />
                      Mark as Sent
                    </Button>
                  )}
                  {canConvert && (
                    <Button
                      variant={canMarkSent ? 'outline' : 'default'}
                      className="flex-1 gap-2"
                      onClick={() => { handleConvert(detailQt); setDetailQt(null) }}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Convert to Invoice</span>
                      <span className="sm:hidden">Convert</span>
                    </Button>
                  )}
                  {!canMarkSent && !canConvert && (
                    <div className="flex-1 text-xs text-muted-foreground italic flex items-center">
                      No further actions for {statusLabel[detailQt.status].toLowerCase()} quotations.
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="shrink-0 gap-2"
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
