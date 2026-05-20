import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useSettingsStore } from '@/stores/settingsStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { RETURN_REASONS } from './SalesReturnsPage'
import { printHtmlInPage } from '@/lib/printUtils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileX2,
  Receipt,
  IndianRupee,
  Printer,
  Download,
  Eye,
  RotateCcw,
  Wallet,
  RefreshCw,
  BadgeCheck,
  Package,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
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
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { PaginatedSelect } from '@/components/shared/PaginatedSelect'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import { exportToCsv } from '@/lib/exportUtils'
import { navigate, useRoute } from '@/lib/router'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface CreditNoteItem {
  id: string
  productName: string
  batchNumber: string
  expiryDate: string
  returnedQty: number
  rate: number
  gstPercent: number
  amount: number
}

interface CreditNote {
  id: string
  creditNoteNo: string
  date: string
  invoiceId: string
  invoiceNumber: string
  customerId?: string
  customerName: string
  reason: string
  items: CreditNoteItem[]
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  totalAmount: number
  settlementMode: 'REFUND' | 'CREDIT' | 'REPLACEMENT'
  notes?: string
  createdAt: string
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
  { value: 'quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
] as const

const SETTLEMENT_OPTIONS = [
  { value: 'all', label: 'All Modes' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'CREDIT', label: 'Adjust Against Outstanding' },
  { value: 'REPLACEMENT', label: 'Store Credit' },
] as const

const settlementConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'info'; icon: typeof Wallet }> = {
  REFUND:      { label: 'Refund',        variant: 'success', icon: Wallet },
  CREDIT:      { label: 'Adjust',        variant: 'warning', icon: BadgeCheck },
  REPLACEMENT: { label: 'Store Credit',  variant: 'info',    icon: RefreshCw },
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function CreditNotesPage() {
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [period, setPeriod] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedSettlement, setSelectedSettlement] = useState('all')
  const [selectedCustomer, setSelectedCustomer] = useState('all')
  const [selectedReason, setSelectedReason] = useState('all')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [detailNote, setDetailNote] = useState<CreditNote | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const openDetail = useCallback(async (cn: CreditNote) => {
    setDetailNote(cn) // show dialog immediately with list data
    setDetailLoading(true)
    try {
      const res = await api.get(`/credit-notes/${cn.id}`)
      setDetailNote(res.data)
    } catch {
      // keep showing list data, items will just be missing
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const fetchCreditNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/credit-notes')
      setCreditNotes(res.data.data || res.data)
    } catch {
      toast.error('Failed to load credit notes')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchCreditNotes() }, [fetchCreditNotes])
  useBranchRefresh(fetchCreditNotes)

  // Deep-link support: open the credit-note drawer when arrived with `?id=<id>`
  // (e.g. from the Customer Detail page's Credit Notes tab). Runs only when
  // the URL param or the loaded list changes.
  const { search: routeSearch } = useRoute()
  useEffect(() => {
    const params = new URLSearchParams(routeSearch)
    const target = params.get('id')
    if (!target || creditNotes.length === 0) return
    if (detailNote?.id === target) return
    const match = creditNotes.find((c) => c.id === target)
    if (match) void openDetail(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch, creditNotes])

  // Master data — for filters that should list ALL options
  const { customers, fetchMasterData } = useMasterDataStore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])

  // ── Filtering ──
  const filtered = useMemo(() => {
    let result = [...creditNotes]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    switch (period) {
      case 'today':
        result = result.filter(cn => cn.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
        result = result.filter(cn => cn.date.slice(0, 10) >= weekAgo.toISOString().slice(0, 10))
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter(cn => cn.date.slice(0, 10) >= monthStart)
        break
      }
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        const quarterStart = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`
        result = result.filter(cn => cn.date.slice(0, 10) >= quarterStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter(cn => cn.date.slice(0, 10) >= dateFrom)
        if (dateTo)   result = result.filter(cn => cn.date.slice(0, 10) <= dateTo)
        break
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(cn =>
        cn.creditNoteNo.toLowerCase().includes(q) ||
        cn.customerName.toLowerCase().includes(q) ||
        cn.invoiceNumber.toLowerCase().includes(q)
      )
    }

    if (selectedSettlement !== 'all') {
      result = result.filter(cn => cn.settlementMode === selectedSettlement)
    }

    if (selectedCustomer !== 'all') {
      result = result.filter(cn => cn.customerName === selectedCustomer)
    }

    if (selectedReason !== 'all') {
      // Case-insensitive prefix match — catches both exact reasons ("Damaged")
      // and free-text variations the user typed ("Damaged packaging — 5 strips returned").
      const sel = selectedReason.toLowerCase()
      result = result.filter(cn => (cn.reason || '').toLowerCase().startsWith(sel))
    }

    if (amountMin) result = result.filter(cn => Number(cn.totalAmount) >= parseFloat(amountMin))
    if (amountMax) result = result.filter(cn => Number(cn.totalAmount) <= parseFloat(amountMax))

    return result
  }, [creditNotes, searchQuery, period, dateFrom, dateTo, selectedSettlement, selectedCustomer, selectedReason, amountMin, amountMax])

  // Backend-paginated customer fetcher. CreditNotes filter by customerName,
  // so value === name.
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

  // Reason options — sourced from the canonical RETURN_REASONS master list
  // (same list used by the Sales Returns creation form), so the dropdown
  // always shows the full set regardless of which reasons appear on this page.
  const reasonOptions = useMemo(() => [
    { value: 'all', label: 'All Reasons' },
    ...RETURN_REASONS.map(r => ({ value: r, label: r })),
  ], [])

  // ── Stats ──
  const stats = useMemo(() => {
    const total = creditNotes.reduce((s, cn) => s + Number(cn.totalAmount), 0)
    const refunds = creditNotes.filter(cn => cn.settlementMode === 'REFUND').reduce((s, cn) => s + Number(cn.totalAmount), 0)
    const adjustments = creditNotes.filter(cn => cn.settlementMode === 'CREDIT').reduce((s, cn) => s + Number(cn.totalAmount), 0)
    return { count: creditNotes.length, total, refunds, adjustments }
  }, [creditNotes])

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const activeFilterCount = [
    period !== 'all' ? period : '',
    dateFrom, dateTo,
    selectedSettlement !== 'all' ? selectedSettlement : '',
    selectedCustomer !== 'all' ? selectedCustomer : '',
    selectedReason !== 'all' ? selectedReason : '',
    amountMin, amountMax,
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('all'); setDateFrom(''); setDateTo('')
    setSelectedSettlement('all')
    setSelectedCustomer('all')
    setSelectedReason('all')
    setAmountMin(''); setAmountMax('')
  }

  const handlePrint = (cn: CreditNote) => {
    printHtmlInPage(`
      <html><head><title>Credit Note ${cn.creditNoteNo}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; font-size: 12px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .sub { color: #666; font-size: 11px; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
        .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #f5f5f5; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 8px; border-bottom: 1px solid #eee; }
        .totals { margin-top: 16px; text-align: right; }
        .totals .row { display: flex; justify-content: flex-end; gap: 32px; margin-bottom: 4px; }
        .grand { font-size: 16px; font-weight: 700; color: #1a56db; }
        @media print { button { display: none; } }
      </style></head><body>
      <h1>CREDIT NOTE</h1>
      <div class="sub">${businessProfile?.name ?? 'Hospital Suppliers'}${businessProfile?.address ? ` · ${businessProfile.address.split(',').slice(-2).join(',').trim()}` : ''}</div>
      <div class="grid">
        <div><div class="label">Credit Note No</div><div class="value">${cn.creditNoteNo}</div></div>
        <div><div class="label">Date</div><div class="value">${formatDate(cn.date)}</div></div>
        <div><div class="label">Customer</div><div class="value">${cn.customerName}</div></div>
        <div><div class="label">Against Invoice</div><div class="value">${cn.invoiceNumber}</div></div>
        <div><div class="label">Settlement</div><div class="value">${settlementConfig[cn.settlementMode]?.label ?? cn.settlementMode}</div></div>
        <div><div class="label">Reason</div><div class="value">${cn.reason}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Product</th><th>Batch</th><th>Qty</th><th>Rate</th><th>GST%</th><th style="text-align:right">Amount</th>
        </tr></thead>
        <tbody>
          ${cn.items.map(item => `<tr>
            <td>${item.productName}</td>
            <td>${item.batchNumber}</td>
            <td>${item.returnedQty}</td>
            <td>₹${Number(item.rate).toFixed(2)}</td>
            <td>${item.gstPercent}%</td>
            <td style="text-align:right">₹${Number(item.amount).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>₹${Number(cn.subtotal).toFixed(2)}</span></div>
        <div class="row"><span>CGST</span><span>₹${Number(cn.cgst).toFixed(2)}</span></div>
        <div class="row"><span>SGST</span><span>₹${Number(cn.sgst).toFixed(2)}</span></div>
        <div class="row grand"><span>Total Credit</span><span>₹${Number(cn.totalAmount).toFixed(2)}</span></div>
      </div>
      </body></html>
    `)
  }

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
            label: 'Total Notes',
            value: stats.count.toString(),
            subtitle: 'all time',
            icon: Receipt,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Total Credit',
            value: formatCurrency(stats.total),
            subtitle: 'issued to customers',
            icon: IndianRupee,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
          },
          {
            label: 'Refunds',
            value: formatCurrency(stats.refunds),
            subtitle: 'via original payment',
            icon: Wallet,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Adjustments',
            value: formatCurrency(stats.adjustments),
            subtitle: 'against outstanding',
            icon: BadgeCheck,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
          },
        ].map((stat) => (
          <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
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
      </div>

      {/* ── Filters ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1) }}
        searchPlaceholder="Search credit note #, customer or invoice..."
        resultsCount={filtered.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
              onClick={() => {
                if (!filtered.length) { toast.info('No credit notes to export'); return }
                exportToCsv(filtered.map(cn => ({
                  'Credit Note #': cn.creditNoteNo,
                  Date: formatDate(cn.date),
                  Customer: cn.customerName,
                  'Invoice #': cn.invoiceNumber,
                  Reason: cn.reason,
                  Settlement: settlementConfig[cn.settlementMode]?.label ?? cn.settlementMode,
                  Total: cn.totalAmount,
                })), 'credit-notes')
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
              onClick={() => navigate('/billing/returns')}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">New Return</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        }
      >
        {/* Custom equal-width grid that overrides DataTableFilterBar's inner grid */}
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <EnumSelect
            label="Period"
            value={period}
            onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
            onClear={() => { setPeriod('all'); setCurrentPage(1) }}
            options={PERIOD_OPTIONS}
          />

          <EnumSelect
            label="Settlement"
            value={selectedSettlement}
            onValueChange={(val) => { setSelectedSettlement(val); setCurrentPage(1) }}
            onClear={() => { setSelectedSettlement('all'); setCurrentPage(1) }}
            options={SETTLEMENT_OPTIONS}
          />

          <EnumSelect
            label="Reason"
            value={selectedReason}
            onValueChange={(val) => { setSelectedReason(val); setCurrentPage(1) }}
            onClear={() => { setSelectedReason('all'); setCurrentPage(1) }}
            options={reasonOptions}
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
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setCurrentPage(1) }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setCurrentPage(1) }} />
              </div>
            </div>
          )}
        </div>
      </DataTableFilterBar>

      {/* ── Table ── */}
      <Card>
        {/* Mobile card list */}
        <div className="lg:hidden">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Loading credit notes...</p>
            </div>
          )}
          {!isLoading && paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <FileX2 className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No credit notes found</p>
            </div>
          )}
          <div className="divide-y divide-border/40">
            {!isLoading && paginated.map((cn) => {
              const settlement = settlementConfig[cn.settlementMode]
              return (
                <div
                  key={cn.id}
                  className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => openDetail(cn)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold">{cn.creditNoteNo}</p>
                    <p className="text-sm font-medium truncate">{cn.customerName}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
                        {settlement?.label ?? cn.settlementMode}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatDate(cn.date)}</span>
                    </div>
                  </div>
                  <p className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400 shrink-0">
                    {formatCurrency(cn.totalAmount)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
        {/* Desktop table */}
        <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Credit Note #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Against Invoice</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Settlement</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Loading credit notes...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                        <FileX2 className="h-7 w-7 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">No credit notes found</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                          {searchQuery || activeFilterCount > 0 ? 'Try adjusting your search or filters' : 'Create your first credit note via Sales Returns'}
                        </p>
                      </div>
                      {!searchQuery && activeFilterCount === 0 && (
                        <Button size="sm" variant="outline" onClick={() => navigate('/billing/returns')}>
                          <RotateCcw className="mr-1.5 h-4 w-4" />
                          Go to Sales Returns
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((cn, idx) => {
                  const settlement = settlementConfig[cn.settlementMode]
                  const SettlementIcon = settlement?.icon ?? Wallet
                  return (
                    <motion.tr
                      key={cn.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => openDetail(cn)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Receipt className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="font-mono text-[11px] font-semibold">{cn.creditNoteNo}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="text-[11px] text-muted-foreground">{formatDate(cn.date)}</span>
                      </TableCell>
                      <TableCell className="max-w-40">
                        <p className="truncate text-sm font-medium">{cn.customerName}</p>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px] text-muted-foreground">{cn.invoiceNumber}</span>
                      </TableCell>
                      <TableCell className="max-w-35">
                        <p className="truncate text-[11px] text-muted-foreground">{cn.reason}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
                          <SettlementIcon className="mr-1 h-2.5 w-2.5" />
                          {settlement?.label ?? cn.settlementMode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrency(cn.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openDetail(cn)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handlePrint(cn)}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  )
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
        </div>

        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* ── Detail Drawer ── */}
      <Sheet open={!!detailNote} onOpenChange={(open) => { if (!open) setDetailNote(null) }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-160 lg:max-w-190 p-0 gap-0 flex flex-col"
        >
          {detailNote && (() => {
            const settlement = settlementConfig[detailNote.settlementMode]
            const itemCount = (detailNote.items ?? []).length
            return (
              <>
                {/* ── Sticky Header ── */}
                <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                  <div className="flex items-center justify-between gap-3 pr-8">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <SheetTitle className="font-mono text-base font-semibold truncate">
                        {detailNote.creditNoteNo}
                      </SheetTitle>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(detailNote.date)}
                      </span>
                    </div>
                    <Badge variant="info" size="sm" className="gap-1">
                      <Package className="h-3 w-3" />
                      {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </Badge>
                  </div>
                </SheetHeader>

                {/* ── Scrollable Body ── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  {/* Customer / Against Invoice / Reason / Settlement — single row, equal width */}
                  <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Customer</p>
                      <p className="mt-0.5 text-sm font-medium truncate" title={detailNote.customerName}>{detailNote.customerName}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Against Invoice</p>
                      <p className="mt-0.5 font-mono text-xs font-medium truncate" title={detailNote.invoiceNumber}>{detailNote.invoiceNumber}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Reason</p>
                      <p className="mt-0.5 text-sm font-medium truncate" title={detailNote.reason}>{detailNote.reason}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Settlement</p>
                      <div className="mt-0.5">
                        <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
                          {settlement?.label ?? detailNote.settlementMode}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Notes — conditional, full width */}
                  {detailNote.notes && (
                    <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                      <p className="mt-0.5 text-sm">{detailNote.notes}</p>
                    </div>
                  )}

                  {/* Items — proper table with sticky header */}
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
                        {detailLoading ? (
                          <TableRow>
                            <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground animate-pulse">
                              Loading items…
                            </TableCell>
                          </TableRow>
                        ) : (detailNote.items ?? []).map((item, idx) => (
                          <TableRow key={item.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                            <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="px-3 py-2.5 text-sm font-medium">{item.productName}</TableCell>
                            <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.batchNumber}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{item.returnedQty}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.rate)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{item.gstPercent}%</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* ── Sticky Footer: totals strip + actions ── */}
                <div className="shrink-0 border-t border-border/40 bg-background">
                  {/* Totals strip — single horizontal row */}
                  <div className="flex items-stretch overflow-x-auto border-b border-border/40 bg-muted/20">
                    {([
                      { label: 'Subtotal', value: detailNote.subtotal },
                      { label: 'CGST', value: detailNote.cgst },
                      { label: 'SGST', value: detailNote.sgst },
                      detailNote.igst > 0 ? { label: 'IGST', value: detailNote.igst } : null,
                      { label: 'Total Credit', value: detailNote.totalAmount, highlight: true as const, tone: 'rose' as const },
                    ].filter(Boolean) as Array<{ label: string; value: number; tone?: 'rose'; highlight?: boolean }>).map((row, i) => (
                      <div
                        key={row.label}
                        className={cn(
                          'flex flex-1 min-w-[72px] flex-col justify-center whitespace-nowrap px-3 py-2',
                          i > 0 && 'border-l border-border/40',
                          row.highlight && 'bg-rose-50 dark:bg-rose-950/20'
                        )}
                      >
                        <p className={cn(
                          'text-[9px] font-semibold uppercase tracking-wider',
                          row.tone === 'rose' ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground'
                        )}>{row.label}</p>
                        <p className={cn(
                          'mt-0.5 font-mono text-xs',
                          row.highlight && 'text-sm font-bold',
                          row.tone === 'rose' && 'text-rose-700 dark:text-rose-400'
                        )}>{formatCurrency(row.value)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="px-5 py-3 flex gap-2">
                    <Button className="flex-1 gap-2" onClick={() => handlePrint(detailNote)}>
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => { setDetailNote(null); navigate(`/billing/sales?invoiceId=${encodeURIComponent(detailNote.invoiceId)}`) }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="hidden sm:inline">View Invoice</span>
                      <span className="sm:hidden">Invoice</span>
                    </Button>
                  </div>
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
