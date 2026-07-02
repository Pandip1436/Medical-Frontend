import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { useSettingsStore } from '@/stores/settingsStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { RETURN_REASONS } from './SalesReturnsPage'
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
  Hourglass,
  XCircle,
  CheckCircle2,
  Filter,
  BarChart3,
  X,
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
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { PaginatedSelect } from '@/components/shared/PaginatedSelect'
import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import { exportToCsv, csvText } from '@/lib/exportUtils'
import { navigate, useRoute } from '@/lib/router'
import { printCreditNote } from './CreditNoteDetailContent'
import { usePageFilter } from '@/hooks/usePageFilter'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'
import { CreditNoteSplitView } from './components/CreditNoteSplitView'

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

export type CreditNoteStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'

export interface CreditNote {
  id: string
  creditNoteNo: string
  date: string
  invoiceId: string
  invoiceNumber: string
  customerId?: string
  customerName: string
  customerPhone?: string | null
  reason: string
  items: CreditNoteItem[]
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  totalAmount: number
  settlementMode: 'REFUND' | 'CREDIT' | 'REPLACEMENT'
  // Inspection lifecycle. PENDING_REVIEW = filed but goods not yet inspected;
  // settlement effects (stock restore, balance change, invoice flip) HAVE NOT
  // fired. APPROVED = reviewer signed off, side effects executed. REJECTED =
  // goods didn't match the claim; CN kept as historical record.
  status: CreditNoteStatus
  reviewedById?: string | null
  reviewedAt?: string | null
  reviewNote?: string | null
  reviewedBy?: { id: string; name: string } | null
  // Settlement completion. For REPLACEMENT, set once the replacement sales
  // invoice (replacementInvoiceId) has been issued to the customer.
  settledAt?: string | null
  replacementInvoiceId?: string | null
  notes?: string
  createdAt: string
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10
const PAGE_SIZE_SPLIT = 30

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
  { value: 'REPLACEMENT', label: 'Replacement' },
] as const

const settlementConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'info'; icon: typeof Wallet }> = {
  REFUND:      { label: 'Refund',        variant: 'success', icon: Wallet },
  CREDIT:      { label: 'Adjust',        variant: 'warning', icon: BadgeCheck },
  REPLACEMENT: { label: 'Replacement',   variant: 'info',    icon: RefreshCw },
}

// Status filter options + per-status visual config. Keep the visual variants
// distinct from settlement variants so a "Refund + Pending" row reads at a
// glance.
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const

type CreditNoteTabKey = 'all' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'

