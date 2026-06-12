import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  PackageCheck,
  AlertTriangle,
  ClipboardList, TrendingUp,
  CheckCircle2, XCircle, ShieldAlert,
  RotateCcw,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { SupplierSearchSelect } from '@/components/shared/SupplierSearchSelect'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { usePersistedState } from '@/hooks/usePersistedState'
import api from '@/lib/api'
import type { GRN } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────
// Unpaid balance owed to the supplier for this GRN's invoice.
function grnBalance(grn: GRN) {
  return Math.max(0, Number(grn.supplierInvoiceAmount || 0) - Number(grn.amountPaid || 0))
}

// Filter predicates shared by the filter bar + stat-card drill-down.
const grnHasShort = (g: GRN) => g.items.some((i) => i.orderedQty > 0 && i.receivedQty < i.orderedQty)
const grnHasDamage = (g: GRN) => g.items.some((i) => (i.damageQty ?? 0) > 0)
const grnPayStatus = (g: GRN): 'PAID' | 'PARTIAL' | 'UNPAID' =>
  grnBalance(g) <= 0.01 ? 'PAID' : Number(g.amountPaid || 0) > 0 ? 'PARTIAL' : 'UNPAID'

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
] as const

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'direct', label: 'Direct' },
  { value: 'po', label: 'Against PO' },
] as const

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All Payments' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'UNPAID', label: 'Unpaid' },
] as const

// ─── Main Page ────────────────────────────────────────────────
const PAGE_SIZE = 15

const GRN_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'supplier', label: 'Supplier', required: true, defaultVisible: true },
  { id: 'invoice', label: 'Invoice #', defaultVisible: true },
  { id: 'source', label: 'Source', defaultVisible: true },
  { id: 'products', label: 'Products', defaultVisible: true },
  { id: 'received', label: 'Received', defaultVisible: true },
  { id: 'damaged', label: 'Damaged', defaultVisible: true },
  { id: 'short', label: 'Short', defaultVisible: true },
  { id: 'value', label: 'Value', defaultVisible: true },
  { id: 'payment', label: 'Payment', defaultVisible: true },
]

