import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  Edit2,
  ExternalLink,
  UserCheck,
  UserX,
  AlertTriangle,
  Calendar,
  ChevronDown,
  IndianRupee,
  CheckCircle2,
  Clock,
  Undo2,
  User,
  Mail,
  Phone,
  Building2,
  Copy,
  Check,
  ArrowUpRight,
  Receipt,
  LogIn,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { SalespersonFormDialog } from '@/components/shared/SalespersonFormDialog'

import { navigate, goBack, useRoute } from '@/lib/router'
import api from '@/lib/api'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { getInitials, getAvatarColor, formatLastLogin } from '@/lib/salespersonUtils'
import { useAuthStore } from '@/stores/authStore'
import { isAdminish } from '@/types'
import { useBranchStore } from '@/stores/branchStore'
import type { Salesperson, Invoice } from '@/types'

const PAGE_SIZE = 10

// ─────────────────────────────────────────────────────────────
// Period filter — "Today" is the default (like the invoice page).
// The selected period drives BOTH the stat cards (via /billing/summary)
// and the paginated list (via /billing?skip&take).
// ─────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'quarter' | 'custom' | 'all'

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'all', label: 'All Time' },
]

function periodLabel(p: Period): string {
  if (p === 'custom') return 'Custom Range'
  return PERIOD_OPTIONS.find((o) => o.value === p)?.label ?? 'Today'
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

// Resolve the active period into an inclusive { from, to } date window. Empty
// strings mean "no bound" (All Time / open-ended custom).
function rangeFor(period: Period, dateFrom: string, dateTo: string): { from: string; to: string } {
  const now = new Date()
  const todayStr = isoToday()
  switch (period) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case 'week':
      return { from: weekStartISO(now), to: todayStr }
    case 'month':
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: todayStr }
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3
      return { from: `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`, to: todayStr }
    }
    case 'custom':
      return { from: dateFrom, to: dateTo }
    default:
      return { from: '', to: '' }
  }
}

type CardFilter = 'all' | 'paid' | 'pending' | 'returns'

const CARD_TO_STATUS: Record<CardFilter, string | undefined> = {
  all: undefined,
  paid: 'PAID',
  pending: 'PENDING', // backend expands PENDING → UNPAID + PARTIAL
  returns: 'RETURNED',
}

interface SummaryData {
  totalInvoices: number
  totalAmount: number
  paidCount: number
  paidTotal: number
  outstandingAmount: number
  outstandingCount: number
  returnsCount: number
}

const EMPTY_SUMMARY: SummaryData = {
  totalInvoices: 0, totalAmount: 0, paidCount: 0, paidTotal: 0,
  outstandingAmount: 0, outstandingCount: 0, returnsCount: 0,
}

