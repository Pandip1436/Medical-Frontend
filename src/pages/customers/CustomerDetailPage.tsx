import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  Edit2,
  MapPin,
  FileBadge,
  Banknote,
  User,
  AlertTriangle,
  RotateCcw,
  Calendar,
  ChevronDown,
  Package,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Receipt,
  FileText,
  FileSignature,
  Stethoscope,
  MessageSquare,
  Phone,
  MessageCircle,
  Mail,
  StickyNote,
  Clock,
  CheckCircle2,
  Trash2,
  MoreHorizontal,
  FileDown,
  FileSpreadsheet,
  Printer,
  Filter,
  Upload,
  Eye,
  X,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { CustomerFormDialog, type CustomerFormValues } from '@/components/shared/CustomerFormDialog'
import {
  SupplierActivityDialog,
  type SupplierActivity,
  type SupplierActivityType as SAType,
} from '@/components/shared/SupplierActivityDialog'

import { navigate, useRoute } from '@/lib/router'
import api, { API_SERVER_URL } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { exportToCsv, exportToPdf, printReport } from '@/lib/exportUtils'
import type { Customer } from '@/types'
import { useCustomerDetail } from '@/hooks/useCustomerDetail'

// ─────────────────────────────────────────────────────────────
// Types & constants — kept local to this page (mirrors SupplierDetailPage).
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 15

type PeriodPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'thisQuarter'
  | 'custom'

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
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  ACCEPTED: 'success',
  REJECTED: 'destructive',
  CONVERTED: 'purple',
  PAID: 'success',
  UNPAID: 'warning',
  PARTIAL: 'warning',
  CREDIT: 'warning',
  CANCELLED: 'secondary',
  SETTLED: 'success',
  PENDING: 'warning',
}

const TYPE_BADGE_VARIANT: Record<string, 'success' | 'purple' | 'warning' | 'secondary'> = {
  RETAIL: 'success',
  WHOLESALE: 'purple',
  DOCTOR: 'warning',
}