export default function GRNListPage() {
  const cols = useColumnVisibility('purchase.grnList', GRN_COLUMNS)
  const [grns, setGrns] = useState<GRN[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = usePersistedState('filters:purchase.grnList:search', '')
  const [currentPage, setCurrentPage] = useState(1)

  // ── Filters (period defaults to "today", mirroring the Invoice List).
  // Persisted to sessionStorage so they survive refresh + navigate-back. ──
  const [period, setPeriod] = usePersistedState('filters:purchase.grnList:period', 'today')
  const [dateFrom, setDateFrom] = usePersistedState('filters:purchase.grnList:dateFrom', '')
  const [dateTo, setDateTo] = usePersistedState('filters:purchase.grnList:dateTo', '')
  const [selectedSupplier, setSelectedSupplier] = usePersistedState('filters:purchase.grnList:supplier', 'all')
  const [selectedSupplierName, setSelectedSupplierName] = usePersistedState('filters:purchase.grnList:supplierName', '')
  const [selectedSource, setSelectedSource] = usePersistedState('filters:purchase.grnList:source', 'all')
  const [selectedPayment, setSelectedPayment] = usePersistedState('filters:purchase.grnList:payment', 'all')
  // Stat-card drill-down: Short Items / Damaged Units narrow the list.
  const [cardFilter, setCardFilter] = usePersistedState<'all' | 'short' | 'damaged'>('filters:purchase.grnList:card', 'all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/grn')
      setGrns(res.data)
    } catch {
      toast.error('Failed to load purchase entries')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Deep-link support: legacy links arrive at the list with `?grnId=<id>`
  // (e.g. from the Supplier Detail page's GRNs tab or notifications). The
  // detail is now its own page, so redirect there.
  const { search: routeSearch } = useRoute()
  useEffect(() => {
    const params = new URLSearchParams(routeSearch)
    const target = params.get('grnId')
    // `replace` so the intermediate `?grnId=` URL never lands in the back
    // stack — otherwise Back returns here and immediately re-redirects (the
    // "press back twice" bug).
    if (target) navigate(`/purchase/grn/detail?id=${target}`, { replace: true })
  }, [routeSearch])

  // GRNs within the selected period — drives both the summary cards and the
  // list, so the cards always reflect the period independent of the other
  // filters / card drill-down applied to the table.
  const periodGrns = useMemo(() => {
    let result = [...grns]
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((g) => g.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
        result = result.filter((g) => g.date.slice(0, 10) >= weekStr)
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter((g) => g.date.slice(0, 10) >= monthStart)
        break
      }
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        const quarterStart = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`
        result = result.filter((g) => g.date.slice(0, 10) >= quarterStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter((g) => g.date.slice(0, 10) >= dateFrom)
        if (dateTo) result = result.filter((g) => g.date.slice(0, 10) <= dateTo)
        break
    }
    return result
  }, [grns, period, dateFrom, dateTo])

  const filtered = useMemo(() => {
    let result = [...periodGrns]

    // Stat-card drill-down
    if (cardFilter === 'short') result = result.filter(grnHasShort)
    else if (cardFilter === 'damaged') result = result.filter(grnHasDamage)

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        (g.supplierInvoiceNo ?? '').toLowerCase().includes(q)
      )
    }

    if (selectedSupplier !== 'all') result = result.filter((g) => g.supplierId === selectedSupplier)
    if (selectedSource === 'direct') result = result.filter((g) => !g.poId)
    else if (selectedSource === 'po') result = result.filter((g) => !!g.poId)
    if (selectedPayment !== 'all') result = result.filter((g) => grnPayStatus(g) === selectedPayment)

    return result
  }, [periodGrns, cardFilter, search, selectedSupplier, selectedSource, selectedPayment])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const stats = useMemo(() => {
    const totalReceived = periodGrns.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.receivedQty + (i.freeQty ?? 0), 0), 0)
    const totalDamaged  = periodGrns.reduce((s, g) => s + g.items.reduce((ss, i) => ss + (i.damageQty ?? 0), 0), 0)
    const totalShort    = periodGrns.reduce((s, g) => s + g.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty).length, 0)
    return { totalReceived, totalDamaged, totalShort }
  }, [periodGrns])

  const activeFilterCount = [
    period !== 'today' ? period : '',
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom,
    dateTo,
    selectedSupplier !== 'all' ? selectedSupplier : '',
    selectedSource !== 'all' ? selectedSource : '',
    selectedPayment !== 'all' ? selectedPayment : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setPeriod('today')
    setCardFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedSupplier('all')
    setSelectedSupplierName('')
    setSelectedSource('all')
    setSelectedPayment('all')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Summary cards — click Short / Damaged to drill the list */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          { label: 'Total Entries', value: periodGrns.length,   icon: ClipboardList, color: 'text-primary',                              bg: 'bg-primary/10',         border: 'border-l-primary',      filterKey: 'all',     activeRing: 'ring-2 ring-primary/40' },
          { label: 'Units Received',value: stats.totalReceived, icon: TrendingUp,    color: 'text-emerald-600 dark:text-emerald-400',    bg: 'bg-emerald-500/10',     border: 'border-l-emerald-500',  filterKey: 'all',     activeRing: 'ring-2 ring-emerald-500/50' },
          { label: 'Short Items',   value: stats.totalShort,    icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400',         bg: 'bg-amber-500/10',       border: 'border-l-amber-500',    filterKey: 'short',   activeRing: 'ring-2 ring-amber-500/50' },
          { label: 'Damaged Units', value: stats.totalDamaged,  icon: ShieldAlert,   color: 'text-rose-600 dark:text-rose-400',           bg: 'bg-rose-500/10',        border: 'border-l-rose-500',     filterKey: 'damaged', activeRing: 'ring-2 ring-rose-500/50' },
        ] as const).map(s => {
          const active = s.filterKey !== 'all' && cardFilter === s.filterKey
          return (
          <Card
            key={s.label}
            hover
            role="button"
            tabIndex={0}
            title={s.filterKey === 'all' ? 'Show all purchases in this period' : `Filter to ${s.label.toLowerCase()}`}
            onClick={() => { setCardFilter(active ? 'all' : (s.filterKey as 'all' | 'short' | 'damaged')); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : (s.filterKey as 'all' | 'short' | 'damaged')); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', s.border, active && s.activeRing)}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.bg)}>
                <s.icon className={cn('h-4 w-4', s.color)} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className={cn('text-xl font-bold font-mono leading-tight', s.color)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* Search + actions */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={(val) => { setSearch(val); setCurrentPage(1) }}
        searchPlaceholder="Search PE #, supplier or invoice..."
        resultsCount={filtered.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        columnsNode={<ColumnsToggle columns={GRN_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => navigate('/purchase/grn')}
          >
            <PackageCheck className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">New PE</span>
            <span className="sm:hidden">New</span>
          </Button>
          </div>
        }
      >
        <EnumSelect
          label="Period"
          value={period}
          onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
          onClear={() => { setPeriod('today'); setCurrentPage(1) }}
          options={PERIOD_OPTIONS}
        />
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setCurrentPage(1) }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setCurrentPage(1) }} />
            </div>
          </>
        )}
        <SupplierSearchSelect
          value={selectedSupplier}
          selectedName={selectedSupplierName}
          onChange={(val, name) => { setSelectedSupplier(val); setSelectedSupplierName(name); setCurrentPage(1) }}
        />
        <EnumSelect
          label="Source"
          value={selectedSource}
          onValueChange={(val) => { setSelectedSource(val); setCurrentPage(1) }}
          onClear={() => { setSelectedSource('all'); setCurrentPage(1) }}
          options={SOURCE_OPTIONS}
        />
        <EnumSelect
          label="Payment"
          value={selectedPayment}
          onValueChange={(val) => { setSelectedPayment(val); setCurrentPage(1) }}
          onClear={() => { setSelectedPayment('all'); setCurrentPage(1) }}
          options={PAYMENT_OPTIONS}
        />
      </DataTableFilterBar>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <CardContent className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
          </CardContent>
        ) : paged.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <PackageCheck className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {search ? 'No entries match your search' : 'No purchase entries yet'}
            </p>
            {!search && <Button size="sm" onClick={() => navigate('/purchase/grn')}>Create First Entry</Button>}
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    {cols.isVisible('date') && <TableHead className="pl-5">Date</TableHead>}
                    <TableHead>Supplier</TableHead>
                    {cols.isVisible('invoice') && <TableHead>Invoice #</TableHead>}
                    {cols.isVisible('source') && <TableHead>Source</TableHead>}
                    {cols.isVisible('products') && <TableHead className="text-center">Products</TableHead>}
                    {cols.isVisible('received') && <TableHead className="text-right">Received</TableHead>}
                    {cols.isVisible('damaged') && <TableHead className="text-center">Damaged</TableHead>}
                    {cols.isVisible('short') && <TableHead className="text-center">Short</TableHead>}
                    {cols.isVisible('value') && <TableHead className="text-right">Value</TableHead>}
                    {cols.isVisible('payment') && <TableHead className="text-center pr-5">Payment</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(grn => {
                    const totalRcv  = grn.items.reduce((s, i) => s + i.receivedQty + (i.freeQty ?? 0), 0)
                    const dmg       = grn.items.reduce((s, i) => s + (i.damageQty ?? 0), 0)
                    const shortItemsRow = grn.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty)
                    const shortCnt  = shortItemsRow.length
                    // Check if shortages are resolved by later supplementary GRNs against same PO
                    const laterGrnsRow = grn.poId
                      ? grns.filter(g => g.poId === grn.poId && g.id !== grn.id && new Date(g.date).getTime() >= new Date(grn.date).getTime())
                      : []
                    // Check if debit notes cover the shortage
                    const shortageDNsRow = (grn.purchaseReturns ?? []).filter(pr =>
                      /short|excess/i.test(pr.reason ?? '')
                    )
                    const resolvedCount = shortItemsRow.filter(it => {
                      const missing = it.orderedQty - it.receivedQty
                      const fulfilled = laterGrnsRow.reduce((s, g) => {
                        const m = g.items.find(gi => gi.productId === it.productId)
                        return s + (m ? m.receivedQty + (m.freeQty ?? 0) : 0)
                      }, 0)
                      const debited = shortageDNsRow.reduce((s, pr) => {
                        const m = pr.items.find(pi => pi.productId === it.productId)
                        return s + (m ? m.returnedQty : 0)
                      }, 0)
                      return (fulfilled + debited) >= missing
                    }).length
                    const allResolved = shortCnt > 0 && resolvedCount === shortCnt
                    const hasPO     = !!grn.poId
                    const hasIssues = dmg > 0 || (shortCnt > 0 && !allResolved)
                    return (
                      <TableRow
                        key={grn.id}
                        className={cn(
                          'cursor-pointer transition-colors',
                          hasIssues ? 'hover:bg-amber-50/30 dark:hover:bg-amber-950/10' : 'hover:bg-muted/30'
                        )}
                        onClick={() => navigate(`/purchase/grn/detail?id=${grn.id}`)}
                      >
                        {cols.isVisible('date') && (
                        <TableCell className="pl-5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(grn.date)}
                        </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                              {grn.supplierName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span
                                role="link"
                                tabIndex={0}
                                title="View supplier details"
                                className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${grn.supplierId}`) }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${grn.supplierId}`) } }}
                              >{grn.supplierName}</span>
                              <span className="block font-mono text-[10px] text-muted-foreground/70">{grn.grnNumber}</span>
                            </div>
                          </div>
                        </TableCell>
                        {cols.isVisible('invoice') && (
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {grn.supplierInvoiceNo || <span className="opacity-40">—</span>}
                        </TableCell>
                        )}
                        {cols.isVisible('source') && (
                        <TableCell>
                          <Badge variant={hasPO ? 'info' : 'secondary'} size="sm">
                            {hasPO ? 'Against PO' : 'Direct'}
                          </Badge>
                        </TableCell>
                        )}
                        {cols.isVisible('products') && <TableCell className="text-center text-xs font-mono font-semibold">{grn.items.length}</TableCell>}
                        {cols.isVisible('received') && (
                        <TableCell className="text-right">
                          <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">+{totalRcv}</span>
                        </TableCell>
                        )}
                        {cols.isVisible('damaged') && (
                        <TableCell className="text-center">
                          {dmg > 0
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-0.5 text-[10px] font-bold">
                                <XCircle className="h-2.5 w-2.5" />{dmg}
                              </span>
                            : <span className="text-muted-foreground/40 text-xs">—</span>
                          }
                        </TableCell>
                        )}
                        {cols.isVisible('short') && (
                        <TableCell className="text-center">
                          {shortCnt > 0
                            ? allResolved
                              ? <span
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold"
                                  title="Shortage resolved by later supplementary delivery"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />Resolved
                                </span>
                              : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold">
                                  <AlertTriangle className="h-2.5 w-2.5" />{shortCnt}
                                </span>
                            : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[10px]">
                                <CheckCircle2 className="h-3 w-3" />Full
                              </span>
                          }
                        </TableCell>
                        )}
                        {cols.isVisible('value') && (
                        <TableCell className="text-right">
                          <span className="text-[15px] font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(grn.supplierInvoiceAmount || grn.totalAmount)}</span>
                        </TableCell>
                        )}
                        {cols.isVisible('payment') && (
                        <TableCell className="text-center pr-5">
                          {grn.isReplacement ? (
                            <Badge
                              variant="outline"
                              size="sm"
                              className="border-sky-200 bg-sky-50 font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400"
                            >
                              Replacement
                            </Badge>
                          ) : (
                            (() => {
                              const bal = grnBalance(grn)
                              const status = bal <= 0.01 ? 'PAID' : Number(grn.amountPaid || 0) > 0 ? 'PARTIAL' : 'UNPAID'
                              return (
                                <div className="flex flex-col items-center gap-0.5">
                                  <StatusBadge status={status} />
                                  {bal > 0.01 && (
                                    <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                                      {formatCurrency(bal)}
                                    </span>
                                  )}
                                </div>
                              )
                            })()
                          )}
                        </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              itemsPerPage={PAGE_SIZE}
              className="border-t border-border/40 px-5"
            />
          </>
        )}
      </Card>
    </motion.div>
  )
}
