import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
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
import { ExportMenu } from '@/components/shared/ExportMenu'
import { SupplierFormDialog, type SupplierFormValues } from '@/components/shared/SupplierFormDialog'
import {
  SupplierActivityDialog,
  type SupplierActivity,
  type SupplierActivityType as SAType,
} from '@/components/shared/SupplierActivityDialog'

import { navigate, goBack, useRoute } from '@/lib/router'
import { cn, formatCurrency, formatDate, formatLedgerBalance, LEDGER_COL_BILLED, LEDGER_COL_PAID } from '@/lib/utils'
import type { Supplier } from '@/types'
import { useSupplierDetail } from '@/hooks/useSupplierDetail'

// ─────────────────────────────────────────────────────────────
// Local types needed by the page-level helpers only
// ─────────────────────────────────────────────────────────────

type Kpi = { label: string; value: string | number }

type LazyState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  attempted: boolean
}

// ─────────────────────────────────────────────────────────────
// Page component — pure presentation; all HTTP lives in the hook.
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 15

// ── Ledger period presets ─────────────────────────────────
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

/** Bundled period state for tabs that need a per-tab filter. */
type TabPeriod = { preset: PeriodPreset; from: string; to: string }

/** Inclusive-of-end-day filter on a list whose items have a string `date` field. */
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

/** Convert a preset into ISO YYYY-MM-DD `from`/`to`. Returns empty strings for 'all'/'custom'. */
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

