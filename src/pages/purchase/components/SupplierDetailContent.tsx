import { useEffect, useMemo, useState } from 'react'
import {
  Edit2,
  MapPin,
  FileBadge,
  Banknote,
  Building2,
  AlertTriangle,
  RotateCcw,
  Calendar,
  ChevronDown,
  Filter,
  Package,
  TrendingUp,
  IndianRupee,
  ClipboardList,
  Receipt,
  Layers,
  FileText,
  MessageSquare,
  Phone,
  MessageCircle,
  Mail,
  StickyNote,
  Clock,
  CheckCircle2,
  Trash2,
  MoreHorizontal,
  Plus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { usePageSize } from '@/hooks/usePageSize'
import { SupplierFormDialog, type SupplierFormValues } from '@/components/shared/SupplierFormDialog'
import {
  SupplierActivityDialog,
  type SupplierActivity,
  type SupplierActivityType as SAType,
} from '@/components/shared/SupplierActivityDialog'

import { navigate, useRoute } from '@/lib/router'
import { cn, formatCurrency, formatDate, formatLedgerBalance, LEDGER_COL_BILLED, LEDGER_COL_PAID } from '@/lib/utils'
import type { Supplier } from '@/types'
import { useSupplierDetail } from '@/hooks/useSupplierDetail'

// ─────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 15

type PeriodPreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'thisQuarter' | 'custom'

const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
]

function presetLabel(p: PeriodPreset): string {
  return PERIOD_OPTIONS.find((o) => o.value === p)?.label ?? 'All Time'
}

type TabPeriod = { preset: PeriodPreset; from: string; to: string }

function filterByPeriod<T extends { date?: string }>(items: T[], period: TabPeriod): T[] {
  if (period.preset === 'all' || (!period.from && !period.to)) return items
  return items.filter((it) => {
    const day = (it.date ?? '').slice(0, 10)
    if (!day) return false
    if (period.from && day < period.from) return false
    if (period.to && day > period.to) return false
    return true
  })
}

function computeRange(preset: PeriodPreset): { from: string; to: string } {
  if (preset === 'all' || preset === 'custom') return { from: '', to: '' }
  const today = new Date()
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayStr = fmt(today)
  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { from: fmt(y), to: fmt(y) }
    }
    case 'last7': {
      const start = new Date(today); start.setDate(start.getDate() - 6)
      return { from: fmt(start), to: todayStr }
    }
    case 'last30': {
      const start = new Date(today); start.setDate(start.getDate() - 29)
      return { from: fmt(start), to: todayStr }
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: fmt(start), to: todayStr }
    }
    case 'thisQuarter': {
      const qm = Math.floor(today.getMonth() / 3) * 3
      const start = new Date(today.getFullYear(), qm, 1)
      return { from: fmt(start), to: todayStr }
    }
  }
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'secondary',
  SENT: 'info',
  ACKNOWLEDGED: 'success',
  PARTIALLY_RECEIVED: 'warning',
  FULLY_RECEIVED: 'success',
  CLOSED: 'purple',
  RECEIVED: 'success',
  VERIFIED: 'success',
  ACCEPTED: 'success',
  SETTLED: 'success',
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface SupplierDetailContentProps {
  supplierId: string
}