const CREDIT_NOTE_TABS: Array<{ key: CreditNoteTabKey; label: string; activeColor: string; badgeColor: string }> = [
  { key: 'all',           label: 'All',            activeColor: 'border-primary text-primary',                                         badgeColor: 'bg-primary/10 text-primary' },
  { key: 'PENDING_REVIEW', label: 'Pending', activeColor: 'border-amber-500 text-amber-600 dark:text-amber-400',                 badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { key: 'APPROVED',      label: 'Approved',        activeColor: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',           badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { key: 'REJECTED',      label: 'Rejected',        activeColor: 'border-rose-500 text-rose-600 dark:text-rose-400',                   badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
]

function CreditNoteStatusTabs({ tab, onChange, counts }: {
  tab: CreditNoteTabKey
  onChange: (t: CreditNoteTabKey) => void
  counts: Record<CreditNoteTabKey, number>
}) {
  return (
    <div className="flex gap-1 overflow-x-auto px-3 pb-2 pt-1">
      {CREDIT_NOTE_TABS.map((t) => (
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

const statusConfig: Record<CreditNoteStatus, { label: string; variant: 'warning' | 'success' | 'destructive'; icon: typeof Hourglass }> = {
  PENDING_REVIEW: { label: 'Pending Review', variant: 'warning',     icon: Hourglass },
  APPROVED:       { label: 'Approved',       variant: 'success',     icon: CheckCircle2 },
  REJECTED:       { label: 'Rejected',       variant: 'destructive', icon: XCircle },
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

const CREDIT_NOTE_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'customer', label: 'Customer', defaultVisible: true },
  { id: 'creditNote', label: 'Credit Note #', required: true, defaultVisible: true },
  { id: 'invoice', label: 'Against Invoice', defaultVisible: true },
  { id: 'reason', label: 'Reason', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'settlement', label: 'Settlement', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
]

const CARD_FIELDS: ColumnDef[] = [
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'creditNoteNo', label: 'Credit Note #', defaultVisible: true },
  { id: 'phone', label: 'Phone', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'settlement', label: 'Settlement', defaultVisible: true },
]

export default function CreditNotesPage() {
  const cols = useColumnVisibility('billing.creditNotes', CREDIT_NOTE_COLUMNS)
  const cardCols = useColumnVisibility('billing.creditNotes.card', CARD_FIELDS)
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Filters — usePageFilter for persistence across sessions
  const [searchQuery, setSearchQuery] = usePageFilter<string>('billing.creditNotes', 'search', '')
  const [period, setPeriod] = usePageFilter<string>('billing.creditNotes', 'period', 'today')
  const [dateFrom, setDateFrom] = usePageFilter<string>('billing.creditNotes', 'dateFrom', '')
  const [dateTo, setDateTo] = usePageFilter<string>('billing.creditNotes', 'dateTo', '')
  const [selectedSettlement, setSelectedSettlement] = usePageFilter<string>('billing.creditNotes', 'settlement', 'all')
  const [selectedStatus, setSelectedStatus] = usePageFilter<string>('billing.creditNotes', 'status', 'all')
  const [selectedCustomer, setSelectedCustomer] = usePageFilter<string>('billing.creditNotes', 'customer', 'all')
  const [selectedReason, setSelectedReason] = usePageFilter<string>('billing.creditNotes', 'reason', 'all')
  const [splitShowStats, setSplitShowStats] = usePageFilter<boolean>('billing.creditNotes', 'splitShowStats', true)
  const [statusTab, setStatusTab] = usePageFilter<CreditNoteTabKey>('billing.creditNotes', 'statusTab', 'all')

  // Stat-card drill-down — not persisted (intentional: resets on page open)
  const [cardFilter, setCardFilter] = useState<'all' | 'pending' | 'refund' | 'adjust'>('all')
  const [splitShowFilters, setSplitShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // ── Split-view infinite scroll pagination ──
  const [splitPage, setSplitPage] = useState(1)
  const [splitItems, setSplitItems] = useState<CreditNote[]>([])
  const [splitTotal, setSplitTotal] = useState(0)
  const [splitLoading, setSplitLoading] = useState(false)
  // Ref to track in-flight requests so filter-change resets don't double-append
  const splitFetchIdRef = useRef(0)

  const loadFilterPrefs = useFilterPrefsStore((s) => s.loadFromServer)
  useEffect(() => { loadFilterPrefs() }, [loadFilterPrefs])

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

  // ── Split-view server-side fetch ──
  const fetchSplitPage = useCallback(async (page: number, fetchId: number) => {
    setSplitLoading(true)
    try {
      const params: Record<string, string> = {
        skip: String((page - 1) * PAGE_SIZE_SPLIT),
        take: String(PAGE_SIZE_SPLIT),
      }

      // Period → date range
      const now = new Date()
      const todayStr = now.toISOString().slice(0, 10)
      if (period === 'today') {
        params.dateFrom = todayStr
        params.dateTo = todayStr
      } else if (period === 'week') {
        params.dateFrom = weekStartISO(now)
      } else if (period === 'month') {
        params.dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      } else if (period === 'quarter') {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        params.dateFrom = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`
      } else if (period === 'custom') {
        if (dateFrom) params.dateFrom = dateFrom
        if (dateTo)   params.dateTo   = dateTo
      }

      if (searchQuery.trim())          params.search          = searchQuery.trim()
      if (selectedSettlement !== 'all') params.settlementMode = selectedSettlement
      if (selectedStatus      !== 'all') params.status        = selectedStatus
      if (selectedCustomer    !== 'all') params.customerName  = selectedCustomer
      if (selectedReason      !== 'all') params.reason        = selectedReason

      const qs = new URLSearchParams(params).toString()
      const res = await api.get(`/credit-notes?${qs}`)

      // Guard: if a newer fetch was fired while this one was in-flight, discard
      if (fetchId !== splitFetchIdRef.current) return

      const incoming: CreditNote[] = res.data.data || res.data
      const total: number = res.data.total ?? incoming.length

      setSplitItems((prev) => (page === 1 ? incoming : [...prev, ...incoming]))
      setSplitTotal(total)
    } catch {
      // silently ignore — table view still works
    } finally {
      if (fetchId === splitFetchIdRef.current) setSplitLoading(false)
    }
  }, [period, dateFrom, dateTo, searchQuery, selectedSettlement, selectedStatus, selectedCustomer, selectedReason])

  // Reset split pagination whenever filters change
  useEffect(() => {
    splitFetchIdRef.current += 1
    setSplitItems([])
    setSplitTotal(0)
    setSplitPage(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, dateFrom, dateTo, searchQuery, selectedSettlement, selectedStatus, selectedCustomer, selectedReason])

  // Fetch when splitPage advances (page=1 reset is handled above — the effect
  // below will also fire because splitPage resets to 1 which re-triggers)
  useEffect(() => {
    const id = splitFetchIdRef.current
    fetchSplitPage(splitPage, id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitPage, fetchSplitPage])

  // Deep-link support: the detail is now its own page. Legacy links that land
  // on the list with `?id=<id>` (Customer Detail → Credit Notes tab,
  // notifications, Approvals) redirect to the standalone detail page.
  // `replace: true` so this intermediate list entry doesn't linger in history —
  // otherwise the detail page's Back lands here and bounces forward again
  // instead of returning to the caller (e.g. the notification folder).
  const { search: routeSearch } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch])

  useEffect(() => {
    const target = urlParams.get('id')
    if (target) navigate(`/billing/credit-notes/detail?id=${target}`, { replace: true })
  }, [urlParams])

  // Split is default; ?view=table → table view
  const effectiveView = urlParams.get('view') === 'table' ? 'table' : 'split'
  const selectedCreditNoteId = urlParams.get('creditNoteId')

  const selectCreditNote = useCallback((id: string | null) => {
    if (window.location.pathname !== '/billing/credit-notes') return
    const params = new URLSearchParams()
    if (id) params.set('creditNoteId', id)
    navigate(`/billing/credit-notes${params.toString() ? `?${params.toString()}` : ''}`)
  }, [])

  const exitSplitView = useCallback(() => {
    navigate('/billing/credit-notes?view=table')
  }, [])

  // Master data — for filters that should list ALL options
  const { customers, fetchMasterData } = useMasterDataStore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])

  // ── Filtering ──

  // Credit notes within the selected period only — drives both the summary
  // cards and the list (so the cards always reflect the period, independent of
  // the card-click / search / status narrowing applied to the table below).
  const periodNotes = useMemo(() => {
    let result = [...creditNotes]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    switch (period) {
      case 'today':
        result = result.filter(cn => cn.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
        result = result.filter(cn => cn.date.slice(0, 10) >= weekStr)
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
    return result
  }, [creditNotes, period, dateFrom, dateTo])

  const preTabFiltered = useMemo(() => {
    let result = [...periodNotes]

    // Stat-card drill-down
    if (cardFilter === 'pending') {
      result = result.filter(cn => cn.status === 'PENDING_REVIEW')
    } else if (cardFilter === 'refund') {
      result = result.filter(cn => cn.settlementMode === 'REFUND')
    } else if (cardFilter === 'adjust') {
      result = result.filter(cn => cn.settlementMode === 'CREDIT')
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

    // ── Status (Pending Review / Approved / Rejected) ──
    if (selectedStatus !== 'all') {
      result = result.filter(cn => cn.status === selectedStatus)
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

    return result
  }, [periodNotes, cardFilter, searchQuery, selectedSettlement, selectedStatus, selectedCustomer, selectedReason])

  const tabCounts = useMemo(() => {
    const counts: Record<CreditNoteTabKey, number> = { all: preTabFiltered.length, PENDING_REVIEW: 0, APPROVED: 0, REJECTED: 0 }
    for (const cn of preTabFiltered) {
      if (cn.status in counts) counts[cn.status as CreditNoteTabKey]++
    }
    return counts
  }, [preTabFiltered])

  const filtered = useMemo(
    () => statusTab === 'all' ? preTabFiltered : preTabFiltered.filter((cn) => cn.status === statusTab),
    [preTabFiltered, statusTab]
  )

  const tabFilteredSplitItems = useMemo(
    () => statusTab === 'all' ? splitItems : splitItems.filter((cn) => cn.status === statusTab),
    [splitItems, statusTab]
  )

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
  // Financial roll-ups (total credit / refunds / adjustments) only count
  // APPROVED CNs — including pending claims would over-state issued credit
  // and confuse anyone reconciling against accounting. Pending count gets
  // its own tile.
  const stats = useMemo(() => {
    const approved = periodNotes.filter(cn => cn.status === 'APPROVED')
    const pendingCount = periodNotes.filter(cn => cn.status === 'PENDING_REVIEW').length
    const total = approved.reduce((s, cn) => s + Number(cn.totalAmount), 0)
    const refunds = approved.filter(cn => cn.settlementMode === 'REFUND').reduce((s, cn) => s + Number(cn.totalAmount), 0)
    const adjustments = approved.filter(cn => cn.settlementMode === 'CREDIT').reduce((s, cn) => s + Number(cn.totalAmount), 0)
    return { count: periodNotes.length, total, refunds, adjustments, pendingCount }
  }, [periodNotes])

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const activeFilterCount = [
    period !== 'today' ? period : '', // "today" is the default baseline
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom, dateTo,
    selectedSettlement !== 'all' ? selectedSettlement : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedCustomer !== 'all' ? selectedCustomer : '',
    selectedReason !== 'all' ? selectedReason : '',
    statusTab !== 'all' ? statusTab : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('today'); setCardFilter('all'); setDateFrom(''); setDateTo('')
    setSelectedSettlement('all')
    setSelectedStatus('all')
    setSelectedCustomer('all')
    setSelectedReason('all')
    setStatusTab('all')
  }

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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {([
                  { label: 'Pending Review', value: stats.pendingCount.toString(), iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', borderAccent: 'border-l-amber-500' },
                  { label: 'Total Notes', value: stats.count.toString(), iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', borderAccent: 'border-l-blue-500' },
                  { label: 'Total Credit', value: formatCurrency(stats.total), iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', borderAccent: 'border-l-rose-500' },
                  { label: 'Refunds', value: formatCurrency(stats.refunds), iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', borderAccent: 'border-l-emerald-500' },
                  { label: 'Adjustments', value: formatCurrency(stats.adjustments), iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', borderAccent: 'border-l-violet-500' },
                ] as const).map((s) => (
                  <Card key={s.label} className={cn('border-l-[3px]', s.borderAccent)}>
                    <CardContent className="flex items-center gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                        <p className="font-mono text-sm font-bold leading-tight">{s.value}</p>
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
            <EnumSelect
              label="Period"
              value={period}
              onValueChange={(v) => { setPeriod(v); setCurrentPage(1) }}
              onClear={() => setPeriod('all')}
              options={PERIOD_OPTIONS}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!filtered.length) { toast.info('No credit notes to export'); return }
              exportToCsv(filtered.map(cn => ({
                'Credit Note #': cn.creditNoteNo,
                Date: csvText(formatDate(cn.date)),
                Customer: cn.customerName,
                'Invoice #': cn.invoiceNumber,
                Reason: cn.reason,
                Status: statusConfig[cn.status]?.label ?? cn.status,
                Settlement: settlementConfig[cn.settlementMode]?.label ?? cn.settlementMode,
                Total: cn.totalAmount,
              })), 'credit-notes')
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
          <Button size="sm" onClick={() => navigate('/billing/returns')}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">New Return</span>
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
                  <EnumSelect label="Settlement" value={selectedSettlement} onValueChange={(v) => { setSelectedSettlement(v); setCurrentPage(1) }} onClear={() => setSelectedSettlement('all')} options={SETTLEMENT_OPTIONS} />
                  <EnumSelect label="Reason" value={selectedReason} onValueChange={(v) => { setSelectedReason(v); setCurrentPage(1) }} onClear={() => setSelectedReason('all')} options={reasonOptions} />
                  <PaginatedSelect label="Customer" value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); setCurrentPage(1) }} onClear={() => setSelectedCustomer('all')} fetcher={customerFetcher} pinnedOption={{ value: 'all', label: 'All Customers' }} selectedLabel={selectedCustomerLabel} pageSize={10} />
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
          <CreditNoteSplitView
            creditNotes={tabFilteredSplitItems}
            loading={splitLoading && splitPage === 1}
            loadingMore={splitLoading && splitPage > 1}
            hasMore={splitItems.length < splitTotal && !splitLoading}
            onLoadMore={() => setSplitPage((p) => p + 1)}
            selectedCreditNoteId={selectedCreditNoteId}
            onSelectCreditNote={selectCreditNote}
            onExitSplitView={exitSplitView}
            onRefresh={() => {
              splitFetchIdRef.current += 1
              setSplitItems([])
              setSplitTotal(0)
              setSplitPage(1)
            }}
            isCardFieldVisible={cardCols.isVisible}
            tabsNode={
              <CreditNoteStatusTabs
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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          {
            label: 'Pending Review',
            value: stats.pendingCount.toString(),
            subtitle: stats.pendingCount === 1 ? 'awaiting inspection' : 'awaiting inspection',
            icon: Hourglass,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
            filterKey: 'pending',
            activeRing: 'ring-2 ring-amber-500/50',
          },
          {
            label: 'Total Notes',
            value: stats.count.toString(),
            subtitle: 'this period',
            icon: Receipt,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            // Financials below count APPROVED only — see stats memo.
            label: 'Total Credit',
            value: formatCurrency(stats.total),
            subtitle: 'approved · issued',
            icon: IndianRupee,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-rose-500/50',
          },
          {
            label: 'Refunds',
            value: formatCurrency(stats.refunds),
            subtitle: 'approved · via original payment',
            icon: Wallet,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: 'refund',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Adjustments',
            value: formatCurrency(stats.adjustments),
            subtitle: 'approved · against outstanding',
            icon: BadgeCheck,
            iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
            borderAccent: 'border-l-violet-500',
            filterKey: 'adjust',
            activeRing: 'ring-2 ring-violet-500/50',
          },
        ] as const).map((stat) => {
          const active = stat.filterKey !== 'all' && cardFilter === stat.filterKey
          return (
          <Card
            key={stat.label}
            hover
            role="button"
            tabIndex={0}
            title={stat.filterKey === 'all' ? 'Show all credit notes in this period' : `Filter list to ${stat.label.toLowerCase()}`}
            onClick={() => { setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : stat.filterKey); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.borderAccent, active && stat.activeRing)}
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
      </div>

      {/* ── Filters ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1) }}
        searchPlaceholder="Search credit note #, customer or invoice..."
        resultsCount={filtered.length}
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
        columnsNode={<ColumnsToggle columns={CREDIT_NOTE_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
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
                  Date: csvText(formatDate(cn.date)),
                  Customer: cn.customerName,
                  Phone: csvText(cn.customerPhone ?? ''),
                  'Invoice #': cn.invoiceNumber,
                  Reason: cn.reason,
                  Status: statusConfig[cn.status]?.label ?? cn.status,
                  Settlement: settlementConfig[cn.settlementMode]?.label ?? cn.settlementMode,
                  Subtotal: cn.subtotal,
                  CGST: cn.cgst,
                  SGST: cn.sgst,
                  Total: cn.totalAmount,
                  'Reviewed By': cn.reviewedBy?.name ?? '',
                  'Reviewed At': cn.reviewedAt ? csvText(formatDate(cn.reviewedAt)) : '',
                })), 'credit-notes')
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/billing/returns')}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">New Return</span>
              <span className="sm:hidden">New</span>
            </Button>
            <ViewModeToggle view="table" onViewChange={(v) => { if (v === 'split') navigate('/billing/credit-notes') }} />
          </div>
        }
      >
        {/* Custom equal-width grid that overrides DataTableFilterBar's inner grid */}
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <EnumSelect
            label="Status"
            value={selectedStatus}
            onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
            onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
            options={STATUS_OPTIONS}
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

      {/* ── Status Tabs ── */}
      <div className="rounded-lg border border-border/40 bg-background">
        <CreditNoteStatusTabs
          tab={statusTab}
          onChange={(t) => { setStatusTab(t); setCurrentPage(1) }}
          counts={tabCounts}
        />
      </div>

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
              const status = statusConfig[cn.status]
              return (
                <div
                  key={cn.id}
                  className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => navigate(`/billing/credit-notes/detail?id=${cn.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold">{cn.creditNoteNo}</p>
                    <CustomerNameLine
                      name={cn.customerName}
                      phone={cn.customerPhone}
                      onNameClick={cn.customerId ? () => navigate(`/customers/detail?customerId=${cn.customerId}`) : undefined}
                    />
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <Badge variant={status?.variant ?? 'secondary'} size="sm" dot>
                        {status?.label ?? cn.status}
                      </Badge>
                      <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
                        {settlement?.label ?? cn.settlementMode}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatDate(cn.date)}</span>
                    </div>
                  </div>
                  <p className="font-mono text-[15px] font-bold text-rose-600 dark:text-rose-400 shrink-0">
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
              {cols.isVisible('date') && <TableHead>Date</TableHead>}
              {cols.isVisible('customer') && <TableHead>Customer</TableHead>}
              {cols.isVisible('creditNote') && <TableHead>Credit Note #</TableHead>}
              {cols.isVisible('invoice') && <TableHead>Against Invoice</TableHead>}
              {cols.isVisible('reason') && <TableHead>Reason</TableHead>}
              {cols.isVisible('status') && <TableHead>Status</TableHead>}
              {cols.isVisible('settlement') && <TableHead>Settlement</TableHead>}
              {cols.isVisible('amount') && <TableHead className="text-right">Amount</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 1} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Loading credit notes...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 1} className="h-48">
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
                  const status = statusConfig[cn.status]
                  const StatusIcon = status?.icon ?? Hourglass
                  return (
                    <motion.tr
                      key={cn.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/billing/credit-notes/detail?id=${cn.id}`)}
                    >
                      {cols.isVisible('date') && (
                      <TableCell className="whitespace-nowrap">
                        <span className="text-[11px] text-muted-foreground">{formatDate(cn.date)}</span>
                      </TableCell>
                      )}
                      {cols.isVisible('customer') && (
                      <TableCell className="max-w-40">
                        <CustomerNameLine
                          name={cn.customerName}
                          phone={cn.customerPhone}
                          onNameClick={cn.customerId ? () => navigate(`/customers/detail?customerId=${cn.customerId}`) : undefined}
                        />
                      </TableCell>
                      )}
                      {cols.isVisible('creditNote') && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Receipt className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="font-mono text-[11px] font-semibold">{cn.creditNoteNo}</span>
                        </div>
                      </TableCell>
                      )}
                      {cols.isVisible('invoice') && (
                      <TableCell>
                        <span className="font-mono text-[11px] text-muted-foreground">{cn.invoiceNumber}</span>
                      </TableCell>
                      )}
                      {cols.isVisible('reason') && (
                      <TableCell className="max-w-35">
                        <p className="truncate text-[11px] text-muted-foreground">{cn.reason}</p>
                      </TableCell>
                      )}
                      {cols.isVisible('status') && (
                      <TableCell>
                        <Badge variant={status?.variant ?? 'secondary'} size="sm" dot>
                          <StatusIcon className="mr-1 h-2.5 w-2.5" />
                          {status?.label ?? cn.status}
                        </Badge>
                      </TableCell>
                      )}
                      {cols.isVisible('settlement') && (
                      <TableCell>
                        <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
                          <SettlementIcon className="mr-1 h-2.5 w-2.5" />
                          {settlement?.label ?? cn.settlementMode}
                        </Badge>
                      </TableCell>
                      )}
                      {cols.isVisible('amount') && (
                      <TableCell className="text-right font-mono text-[15px] font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrency(cn.totalAmount)}
                      </TableCell>
                      )}
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/billing/credit-notes/detail?id=${cn.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => printCreditNote(cn, businessProfile)}>
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
    </motion.div>
  )
}