export default function CustomerDetailPage() {
  const { search } = useRoute()
  const customerId = new URLSearchParams(search).get('customerId') ?? ''

  const d = useCustomerDetail(customerId)
  const [activeTab, setActiveTab] = useState<
    'ledger' | 'activity' | 'invoices' | 'creditNotes' | 'payments' | 'quotations' | 'rx'
  >('ledger')
  const [editOpen, setEditOpen] = useState(false)

  // Activity tab UI state — type filter, dialog target, edit target.
  const [activityTypeFilter, setActivityTypeFilter] = useState<'ALL' | SAType>('ALL')
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; type: SAType; editing: SupplierActivity | null }>({
    open: false,
    type: 'NOTE',
    editing: null,
  })

  // Rx upload dialog state lifted into the parent so the tab-row "Upload Rx"
  // button can trigger it (mirrors the activity quick-log pattern).
  const [rxUploadOpen, setRxUploadOpen] = useState(false)

  // Per-tab period filter state.
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [invoicesPeriod, setInvoicesPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [creditNotesPeriod, setCreditNotesPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [paymentsPeriod, setPaymentsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [quotationsPeriod, setQuotationsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [activityPeriod, setActivityPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })

  // Single source of truth for the "what period filter is active on the current tab"
  // question. Same accessor pattern as SupplierDetailPage.
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
    if (activeTab === 'invoices') return { period: invoicesPeriod, setPeriod: setInvoicesPeriod }
    if (activeTab === 'creditNotes') return { period: creditNotesPeriod, setPeriod: setCreditNotesPeriod }
    if (activeTab === 'payments') return { period: paymentsPeriod, setPeriod: setPaymentsPeriod }
    if (activeTab === 'quotations') return { period: quotationsPeriod, setPeriod: setQuotationsPeriod }
    if (activeTab === 'activity') return { period: activityPeriod, setPeriod: setActivityPeriod }
    return null
  })()

  // Trigger lazy loads when their tab becomes active
  useEffect(() => {
    if (activeTab === 'invoices') void d.invoices.ensureLoaded()
    if (activeTab === 'creditNotes') void d.creditNotes.ensureLoaded()
    if (activeTab === 'payments') void d.payments.ensureLoaded()
    if (activeTab === 'quotations') void d.quotations.ensureLoaded()
    if (activeTab === 'rx') void d.prescriptions.ensureLoaded()
    if (activeTab === 'activity') void d.activities.ensureLoaded()
  }, [activeTab, d.invoices, d.creditNotes, d.payments, d.quotations, d.prescriptions, d.activities])

  const cust = d.customer.data
  const kpis = d.ledger.data?.kpis ?? []
  const outstanding = cust?.currentOutstanding ?? 0

  // Per-tab pagination state
  const [ledgerPage, setLedgerPage] = useState(1)
  const [invoicesPage, setInvoicesPage] = useState(1)
  const [creditNotesPage, setCreditNotesPage] = useState(1)
  const [paymentsPage, setPaymentsPage] = useState(1)
  const [quotationsPage, setQuotationsPage] = useState(1)
  const [rxPage, setRxPage] = useState(1)
  useEffect(() => {
    setLedgerPage(1); setInvoicesPage(1); setCreditNotesPage(1)
    setPaymentsPage(1); setQuotationsPage(1); setRxPage(1)
  }, [customerId])

  // Derived/sorted lists (memoised)
  const ledgerRows = d.ledger.data?.tableData ?? []

  // Period-filtered lists for the per-tab dropdown.
  const invoicesFiltered = useMemo(
    () => filterByPeriod(d.invoices.data ?? [], invoicesPeriod),
    [d.invoices.data, invoicesPeriod],
  )
  const creditNotesFiltered = useMemo(
    () => filterByPeriod(d.creditNotes.data ?? [], creditNotesPeriod),
    [d.creditNotes.data, creditNotesPeriod],
  )
  const paymentsFiltered = useMemo(
    () => filterByPeriod(
      (d.payments.data ?? []).map((p) => ({ ...p, date: p.createdAt ?? p.date })),
      paymentsPeriod,
    ),
    [d.payments.data, paymentsPeriod],
  )
  const quotationsFiltered = useMemo(
    () => filterByPeriod(d.quotations.data ?? [], quotationsPeriod),
    [d.quotations.data, quotationsPeriod],
  )
  const activityFiltered = useMemo(() => {
    const all = d.activities.data ?? []
    const byType = activityTypeFilter === 'ALL' ? all : all.filter((a) => a.type === activityTypeFilter)
    return filterByPeriod(
      byType.map((a) => ({ ...a, date: a.createdAt })),
      activityPeriod,
    )
  }, [d.activities.data, activityTypeFilter, activityPeriod])

  // Reset to first page when its period filter changes
  useEffect(() => { setInvoicesPage(1) }, [invoicesPeriod])
  useEffect(() => { setCreditNotesPage(1) }, [creditNotesPeriod])
  useEffect(() => { setPaymentsPage(1) }, [paymentsPeriod])
  useEffect(() => { setQuotationsPage(1) }, [quotationsPeriod])

  const ledgerPaged = ledgerRows.slice((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE)
  const invoicesPaged = invoicesFiltered.slice((invoicesPage - 1) * PAGE_SIZE, invoicesPage * PAGE_SIZE)
  const creditNotesPaged = creditNotesFiltered.slice((creditNotesPage - 1) * PAGE_SIZE, creditNotesPage * PAGE_SIZE)
  const paymentsPaged = paymentsFiltered.slice((paymentsPage - 1) * PAGE_SIZE, paymentsPage * PAGE_SIZE)
  const quotationsPaged = quotationsFiltered.slice((quotationsPage - 1) * PAGE_SIZE, quotationsPage * PAGE_SIZE)
  const rxList = d.prescriptions.data ?? []
  const rxPaged = rxList.slice((rxPage - 1) * PAGE_SIZE, rxPage * PAGE_SIZE)

  // ── Render guards ──────────────────────────────────────────
  if (!customerId) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-2 text-sm">No customer ID provided</p>
          <Button className="mt-4" onClick={() => navigate('/customers')}>Back to Customers</Button>
        </div>
      </div>
    )
  }

  // Edit-save optimistic handler — merge patch into displayed customer immediately,
  // then re-fetch silently in the background for the canonical server copy.
  const handleEditSaved = (values: CustomerFormValues, _mode: 'create' | 'update') => {
    d.customer.applyPatch(values as Partial<Customer>)
    void d.customer.refetch()
  }

  // Export the current ledger view (PDF / Excel / Print) — period-aware via
  // the same dropdown that filters the on-screen rows.
  const handleExportLedger = (format: 'PDF' | 'Excel' | 'Print') => {
    if (!ledgerRows.length) {
      toast.info('No ledger data to export for the selected period')
      return
    }
    const periodLabel =
      d.ledger.from && d.ledger.to ? ` (${d.ledger.from} → ${d.ledger.to})` : ''
    const title = `Customer Ledger — ${cust?.name ?? '—'}${periodLabel}`
    const safeName = (cust?.name ?? 'customer').replace(/[^a-z0-9-_]+/gi, '_')
    const rows = ledgerRows.map((r) => ({
      Date: r.date ? formatDate(r.date) : '',
      Reference: r.ref ?? '',
      Description: r.description ?? '',
      Debit: Number(r.debit ?? 0) || '',
      Credit: Number(r.credit ?? 0) || '',
      Balance: Number(r.balance ?? 0),
    }))
    if (format === 'PDF') exportToPdf(rows, title, `ledger-${safeName}`)
    else if (format === 'Excel') exportToCsv(rows, `ledger-${safeName}`)
    else printReport(rows, title)
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 border-b border-border/40 bg-background px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate('/customers')}
              className="mt-0.5 shrink-0"
              aria-label="Back to Customers"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              {d.customer.loading && !cust ? (
                <Skeleton className="h-5 w-56" />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold tracking-tight truncate">{cust?.name ?? '—'}</h1>
                  {cust && (
                    <Badge variant={TYPE_BADGE_VARIANT[cust.type] ?? 'secondary'} size="sm" dot>
                      {cust.type}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportLedger('PDF')}
              disabled={!d.ledger.data}
              className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportLedger('Excel')}
              disabled={!d.ledger.data}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportLedger('Print')}
              disabled={!d.ledger.data}
              className="border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-500/10"
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={!cust}>
              <Edit2 className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="shrink-0 border-b border-border/40 bg-muted/10">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <KpiCell
            icon={TrendingUp}
            label="Total Sales"
            value={pickKpi(kpis, 'Total Sales') !== '—' ? pickKpi(kpis, 'Total Sales') : pickKpi(kpis, 'Total Debit')}
            tone="blue"
            loading={d.ledger.loading && !d.ledger.data}
          />
          <KpiCell
            icon={TrendingDown}
            label="Total Returns"
            value={pickKpi(kpis, 'Total Returns')}
            tone="rose"
            loading={d.ledger.loading && !d.ledger.data}
            borderLeft
          />
          <KpiCell
            icon={IndianRupee}
            label="Outstanding"
            value={Number(outstanding) > 0 ? formatCurrency(Number(outstanding)) : '₹0'}
            tone={Number(outstanding) > 0 ? 'amber' : 'emerald'}
            loading={d.customer.loading && !cust}
            borderLeft
          />
          <KpiCell
            icon={FileSignature}
            label="Active Quotations"
            value={pickKpi(kpis, 'Active Quotations')}
            tone="purple"
            loading={d.ledger.loading && !d.ledger.data}
            borderLeft
          />
        </div>
      </div>

      {/* ── Two-pane: Overview (left, 30%) + Tabs (right) ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: Persistent Overview panel ── */}
        <aside className="hidden lg:flex lg:w-[30%] shrink-0 flex-col overflow-hidden border-r border-border/40 bg-muted/5">
          <div className="shrink-0 border-b border-border/40 bg-background px-5 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Customer Overview
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {d.customer.loading && !cust ? (
              <OverviewPanelSkeleton />
            ) : d.customer.error && !cust ? (
              <InlineError message={d.customer.error} onRetry={d.customer.refetch} />
            ) : cust ? (
              <>
                <OverviewSection icon={User} title="Contact">
                  <Row label="Name" value={cust.name} />
                  <Row label="Phone" value={cust.phone || '—'} mono />
                  {cust.alternatePhone && <Row label="Alt Phone" value={cust.alternatePhone} mono />}
                  <Row label="Email" value={cust.email || '—'} />
                </OverviewSection>

                <OverviewSection icon={MapPin} title="Address">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{cust.address || '—'}</p>
                </OverviewSection>

                <OverviewSection icon={FileBadge} title="Identification">
                  <Row
                    label="GSTIN"
                    value={cust.gstin || <span className="text-muted-foreground/40">Not provided</span>}
                    mono
                  />
                  <Row
                    label="Drug Lic."
                    value={cust.dlNumber || <span className="text-muted-foreground/40">Not provided</span>}
                    mono
                  />
                  {(cust.type === 'DOCTOR' || (cust as any).registrationNumber) && (
                    <Row
                      label="Reg. #"
                      value={(cust as any).registrationNumber || <span className="text-muted-foreground/40">Not provided</span>}
                      mono
                    />
                  )}
                </OverviewSection>

                <OverviewSection icon={Banknote} title="Commercial">
                  <Row
                    label="Type"
                    value={<Badge variant={TYPE_BADGE_VARIANT[cust.type] ?? 'secondary'} size="sm">{cust.type}</Badge>}
                  />
                  <Row
                    label="Credit Limit"
                    value={<span className="font-mono">{formatCurrency(Number(cust.creditLimit ?? 0))}</span>}
                  />
                  <Row
                    label="Outstanding"
                    value={
                      Number(cust.currentOutstanding) > 0 ? (
                        <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                          {formatCurrency(Number(cust.currentOutstanding))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">₹0</span>
                      )
                    }
                  />
                  <Row
                    label="Loyalty"
                    value={<span className="font-mono">{cust.loyaltyPoints ?? 0} pts</span>}
                  />
                  {cust.referredBy && <Row label="Referred By" value={cust.referredBy} />}
                  {cust.doctorRef && <Row label="Doctor Ref" value={cust.doctorRef} />}
                </OverviewSection>

                {cust.notes && (
                  <OverviewSection icon={StickyNote} title="Notes">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{cust.notes}</p>
                  </OverviewSection>
                )}
              </>
            ) : null}
          </div>
        </aside>

        {/* ── RIGHT: Tabs + tab content ── */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex flex-1 flex-col overflow-hidden min-w-0"
        >
          {/* Tab row — tabs on the left, period dropdown + activity-only Type filter on the right. */}
          <div className="shrink-0 border-b border-border/40 bg-background flex items-center gap-2 px-5">
            <div className="flex-1 min-w-0 overflow-x-auto">
              <TabsList className="h-auto justify-start gap-0 rounded-none bg-transparent p-0">
                {[
                  { value: 'ledger', label: 'Ledger', icon: FileText },
                  { value: 'activity', label: 'Activity', icon: MessageSquare },
                  { value: 'invoices', label: 'Invoices', icon: Receipt },
                  { value: 'creditNotes', label: 'Credit Notes', icon: RotateCcw },
                  { value: 'payments', label: 'Payments', icon: IndianRupee },
                  { value: 'quotations', label: 'Quotations', icon: FileSignature },
                  { value: 'rx', label: 'Rx', icon: Stethoscope },
                ].map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className={cn(
                      'gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground shadow-none transition-colors',
                      'hover:text-foreground hover:bg-muted/30',
                      'data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none',
                    )}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Activity-only Type filter — sits next to the period dropdown.
                Same DropdownMenu + Button shape as the period control so both
                per-tab filters share one visual language. */}
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

            {/* Rx-only Upload button — lives in the tab row instead of the tab
                content so it sits in the same slot as the period dropdown on
                other tabs. */}
            {activeTab === 'rx' && (
              <Button
                size="sm"
                onClick={() => setRxUploadOpen(true)}
                className="h-8 shrink-0 gap-1.5 my-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Upload Rx
              </Button>
            )}

            {/* Period dropdown — only on transactional tabs (Rx has no period filter). */}
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

          {/* Date-picker strip — only renders when the user explicitly picks
              "Custom Range" from the period dropdown. */}
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
                {currentTabCountLabel(activeTab, ledgerRows.length, invoicesFiltered.length, creditNotesFiltered.length, paymentsFiltered.length, quotationsFiltered.length, activityFiltered.length, rxList.length, d)}
              </span>
            </div>
          )}

          {/* Tab content area — only this scrolls */}
          <div className="flex-1 overflow-hidden">
            {/* ── Ledger ── */}
            <TabsContent value="ledger" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.ledger.error && !d.ledger.data ? (
                  <InlineError message={d.ledger.error} onRetry={d.ledger.refetch} />
                ) : d.ledger.loading && !d.ledger.data ? (
                  <TableSkeleton rows={8} />
                ) : ledgerRows.length === 0 ? (
                  <EmptyState icon={FileText} title="No transactions" subtitle="No ledger entries for this period." />
                ) : (
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                        <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reference</TableHead>
                        <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Debit</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Credit</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerPaged.map((r, i) => {
                        const debit = Number(r.debit ?? 0)
                        const credit = Number(r.credit ?? 0)
                        const balance = Number(r.balance ?? 0)
                        const target =
                          r.sourceType === 'INVOICE' && r.sourceId
                            ? `/billing/sales?invoiceId=${r.sourceId}`
                            : r.sourceType === 'CREDIT_NOTE' && r.sourceId
                              ? `/billing/credit-notes?id=${r.sourceId}`
                              : null
                        return (
                          <TableRow
                            key={i}
                            className={target ? 'cursor-pointer hover:bg-muted/20' : 'hover:bg-muted/20'}
                            onClick={target ? () => navigate(target) : undefined}
                          >
                            <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{r.date ? formatDate(r.date) : '—'}</TableCell>
                            <TableCell className="px-3 py-2 font-mono text-xs">{r.ref ?? '—'}</TableCell>
                            <TableCell className="px-3 py-2 text-xs">{r.description ?? '—'}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-xs">{debit > 0 ? formatCurrency(debit) : '—'}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-xs">{credit > 0 ? formatCurrency(credit) : '—'}</TableCell>
                            <TableCell className="px-3 py-2 text-right font-mono text-xs font-semibold">{formatCurrency(balance)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
              {ledgerRows.length > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={ledgerPage}
                    totalPages={Math.max(1, Math.ceil(ledgerRows.length / PAGE_SIZE))}
                    onPageChange={setLedgerPage}
                    totalItems={ledgerRows.length}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

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

            {/* ── Invoices ── */}
            <TabsContent value="invoices" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                <TabListContent
                  state={d.invoices}
                  emptyIcon={Receipt}
                  emptyTitle="No invoices"
                  emptySubtitle="This customer has no invoices in the selected period."
                  rows={invoicesPaged}
                  renderRow={(inv: any) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/billing/sales?invoiceId=${inv.id}`)}
                    >
                      <TableCell className="px-3 py-2 font-mono text-xs font-semibold">{inv.invoiceNumber}</TableCell>
                      <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{inv.date ? formatDate(inv.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2 text-center text-xs">{inv.items?.length ?? 0}</TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs font-semibold">{formatCurrency(Number(inv.grandTotal ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(Number(inv.amountPaid ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2"><StatusPill status={inv.status ?? inv.paymentStatus} /></TableCell>
                    </TableRow>
                  )}
                  columns={['Invoice #', 'Date', { label: 'Items', center: true }, { label: 'Total', right: true }, { label: 'Paid', right: true }, 'Status']}
                />
              </div>
              {invoicesFiltered.length > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={invoicesPage}
                    totalPages={Math.max(1, Math.ceil(invoicesFiltered.length / PAGE_SIZE))}
                    onPageChange={setInvoicesPage}
                    totalItems={invoicesFiltered.length}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* ── Credit Notes ── */}
            <TabsContent value="creditNotes" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                <TabListContent
                  state={d.creditNotes}
                  emptyIcon={RotateCcw}
                  emptyTitle="No credit notes"
                  emptySubtitle="No returns / credit notes in this period."
                  rows={creditNotesPaged}
                  renderRow={(cn: any) => (
                    <TableRow
                      key={cn.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/billing/credit-notes?id=${cn.id}`)}
                    >
                      <TableCell className="px-3 py-2 font-mono text-xs font-semibold">{cn.creditNoteNo}</TableCell>
                      <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{cn.date ? formatDate(cn.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs">{cn.reason || '—'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs"><Badge variant="secondary" size="sm">{cn.settlementMode || '—'}</Badge></TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(Number(cn.totalAmount ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2"><StatusPill status={cn.settledAt ? 'SETTLED' : 'PENDING'} /></TableCell>
                    </TableRow>
                  )}
                  columns={['CN #', 'Date', 'Reason', 'Settlement', { label: 'Amount', right: true }, 'Status']}
                />
              </div>
              {creditNotesFiltered.length > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={creditNotesPage}
                    totalPages={Math.max(1, Math.ceil(creditNotesFiltered.length / PAGE_SIZE))}
                    onPageChange={setCreditNotesPage}
                    totalItems={creditNotesFiltered.length}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* ── Payments ── */}
            <TabsContent value="payments" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                <TabListContent
                  state={d.payments}
                  emptyIcon={IndianRupee}
                  emptyTitle="No payments recorded"
                  emptySubtitle="No payments received from this customer in the selected period."
                  rows={paymentsPaged}
                  renderRow={(p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/20">
                      <TableCell className="px-3 py-2 font-mono text-xs font-semibold">{p.receiptNumber ?? p.id?.slice(0, 8)}</TableCell>
                      <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{(p.createdAt ?? p.date) ? formatDate(p.createdAt ?? p.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs"><Badge variant="secondary" size="sm">{p.mode || p.paymentMode || '—'}</Badge></TableCell>
                      <TableCell className="px-3 py-2 font-mono text-xs">{p.reference || '—'}</TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(p.amount ?? 0))}</TableCell>
                    </TableRow>
                  )}
                  columns={['Receipt #', 'Date', 'Mode', 'Reference', { label: 'Amount', right: true }]}
                />
              </div>
              {paymentsFiltered.length > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={paymentsPage}
                    totalPages={Math.max(1, Math.ceil(paymentsFiltered.length / PAGE_SIZE))}
                    onPageChange={setPaymentsPage}
                    totalItems={paymentsFiltered.length}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* ── Quotations ── */}
            <TabsContent value="quotations" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                <TabListContent
                  state={d.quotations}
                  emptyIcon={FileSignature}
                  emptyTitle="No quotations"
                  emptySubtitle="No quotations issued to this customer in the selected period."
                  rows={quotationsPaged}
                  renderRow={(q: any) => (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/billing/quotations?quotationId=${q.id}`)}
                    >
                      <TableCell className="px-3 py-2 font-mono text-xs font-semibold">{q.quotationNumber}</TableCell>
                      <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{q.date ? formatDate(q.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{q.validUntil ? formatDate(q.validUntil) : '—'}</TableCell>
                      <TableCell className="px-3 py-2 text-center text-xs">{q.items?.length ?? 0}</TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs font-semibold">{formatCurrency(Number(q.total ?? q.grandTotal ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2"><StatusPill status={q.status} /></TableCell>
                    </TableRow>
                  )}
                  columns={['Quote #', 'Date', 'Valid Until', { label: 'Items', center: true }, { label: 'Total', right: true }, 'Status']}
                />
              </div>
              {quotationsFiltered.length > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={quotationsPage}
                    totalPages={Math.max(1, Math.ceil(quotationsFiltered.length / PAGE_SIZE))}
                    onPageChange={setQuotationsPage}
                    totalItems={quotationsFiltered.length}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* ── Rx (Prescriptions) ── */}
            <TabsContent value="rx" className="m-0 h-full flex flex-col">
              <RxTabContent
                customerId={customerId}
                state={d.prescriptions}
                rows={rxPaged}
                onRefetch={() => d.prescriptions.refetch()}
                uploadOpen={rxUploadOpen}
                setUploadOpen={setRxUploadOpen}
              />
              {rxList.length > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={rxPage}
                    totalPages={Math.max(1, Math.ceil(rxList.length / PAGE_SIZE))}
                    onPageChange={setRxPage}
                    totalItems={rxList.length}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Edit dialog — shared with the list page */}
      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingCustomer={cust as Customer | null}
        onSaved={handleEditSaved}
      />

      {/* Activity create/edit dialog — reuses the supplier dialog (entity-agnostic) */}
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
// Small presentational helpers — same set as SupplierDetailPage.
// ─────────────────────────────────────────────────────────────

function pickKpi(kpis: Array<{ label: string; value: string | number }>, label: string): string {
  const k = kpis.find((x) => x.label.toLowerCase() === label.toLowerCase())
  return k?.value !== undefined ? String(k.value) : '—'
}

function currentTabCountLabel(
  activeTab: 'ledger' | 'activity' | 'invoices' | 'creditNotes' | 'payments' | 'quotations' | 'rx',
  ledgerCount: number,
  invoicesCount: number,
  creditNotesCount: number,
  paymentsCount: number,
  quotationsCount: number,
  activityCount: number,
  rxCount: number,
  d: {
    ledger: { loading: boolean }
    invoices: { loading: boolean }
    creditNotes: { loading: boolean }
    payments: { loading: boolean }
    quotations: { loading: boolean }
    activities: { loading: boolean }
    prescriptions: { loading: boolean }
  },
): string {
  switch (activeTab) {
    case 'ledger':      return d.ledger.loading        ? 'Loading…' : `${ledgerCount} transaction${ledgerCount !== 1 ? 's' : ''}`
    case 'invoices':    return d.invoices.loading      ? 'Loading…' : `${invoicesCount} invoice${invoicesCount !== 1 ? 's' : ''}`
    case 'creditNotes': return d.creditNotes.loading   ? 'Loading…' : `${creditNotesCount} credit note${creditNotesCount !== 1 ? 's' : ''}`
    case 'payments':    return d.payments.loading      ? 'Loading…' : `${paymentsCount} payment${paymentsCount !== 1 ? 's' : ''}`
    case 'quotations':  return d.quotations.loading    ? 'Loading…' : `${quotationsCount} quotation${quotationsCount !== 1 ? 's' : ''}`
    case 'activity':    return d.activities.loading    ? 'Loading…' : `${activityCount} activit${activityCount !== 1 ? 'ies' : 'y'}`
    case 'rx':          return d.prescriptions.loading ? 'Loading…' : `${rxCount} prescription${rxCount !== 1 ? 's' : ''}`
    default: return ''
  }
}

function KpiCell({
  icon: Icon,
  label,
  value,
  tone,
  loading,
  borderLeft,
}: {
  icon: typeof Package
  label: string
  value: string
  tone: 'blue' | 'emerald' | 'rose' | 'amber' | 'purple'
  loading?: boolean
  borderLeft?: boolean
}) {
  const toneMap: Record<typeof tone, string> = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  }
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', borderLeft && 'lg:border-l border-border/40')}>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneMap[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-5 w-24" /> : <p className="font-mono text-base font-bold leading-tight truncate">{value}</p>}
      </div>
    </div>
  )
}

function OverviewSection({ icon: Icon, title, children }: { icon: typeof Package; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="space-y-1.5 pl-5">{children}</div>
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
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
      <span className={cn('text-sm font-medium text-right truncate', mono && 'font-mono text-xs')}>{value}</span>
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

type LazyState<T> = { data: T | null; loading: boolean; error: string | null; attempted: boolean }

function TabListContent({
  state,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  rows,
  renderRow,
  columns,
}: {
  state: LazyState<any[]> & { ensureLoaded: () => Promise<void>; refetch?: () => void }
  emptyIcon: typeof Package
  emptyTitle: string
  emptySubtitle?: string
  rows: any[]
  renderRow: (row: any) => React.ReactNode
  columns: Array<string | { label: string; center?: boolean; right?: boolean }>
}) {
  if (state.error && !state.data) {
    return <InlineError message={state.error} onRetry={() => state.refetch?.()} />
  }
  if (state.loading) return <TableSkeleton rows={8} />
  if (!state.data || state.data.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} />
  }
  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
        <TableRow>
          {columns.map((c, i) => {
            const isObj = typeof c === 'object'
            const label = isObj ? c.label : c
            const align = isObj && c.center ? 'text-center' : isObj && c.right ? 'text-right' : ''
            return (
              <TableHead key={i} className={cn('h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground', align)}>
                {label}
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>{rows.map(renderRow)}</TableBody>
    </Table>
  )
}

// ─────────────────────────────────────────────────────────────
// Activity Tab — same shape as SupplierDetailPage's ActivityTabContent
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
  state: LazyState<SupplierActivity[]> & { refetch?: () => void }
  filtered: SupplierActivity[]
  onOpenDialog: (type: SAType, editing: SupplierActivity | null) => void
  onMarkDone: (id: string) => void
  onDelete: (id: string) => void
}) {
  const types: SAType[] = ['CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'REMINDER']
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        {state.error && !state.data ? (
          <InlineError message={state.error} onRetry={() => state.refetch?.()} />
        ) : state.loading && !state.data ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No activity logged yet"
            subtitle="Use the buttons below to log a call, WhatsApp, email, note, or schedule a reminder."
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

      <div className="shrink-0 grid grid-cols-5 gap-2 border-t border-border/40 bg-muted/5 px-5 py-2.5">
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

// ─────────────────────────────────────────────────────────────
// Rx Tab — list + upload dialog + preview + delete. Customer-specific
// (suppliers don't have prescriptions). Upload uses multipart/form-data
// against /prescriptions/upload, same endpoint the legacy page hit.
// ─────────────────────────────────────────────────────────────

function RxTabContent({
  customerId,
  state,
  rows,
  onRefetch,
  uploadOpen,
  setUploadOpen,
}: {
  customerId: string
  state: LazyState<any[]> & { refetch?: () => void }
  rows: any[]
  onRefetch: () => void
  uploadOpen: boolean
  setUploadOpen: (open: boolean) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [doctorName, setDoctorName] = useState('')
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setFile(null); setDoctorName(''); setNotes(''); setValidUntil('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpload = async () => {
    if (!file || !doctorName.trim()) {
      toast.error('File and doctor name are required')
      return
    }
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('customerId', customerId)
      form.append('doctorName', doctorName)
      if (notes) form.append('notes', notes)
      if (validUntil) form.append('validUntil', validUntil)
      await api.post('/prescriptions/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Prescription uploaded')
      setUploadOpen(false)
      resetForm()
      onRefetch()
    } catch {
      toast.error('Failed to upload prescription')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this prescription?')) return
    try {
      await api.delete(`/prescriptions/${id}`)
      toast.success('Prescription deleted')
      onRefetch()
    } catch {
      toast.error('Failed to delete prescription')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        {state.error && !state.data ? (
          <InlineError message={state.error} onRetry={() => state.refetch?.()} />
        ) : state.loading && !state.data ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No prescriptions on file"
            subtitle="Click Upload Rx to add a prescription image or PDF for this customer."
          />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
              <TableRow>
                <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Doctor</TableHead>
                <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Uploaded</TableHead>
                <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valid Until</TableHead>
                <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((rx) => {
                const url = rx.imageUrl ? `${API_SERVER_URL}${rx.imageUrl}` : null
                return (
                  <TableRow key={rx.id} className="hover:bg-muted/20">
                    <TableCell className="px-3 py-2 text-sm font-medium">{rx.doctorName ?? '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{rx.createdAt ? formatDate(rx.createdAt) : '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{rx.validUntil ? formatDate(rx.validUntil) : '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[20rem]" title={rx.notes ?? ''}>{rx.notes ?? '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        {url && (
                          <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={() => setPreviewUrl(url)} aria-label="Preview">
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon-sm" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(rx.id)} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!open) resetForm(); setUploadOpen(open) }}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Upload Prescription</DialogTitle>
            <DialogDescription>
              Attach an image or PDF prescription for this customer. Doctor name is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-[11px] text-muted-foreground truncate">Selected: {file.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Doctor Name</Label>
                <Input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="e.g. Dr. Sharma" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valid Until (optional)</Label>
                <DatePicker value={validUntil} onChange={setValidUntil} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Free-text notes about this prescription" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setUploadOpen(false) }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleUpload} disabled={submitting || !file || !doctorName.trim()}>
              {submitting ? 'Uploading…' : (<><Upload className="mr-1.5 h-3.5 w-3.5" /> Upload</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null) }}>
        <DialogContent className="max-w-3xl rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center justify-between">
              Prescription Preview
              <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={() => setPreviewUrl(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-muted/20 max-h-[75vh] overflow-auto">
            {previewUrl && (previewUrl.toLowerCase().endsWith('.pdf') ? (
              <iframe src={previewUrl} className="w-full h-[75vh]" title="Prescription" />
            ) : (
              <img src={previewUrl} alt="Prescription" className="w-full h-auto" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Suppress unused-import warning for useCallback (kept for hook parity).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _useCallbackHint = useCallback