export default function SalespersonDetailPage() {
  const { search } = useRoute()
  const salespersonId = new URLSearchParams(search).get('salespersonId') ?? ''

  const { user } = useAuthStore()
  const isAdmin = isAdminish(user)
  const { branches, fetchBranches } = useBranchStore()

  const [salesperson, setSalesperson] = useState<Salesperson | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [activeTab, setActiveTab] = useState<'overview' | 'sales'>('sales')
  const [editOpen, setEditOpen] = useState(false)

  // Period + drill-down state (defaults to Today, like the invoice page).
  const [period, setPeriod] = useState<Period>('today')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [cardFilter, setCardFilter] = useState<CardFilter>('all')
  const [page, setPage] = useState(1)

  // Period-summary (stat cards) + paginated list state.
  const [summary, setSummary] = useState<SummaryData>(EMPTY_SUMMARY)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [rows, setRows] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)

  const range = useMemo(() => rangeFor(period, dateFrom, dateTo), [period, dateFrom, dateTo])

  useEffect(() => { fetchBranches() }, [fetchBranches])

  // ── Profile + lifetime stats (independent of the period filter) ──
  const fetchProfile = useCallback(async () => {
    if (!salespersonId) { setProfileLoading(false); return }
    setProfileLoading(true)
    try {
      const spRes = await api.get('/salespersons')
      const sp = (spRes.data as Salesperson[]).find((s) => s.id === salespersonId) ?? null
      setSalesperson(sp)
      setNotFound(!sp)
    } catch {
      toast.error('Failed to load salesperson')
    } finally {
      setProfileLoading(false)
    }
  }, [salespersonId])

  useEffect(() => { void fetchProfile() }, [fetchProfile])

  // ── Period summary (stat cards) — reflects the whole period, not the page ──
  const fetchSummary = useCallback(async () => {
    if (!salespersonId) return
    setSummaryLoading(true)
    try {
      const params: Record<string, string> = { salespersonId }
      if (range.from) params.from = range.from
      if (range.to) params.to = range.to
      const { data } = await api.get('/billing/summary', { params })
      setSummary({ ...EMPTY_SUMMARY, ...data })
    } catch {
      setSummary(EMPTY_SUMMARY)
    } finally {
      setSummaryLoading(false)
    }
  }, [salespersonId, range.from, range.to])

  useEffect(() => { void fetchSummary() }, [fetchSummary])

  // ── Paginated list — 10 rows/page via the server (skip/take) ──
  const fetchList = useCallback(async () => {
    if (!salespersonId) return
    setListLoading(true)
    try {
      const params: Record<string, string | number> = {
        salespersonId,
        type: 'INVOICE',
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }
      if (range.from) params.from = range.from
      if (range.to) params.to = range.to
      const status = CARD_TO_STATUS[cardFilter]
      if (status) params.status = status
      const { data } = await api.get('/billing', { params })
      // Paginated contract: { data, total, hasMore }
      setRows(data?.data ?? [])
      setTotal(data?.total ?? 0)
    } catch {
      toast.error('Failed to load sales')
      setRows([])
      setTotal(0)
    } finally {
      setListLoading(false)
    }
  }, [salespersonId, range.from, range.to, cardFilter, page])

  useEffect(() => { void fetchList() }, [fetchList])

  const branchName = useMemo(() => {
    if (!salesperson?.branchId) return '—'
    return branches.find((b) => b.id === salesperson.branchId)?.name ?? '—'
  }, [branches, salesperson])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Handlers ──
  const handleToggle = async () => {
    if (!salesperson) return
    try {
      await api.patch(`/salespersons/${salesperson.id}/toggle`)
      toast.success(salesperson.isActive ? 'Salesperson deactivated' : 'Salesperson activated')
      void fetchProfile()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const applyPeriod = (next: Period) => {
    setPeriod(next)
    if (next !== 'custom') { setDateFrom(''); setDateTo('') }
    setCardFilter('all')
    setPage(1)
  }

  const applyCard = (key: CardFilter) => {
    setCardFilter((prev) => (prev === key ? 'all' : key))
    setPage(1)
  }

  // ── Render guards ──
  if (!salespersonId) {
    return (
      <div className="flex h-content-viewport items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-2 text-sm">No salesperson ID provided</p>
          <Button className="mt-4" onClick={() => goBack('/salespersons')}>Back to Salespersons</Button>
        </div>
      </div>
    )
  }

  if (notFound && !profileLoading) {
    return (
      <div className="flex h-content-viewport items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-2 text-sm">Salesperson not found</p>
          <Button className="mt-4" onClick={() => goBack('/salespersons')}>Back to Salespersons</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 border-b border-border/40 bg-background px-5 py-3">
        {/* responsive: stack identity above the actions on phones so the name
            isn't squeezed out by the buttons; single row at sm+ */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => goBack('/salespersons')}
              className="shrink-0"
              aria-label="Back to Salespersons"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {profileLoading && !salesperson ? (
              <Skeleton className="h-9 w-56" />
            ) : salesperson ? (
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className={cn('text-sm font-bold', getAvatarColor(salesperson.name))}>
                    {getInitials(salesperson.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold tracking-tight truncate">{salesperson.name}</h1>
                    <StatusBadge status={salesperson.isActive ? 'active' : 'inactive'} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{salesperson.email}</p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            {isAdmin && (
              <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setEditOpen(true)} disabled={!salesperson}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => salesperson && navigate(`/salespersons/report?salespersonId=${encodeURIComponent(salesperson.id)}`)}
              disabled={!salesperson}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">View Full Report</span>
              <span className="sm:hidden">Report</span>
            </Button>
            {isAdmin && salesperson && (
              <Button
                size="sm"
                variant={salesperson.isActive ? 'destructive' : 'default'}
                className="flex-1 sm:flex-none"
                onClick={handleToggle}
              >
                {salesperson.isActive ? <UserX className="mr-1.5 h-3.5 w-3.5" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />}
                {salesperson.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex flex-1 flex-col overflow-hidden min-w-0"
        >
          {/* Tab row — tabs left, period dropdown (Sales tab only) right */}
          <div className="shrink-0 border-b border-border/40 bg-background flex items-center gap-2 px-5">
            <div className="flex-1 min-w-0 overflow-x-auto">
              <TabsList className="h-auto justify-start gap-0 rounded-none bg-transparent p-0">
                {[
                  { value: 'overview', label: 'Overview', icon: User },
                  { value: 'sales', label: 'Sales', icon: Receipt },
                ].map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className={cn(
                      'gap-2 rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors',
                      'hover:text-foreground hover:bg-muted/40',
                      'data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-none',
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {activeTab === 'sales' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 my-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="text-xs">{periodLabel(period)}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {PERIOD_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onSelect={() => applyPeriod(opt.value)}
                      className={cn('cursor-pointer text-xs', period === opt.value && 'bg-accent font-semibold')}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => applyPeriod('custom')}
                    className={cn('cursor-pointer text-xs', period === 'custom' && 'bg-accent font-semibold')}
                  >
                    Custom Range…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Custom date-picker strip (Sales tab + custom only) */}
          {activeTab === 'sales' && period === 'custom' && (
            <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/5 px-5 py-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
              <div className="w-40"><DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1) }} /></div>
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
              <div className="w-40"><DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(1) }} /></div>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}>
                  Clear
                </Button>
              )}
            </div>
          )}

          {/* ── Overview ── single full-width profile card (mirrors Customer detail) */}
          <TabsContent value="overview" className="m-0 h-full flex flex-col">
            <div className="flex-1 overflow-auto p-4 lg:p-6">
              {profileLoading && !salesperson ? (
                <OverviewSkeleton />
              ) : salesperson ? (
                <Card>
                  <CardContent className="p-5 lg:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6 items-start">
                      <OverviewSection icon={User} title="Contact">
                        <CopyRow icon={Mail} label="Email" value={salesperson.email} />
                        <CopyRow icon={Phone} label="Phone" value={salesperson.phone} mono />
                      </OverviewSection>

                      <OverviewSection icon={Building2} title="Assignment">
                        <Row label="Branch" value={branchName} />
                      </OverviewSection>

                      <OverviewSection icon={LogIn} title="Access">
                        <Row label="Last Login" value={formatLastLogin(salesperson.lastLogin)} />
                        <Row label="Joined" value={salesperson.createdAt ? formatDate(salesperson.createdAt) : '—'} />
                      </OverviewSection>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          {/* ── Sales ── */}
          <TabsContent value="sales" className="m-0 h-full flex flex-col overflow-hidden">
            {/* Stat cards (period-aware, click to drill the list) */}
            <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 py-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {([
                  {
                    label: 'Total Sales', value: formatCurrency(summary.totalAmount), subtitle: `${summary.totalInvoices} invoices`,
                    icon: IndianRupee, iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', border: 'border-l-blue-500',
                    key: 'all' as CardFilter, ring: 'ring-2 ring-blue-500/50',
                  },
                  {
                    label: 'Collected', value: formatCurrency(summary.paidTotal), subtitle: `${summary.paidCount} paid`,
                    icon: CheckCircle2, iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', border: 'border-l-emerald-500',
                    key: 'paid' as CardFilter, ring: 'ring-2 ring-emerald-500/50',
                  },
                  {
                    label: 'Outstanding', value: formatCurrency(summary.outstandingAmount), subtitle: `${summary.outstandingCount} pending`,
                    icon: Clock, iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', border: 'border-l-amber-500',
                    key: 'pending' as CardFilter, ring: 'ring-2 ring-amber-500/50',
                  },
                  {
                    label: 'Returns', value: summary.returnsCount.toString(), subtitle: 'this period',
                    icon: Undo2, iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', border: 'border-l-rose-500',
                    key: 'returns' as CardFilter, ring: 'ring-2 ring-rose-500/50',
                  },
                ]).map((stat) => {
                  const active = cardFilter === stat.key
                  return (
                    <Card
                      key={stat.label}
                      hover
                      role="button"
                      tabIndex={0}
                      title={stat.key === 'all' ? 'Show all sales in this period' : `Filter to ${stat.label.toLowerCase()}`}
                      onClick={() => applyCard(stat.key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyCard(stat.key) } }}
                      className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.border, active && stat.ring)}
                    >
                      <CardContent className="flex items-center gap-3 p-3">
                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.iconBg)}>
                          <stat.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                          {summaryLoading ? (
                            <Skeleton className="mt-1 h-5 w-20" />
                          ) : (
                            <p className="text-base font-bold font-mono leading-tight truncate">{stat.value}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Sales table (flat, server-paginated) */}
            <div className="flex-1 overflow-auto">
              {listLoading && rows.length === 0 ? (
                <TableSkeleton />
              ) : rows.length === 0 ? (
                <EmptyState period={period} />
              ) : (
                <>
                  {/* responsive: cards on phones, table at md+ */}
                  <div className="divide-y divide-border/40 md:hidden">
                    {rows.map((inv) => <SalesCard key={inv.id} inv={inv} />)}
                  </div>
                  <div className="hidden md:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Date</TableHead>
                        <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                        <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice #</TableHead>
                        <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                        <TableHead className="h-10 w-8 px-3" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((inv) => <SalesRow key={inv.id} inv={inv} />)}
                    </TableBody>
                  </Table>
                  </div>
                </>
              )}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="shrink-0 border-t border-border/40">
                <DataTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  totalItems={total}
                  itemsPerPage={PAGE_SIZE}
                  className="px-4"
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit dialog — shared with the list page */}
      {isAdmin && (
        <SalespersonFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editing={salesperson}
          onSaved={() => fetchProfile()}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sales row — flat table row. Customer is highlighted + clickable
// (→ customer detail); the row navigates to the invoice.
// ─────────────────────────────────────────────────────────────

function SalesRow({ inv }: { inv: Invoice }) {
  return (
    <TableRow
      className="group cursor-pointer border-b border-border/30 hover:bg-muted/20"
      title="View invoice details"
      onClick={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
    >
      <TableCell className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(inv.date)}</TableCell>
      <TableCell className="px-3 py-2.5 max-w-50">
        <CustomerNameLine
          name={inv.customerName}
          phone={inv.customerPhone}
          onNameClick={inv.customerId ? () => navigate(`/customers/detail?customerId=${inv.customerId}`) : undefined}
        />
      </TableCell>
      <TableCell className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <span className="font-mono text-xs font-semibold whitespace-nowrap">{inv.invoiceNumber}</span>
        </div>
      </TableCell>
      <TableCell className="px-3 py-2.5 text-right font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
        {formatCurrency(inv.grandTotal)}
      </TableCell>
      <TableCell className="px-3 py-2.5"><StatusBadge status={inv.status} /></TableCell>
      <TableCell className="px-3 py-2.5">
        <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" aria-hidden />
      </TableCell>
    </TableRow>
  )
}

// Mobile card — mirrors SalesRow. Row navigates to the invoice; the customer
// name (via CustomerNameLine) navigates to the customer detail.
function SalesCard({ inv }: { inv: Invoice }) {
  return (
    <div
      className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
      title="View invoice details"
      onClick={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
    >
      <div className="min-w-0 flex-1">
        <CustomerNameLine
          name={inv.customerName}
          phone={inv.customerPhone}
          onNameClick={inv.customerId ? () => navigate(`/customers/detail?customerId=${inv.customerId}`) : undefined}
        />
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono font-semibold">
            <Receipt className="h-3 w-3 text-muted-foreground/50" />
            {inv.invoiceNumber}
          </span>
          <span className="opacity-50">·</span>
          <span>{formatDate(inv.date)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          {formatCurrency(inv.grandTotal)}
        </span>
        <StatusBadge status={inv.status} />
      </div>
    </div>
  )
}

function EmptyState({ period }: { period: Period }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
        <Receipt className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">No sales {period === 'today' ? 'today' : 'in this period'}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/60">Try a wider period from the dropdown above.</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────

function OverviewSection({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="space-y-2.5 pl-6">{children}</div>
    </div>
  )
}

function Row({ label, value, mono, icon: Icon }: { label: string; value: React.ReactNode; mono?: boolean; icon?: typeof User }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </span>
      <span className={cn('text-sm font-medium wrap-break-word', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function CopyRow({ icon: Icon, label, value, mono }: { icon: typeof Mail; label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <button
        type="button"
        onClick={copy}
        title="Click to copy"
        className={cn('flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors min-w-0', mono && 'font-mono')}
      >
        <span className="truncate">{value}</span>
        {copied ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <Copy className="h-3 w-3 shrink-0 opacity-40" />}
      </button>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 lg:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}
