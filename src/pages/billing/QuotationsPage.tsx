import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Send,
  ArrowRightLeft,
  Trash2,
  FileText,
  Download,
  Printer,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  CheckCircle2,
  Clock,
  XCircle,
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
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import api from '@/lib/api'
import { downloadInvoicePdf, printInvoicePdf } from '@/lib/pdf/invoicePdf'
import { exportToCsv, printReport } from '@/lib/exportUtils'

// ─────────────────────────────────────────────────────────────
// MOCK QUOTATION DATA
// ─────────────────────────────────────────────────────────────

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
  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [period, setPeriod] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
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

  const fetchQuotations = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/billing?type=QUOTATION')
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
      const mapped: Quotation[] = raw
        .filter((inv: any) => inv.type === 'QUOTATION')
        .map((inv: any) => ({
          id: inv.id,
          quotationNumber: inv.invoiceNumber,
          date: inv.date,
          customerName: inv.customerName,
          items: (inv.items ?? []).map((it: any) => ({
            name: it.productName,
            qty: it.quantity,
            rate: it.rate,
          })),
          total: inv.grandTotal,
          status: inv.status === 'PAID' ? 'CONVERTED' : (inv.status as QuotationStatus),
        }))
      setQuotations(mapped)
    } catch {
      // keep empty on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchQuotations() }, [fetchQuotations])
  useBranchRefresh(fetchQuotations)

  const handleConvert = async (qt: Quotation) => {
    try {
      const res = await api.patch(`/billing/${qt.id}/convert`)
      toast.success(`Quotation ${qt.quotationNumber} converted to invoice`)
      downloadInvoicePdf(res.data)
      fetchQuotations()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Conversion failed')
    }
  }

  const clearFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    setSelectedStatus('all')
    setAmountMin('')
    setAmountMax('')
  }

  // ── Filtering logic ──

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Amount range
    if (amountMin) {
      result = result.filter((qt) => qt.total >= parseFloat(amountMin))
    }
    if (amountMax) {
      result = result.filter((qt) => qt.total <= parseFloat(amountMax))
    }

    return result
  }, [searchQuery, period, dateFrom, dateTo, selectedStatus, amountMin, amountMax])

  // ── Stats ──

  const stats = useMemo(() => {
    const total = quotations.reduce((sum, qt) => sum + qt.total, 0)
    const acceptedTotal = quotations
      .filter((qt) => qt.status === 'ACCEPTED' || qt.status === 'CONVERTED')
      .reduce((sum, qt) => sum + qt.total, 0)
    const pendingTotal = quotations
      .filter((qt) => qt.status === 'DRAFT' || qt.status === 'SENT')
      .reduce((sum, qt) => sum + qt.total, 0)
    const rejectedCount = quotations.filter((qt) => qt.status === 'REJECTED').length
    return {
      total,
      totalCount: quotations.length,
      acceptedCount: quotations.filter((qt) => qt.status === 'ACCEPTED' || qt.status === 'CONVERTED').length,
      acceptedTotal,
      pendingCount: quotations.filter((qt) => qt.status === 'DRAFT' || qt.status === 'SENT').length,
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

  const rangeStart = filteredQuotations.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredQuotations.length)

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
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quotations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage quotations for customers
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={() => navigate('/billing/new?type=quotation')}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create Quotation
          </Button>
          <Button variant="outline" onClick={() => navigate('/billing/sales')}>
            <FileText className="mr-1.5 h-4 w-4" />
            Sales List
          </Button>
        </div>
      </div>

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
            label: 'Accepted / Converted',
            value: formatCurrency(stats.acceptedTotal),
            subtitle: `${stats.acceptedCount} accepted`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Pending',
            value: formatCurrency(stats.pendingTotal),
            subtitle: `${stats.pendingCount} draft/sent`,
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
      >
        <EnumSelect
          label="Period"
          value={period}
          onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
          onClear={() => { setPeriod('all'); setCurrentPage(1) }}
          options={PERIOD_OPTIONS}
        />

        {/* Custom date range */}
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
          label="Status"
          value={selectedStatus}
          onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
          onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
          options={STATUS_OPTIONS}
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
            <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 dark:bg-primary/10">
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
        <div className="md:hidden">
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
        <div className="hidden md:block">
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
                            await api.delete(`/billing/${qt.id}`)
                            toast.success(`Quotation ${qt.quotationNumber} deleted`)
                            fetchQuotations()
                          } catch {
                            toast.error('Failed to delete quotation')
                          }
                        }}
                        customActions={[
                          {
                            label: 'Convert',
                            icon: <ArrowRightLeft className="h-4 w-4" />,
                            onClick: () => handleConvert(qt),
                            disabled: qt.status === 'CONVERTED' || qt.status === 'REJECTED'
                          },
                          {
                            label: 'Send (WhatsApp)',
                            icon: <Send className="h-4 w-4" />,
                            onClick: () => {
                              const text = `Quotation ${qt.quotationNumber} — Total: ₹${qt.total.toLocaleString('en-IN')}`
                              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                            },
                            disabled: qt.status === 'REJECTED'
                          },
                          {
                            label: 'Download PDF',
                            icon: <Download className="h-4 w-4" />,
                            onClick: () => downloadInvoicePdf(qt as any)
                          },
                          {
                            label: 'Print PDF',
                            icon: <Printer className="h-4 w-4" />,
                            onClick: () => printInvoicePdf(qt as any)
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
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeStart}-{rangeEnd}</span> of{' '}
            <span className="font-medium text-foreground">{filteredQuotations.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Page {currentPage} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>

    {/* ── Quotation Detail Dialog ── */}
    <Dialog open={!!detailQt} onOpenChange={(open) => !open && setDetailQt(null)}>
      <DialogContent className="max-w-2xl">
        {detailQt && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                {detailQt.quotationNumber}
              </DialogTitle>
            </DialogHeader>

            {/* Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                <p className="mt-0.5 font-medium">{detailQt.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</p>
                <p className="mt-0.5">{formatDate(detailQt.date)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                <Badge size="sm" variant={statusBadgeVariant[detailQt.status]} className="mt-0.5">
                  {statusLabel[detailQt.status]}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="mt-0.5 font-mono font-bold">{formatCurrency(detailQt.total)}</p>
              </div>
            </div>

            {/* Items */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailQt.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-right">{item.qty}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.rate)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.qty * item.rate)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={3} className="text-right">Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(detailQt.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => printInvoicePdf(detailQt as any)}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadInvoicePdf(detailQt as any)}>
                <Download className="mr-1.5 h-4 w-4" />
                Download PDF
              </Button>
              {(detailQt.status === 'DRAFT' || detailQt.status === 'SENT' || detailQt.status === 'ACCEPTED') && (
                <Button size="sm" onClick={() => { handleConvert(detailQt); setDetailQt(null) }}>
                  <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                  Convert to Invoice
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
