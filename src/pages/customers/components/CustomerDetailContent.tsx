import { useCallback, useEffect, useState, useRef } from 'react'
import {
  Edit2,
  MapPin,
  FileBadge,
  Banknote,
  AlertTriangle,
  RotateCcw,
  Calendar,
  ChevronDown,
  Package,
  TrendingUp,
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
  Filter,
  Upload,
  Eye,
  X,
  Plus,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CustomerFormDialog, type CustomerFormValues } from '@/components/shared/CustomerFormDialog'
import {
  SupplierActivityDialog,
  type SupplierActivity,
  type SupplierActivityType as SAType,
} from '@/components/shared/SupplierActivityDialog'

import { navigate, useRoute } from '@/lib/router'
import api, { API_SERVER_URL } from '@/lib/api'
import { cn, formatCurrency, formatDate, formatLedgerBalance, LEDGER_COL_BILLED, LEDGER_COL_PAID } from '@/lib/utils'
import type { Customer } from '@/types'
import { useCustomerDetail, CUSTOMER_TAB_PAGE_SIZE, type TabRange } from '@/hooks/useCustomerDetail'

// ─────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = CUSTOMER_TAB_PAGE_SIZE

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

function rangeOf(p: TabPeriod): TabRange {
  if (p.preset === 'custom') return { from: p.from || undefined, to: p.to || undefined }
  const r = computeRange(p.preset)
  return { from: r.from || undefined, to: r.to || undefined }
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
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
}