export function SupplierDetailContent({ supplierId }: SupplierDetailContentProps) {
  const d = useSupplierDetail(supplierId)
  const { path, search } = useRoute()
  const TAB_KEYS = ['overview', 'ledger', 'activity', 'pos', 'grns', 'dns', 'batches'] as const
  type SupplierTab = typeof TAB_KEYS[number]
  const tabFromUrl = new URLSearchParams(search).get('tab') ?? ''
  const [activeTab, setActiveTab] = useState<SupplierTab>(
    (TAB_KEYS as readonly string[]).includes(tabFromUrl) ? (tabFromUrl as SupplierTab) : 'overview',
  )
  // Mirror the active tab into the URL so browser Back — e.g. returning from a
  // PE (GRN) detail page — restores the same tab in this split view. Only
  // non-default tabs are written (overview clears it) to keep the shared
  // /purchase/suppliers URL clean.
  useEffect(() => {
    const params = new URLSearchParams(search)
    const current = params.get('tab')
    if (activeTab === 'overview') {
      if (current) { params.delete('tab'); navigate(`${path}?${params.toString()}`, { replace: true }) }
    } else if (current !== activeTab) {
      params.set('tab', activeTab)
      navigate(`${path}?${params.toString()}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])
  const [editOpen, setEditOpen] = useState(false)

  const [activityTypeFilter, setActivityTypeFilter] = useState<'ALL' | SAType>('ALL')
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; type: SAType; editing: SupplierActivity | null }>({
    open: false,
    type: 'NOTE',
    editing: null,
  })

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [posPeriod, setPosPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [grnsPeriod, setGrnsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [dnsPeriod, setDnsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [activityPeriod, setActivityPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })

  const currentPeriod: { period: TabPeriod; setPeriod: (next: TabPeriod) => void } | null = (() => {
    if (activeTab === 'ledger') {
      return {
        period: { preset: periodPreset, from: d.ledger.from, to: d.ledger.to },
        setPeriod: (next) => {
          setPeriodPreset(next.preset)
          d.ledger.setFrom(next.from)
          d.ledger.setTo(next.to)
        },
      }
    }
    if (activeTab === 'pos') return { period: posPeriod, setPeriod: setPosPeriod }
    if (activeTab === 'grns') return { period: grnsPeriod, setPeriod: setGrnsPeriod }
    if (activeTab === 'dns') return { period: dnsPeriod, setPeriod: setDnsPeriod }
    if (activeTab === 'activity') return { period: activityPeriod, setPeriod: setActivityPeriod }
    return null
  })()

  // Trigger lazy loads when their tab becomes active
  useEffect(() => {
    if (activeTab === 'pos') void d.pos.ensureLoaded()
    if (activeTab === 'grns') void d.grns.ensureLoaded()
    if (activeTab === 'dns') void d.dns.ensureLoaded()
    if (activeTab === 'activity') void d.activities.ensureLoaded()
  }, [activeTab, d.pos, d.grns, d.dns, d.activities])

  // Eagerly fetch ledger so Financial Summary is available on the Overview tab
  useEffect(() => {
    if (!d.ledger.data && !d.ledger.loading) void d.ledger.refetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sup = d.supplier.data
  const kpis = d.ledger.data?.kpis ?? []

  // KPI values arrive pre-formatted from the backend (e.g. "₹11,43,786"), so
  // strip everything but digits/sign/decimal before parsing — a bare Number()
  // on that string is NaN, which is what made "Paid" render as ₹0.
  const kpiNum = (label: string) => {
    const k = kpis.find((x) => x.label.toLowerCase() === label.toLowerCase())
    if (!k) return null
    const n = Number(String(k.value).replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  const totalPurchasesNum = kpiNum('Total Purchases')
  const outstandingNum = Number(sup?.currentOutstanding ?? 0)
  // Prefer the backend's actual Total Paid (Σ supplier payments) — it reconciles
  // (Purchases = Paid + Returns + Outstanding). Fall back to Purchases −
  // Outstanding only if that KPI is missing.
  const paidFromKpi = kpiNum('Total Paid')
  const derivedPaid =
    paidFromKpi !== null
      ? paidFromKpi
      : totalPurchasesNum !== null
        ? Math.max(0, totalPurchasesNum - outstandingNum)
        : null

  // Per-tab pagination state
  const [ledgerPage, setLedgerPage] = useState(1)
  const [posPage, setPosPage] = useState(1)
  const [grnsPage, setGrnsPage] = useState(1)
  const [dnsPage, setDnsPage] = useState(1)
  const [batchPage, setBatchPage] = useState(1)
  const [ledgerPageSize, setLedgerPageSize] = usePageSize('pbims.supplierDetail.ledger.pageSize', PAGE_SIZE)
  const [posPageSize, setPosPageSize] = usePageSize('pbims.supplierDetail.pos.pageSize', PAGE_SIZE)
  const [grnsPageSize, setGrnsPageSize] = usePageSize('pbims.supplierDetail.grns.pageSize', PAGE_SIZE)
  const [dnsPageSize, setDnsPageSize] = usePageSize('pbims.supplierDetail.dns.pageSize', PAGE_SIZE)
  const [batchPageSize, setBatchPageSize] = usePageSize('pbims.supplierDetail.batches.pageSize', PAGE_SIZE)
  useEffect(() => { setLedgerPage(1); setPosPage(1); setGrnsPage(1); setDnsPage(1); setBatchPage(1) }, [supplierId])

  const ledgerRows = d.ledger.data?.tableData ?? []
  const sortedBatches = useMemo(() => {
    const list = sup?.batches ?? []
    return [...list].sort((a, b) => {
      const ad = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity
      const bd = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity
      return ad - bd
    })
  }, [sup?.batches])

  const posFiltered = useMemo(() => filterByPeriod(d.pos.data ?? [], posPeriod), [d.pos.data, posPeriod])
  const grnsFiltered = useMemo(() => filterByPeriod(d.grns.data ?? [], grnsPeriod), [d.grns.data, grnsPeriod])
  const dnsFiltered = useMemo(() => filterByPeriod(d.dns.data ?? [], dnsPeriod), [d.dns.data, dnsPeriod])

  const activityFiltered = useMemo(() => {
    const all = d.activities.data ?? []
    const byType = activityTypeFilter === 'ALL' ? all : all.filter((a) => a.type === activityTypeFilter)
    return filterByPeriod(
      byType.map((a) => ({ ...a, date: a.createdAt })),
      activityPeriod,
    )
  }, [d.activities.data, activityTypeFilter, activityPeriod])

  useEffect(() => { setPosPage(1) }, [posPeriod])
  useEffect(() => { setGrnsPage(1) }, [grnsPeriod])
  useEffect(() => { setDnsPage(1) }, [dnsPeriod])

  const ledgerPaged = ledgerRows.slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize)
  const posPaged = posFiltered.slice((posPage - 1) * posPageSize, posPage * posPageSize)
  const grnsPaged = grnsFiltered.slice((grnsPage - 1) * grnsPageSize, grnsPage * grnsPageSize)
  const dnsPaged = dnsFiltered.slice((dnsPage - 1) * dnsPageSize, dnsPage * dnsPageSize)
  const batchPaged = sortedBatches.slice((batchPage - 1) * batchPageSize, batchPage * batchPageSize)

  const handleEditSaved = (values: SupplierFormValues, _mode: 'create' | 'update') => {
    d.supplier.applyPatch(values as Partial<Supplier>)
    void d.supplier.refetch()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Small action bar */}
      <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 py-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Supplier Detail</span>
        <div className="flex-1" />
        {/* Period dropdown — show for tabs that have a period */}
        {currentPeriod && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 bg-muted/60 border-border/60 hover:bg-muted">
                <Calendar className="h-3 w-3" />
                <span className="text-xs">{presetLabel(currentPeriod.period.preset)}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {PERIOD_OPTIONS.slice(0, -1).map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onSelect={() => {
                    const r = computeRange(opt.value)
                    currentPeriod.setPeriod({ preset: opt.value, from: r.from, to: r.to })
                  }}
                  className={cn(
                    'cursor-pointer text-xs',
                    currentPeriod.period.preset === opt.value && 'bg-accent font-semibold',
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => currentPeriod.setPeriod({ preset: 'custom', from: '', to: '' })}
                className={cn(
                  'cursor-pointer text-xs',
                  currentPeriod.period.preset === 'custom' && 'bg-accent font-semibold',
                )}
              >
                Custom Range…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Activity type filter — only when activity tab active */}
        {activeTab === 'activity' && (() => {
          const typeOptions: Array<{ value: 'ALL' | SAType; label: string }> = [
            { value: 'ALL', label: 'All Types' },
            { value: 'CALL', label: 'Call' },
            { value: 'WHATSAPP', label: 'WhatsApp' },
            { value: 'EMAIL', label: 'Email' },
            { value: 'NOTE', label: 'Note' },
            { value: 'REMINDER', label: 'Reminder' },
          ]
          const current = typeOptions.find((o) => o.value === activityTypeFilter)
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 bg-muted/60 border-border/60 hover:bg-muted">
                  <Filter className="h-3 w-3" />
                  <span className="text-xs">{current?.label ?? 'All Types'}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {typeOptions.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onSelect={() => setActivityTypeFilter(opt.value)}
                    className={cn(
                      'cursor-pointer text-xs',
                      activityTypeFilter === opt.value && 'bg-accent font-semibold',
                    )}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })()}
        {/* Edit button */}
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={!sup}>
          <Edit2 className="mr-1.5 h-3.5 w-3.5" />Edit
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex flex-1 flex-col overflow-hidden min-w-0"
        >
          {/* Tab row */}
          <div className="shrink-0 border-b border-border/40 bg-background overflow-x-auto px-5">
            <TabsList className="h-auto justify-start gap-0 rounded-none bg-transparent p-0">
              {[
                { value: 'overview', label: 'Overview', icon: Building2 },
                { value: 'ledger', label: 'Ledger', icon: FileText },
                { value: 'activity', label: 'Activity', icon: MessageSquare },
                { value: 'pos', label: 'POs', icon: ClipboardList },
                { value: 'grns', label: 'PEs', icon: Receipt },
                { value: 'dns', label: 'Debit Notes', icon: RotateCcw },
                { value: 'batches', label: 'Batches', icon: Layers },
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

          {/* Custom date-picker strip */}
          {currentPeriod && currentPeriod.period.preset === 'custom' && (
            <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/5 px-5 py-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
              <div className="w-40">
                <DatePicker
                  value={currentPeriod.period.from}
                  onChange={(v) => currentPeriod.setPeriod({ ...currentPeriod.period, from: v })}
                />
              </div>
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
              <div className="w-40">
                <DatePicker
                  value={currentPeriod.period.to}
                  onChange={(v) => currentPeriod.setPeriod({ ...currentPeriod.period, to: v })}
                />
              </div>
              {(currentPeriod.period.from || currentPeriod.period.to) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => currentPeriod.setPeriod({ ...currentPeriod.period, from: '', to: '' })}
                >
                  Clear
                </Button>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
                {currentTabCountLabel(activeTab, ledgerRows.length, posFiltered.length, grnsFiltered.length, dnsFiltered.length, activityFiltered.length, d)}
              </span>
            </div>
          )}

          {/* Tab content area */}
          <div className="flex-1 overflow-hidden">
            {/* Overview */}
            <TabsContent value="overview" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto p-4 lg:p-6">
                {d.supplier.loading && !sup ? (
                  <OverviewPanelSkeleton />
                ) : d.supplier.error && !sup ? (
                  <InlineError message={d.supplier.error} onRetry={d.supplier.refetch} />
                ) : sup ? (
                  <Card>
                    <CardContent className="p-5 lg:p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6 items-start">
                        <OverviewSection icon={Building2} title="Contact">
                          <Row label="Company" value={sup.name} />
                          <Row label="Person" value={sup.contactPerson || '—'} />
                          <Row label="Phone" value={sup.phone || '—'} mono />
                          <Row label="Email" value={sup.email || '—'} />
                        </OverviewSection>

                        <OverviewSection icon={MapPin} title="Address">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{sup.address || '—'}</p>
                        </OverviewSection>

                        <OverviewSection icon={FileBadge} title="Compliance">
                          <Row
                            label="GSTIN"
                            value={sup.gstin || <span className="text-muted-foreground/40">Not provided</span>}
                            mono
                          />
                          <Row
                            label="Drug Lic."
                            value={sup.drugLicense || <span className="text-muted-foreground/40">Not provided</span>}
                            mono
                          />
                        </OverviewSection>

                        <OverviewSection icon={Banknote} title="Commercial">
                          <Row
                            label="Terms"
                            value={<Badge variant="secondary" size="sm">{sup.paymentTerms}</Badge>}
                          />
                          <Row
                            label="Outstanding"
                            value={
                              Number(sup.currentOutstanding) > 0 ? (
                                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                                  {formatCurrency(Number(sup.currentOutstanding))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">₹0</span>
                              )
                            }
                          />
                          {sup.bankDetails && <Row label="Bank" value={sup.bankDetails} mono />}
                        </OverviewSection>

                        {kpis.length > 0 && (
                          <OverviewSection icon={TrendingUp} title="Financial Summary">
                            <Row label="Total Purchases" value={<span className="font-mono font-semibold">{pickKpi(kpis, 'Total Purchases')}</span>} />
                            {derivedPaid !== null && (
                              <Row label="Paid" value={<span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(derivedPaid)}</span>} />
                            )}
                            <Row label="Total Returns" value={<span className="font-mono font-semibold text-rose-600 dark:text-rose-400">{pickKpi(kpis, 'Total Returns')}</span>} />
                            <Row label="Open POs" value={<span className="font-mono font-semibold">{pickKpi(kpis, 'Open POs')}</span>} />
                          </OverviewSection>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </TabsContent>

            {/* Ledger */}
            <TabsContent value="ledger" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.ledger.error && !d.ledger.data ? (
                  <InlineError message={d.ledger.error} onRetry={d.ledger.refetch} />
                ) : d.ledger.loading && !d.ledger.data ? (
                  <TableSkeleton rows={8} />
                ) : ledgerRows.length === 0 ? (
                  <EmptyState icon={FileText} title="No transactions" subtitle="No ledger entries for this period." />
                ) : (
                  <>
                    {/* responsive: cards on phones */}
                    <div className="divide-y divide-border/40 md:hidden">
                      {ledgerPaged.map((r, i) => {
                        const debit = Number(r.debit ?? 0)
                        const credit = Number(r.credit ?? 0)
                        const balance = Number(r.balance ?? 0)
                        const target =
                          r.sourceType === 'GRN' && r.sourceId
                            ? `/purchase/grn/detail?id=${r.sourceId}`
                            : r.sourceType === 'PURCHASE_RETURN' && r.sourceId
                              ? `/purchase/debit-notes/detail?id=${r.sourceId}`
                              : null
                        return (
                          <div
                            key={i}
                            className={cn('px-3 py-3 transition-colors hover:bg-muted/20', target && 'cursor-pointer')}
                            onClick={target ? () => navigate(target) : undefined}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-sm font-semibold">{r.ref ?? '—'}</span>
                              <span className="font-mono text-sm font-semibold">{formatLedgerBalance(balance, 'supplier')}</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <span>{r.date ? formatDate(r.date) : '—'}</span>
                              {r.description && <span>· {r.description}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span className="text-[11px]">
                                <span className="text-muted-foreground/70">{LEDGER_COL_BILLED}: </span>
                                <span className="font-mono">{debit > 0 ? formatCurrency(debit) : '—'}</span>
                              </span>
                              <span className="text-[11px]">
                                <span className="text-muted-foreground/70">{LEDGER_COL_PAID}: </span>
                                <span className="font-mono">{credit > 0 ? formatCurrency(credit) : '—'}</span>
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                          <TableRow>
                            <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                            <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference</TableHead>
                            <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</TableHead>
                            <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{LEDGER_COL_BILLED}</TableHead>
                            <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{LEDGER_COL_PAID}</TableHead>
                            <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ledgerPaged.map((r, i) => {
                            const debit = Number(r.debit ?? 0)
                            const credit = Number(r.credit ?? 0)
                            const balance = Number(r.balance ?? 0)
                            const target =
                              r.sourceType === 'GRN' && r.sourceId
                                ? `/purchase/grn/detail?id=${r.sourceId}`
                                : r.sourceType === 'PURCHASE_RETURN' && r.sourceId
                                  ? `/purchase/debit-notes/detail?id=${r.sourceId}`
                                  : null
                            return (
                              <TableRow
                                key={i}
                                className={target ? 'cursor-pointer hover:bg-muted/20' : 'hover:bg-muted/20'}
                                onClick={target ? () => navigate(target) : undefined}
                              >
                                <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{r.date ? formatDate(r.date) : '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 font-mono text-sm">{r.ref ?? '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 text-sm">{r.description ?? '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{debit > 0 ? formatCurrency(debit) : '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{credit > 0 ? formatCurrency(credit) : '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold">{formatLedgerBalance(balance, 'supplier')}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
              {ledgerRows.length > ledgerPageSize && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={ledgerPage}
                    totalPages={Math.max(1, Math.ceil(ledgerRows.length / ledgerPageSize))}
                    onPageChange={setLedgerPage}
                    totalItems={ledgerRows.length}
                    itemsPerPage={ledgerPageSize}
                    pageSize={ledgerPageSize}
                    onPageSizeChange={(n) => { setLedgerPageSize(n); setLedgerPage(1) }}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Activity */}
            <TabsContent value="activity" className="m-0 h-full flex flex-col">
              <ActivityTabContent
                state={d.activities}
                filtered={activityFiltered}
                onOpenDialog={(type, editing) =>
                  setActivityDialog({ open: true, type, editing })
                }
                onMarkDone={(id) =>
                  d.activities.update(id, { status: 'DONE' }).catch(() => {})
                }
                onDelete={(id) =>
                  d.activities.remove(id).catch(() => {})
                }
              />
            </TabsContent>

            {/* Purchase Orders */}
            <TabsContent value="pos" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.pos.error && !d.pos.data ? (
                  <InlineError message={d.pos.error} onRetry={() => d.pos.refetch?.()} />
                ) : d.pos.loading ? (
                  <TableSkeleton rows={8} />
                ) : posPaged.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">No purchase orders</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">This supplier hasn't been issued a PO in this period.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => sup && navigate(`/purchase/orders?supplierId=${sup.id}`)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      New PO
                    </Button>
                  </div>
                ) : (
                <TabListContent
                  state={d.pos}
                  emptyIcon={ClipboardList}
                  emptyTitle="No purchase orders"
                  emptySubtitle="This supplier hasn't been issued a PO in this period."
                  rows={posPaged}
                  renderRow={(po: any) => (
                    <TableRow
                      key={po.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/purchase/orders?poId=${po.id}`)}
                    >
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{po.date ? formatDate(po.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">{po.poNumber}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-center text-sm">{po.items?.length ?? 0}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold">{formatCurrency(Number(po.totalAmount ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2.5"><StatusPill status={po.status} /></TableCell>
                    </TableRow>
                  )}
                  renderCard={(po: any) => (
                    <div
                      key={po.id}
                      className="flex flex-col gap-1.5 px-3 py-3 cursor-pointer transition-colors hover:bg-muted/20"
                      onClick={() => navigate(`/purchase/orders?poId=${po.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{po.poNumber}</span>
                        <span className="font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(Number(po.totalAmount ?? 0))}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{po.date ? formatDate(po.date) : '—'}</span>
                        <span>{po.items?.length ?? 0} items</span>
                      </div>
                      <StatusPill status={po.status} />
                    </div>
                  )}
                  columns={['Date', 'PO #', 'Expected', { label: 'Items', center: true }, { label: 'Total', right: true }, 'Status']}
                />
                )}
              </div>
              {posFiltered.length > posPageSize && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={posPage}
                    totalPages={Math.max(1, Math.ceil(posFiltered.length / posPageSize))}
                    onPageChange={setPosPage}
                    totalItems={posFiltered.length}
                    itemsPerPage={posPageSize}
                    pageSize={posPageSize}
                    onPageSizeChange={(n) => { setPosPageSize(n); setPosPage(1) }}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* GRNs */}
            <TabsContent value="grns" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.grns.error && !d.grns.data ? (
                  <InlineError message={d.grns.error} onRetry={() => d.grns.refetch?.()} />
                ) : d.grns.loading ? (
                  <TableSkeleton rows={8} />
                ) : grnsPaged.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <Receipt className="h-10 w-10 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">No purchase entries</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">No entries in this period.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/purchase/grn')} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      New GRN
                    </Button>
                  </div>
                ) : (
                <TabListContent
                  state={d.grns}
                  emptyIcon={Receipt}
                  emptyTitle="No purchase entries"
                  emptySubtitle="No entries in this period."
                  rows={grnsPaged}
                  renderRow={(g: any) => (
                    <TableRow
                      key={g.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/purchase/grn/detail?id=${g.id}`)}
                    >
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{g.date ? formatDate(g.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">{g.grnNumber}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm">{g.supplierInvoiceNo || '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-center text-sm">{g.items?.length ?? 0}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold">{formatCurrency(Number(g.totalAmount ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2.5"><StatusPill status={g.status} /></TableCell>
                    </TableRow>
                  )}
                  renderCard={(g: any) => (
                    <div
                      key={g.id}
                      className="flex flex-col gap-1.5 px-3 py-3 cursor-pointer transition-colors hover:bg-muted/20"
                      onClick={() => navigate(`/purchase/grn/detail?id=${g.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{g.grnNumber}</span>
                        <span className="font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(Number(g.totalAmount ?? 0))}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{g.date ? formatDate(g.date) : '—'}</span>
                        <span>{g.supplierInvoiceNo || '—'}</span>
                        <span>{g.items?.length ?? 0} items</span>
                      </div>
                      <StatusPill status={g.status} />
                    </div>
                  )}
                  columns={['Date', 'GRN #', 'Supplier Invoice', { label: 'Items', center: true }, { label: 'Value', right: true }, 'Status']}
                />
                )}
              </div>
              {grnsFiltered.length > grnsPageSize && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={grnsPage}
                    totalPages={Math.max(1, Math.ceil(grnsFiltered.length / grnsPageSize))}
                    onPageChange={setGrnsPage}
                    totalItems={grnsFiltered.length}
                    itemsPerPage={grnsPageSize}
                    pageSize={grnsPageSize}
                    onPageSizeChange={(n) => { setGrnsPageSize(n); setGrnsPage(1) }}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Debit Notes */}
            <TabsContent value="dns" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.dns.error && !d.dns.data ? (
                  <InlineError message={d.dns.error} onRetry={() => d.dns.refetch?.()} />
                ) : d.dns.loading ? (
                  <TableSkeleton rows={8} />
                ) : dnsPaged.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <RotateCcw className="h-10 w-10 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">No debit notes</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">No purchase returns / debit notes in this period.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/purchase/returns')} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      New Debit Note
                    </Button>
                  </div>
                ) : (
                <TabListContent
                  state={d.dns}
                  emptyIcon={RotateCcw}
                  emptyTitle="No debit notes"
                  emptySubtitle="No purchase returns / debit notes in this period."
                  rows={dnsPaged}
                  renderRow={(r: any) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/purchase/debit-notes/detail?id=${r.id}`)}
                    >
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{r.date ? formatDate(r.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">{r.debitNoteNo}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm">{r.reason || '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm"><Badge variant="secondary" size="sm">{r.settlementMode || '—'}</Badge></TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(Number(r.totalAmount ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2.5"><StatusPill status={r.status} /></TableCell>
                    </TableRow>
                  )}
                  renderCard={(r: any) => (
                    <div
                      key={r.id}
                      className="flex flex-col gap-1.5 px-3 py-3 cursor-pointer transition-colors hover:bg-muted/20"
                      onClick={() => navigate(`/purchase/debit-notes/detail?id=${r.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{r.debitNoteNo}</span>
                        <span className="font-mono text-sm font-semibold whitespace-nowrap text-rose-600 dark:text-rose-400">{formatCurrency(Number(r.totalAmount ?? 0))}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{r.date ? formatDate(r.date) : '—'}</span>
                        <span>{r.reason || '—'}</span>
                        <Badge variant="secondary" size="sm">{r.settlementMode || '—'}</Badge>
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                  )}
                  columns={['Date', 'DN #', 'Reason', 'Settlement', { label: 'Amount', right: true }, 'Status']}
                />
                )}
              </div>
              {dnsFiltered.length > dnsPageSize && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={dnsPage}
                    totalPages={Math.max(1, Math.ceil(dnsFiltered.length / dnsPageSize))}
                    onPageChange={setDnsPage}
                    totalItems={dnsFiltered.length}
                    itemsPerPage={dnsPageSize}
                    pageSize={dnsPageSize}
                    onPageSizeChange={(n) => { setDnsPageSize(n); setDnsPage(1) }}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Batches */}
            <TabsContent value="batches" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.supplier.loading && !sup ? (
                  <TableSkeleton rows={8} />
                ) : sortedBatches.length === 0 ? (
                  <EmptyState icon={Layers} title="No batches" subtitle="No batches received from this supplier yet." />
                ) : (
                  <>
                    {/* responsive: cards on phones */}
                    <div className="divide-y divide-border/40 md:hidden">
                      {batchPaged.map((b) => {
                        const days = b.expiryDate ? Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86400000) : null
                        const expiryColor = days === null ? 'text-muted-foreground/60' : days < 0 ? 'text-rose-600 dark:text-rose-400' : days <= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        const stockValue = b.quantity * Number(b.purchaseRate ?? 0)
                        return (
                          <div key={b.id} className="px-3 py-3 transition-colors hover:bg-muted/20">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium">{b.productName || b.product?.name || '—'}</span>
                              <span className="font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(stockValue)}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Batch</div>
                                <div className="font-mono text-[11px]">{b.batchNumber}</div>
                              </div>
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Expiry</div>
                                <div className={cn('text-[11px] font-semibold', expiryColor)}>
                                  {b.expiryDate ? formatDate(b.expiryDate) : '—'}
                                  {days !== null && days < 0 && ' (expired)'}
                                  {days !== null && days >= 0 && days <= 90 && ` (${days}d)`}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Qty</div>
                                <div className="font-mono text-[11px]">{b.quantity}</div>
                              </div>
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Rate</div>
                                <div className="text-[11px]">{formatCurrency(Number(b.purchaseRate ?? 0))}</div>
                              </div>
                              <div>
                                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">MRP</div>
                                <div className="text-[11px]">{formatCurrency(Number(b.mrp ?? 0))}</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                          <TableRow>
                            <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                            <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch #</TableHead>
                            <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mfg</TableHead>
                            <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expiry</TableHead>
                            <TableHead className="h-9 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                            <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                            <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">MRP</TableHead>
                            <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batchPaged.map((b) => {
                            const days = b.expiryDate ? Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86400000) : null
                            const expiryColor = days === null ? 'text-muted-foreground/60' : days < 0 ? 'text-rose-600 dark:text-rose-400' : days <= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                            const stockValue = b.quantity * Number(b.purchaseRate ?? 0)
                            return (
                              <TableRow key={b.id} className="hover:bg-muted/20">
                                <TableCell className="px-3 py-2 text-sm">{b.productName || b.product?.name || '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 font-mono text-sm">{b.batchNumber}</TableCell>
                                <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{b.mfgDate ? formatDate(b.mfgDate) : '—'}</TableCell>
                                <TableCell className={cn('px-3 py-2.5 text-sm font-semibold whitespace-nowrap', expiryColor)}>
                                  {b.expiryDate ? formatDate(b.expiryDate) : '—'}
                                  {days !== null && days < 0 && ' (expired)'}
                                  {days !== null && days >= 0 && days <= 90 && ` (${days}d)`}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-center font-mono text-xs">{b.quantity}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{formatCurrency(Number(b.purchaseRate ?? 0))}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-sm text-muted-foreground">{formatCurrency(Number(b.mrp ?? 0))}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold">{formatCurrency(stockValue)}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
              {sortedBatches.length > batchPageSize && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={batchPage}
                    totalPages={Math.max(1, Math.ceil(sortedBatches.length / batchPageSize))}
                    onPageChange={setBatchPage}
                    totalItems={sortedBatches.length}
                    itemsPerPage={batchPageSize}
                    pageSize={batchPageSize}
                    onPageSizeChange={(n) => { setBatchPageSize(n); setBatchPage(1) }}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Edit dialog */}
      <SupplierFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingSupplier={sup as Supplier | null}
        onSaved={handleEditSaved}
      />

      {/* Activity dialog */}
      <SupplierActivityDialog
        open={activityDialog.open}
        onOpenChange={(open) => setActivityDialog((s) => ({ ...s, open }))}
        type={activityDialog.type}
        editing={activityDialog.editing}
        onSubmit={async (payload) => {
          if (activityDialog.editing) {
            await d.activities.update(activityDialog.editing.id, payload)
          } else {
            await d.activities.create(payload)
          }
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Local helper components (mirrors SupplierDetailPage)
// ─────────────────────────────────────────────────────────────

function pickKpi(kpis: Array<{ label: string; value: string | number }>, label: string): string {
  const k = kpis.find((x) => x.label.toLowerCase() === label.toLowerCase())
  return k?.value !== undefined ? String(k.value) : '—'
}

function currentTabCountLabel(
  activeTab: 'overview' | 'ledger' | 'activity' | 'pos' | 'grns' | 'dns' | 'batches',
  ledgerCount: number,
  posCount: number,
  grnsCount: number,
  dnsCount: number,
  activityCount: number,
  d: { ledger: { loading: boolean }; pos: { loading: boolean }; grns: { loading: boolean }; dns: { loading: boolean }; activities: { loading: boolean } },
): string {
  switch (activeTab) {
    case 'ledger':   return d.ledger.loading     ? 'Loading…' : `${ledgerCount} transaction${ledgerCount !== 1 ? 's' : ''}`
    case 'pos':      return d.pos.loading        ? 'Loading…' : `${posCount} PO${posCount !== 1 ? 's' : ''}`
    case 'grns':     return d.grns.loading       ? 'Loading…' : `${grnsCount} PE${grnsCount !== 1 ? 's' : ''}`
    case 'dns':      return d.dns.loading        ? 'Loading…' : `${dnsCount} debit note${dnsCount !== 1 ? 's' : ''}`
    case 'activity': return d.activities.loading ? 'Loading…' : `${activityCount} activit${activityCount !== 1 ? 'ies' : 'y'}`
    default: return ''
  }
}

function OverviewSection({ icon: Icon, title, children }: { icon: typeof Package; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2.5 border-b border-border/50 pb-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function OverviewPanelSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium wrap-break-word', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return <span className="text-muted-foreground/40">—</span>
  const variant = (STATUS_COLORS[status] ?? 'secondary') as any
  return <Badge variant={variant} size="sm" dot>{status.replace(/_/g, ' ')}</Badge>
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: typeof Package; title: string; subtitle?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
        <Icon className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground/60">{subtitle}</p>}
      </div>
    </div>
  )
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  )
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

function TabListContent({
  state,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  rows,
  renderRow,
  renderCard,
  columns,
}: {
  state: { data: any[] | null; loading: boolean; error: string | null; attempted?: boolean; refetch?: () => void }
  emptyIcon: typeof Package
  emptyTitle: string
  emptySubtitle?: string
  rows: any[]
  renderRow: (row: any) => React.ReactNode
  renderCard?: (row: any) => React.ReactNode
  columns: Array<string | { label: string; center?: boolean; right?: boolean }>
}) {
  if (state.error && !state.data) {
    return <InlineError message={state.error} onRetry={() => state.refetch?.()} />
  }
  if (state.loading) return <TableSkeleton rows={8} />
  if (!state.data || state.data.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} />
  }
  const table = (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
        <TableRow>
          {columns.map((c, i) => {
            const isObj = typeof c === 'object'
            const label = isObj ? c.label : c
            const align = isObj && c.center ? 'text-center' : isObj && c.right ? 'text-right' : ''
            return (
              <TableHead key={i} className={cn('h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground', align)}>
                {label}
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>{rows.map(renderRow)}</TableBody>
    </Table>
  )
  // Fall back to the plain table when no card renderer is supplied.
  if (!renderCard) return table
  return (
    <>
      {/* responsive: cards on phones */}
      <div className="divide-y divide-border/40 md:hidden">{rows.map(renderCard)}</div>
      <div className="hidden md:block">{table}</div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Activity Tab
// ─────────────────────────────────────────────────────────────

const ACTIVITY_META: Record<
  SAType,
  { label: string; icon: typeof Phone; chip: string; btnTone: string }
> = {
  CALL: {
    label: 'Call',
    icon: Phone,
    chip: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
    btnTone: 'border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-300 dark:hover:bg-blue-500/10',
  },
  WHATSAPP: {
    label: 'WhatsApp',
    icon: MessageCircle,
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    btnTone: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10',
  },
  EMAIL: {
    label: 'Email',
    icon: Mail,
    chip: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30',
    btnTone: 'border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10',
  },
  NOTE: {
    label: 'Note',
    icon: StickyNote,
    chip: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30',
    btnTone: 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-500/40 dark:text-slate-300 dark:hover:bg-slate-500/10',
  },
  REMINDER: {
    label: 'Reminder',
    icon: Clock,
    chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    btnTone: 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10',
  },
}

function relativeTime(iso?: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diffMs = t - Date.now()
  const abs = Math.abs(diffMs)
  const minute = 60_000, hour = 3_600_000, day = 86_400_000
  const fmt = (n: number, unit: string) => `${n} ${unit}${n !== 1 ? 's' : ''}`
  let str: string
  if (abs < hour) str = fmt(Math.max(1, Math.round(abs / minute)), 'minute')
  else if (abs < day) str = fmt(Math.round(abs / hour), 'hour')
  else str = fmt(Math.round(abs / day), 'day')
  return diffMs < 0 ? `${str} ago` : `in ${str}`
}

function ActivityTabContent({
  state,
  filtered,
  onOpenDialog,
  onMarkDone,
  onDelete,
}: {
  state: { data: SupplierActivity[] | null; loading: boolean; error: string | null; attempted?: boolean; refetch?: () => void }
  filtered: SupplierActivity[]
  onOpenDialog: (type: SAType, editing: SupplierActivity | null) => void
  onMarkDone: (id: string) => void
  onDelete: (id: string) => void
}) {
  const types: SAType[] = ['CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'REMINDER']
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 border-b border-border/40 bg-muted/5 px-3 sm:px-5 py-2.5">
        {types.map((t) => {
          const meta = ACTIVITY_META[t]
          const Icon = meta.icon
          return (
            <Button
              key={t}
              size="sm"
              variant="outline"
              className={cn('h-8 w-full gap-1.5 text-xs', meta.btnTone)}
              onClick={() => onOpenDialog(t, null)}
            >
              <Icon className="h-3.5 w-3.5" />
              {t === 'REMINDER' ? 'Reminder' : `Log ${meta.label}`}
            </Button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {state.error && !state.data ? (
          <InlineError message={state.error} onRetry={() => state.refetch?.()} />
        ) : state.loading && !state.data ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No activity logged yet"
            subtitle="Use the buttons above to log a call, WhatsApp, email, note, or schedule a reminder."
          />
        ) : (
          <ol className="divide-y divide-border/40">
            {filtered.map((a) => (
              <ActivityRow
                key={a.id}
                activity={a}
                onEdit={() => onOpenDialog(a.type, a)}
                onMarkDone={() => onMarkDone(a.id)}
                onDelete={() => onDelete(a.id)}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function ActivityRow({
  activity,
  onEdit,
  onMarkDone,
  onDelete,
}: {
  activity: SupplierActivity
  onEdit: () => void
  onMarkDone: () => void
  onDelete: () => void
}) {
  const meta = ACTIVITY_META[activity.type]
  const Icon = meta.icon
  const isReminder = activity.type === 'REMINDER'
  const dueMs = activity.dueAt ? new Date(activity.dueAt).getTime() - Date.now() : 0
  const isOverdue = isReminder && activity.status === 'PENDING' && activity.dueAt && dueMs < 0
  const isDueSoon = isReminder && activity.status === 'PENDING' && activity.dueAt && dueMs >= 0 && dueMs < 7 * 86_400_000

  const chipClass = isReminder
    ? isOverdue
      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30'
      : isDueSoon
        ? meta.chip
        : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30'
    : meta.chip

  return (
    <li className="px-5 py-3 hover:bg-muted/20">
      <div className="flex gap-3">
        <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border', chipClass)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold">{meta.label}</span>
            {isReminder && activity.title && <span className="text-sm font-medium">· {activity.title}</span>}
            {!isReminder && activity.contactName && (
              <span className="text-xs text-muted-foreground">· {activity.contactName}</span>
            )}
            {activity.type === 'EMAIL' && activity.subject && (
              <span className="text-xs text-muted-foreground">· Subject: {activity.subject}</span>
            )}
            {isReminder && (
              <Badge
                variant={
                  activity.status === 'DONE' ? 'success' : activity.status === 'CANCELLED' ? 'secondary' : isOverdue ? 'destructive' : 'warning'
                }
                size="sm"
              >
                {activity.status ?? 'PENDING'}
              </Badge>
            )}
            {isReminder && activity.dueAt && (
              <span className={cn('text-[11px] font-medium', isOverdue ? 'text-rose-600 dark:text-rose-400' : isDueSoon ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                Due {relativeTime(activity.dueAt)}
              </span>
            )}
            {!isReminder && activity.occurredAt && (
              <span className="text-[11px] text-muted-foreground">{formatDate(activity.occurredAt)}</span>
            )}
          </div>
          {activity.notes && (
            <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/90">{activity.notes}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>by {activity.createdBy?.name ?? 'Unknown'}</span>
            <span>· {relativeTime(activity.createdAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          {isReminder && activity.status === 'PENDING' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={onMarkDone}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark Done
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="h-7 w-7" aria-label="Activity menu">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onSelect={onEdit} className="cursor-pointer text-xs">
                <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} className="cursor-pointer text-xs text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}
