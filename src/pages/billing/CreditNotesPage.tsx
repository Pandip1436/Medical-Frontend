import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useSettingsStore } from '@/stores/settingsStore'
import { printHtmlInPage } from '@/lib/printUtils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileX2,
  Receipt,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  Printer,
  Download,
  Eye,
  RotateCcw,
  Wallet,
  RefreshCw,
  BadgeCheck,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import { exportToCsv } from '@/lib/exportUtils'
import { navigate } from '@/lib/router'

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

    return result
  }, [creditNotes, searchQuery, period, dateFrom, dateTo, selectedSettlement])

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
  const rangeStart = filtered.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  const activeFilterCount = [
    period !== 'all' ? period : '',
    dateFrom, dateTo,
    selectedSettlement !== 'all' ? selectedSettlement : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('all'); setDateFrom(''); setDateTo('')
    setSelectedSettlement('all')
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
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Credit Notes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All sales return credit notes issued to customers
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
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
          }}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
          <Button size="sm" onClick={() => navigate('/billing/returns')}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            New Return
          </Button>
        </div>
      </div>

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
      >
        <EnumSelect
          label="Period"
          value={period}
          onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
          onClear={() => { setPeriod('all'); setCurrentPage(1) }}
          options={PERIOD_OPTIONS}
        />
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
              <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setCurrentPage(1) }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
              <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setCurrentPage(1) }} />
            </div>
          </>
        )}
        <EnumSelect
          label="Settlement"
          value={selectedSettlement}
          onValueChange={(val) => { setSelectedSettlement(val); setCurrentPage(1) }}
          onClear={() => { setSelectedSettlement('all'); setCurrentPage(1) }}
          options={SETTLEMENT_OPTIONS}
        />
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

        {/* Pagination */}
        <div className="flex flex-col items-center gap-2 border-t border-border/40 px-4 py-3 sm:flex-row sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of{' '}
            <span className="font-medium text-foreground">{filtered.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Prev
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Page {currentPage} of {totalPages || 1}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Detail Dialog ── */}
      <AnimatePresence>
        {detailNote && (
          <Dialog open onOpenChange={(open) => { if (!open) setDetailNote(null) }}>
            <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-2xl md:w-full md:h-auto md:max-h-[90vh] md:overflow-y-auto overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  {detailNote.creditNoteNo}
                </DialogTitle>
              </DialogHeader>

              {/* Meta grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                {[
                  { label: 'Date', value: formatDate(detailNote.date) },
                  { label: 'Customer', value: detailNote.customerName },
                  { label: 'Against Invoice', value: detailNote.invoiceNumber },
                  { label: 'Reason', value: detailNote.reason },
                  { label: 'Settlement', value: settlementConfig[detailNote.settlementMode]?.label ?? detailNote.settlementMode },
                  { label: 'Notes', value: detailNote.notes || '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-medium truncate">{value}</p>
                  </div>
                ))}
              </div>

              {/* Items table */}
              <div className="rounded-xl border border-border/60 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-[10px]">Product</TableHead>
                      <TableHead className="text-[10px]">Batch</TableHead>
                      <TableHead className="text-[10px] text-center">Qty</TableHead>
                      <TableHead className="text-[10px] text-right">Rate</TableHead>
                      <TableHead className="text-[10px] text-center">GST%</TableHead>
                      <TableHead className="text-[10px] text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-4 text-sm text-muted-foreground animate-pulse">Loading items…</TableCell></TableRow>
                    ) : (detailNote.items ?? []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm font-medium">{item.productName}</TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">{item.batchNumber}</TableCell>
                        <TableCell className="text-center text-sm font-semibold">{item.returnedQty}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(item.rate)}</TableCell>
                        <TableCell className="text-center text-[11px] text-muted-foreground">{item.gstPercent}%</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-4">
                {[
                  { label: 'Subtotal', value: detailNote.subtotal },
                  { label: 'CGST', value: detailNote.cgst },
                  { label: 'SGST', value: detailNote.sgst },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm text-muted-foreground">
                    <span>{label}</span>
                    <span className="font-mono">{formatCurrency(value)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-border/60 pt-2">
                  <span className="text-base font-bold">Total Credit</span>
                  <span className="font-mono text-lg font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrency(detailNote.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePrint(detailNote)}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  Print
                </Button>
                <Button size="sm" onClick={() => setDetailNote(null)}>Close</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