const TYPE_BADGE_VARIANT: Record<string, 'success' | 'purple' | 'warning' | 'secondary'> = {
  RETAIL: 'success',
  WHOLESALE: 'purple',
  DOCTOR: 'warning',
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface CustomerDetailContentProps {
  customerId: string
}

export function CustomerDetailContent({ customerId }: CustomerDetailContentProps) {
  const d = useCustomerDetail(customerId)
  const { path, search } = useRoute()
  const TAB_KEYS = ['overview', 'ledger', 'activity', 'invoices', 'creditNotes', 'payments', 'quotations', 'rx'] as const
  type CustomerTab = typeof TAB_KEYS[number]
  const tabFromUrl = new URLSearchParams(search).get('tab') ?? ''
  const [activeTab, setActiveTab] = useState<CustomerTab>(
    (TAB_KEYS as readonly string[]).includes(tabFromUrl) ? (tabFromUrl as CustomerTab) : 'overview',
  )
  // Mirror the active tab into the URL so browser Back — e.g. returning from an
  // invoice's detail page — restores the same tab in this split view. Only
  // non-default tabs are written (overview clears the param) to keep the shared
  // /customers URL clean.
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

  const [rxUploadOpen, setRxUploadOpen] = useState(false)

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [invoicesPeriod, setInvoicesPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [creditNotesPeriod, setCreditNotesPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [paymentsPeriod, setPaymentsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [quotationsPeriod, setQuotationsPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })
  const [activityPeriod, setActivityPeriod] = useState<TabPeriod>({ preset: 'all', from: '', to: '' })

  const activityExtra = useCallback(
    () => (activityTypeFilter === 'ALL' ? undefined : { type: activityTypeFilter }),
    [activityTypeFilter],
  )

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
    if (activeTab === 'invoices')
      return { period: invoicesPeriod, setPeriod: (next) => { setInvoicesPeriod(next); void d.invoices.fetchPage(1, rangeOf(next)) } }
    if (activeTab === 'creditNotes')
      return { period: creditNotesPeriod, setPeriod: (next) => { setCreditNotesPeriod(next); void d.creditNotes.fetchPage(1, rangeOf(next)) } }
    if (activeTab === 'payments')
      return { period: paymentsPeriod, setPeriod: (next) => { setPaymentsPeriod(next); void d.payments.fetchPage(1, rangeOf(next)) } }
    if (activeTab === 'quotations')
      return { period: quotationsPeriod, setPeriod: (next) => { setQuotationsPeriod(next); void d.quotations.fetchPage(1, rangeOf(next)) } }
    if (activeTab === 'activity')
      return { period: activityPeriod, setPeriod: (next) => { setActivityPeriod(next); void d.activities.fetchPage(1, rangeOf(next), activityExtra()) } }
    return null
  })()

  const fetchLedgerPage = d.ledger.fetchPage
  const fetchInvoicesPage = d.invoices.fetchPage
  const fetchCreditNotesPage = d.creditNotes.fetchPage
  const fetchPaymentsPage = d.payments.fetchPage
  const fetchQuotationsPage = d.quotations.fetchPage
  const fetchPrescriptionsPage = d.prescriptions.fetchPage
  const fetchActivitiesPage = d.activities.fetchPage

  useEffect(() => {
    if (activeTab === 'ledger') void fetchLedgerPage(1)
    else if (activeTab === 'invoices') void fetchInvoicesPage(1, rangeOf(invoicesPeriod))
    else if (activeTab === 'creditNotes') void fetchCreditNotesPage(1, rangeOf(creditNotesPeriod))
    else if (activeTab === 'payments') void fetchPaymentsPage(1, rangeOf(paymentsPeriod))
    else if (activeTab === 'quotations') void fetchQuotationsPage(1, rangeOf(quotationsPeriod))
    else if (activeTab === 'rx') void fetchPrescriptionsPage(1)
    else if (activeTab === 'activity') void fetchActivitiesPage(1, rangeOf(activityPeriod), activityExtra())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, customerId, fetchLedgerPage, fetchInvoicesPage, fetchCreditNotesPage, fetchPaymentsPage, fetchQuotationsPage, fetchPrescriptionsPage, fetchActivitiesPage])

  // Eagerly fetch ledger so Financial Summary is available on the Overview tab
  useEffect(() => {
    if (!d.ledger.data && !d.ledger.loading) void fetchLedgerPage(1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refetchLedger = d.ledger.refetch
  const refetchInvoices = d.invoices.refetch
  const refetchCreditNotes = d.creditNotes.refetch
  const refetchPayments = d.payments.refetch
  useEffect(() => {
    const refetchActive = () => {
      void refetchLedger()
      if (activeTab === 'invoices') void refetchInvoices()
      if (activeTab === 'creditNotes') void refetchCreditNotes()
      if (activeTab === 'payments') void refetchPayments()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetchActive()
    }
    window.addEventListener('focus', refetchActive)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refetchActive)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [activeTab, refetchLedger, refetchInvoices, refetchCreditNotes, refetchPayments])

  const cust = d.customer.data
  const kpis = d.ledger.data?.kpis ?? []

  const ledgerRows = d.ledger.data?.tableData ?? []
  const invoicesRows = d.invoices.data ?? []
  const creditNotesRows = d.creditNotes.data ?? []
  const paymentsRows = d.payments.data ?? []
  const quotationsRows = d.quotations.data ?? []
  const rxList = d.prescriptions.data ?? []
  const activityRows = d.activities.data ?? []

  const handleEditSaved = (values: CustomerFormValues, _mode: 'create' | 'update') => {
    d.customer.applyPatch(values as Partial<Customer>)
    void d.customer.refetch()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Small action bar */}
      <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 py-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Customer Detail</span>
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
                    onSelect={() => {
                      setActivityTypeFilter(opt.value)
                      void d.activities.fetchPage(1, rangeOf(activityPeriod), opt.value === 'ALL' ? undefined : { type: opt.value })
                    }}
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
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={!cust}>
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
                { value: 'overview', label: 'Overview', icon: User },
                { value: 'ledger', label: 'Ledger', icon: FileText },
                { value: 'activity', label: 'Activity', icon: MessageSquare },
                { value: 'invoices', label: 'Invoices', icon: Receipt },
                { value: 'creditNotes', label: 'Credit Notes', icon: RotateCcw },
                { value: 'payments', label: 'Payments', icon: IndianRupee },
                { value: 'quotations', label: 'Quotations', icon: FileSignature },
                { value: 'rx', label: 'Document', icon: Stethoscope },
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
                {currentTabCountLabel(activeTab, d.ledger.total, d.invoices.total, d.creditNotes.total, d.payments.total, d.quotations.total, d.activities.total, d.prescriptions.total, d)}
              </span>
            </div>
          )}

          {/* Tab content area */}
          <div className="flex-1 overflow-hidden">
            {/* Overview */}
            <TabsContent value="overview" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto p-4 lg:p-6">
                {d.customer.loading && !cust ? (
                  <OverviewPanelSkeleton />
                ) : d.customer.error && !cust ? (
                  <InlineError message={d.customer.error} onRetry={d.customer.refetch} />
                ) : cust ? (
                  <Card>
                    <CardContent className="p-5 lg:p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6 items-start">
                        <OverviewSection icon={User} title="Contact">
                          <Row label="Name" value={cust.name} />
                          <Row label="Phone" value={cust.phone || '—'} mono />
                          {cust.alternatePhone && <Row label="Alt Phone" value={cust.alternatePhone} mono />}
                          <Row label="Email" value={cust.email || '—'} />
                        </OverviewSection>

                        <OverviewSection icon={MapPin} title="Address">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{cust.address || '—'}</p>
                        </OverviewSection>

                        {cust.type !== 'RETAIL' && (
                          <OverviewSection icon={FileBadge} title="Identification">
                            {cust.type === 'WHOLESALE' && (
                              <>
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
                              </>
                            )}
                            {cust.type === 'DOCTOR' && (
                              <Row
                                label="Reg. #"
                                value={(cust as any).registrationNumber || <span className="text-muted-foreground/40">Not provided</span>}
                                mono
                              />
                            )}
                          </OverviewSection>
                        )}

                        <OverviewSection icon={Banknote} title="Commercial">
                          <Row
                            label="Type"
                            value={<Badge variant={TYPE_BADGE_VARIANT[cust.type] ?? 'secondary'} size="sm">{cust.type}</Badge>}
                          />
                          <Row
                            label="Credit Limit"
                            value={(() => {
                              const used = Number((cust as any).pendingCreditCount ?? 0)
                              const max = Number((cust as any).maxPendingCredit ?? 3)
                              const full = used >= max
                              return (
                                <span className={cn('font-mono', full && 'font-semibold text-rose-600 dark:text-rose-400')}>
                                  {used}/{max}
                                </span>
                              )
                            })()}
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
                          {cust.referredBy && <Row label="Referred By" value={cust.referredBy} />}
                          {cust.doctorRef && <Row label="Doctor Ref" value={cust.doctorRef} />}
                        </OverviewSection>

                        {kpis.length > 0 && (
                          <OverviewSection icon={TrendingUp} title="Financial Summary">
                            <Row label="Total Sales" value={<span className="font-mono font-semibold">{pickKpi(kpis, 'Total Sales') !== '—' ? pickKpi(kpis, 'Total Sales') : pickKpi(kpis, 'Total Debit')}</span>} />
                            <Row label="Paid" value={<span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{pickKpi(kpis, 'Total Paid')}</span>} />
                            <Row label="Total Returns" value={<span className="font-mono font-semibold text-rose-600 dark:text-rose-400">{pickKpi(kpis, 'Total Returns')}</span>} />
                          </OverviewSection>
                        )}

                        {cust.notes && (
                          <OverviewSection icon={StickyNote} title="Notes">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{cust.notes}</p>
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
                      {ledgerRows.map((r, i) => {
                        const debit = Number(r.debit ?? 0)
                        const credit = Number(r.credit ?? 0)
                        const balance = Number(r.balance ?? 0)
                        const target =
                          r.sourceType === 'INVOICE' && r.sourceId
                            ? `/customers/invoices/detail?id=${r.sourceId}`
                            : r.sourceType === 'CREDIT_NOTE' && r.sourceId
                              ? `/billing/credit-notes/detail?id=${r.sourceId}`
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
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold">{formatLedgerBalance(balance, 'customer')}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
              {d.ledger.total > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={d.ledger.page}
                    totalPages={Math.max(1, Math.ceil(d.ledger.total / PAGE_SIZE))}
                    onPageChange={(p) => d.ledger.fetchPage(p)}
                    totalItems={d.ledger.total}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Activity */}
            <TabsContent value="activity" className="m-0 h-full flex flex-col">
              <ActivityTabContent
                state={d.activities}
                filtered={activityRows}
                total={d.activities.total}
                page={d.activities.page}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => d.activities.fetchPage(p, rangeOf(activityPeriod), activityExtra())}
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

            {/* Invoices */}
            <TabsContent value="invoices" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.invoices.error && !d.invoices.data ? (
                  <InlineError message={d.invoices.error} onRetry={() => d.invoices.refetch?.()} />
                ) : d.invoices.loading ? (
                  <TableSkeleton rows={8} />
                ) : invoicesRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <Receipt className="h-10 w-10 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">No invoices</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">This customer has no invoices in the selected period.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => cust && navigate(`/billing/new?customerId=${cust.id}`)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      New Sale
                    </Button>
                  </div>
                ) : (
                <TabListContent
                  state={d.invoices}
                  emptyIcon={Receipt}
                  emptyTitle="No invoices"
                  emptySubtitle="This customer has no invoices in the selected period."
                  rows={invoicesRows}
                  renderRow={(inv: any) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/customers/invoices/detail?id=${inv.id}`)}
                    >
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{inv.date ? formatDate(inv.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">{inv.invoiceNumber}</TableCell>
                      <TableCell className="px-3 py-2.5 text-center text-sm">{inv.items?.length ?? 0}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold">{formatCurrency(Number(inv.grandTotal ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{formatCurrency(Number(inv.amountPaid ?? 0))}</TableCell>
                      {(() => {
                        const balance = Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0)
                        return (
                          <TableCell className={cn('px-3 py-2.5 text-right font-mono text-sm font-semibold', balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                            {formatCurrency(balance)}
                          </TableCell>
                        )
                      })()}
                      <TableCell className="px-3 py-2.5 text-center text-sm whitespace-nowrap">
                        {inv.dueDate ? (() => {
                          const overdue = new Date(inv.dueDate) < new Date() && (inv.status === 'UNPAID' || inv.status === 'PARTIAL')
                          return <span className={cn(overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>{formatDate(inv.dueDate)}</span>
                        })() : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-center"><PaymentModeBadge mode={inv.paymentMode} /></TableCell>
                      <TableCell className="px-3 py-2.5 text-center"><StatusPill status={inv.status ?? inv.paymentStatus} /></TableCell>
                    </TableRow>
                  )}
                  columns={['Date', 'Invoice #', { label: 'Items', center: true }, { label: 'Total', right: true }, { label: 'Paid', right: true }, { label: 'Balance', right: true }, { label: 'Due Date', center: true }, { label: 'Payment', center: true }, { label: 'Status', center: true }]}
                />
                )}
              </div>
              {d.invoices.total > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={d.invoices.page}
                    totalPages={Math.max(1, Math.ceil(d.invoices.total / PAGE_SIZE))}
                    onPageChange={(p) => d.invoices.fetchPage(p, rangeOf(invoicesPeriod))}
                    totalItems={d.invoices.total}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Credit Notes */}
            <TabsContent value="creditNotes" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.creditNotes.error && !d.creditNotes.data ? (
                  <InlineError message={d.creditNotes.error} onRetry={() => d.creditNotes.refetch?.()} />
                ) : d.creditNotes.loading ? (
                  <TableSkeleton rows={8} />
                ) : creditNotesRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <RotateCcw className="h-10 w-10 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">No credit notes</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">No returns / credit notes in this period.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => cust && navigate(`/billing/credit-notes/new?customerId=${cust.id}`)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      New Credit Note
                    </Button>
                  </div>
                ) : (
                <TabListContent
                  state={d.creditNotes}
                  emptyIcon={RotateCcw}
                  emptyTitle="No credit notes"
                  emptySubtitle="No returns / credit notes in this period."
                  rows={creditNotesRows}
                  renderRow={(cn: any) => (
                    <TableRow
                      key={cn.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/billing/credit-notes/detail?id=${cn.id}`)}
                    >
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{cn.date ? formatDate(cn.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">{cn.creditNoteNo}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm">{cn.reason || '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm"><Badge variant="secondary" size="sm">{cn.settlementMode || '—'}</Badge></TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(Number(cn.totalAmount ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2.5"><StatusPill status={cn.status ?? (cn.settledAt ? 'SETTLED' : 'PENDING_REVIEW')} /></TableCell>
                    </TableRow>
                  )}
                  columns={['Date', 'CN #', 'Reason', 'Settlement', { label: 'Amount', right: true }, 'Status']}
                />
                )}
              </div>
              {d.creditNotes.total > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={d.creditNotes.page}
                    totalPages={Math.max(1, Math.ceil(d.creditNotes.total / PAGE_SIZE))}
                    onPageChange={(p) => d.creditNotes.fetchPage(p, rangeOf(creditNotesPeriod))}
                    totalItems={d.creditNotes.total}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Payments */}
            <TabsContent value="payments" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.payments.error && !d.payments.data ? (
                  <InlineError message={d.payments.error} onRetry={() => d.payments.refetch?.()} />
                ) : d.payments.loading ? (
                  <TableSkeleton rows={8} />
                ) : paymentsRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <IndianRupee className="h-10 w-10 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">No payments recorded</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">No payments received from this customer in the selected period.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => cust && navigate(`/billing/payment?customerId=${cust.id}`)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Collect Payment
                    </Button>
                  </div>
                ) : (
                <TabListContent
                  state={d.payments}
                  emptyIcon={IndianRupee}
                  emptyTitle="No payments recorded"
                  emptySubtitle="No payments received from this customer in the selected period."
                  rows={paymentsRows}
                  renderRow={(p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/20">
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{(p.createdAt ?? p.date) ? formatDate(p.createdAt ?? p.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">{p.receiptNumber ?? p.id?.slice(0, 8)}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm"><Badge variant="secondary" size="sm">{p.mode || p.paymentMode || '—'}</Badge></TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm">{p.reference || '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(p.amount ?? 0))}</TableCell>
                    </TableRow>
                  )}
                  columns={['Date', 'Receipt #', 'Mode', 'Reference', { label: 'Amount', right: true }]}
                />
                )}
              </div>
              {d.payments.total > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={d.payments.page}
                    totalPages={Math.max(1, Math.ceil(d.payments.total / PAGE_SIZE))}
                    onPageChange={(p) => d.payments.fetchPage(p, rangeOf(paymentsPeriod))}
                    totalItems={d.payments.total}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Quotations */}
            <TabsContent value="quotations" className="m-0 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                {d.quotations.error && !d.quotations.data ? (
                  <InlineError message={d.quotations.error} onRetry={() => d.quotations.refetch?.()} />
                ) : d.quotations.loading ? (
                  <TableSkeleton rows={8} />
                ) : quotationsRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <FileSignature className="h-10 w-10 text-muted-foreground/30" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">No quotations</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">No quotations issued to this customer in the selected period.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/billing/new?type=quotation`)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Add Quotation
                    </Button>
                  </div>
                ) : (
                <TabListContent
                  state={d.quotations}
                  emptyIcon={FileSignature}
                  emptyTitle="No quotations"
                  emptySubtitle="No quotations issued to this customer in the selected period."
                  rows={quotationsRows}
                  renderRow={(q: any) => (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => navigate(`/billing/quotations?quotationId=${q.id}`)}
                    >
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{q.date ? formatDate(q.date) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold">{q.quotationNumber}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{q.validUntil ? formatDate(q.validUntil) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-center text-sm">{q.items?.length ?? 0}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold">{formatCurrency(Number(q.total ?? q.grandTotal ?? 0))}</TableCell>
                      <TableCell className="px-3 py-2.5"><StatusPill status={q.status} /></TableCell>
                    </TableRow>
                  )}
                  columns={['Date', 'Quote #', 'Valid Until', { label: 'Items', center: true }, { label: 'Total', right: true }, 'Status']}
                />
                )}
              </div>
              {d.quotations.total > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={d.quotations.page}
                    totalPages={Math.max(1, Math.ceil(d.quotations.total / PAGE_SIZE))}
                    onPageChange={(p) => d.quotations.fetchPage(p, rangeOf(quotationsPeriod))}
                    totalItems={d.quotations.total}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>

            {/* Rx (Prescriptions) */}
            <TabsContent value="rx" className="m-0 h-full flex flex-col">
              <RxTabContent
                customerId={customerId}
                state={d.prescriptions}
                rows={rxList}
                onRefetch={() => d.prescriptions.refetch()}
                uploadOpen={rxUploadOpen}
                setUploadOpen={setRxUploadOpen}
              />
              {d.prescriptions.total > PAGE_SIZE && (
                <div className="shrink-0 border-t border-border/40">
                  <DataTablePagination
                    currentPage={d.prescriptions.page}
                    totalPages={Math.max(1, Math.ceil(d.prescriptions.total / PAGE_SIZE))}
                    onPageChange={(p) => d.prescriptions.fetchPage(p)}
                    totalItems={d.prescriptions.total}
                    itemsPerPage={PAGE_SIZE}
                    className="px-4"
                  />
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Edit dialog */}
      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingCustomer={cust as Customer | null}
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
// Local helper components (mirrors CustomerDetailPage)
// ─────────────────────────────────────────────────────────────

function pickKpi(kpis: Array<{ label: string; value: string | number }>, label: string): string {
  const k = kpis.find((x) => x.label.toLowerCase() === label.toLowerCase())
  return k?.value !== undefined ? String(k.value) : '—'
}

function currentTabCountLabel(
  activeTab: 'overview' | 'ledger' | 'activity' | 'invoices' | 'creditNotes' | 'payments' | 'quotations' | 'rx',
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

const PAYMENT_MODE_META: Record<string, { label: string; className: string }> = {
  CASH:   { label: 'Cash',   className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400' },
  UPI:    { label: 'UPI',    className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-400' },
  CARD:   { label: 'Card',   className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400' },
  CHEQUE: { label: 'Cheque', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400' },
  CREDIT: { label: 'Credit', className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400' },
  SPLIT:  { label: 'Split',  className: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-400' },
}

function PaymentModeBadge({ mode }: { mode?: string }) {
  if (!mode) return <span className="text-muted-foreground/40">—</span>
  const meta = PAYMENT_MODE_META[mode]
  return (
    <Badge variant="outline" size="sm" className={cn('font-medium', meta?.className)}>
      {meta?.label ?? mode.replace(/_/g, ' ')}
    </Badge>
  )
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
  columns,
}: {
  state: { data: any[] | null; loading: boolean; error: string | null; refetch?: () => void }
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
  total,
  page,
  pageSize,
  onPageChange,
  onOpenDialog,
  onMarkDone,
  onDelete,
}: {
  state: { data: SupplierActivity[] | null; loading: boolean; error: string | null; refetch?: () => void }
  filtered: SupplierActivity[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
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

      {total > pageSize && (
        <div className="shrink-0 border-t border-border/40">
          <DataTablePagination
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            onPageChange={onPageChange}
            totalItems={total}
            itemsPerPage={pageSize}
            className="px-4"
          />
        </div>
      )}
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
            <span className="text-sm font-semibold">{meta.label}</span>
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
// Rx Tab
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
  state: { data: any[] | null; loading: boolean; error: string | null; refetch?: () => void }
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
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editDoctorName, setEditDoctorName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editValidUntil, setEditValidUntil] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const openEdit = (rx: { id: string; doctorName?: string | null; notes?: string | null; validUntil?: string | null }) => {
    setEditId(rx.id)
    setEditDoctorName(rx.doctorName ?? '')
    setEditNotes(rx.notes ?? '')
    setEditValidUntil(rx.validUntil ? String(rx.validUntil).slice(0, 10) : '')
  }

  const handleUpdate = async () => {
    if (!editId || !editDoctorName.trim()) {
      toast.error('Type / Doctor is required')
      return
    }
    setEditSubmitting(true)
    try {
      await api.patch(`/prescriptions/${editId}`, {
        doctorName: editDoctorName.trim(),
        notes: editNotes,
      })
      toast.success('Document updated')
      setEditId(null)
      onRefetch()
    } catch {
      toast.error('Failed to update document')
    } finally {
      setEditSubmitting(false)
    }
  }

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

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await api.delete(`/prescriptions/${deleteId}`)
      toast.success('Prescription deleted')
      setDeleteId(null)
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
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Stethoscope className="h-10 w-10 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">No documents on file</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Upload a prescription or document for this customer.</p>
            </div>
            <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Upload Document
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-end px-4 py-2 border-b border-border/20">
              <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)} className="h-7 gap-1.5 text-xs">
                <Upload className="h-3 w-3" />
                Upload Document
              </Button>
            </div>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                <TableRow>
                  <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploaded</TableHead>
                  <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</TableHead>
                  <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</TableHead>
                  <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((rx) => {
                  const url = rx.imageUrl ? `${API_SERVER_URL}${rx.imageUrl}` : null
                  return (
                    <TableRow key={rx.id} className="hover:bg-muted/20">
                      <TableCell className="px-3 py-2.5 text-sm whitespace-nowrap">{rx.createdAt ? formatDate(rx.createdAt) : '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-sm font-medium">
                        {rx.doctorName ? (
                          <Badge variant="secondary" size="sm">{rx.doctorName}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-sm text-muted-foreground truncate max-w-[20rem]" title={rx.notes ?? ''}>{rx.notes ?? '—'}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {url && (
                            <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={() => setPreviewUrl(url)} aria-label="Preview">
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rx)} aria-label="Edit">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button size="icon-sm" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(rx.id)} aria-label="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </>
        )}
      </div>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!open) resetForm(); setUploadOpen(open) }}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Attach an image or PDF for this customer. Title is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</Label>
              <Input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="e.g. Prescription, Lab Report, ID Proof…" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Upload</Label>
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
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Free-text notes about this document" />
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

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={(open) => { if (!open) setEditId(null) }}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update the title and notes. The uploaded file isn't changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</Label>
              <Input value={editDoctorName} onChange={(e) => setEditDoctorName(e.target.value)} placeholder="e.g. Prescription, Lab Report, ID Proof…" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} placeholder="Free-text notes about this document" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)} disabled={editSubmitting}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={editSubmitting || !editDoctorName.trim()}>
              {editSubmitting ? 'Saving…' : (<><Edit2 className="mr-1.5 h-3.5 w-3.5" /> Save Changes</>)}
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null) }}
        title="Delete prescription?"
        description="This permanently removes the uploaded prescription. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