export default function SupplierDetailPage() {
  const { path, search } = useRoute()
  const supplierId = new URLSearchParams(search).get('supplierId') ?? ''

  const d = useSupplierDetail(supplierId)
  const SUP_TAB_KEYS = ['overview', 'ledger', 'activity', 'pos', 'grns', 'dns', 'batches'] as const
  type SupplierTab = typeof SUP_TAB_KEYS[number]
  const tabFromUrl = new URLSearchParams(search).get('tab') ?? ''
  const [activeTab, setActiveTab] = useState<SupplierTab>(
    (SUP_TAB_KEYS as readonly string[]).includes(tabFromUrl) ? (tabFromUrl as SupplierTab) : 'overview',
  )
  // Keep the active tab in the URL so browser Back — e.g. returning from a PE
  // (GRN) detail page — restores the same tab instead of resetting to Overview.
  useEffect(() => {
    const params = new URLSearchParams(search)
    if (params.get('tab') !== activeTab) {
      params.set('tab', activeTab)
      navigate(`${path}?${params.toString()}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])
  const [editOpen, setEditOpen] = useState(false)

  // Activity tab UI state — type filter, dialog target, edit target.
  const [activityTypeFilter, setActivityTypeFilter] = useState<'ALL' | SAType>('ALL')
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; type: SAType; editing: SupplierActivity | null }>({
    open: false,
    type: 'NOTE',
    editing: null,
  })

  // Per-tab period filter state. Each transactional tab keeps its own range so
  // setting "Last 7 Days" on POs doesn't accidentally narrow your GRN view.
  // The dropdown in the tab row reads/writes whichever state matches activeTab.
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [posPeriod, setPosPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [grnsPeriod, setGrnsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [dnsPeriod, setDnsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [activityPeriod, setActivityPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })

  /**
   * Single source of truth for the "what period filter is active on the current tab"
   * question. The tab-row dropdown reads/writes from this so the same button works
   * for whichever transactional tab the user happens to be on, and each tab still
   * keeps its own independent state.
   */
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

  const sup = d.supplier.data
  const kpis = d.ledger.data?.kpis ?? []

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

  // Derived/sorted lists (memoised)
  const ledgerRows = d.ledger.data?.tableData ?? []
  const sortedBatches = useMemo(() => {
    const list = sup?.batches ?? []
    return [...list].sort((a, b) => {
      const ad = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity
      const bd = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity
      return ad - bd
    })
  }, [sup?.batches])

  // Period-filtered lists for POs / GRNs / DNs (cheap client-side filter, runs
  // only when the underlying data or the period state changes).
  const posFiltered = useMemo(() => filterByPeriod(d.pos.data ?? [], posPeriod), [d.pos.data, posPeriod])
  const grnsFiltered = useMemo(() => filterByPeriod(d.grns.data ?? [], grnsPeriod), [d.grns.data, grnsPeriod])
  const dnsFiltered = useMemo(() => filterByPeriod(d.dns.data ?? [], dnsPeriod), [d.dns.data, dnsPeriod])

  // Activity: type filter THEN period filter. Period is matched against
  // `createdAt` so the same dropdown semantics work for both past interactions
  // (occurredAt ≈ createdAt) and reminders (dueAt may be in the future).
  const activityFiltered = useMemo(() => {
    const all = d.activities.data ?? []
    const byType = activityTypeFilter === 'ALL' ? all : all.filter((a) => a.type === activityTypeFilter)
    return filterByPeriod(
      byType.map((a) => ({ ...a, date: a.createdAt })),
      activityPeriod,
    )
  }, [d.activities.data, activityTypeFilter, activityPeriod])

  // Reset to first page when its period filter changes (otherwise you could
  // land on page 4 of a list that just shrunk to a single page).
  useEffect(() => { setPosPage(1) }, [posPeriod])
  useEffect(() => { setGrnsPage(1) }, [grnsPeriod])
  useEffect(() => { setDnsPage(1) }, [dnsPeriod])

  const ledgerPaged = ledgerRows.slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize)
  const posPaged = posFiltered.slice((posPage - 1) * posPageSize, posPage * posPageSize)
  const grnsPaged = grnsFiltered.slice((grnsPage - 1) * grnsPageSize, grnsPage * grnsPageSize)
  const dnsPaged = dnsFiltered.slice((dnsPage - 1) * dnsPageSize, dnsPage * dnsPageSize)
  const batchPaged = sortedBatches.slice((batchPage - 1) * batchPageSize, batchPage * batchPageSize)

  // ── Render guards ──────────────────────────────────────────
  if (!supplierId) {
    return (
      <div className="flex h-content-viewport items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-2 text-sm">No supplier ID provided</p>
          <Button className="mt-4" onClick={() => goBack('/purchase/suppliers')}>Back to Suppliers</Button>
        </div>
      </div>
    )
  }

  // Edit-save optimistic handler — merge patch into displayed supplier immediately,
  // then re-fetch silently in the background for the canonical server copy.
  const handleEditSaved = (values: SupplierFormValues, _mode: 'create' | 'update') => {
    d.supplier.applyPatch(values as Partial<Supplier>)
    void d.supplier.refetch()
  }

  // Export the current ledger view (PDF / Excel / Print). Pulls from
  // `ledgerRows` which is already period-filtered server-side via the period
  // dropdown — so the file matches exactly what's on screen. Mirrors the
  // handler shape used by accounting/LedgerPage so we stay consistent.
  const ledgerPeriodLabel =
    d.ledger.from && d.ledger.to
      ? ` (${d.ledger.from} → ${d.ledger.to})`
      : ''
  const ledgerSafeName = (sup?.name ?? 'supplier').replace(/[^a-z0-9-_]+/gi, '_')
  const ledgerExportRows = () => ledgerRows.map((r) => ({
    Date: r.date ? formatDate(r.date) : '',
    Reference: r.ref ?? '',
    Description: r.description ?? '',
    [LEDGER_COL_BILLED]: Number(r.debit ?? 0) || '',
    [LEDGER_COL_PAID]: Number(r.credit ?? 0) || '',
    Balance: Number(r.balance ?? 0),
  }))

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 border-b border-border/40 bg-background px-5 py-3">
        {/* responsive: stack identity above the export/edit actions on phones so
            the supplier name isn't squeezed out; single row at sm+ */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => goBack('/purchase/suppliers')}
              className="mt-0.5 shrink-0"
              aria-label="Back to Suppliers"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              {d.supplier.loading && !sup ? (
                <Skeleton className="h-5 w-56" />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold tracking-tight truncate">{sup?.name ?? '—'}</h1>
                  {sup && (
                    <Badge variant={sup.isActive ? 'success' : 'secondary'} size="sm" dot>
                      {sup.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  )}
                </div>
              )}
              {/* Contact info intentionally removed from header — full contact
                  details live in the persistent Overview panel on the left. */}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Ledger exports — operate on whatever is currently in the Ledger
                tab, so the period dropdown above doubles as the report's date
                filter. Disabled until the ledger has loaded at least once. */}
            <ExportMenu
              title={`Supplier Ledger — ${sup?.name ?? '—'}${ledgerPeriodLabel}`}
              filename={`ledger-${ledgerSafeName}`}
              noun="entry"
              disabled={!d.ledger.data}
              rows={ledgerExportRows}
            />
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={!sup}>
              <Edit2 className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      {/* ── Full-width Tabs (Overview is now the first tab) ── */}
      <div className="flex flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex flex-1 flex-col overflow-hidden min-w-0"
        >
          {/* Tab row — tabs get the full row to themselves; the period dropdown +
              activity-only Type filter / per-tab action button sit on their OWN row
              below (order-2), at every screen size. This used to collapse onto one
              row from xl up, but with 7 tabs that row still needed its own
              horizontal scrollbar even on wide desktop monitors — and the filter
              cluster, released from a `contents` wrapper, was landing BEFORE the
              tabs instead of after (it had no explicit `order`, so it lost to the
              tabs list's `order-1`). Splitting the rows unconditionally fixes both:
              tabs always get full width, and the action row is always in the
              right place. */}
          <div className="shrink-0 border-b border-border/40 bg-background flex flex-wrap items-center gap-2 px-3 sm:px-5">
            <div className="order-1 w-full min-w-0 overflow-x-auto">
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

            <div className="order-2 flex w-full flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-1.5">

            {/* Activity-only quick-log buttons — desktop only (xl+). Below xl these
                same actions live inside ActivityTabContent instead, icon-only and
                pinned to the bottom of the tab (see that component for why). */}
            {activeTab === 'activity' && (
              <div className="hidden items-center gap-1.5 xl:flex">
                {(['CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'REMINDER'] as SAType[]).map((t) => {
                  const meta = ACTIVITY_META[t]
                  const Icon = meta.icon
                  return (
                    <Button
                      key={t}
                      size="sm"
                      variant="outline"
                      className={cn('h-8 shrink-0 gap-1.5 text-xs my-1.5', meta.btnTone)}
                      onClick={() => setActivityDialog({ open: true, type: t, editing: null })}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t === 'REMINDER' ? 'Reminder' : `Log ${meta.label}`}
                    </Button>
                  )
                })}
              </div>
            )}

            {/* Activity-only Type filter — uses the same DropdownMenu + Button
                trigger as the period dropdown so both per-tab controls share
                one visual language. */}
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
                    <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 my-1.5">
                      <Filter className="h-3.5 w-3.5" />
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

            {/* POs-only New button — same slot/pattern used elsewhere for a
                per-tab primary action. Was missing entirely; this tab had no
                way to create a purchase order for this supplier. */}
            {activeTab === 'pos' && (
              <Button
                size="sm"
                onClick={() => navigate('/purchase/orders?add=1')}
                className="h-8 shrink-0 gap-1.5 my-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                New Purchase Order
              </Button>
            )}

            {/* Period dropdown — only on transactional tabs (Batches has no period filter). */}
            {currentPeriod && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 my-1.5">
                    <Calendar className="h-3.5 w-3.5" />
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
            </div>
          </div>

          {/* Date-picker strip — only renders when the user explicitly picks
              "Custom Range" from the period dropdown. All other presets are
              self-explanatory from the button label so no extra row is needed. */}
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
              <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">{currentTabCountLabel(activeTab, ledgerRows.length, posFiltered.length, grnsFiltered.length, dnsFiltered.length, activityFiltered.length, d)}</span>
            </div>
          )}

        {/* Tab content area — only this scrolls */}
        <div className="flex-1 overflow-hidden">
          {/* ── Overview ── full-width supplier profile (was the left sidebar) */}
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
                        <Row label="Total Purchases" value={pickKpi(kpis, 'Total Purchases')} mono />
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
                        <Row label="Total Returns" value={pickKpi(kpis, 'Total Returns')} mono />
                        <Row label="Open POs" value={pickKpi(kpis, 'Open POs')} mono />
                        {sup.bankDetails && <Row label="Bank" value={sup.bankDetails} mono />}
                      </OverviewSection>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          {/* ── Ledger ── (toolbar moved to the tab row above) */}
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

          {/* (Overview is now a persistent left-pane panel, no longer a tab.) */}

          {/* ── Activity ── */}
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

          {/* ── Purchase Orders ── */}
          <TabsContent value="pos" className="m-0 h-full flex flex-col">
            <div className="flex-1 overflow-auto">
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

          {/* ── GRNs ── */}
          <TabsContent value="grns" className="m-0 h-full flex flex-col">
            <div className="flex-1 overflow-auto">
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

          {/* ── Debit Notes ── */}
          <TabsContent value="dns" className="m-0 h-full flex flex-col">
            <div className="flex-1 overflow-auto">
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

          {/* ── Batches ── */}
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

      {/* Edit dialog — shared with the list page */}
      <SupplierFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingSupplier={sup as Supplier | null}
        onSaved={handleEditSaved}
      />

      {/* Activity create/edit dialog — single component, all 5 types */}
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
// Small presentational helpers
// ─────────────────────────────────────────────────────────────

function pickKpi(kpis: Kpi[], label: string): string {
  const k = kpis.find((x) => x.label.toLowerCase() === label.toLowerCase())
  return k?.value !== undefined ? String(k.value) : '—'
}

/** Right-aligned record count text for the slim strip under the tabs. */
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

/** Section header + fields for an Overview card. */
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


// Shared list-tab content (handles loading / error / empty + renders table chrome)
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
  state: LazyState<any[]> & { ensureLoaded: () => Promise<void>; refetch?: () => void }
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
// Activity Tab — quick-log toolbar + timeline list
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

/** Human-friendly relative time ("2 days ago", "in 3 days"). */
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
  state: LazyState<SupplierActivity[]> & { refetch?: () => void }
  filtered: SupplierActivity[]
  onOpenDialog: (type: SAType, editing: SupplierActivity | null) => void
  onMarkDone: (id: string) => void
  onDelete: (id: string) => void
}) {
  const types: SAType[] = ['CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'REMINDER']
  return (
    <div className="flex h-full flex-col">
      {/* Quick-log toolbar — phone and tablet only (below xl). Icon-only, pinned
          to the BOTTOM of the tab via `order`. At xl+ this is hidden entirely —
          the same actions are merged into the tab-row filter cluster above
          (text-labeled, alongside the Type/Period dropdowns) so everything
          sits in one row on desktop instead of two. */}
      <div className="order-2 xl:hidden shrink-0 grid grid-cols-5 gap-2 border-b border-border/40 bg-muted/5 px-3 sm:px-5 py-2.5">
        {types.map((t) => {
          const meta = ACTIVITY_META[t]
          const Icon = meta.icon
          const label = t === 'REMINDER' ? 'Reminder' : `Log ${meta.label}`
          return (
            <Button
              key={t}
              size="sm"
              variant="outline"
              className={cn('h-8 w-full gap-1.5 text-xs', meta.btnTone)}
              onClick={() => onOpenDialog(t, null)}
              aria-label={label}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          )
        })}
      </div>

      <div className="order-1 flex-1 overflow-auto">
        {state.error && !state.data ? (
          <InlineError message={state.error} onRetry={() => state.refetch?.()} />
        ) : state.loading && !state.data ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No activity logged yet"
            subtitle="Log a call, WhatsApp, email, note, or schedule a reminder to get started."
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

  // Override the chip colour for reminders based on urgency.
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
