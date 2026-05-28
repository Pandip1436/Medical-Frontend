import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Shield,
  Download,
  RefreshCw,
  FilePlus2,
  FilePenLine,
  Trash2,
  Activity,
  FileSpreadsheet,
  FileDown,
} from 'lucide-react'

import api from '@/lib/api'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  SheetDescription,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { EmptyState } from '@/components/shared/EmptyState'
import { exportToCsv, exportToPdf } from '@/lib/exportUtils'
import { exportToExcel } from '@/lib/excelUtils'

// ─── Types ───────────────────────────────────────────────────────────

interface AuditUser {
  id: string
  name: string
  email: string
  role: string
}

interface AuditLogRow {
  id: string
  userId: string
  user?: AuditUser | null
  module: string
  action: string
  entity: string
  entityId?: string | null
  entityLabel?: string | null
  oldValue?: unknown
  newValue?: unknown
  ipAddress?: string | null
  createdAt: string
}

interface UserOption {
  id: string
  name: string
  role: string
}

interface StatsResponse {
  total: number
  creates: number
  updates: number
  deletes: number
}

// ─── Constants ───────────────────────────────────────────────────────

const PAGE_SIZE = 10

// Curated module list — these are the modules the backend actually writes
// audit rows for. Static list avoids an extra round-trip for an enum that
// changes only when a new module is added.
const MODULE_OPTIONS = [
  { value: 'all', label: 'All Modules' },
  { value: 'batches', label: 'Batches' },
  { value: 'branches', label: 'Branches' },
  { value: 'categories', label: 'Categories' },
  { value: 'credit-notes', label: 'Credit Notes' },
  { value: 'customers', label: 'Customers' },
  { value: 'debit-notes', label: 'Debit Notes' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'grn', label: 'Purchase Received' },
  { value: 'products', label: 'Products' },
  { value: 'purchase-orders', label: 'Purchase Orders' },
  { value: 'quotations', label: 'Quotations' },
  { value: 'sales-invoices', label: 'Sales Invoices' },
  { value: 'settings', label: 'Settings' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'users', label: 'Users' },
]

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REJECT', label: 'Reject' },
  { value: 'SUBMIT', label: 'Submit' },
  { value: 'CANCEL', label: 'Cancel' },
  { value: 'VOID', label: 'Void' },
  { value: 'CONVERT', label: 'Convert' },
  { value: 'FINALIZE', label: 'Finalize' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'SEND', label: 'Send' },
  { value: 'RETURN', label: 'Return' },
]

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  PHARMACIST: 'Pharmacist',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
  SALESPERSON: 'Salesperson',
}

function actionBadgeVariant(action: string): 'success' | 'info' | 'warning' | 'destructive' | 'secondary' {
  switch (action.toUpperCase()) {
    case 'CREATE':
    case 'ACTIVATE':
    case 'APPROVE':
    case 'PAYMENT':
      return 'success'
    case 'UPDATE':
    case 'SUBMIT':
    case 'CONVERT':
    case 'FINALIZE':
    case 'SEND':
      return 'info'
    case 'DELETE':
    case 'CANCEL':
    case 'DEACTIVATE':
    case 'REJECT':
    case 'VOID':
      return 'destructive'
    case 'RETURN':
      return 'warning'
    default:
      return 'secondary'
  }
}

// Title-case an action code for display, e.g. REJECT → "Reject".
function prettyAction(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
}

// Period → ISO date range. `all` returns undefined so the filter is dropped.
function periodToRange(period: string): { dateFrom?: string; dateTo?: string } {
  if (period === 'all') return {}
  const now = new Date()
  const dateTo = now.toISOString()
  if (period === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { dateFrom: start.toISOString(), dateTo }
  }
  if (period === '7d') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    return { dateFrom: start.toISOString(), dateTo }
  }
  if (period === '30d') {
    const start = new Date(now)
    start.setDate(start.getDate() - 30)
    return { dateFrom: start.toISOString(), dateTo }
  }
  return {}
}

// Render a JSON value as plain text for the CSV export.
function jsonString(value: unknown): string {
  if (value === null || value === undefined) return ''
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return ''
  }
}

// Human-readable label for the affected record, so the log answers "which
// customer / product / invoice?" without the user decoding an opaque CUID.
// Pulled from whichever payload is present (newValue first, then oldValue).
const ENTITY_LABEL_KEYS = [
  'name', 'productName', 'customerName', 'supplierName', 'fullName',
  'title', 'invoiceNumber', 'poNumber', 'grnNumber', 'quotationNumber',
  'creditNoteNumber', 'debitNoteNumber', 'batchNumber', 'code', 'email',
]
function entityLabel(row: AuditLogRow): string | null {
  for (const src of [row.newValue, row.oldValue]) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue
    const obj = src as Record<string, unknown>
    for (const key of ENTITY_LABEL_KEYS) {
      const v = obj[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
    }
  }
  return null
}

// The label to show in the Record column / detail header. Prefers the
// backend-stored `entityLabel` (accurate for every action, incl. field-only
// updates), then the payload-derived guess (keeps pre-rework rows working).
// Deliberately does NOT fall back to the opaque entity id — callers show the
// module name or a dash instead, so no DB ids surface in the UI.
function recordLabel(row: AuditLogRow): string | null {
  return (row.entityLabel?.trim() || null) ?? entityLabel(row)
}

// Build a compact human summary for the table's Changes cell.
function changesSummary(row: AuditLogRow): { text: string; hint?: string } {
  const action = row.action.toUpperCase()
  if (action === 'CREATE') {
    const v = row.newValue as Record<string, unknown> | undefined
    const hint = typeof v?.name === 'string'
      ? (v.name as string)
      : typeof v?.title === 'string'
        ? (v.title as string)
        : typeof v?.poNumber === 'string'
          ? (v.poNumber as string)
          : undefined
    return { text: 'Created', hint }
  }
  if (action === 'DELETE') return { text: 'Deleted' }
  if (action === 'UPDATE') {
    const newVal = (row.newValue as Record<string, unknown> | null) ?? {}
    const oldVal = (row.oldValue as Record<string, unknown> | null) ?? {}
    // Match the detail-sheet diff: only submitted, non-hidden fields whose
    // value actually changed against the captured snapshot.
    const changedKeys = Object.keys(newVal)
      .filter((k) => !isHiddenKey(k))
      .filter((k) => JSON.stringify(newVal[k]) !== JSON.stringify(oldVal[k]))
    const n = changedKeys.length
    if (n === 0) return { text: 'Updated' }
    return {
      text: n === 1 ? '1 field changed' : `${n} fields changed`,
      hint: changedKeys[0],
    }
  }
  return { text: action.charAt(0) + action.slice(1).toLowerCase() }
}

// ─── Page ────────────────────────────────────────────────────────────

export default function AuditTrailPage() {
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)
  const [userFilter, setUserFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('30d')

  // Pagination + data
  const [currentPage, setCurrentPage] = useState(1)
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState<StatsResponse>({ total: 0, creates: 0, updates: 0, deletes: 0 })

  // User dropdown options — pulled from /users once.
  const [users, setUsers] = useState<UserOption[]>([])

  // Row detail sheet
  const [detailRow, setDetailRow] = useState<AuditLogRow | null>(null)

  // Build the request params from current filter state. Centralised so the
  // table fetch, stats fetch, and Export all stay in sync.
  const requestParams = useCallback((): Record<string, string> => {
    const range = periodToRange(periodFilter)
    const params: Record<string, string> = {}
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim()
    if (userFilter !== 'all') params.userId = userFilter
    if (moduleFilter !== 'all') params.module = moduleFilter
    if (actionFilter !== 'all') params.action = actionFilter
    if (range.dateFrom) params.dateFrom = range.dateFrom
    if (range.dateTo) params.dateTo = range.dateTo
    return params
  }, [debouncedSearch, userFilter, moduleFilter, actionFilter, periodFilter])

  const fetchRows = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = {
        ...requestParams(),
        skip: String((currentPage - 1) * PAGE_SIZE),
        take: String(PAGE_SIZE),
      }
      const res = await api.get('/audit-logs', { params })
      // Backend returns the paginated envelope when skip/take are supplied.
      const payload = res.data as { data?: AuditLogRow[]; total?: number } | AuditLogRow[]
      if (Array.isArray(payload)) {
        setRows(payload)
        setTotal(payload.length)
      } else {
        setRows(payload.data ?? [])
        setTotal(payload.total ?? 0)
      }
    } catch {
      toast.error('Failed to load audit log')
    } finally {
      setIsLoading(false)
    }
  }, [requestParams, currentPage])

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/audit-logs/stats', { params: requestParams() })
      setStats(res.data as StatsResponse)
    } catch {
      // Stats are nice-to-have; failure should not block the page.
    }
  }, [requestParams])

  // Mount-only: pull the user list for the filter dropdown.
  useEffect(() => {
    api.get('/users').then((res) => {
      const payload = res.data
      const list: UserOption[] = (Array.isArray(payload) ? payload : (payload?.data ?? [])).map(
        (u: { id: string; name: string; role: string }) => ({ id: u.id, name: u.name, role: u.role }),
      )
      setUsers(list)
    }).catch(() => {
      // Non-fatal — dropdown stays empty, all other filters still work.
    })
  }, [])

  // Reset to page 1 whenever any filter changes.
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, userFilter, moduleFilter, actionFilter, periodFilter])

  // Re-fetch table whenever filters or page change.
  useEffect(() => { fetchRows() }, [fetchRows])

  // Re-fetch stats whenever filters change (not on page change — stats are
  // window-wide, not page-bound).
  useEffect(() => { fetchStats() }, [fetchStats])

  const userOptions = useMemo(
    () => [
      { value: 'all', label: 'All Users' },
      ...users.map((u) => ({ value: u.id, label: u.name })),
    ],
    [users],
  )

  const activeFilterCount =
    (userFilter !== 'all' ? 1 : 0) +
    (moduleFilter !== 'all' ? 1 : 0) +
    (actionFilter !== 'all' ? 1 : 0) +
    (periodFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setUserFilter('all')
    setModuleFilter('all')
    setActionFilter('all')
    setPeriodFilter('all')
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Common pipeline for all three export formats: pull the full filtered set
  // (server-capped at 5000) so the file reflects the table's current filters
  // — not just the visible page — and shape rows into a flat plain-object
  // array that exportToCsv / exportToExcel / exportToPdf can each consume.
  const fetchExportRows = async (): Promise<Record<string, string>[]> => {
    const res = await api.get('/audit-logs', {
      params: { ...requestParams(), skip: '0', take: '5000' },
    })
    const payload = res.data as { data?: AuditLogRow[] } | AuditLogRow[]
    const data = Array.isArray(payload) ? payload : (payload.data ?? [])
    return data.map((r) => ({
      Timestamp: formatDateTime(r.createdAt),
      User: r.user?.name ?? r.userId,
      Role: r.user ? (ROLE_LABEL[r.user.role] ?? r.user.role) : '',
      Module: r.module,
      Action: r.action,
      Record: recordLabel(r) ?? '',
      'Old Value': jsonString(r.oldValue),
      'New Value': jsonString(r.newValue),
    }))
  }

  const exportFilename = `audit-trail-${new Date().toISOString().slice(0, 10)}`

  const handleExportCsv = async () => {
    try {
      const rows = await fetchExportRows()
      if (rows.length === 0) { toast.info('No audit entries to export'); return }
      exportToCsv(rows, exportFilename)
      toast.success(`Exported ${rows.length} entries to CSV`)
    } catch { toast.error('Failed to export audit log') }
  }

  const handleExportExcel = async () => {
    try {
      const rows = await fetchExportRows()
      if (rows.length === 0) { toast.info('No audit entries to export'); return }
      exportToExcel(rows, exportFilename)
      toast.success(`Exported ${rows.length} entries to Excel`)
    } catch { toast.error('Failed to export audit log') }
  }

  const handleExportPdf = async () => {
    try {
      const rows = await fetchExportRows()
      if (rows.length === 0) { toast.info('No audit entries to export'); return }
      // PDF is space-constrained — drop the verbose JSON columns for the
      // printable summary. They're still in the CSV / Excel exports.
      const slim = rows.map((r) => {
        const { 'Old Value': _oldV, 'New Value': _newV, ...rest } = r
        void _oldV; void _newV
        return rest
      })
      exportToPdf(slim, `Audit Trail — ${formatDate(new Date())}`, exportFilename)
      toast.success(`Exported ${rows.length} entries to PDF`)
    } catch { toast.error('Failed to export audit log') }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Header strip ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 dark:bg-rose-500/15">
          <Shield className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">Audit Trail</h1>
          <p className="text-xs text-muted-foreground">Complete log of all system changes (read-only)</p>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Events',
            value: stats.total.toString(),
            subtitle: periodFilter === 'all' ? 'all time' : `in ${PERIOD_OPTIONS.find((p) => p.value === periodFilter)?.label.toLowerCase()}`,
            icon: Activity,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Creates',
            value: stats.creates.toString(),
            subtitle: stats.total > 0 ? `${Math.round((stats.creates / stats.total) * 100)}% of events` : '—',
            icon: FilePlus2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Updates',
            value: stats.updates.toString(),
            subtitle: stats.total > 0 ? `${Math.round((stats.updates / stats.total) * 100)}% of events` : '—',
            icon: FilePenLine,
            iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
            borderAccent: 'border-l-sky-500',
          },
          {
            label: 'Deletes',
            value: stats.deletes.toString(),
            subtitle: stats.deletes > 0 ? 'review for risk' : 'none',
            icon: Trash2,
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

      {/* ── Filter bar ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search modules, actions, entities…"
        resultsCount={total}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { fetchRows(); fetchStats() }}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCsv}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>
                  <FileDown className="mr-2 h-4 w-4" /> Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EnumSelect
            label="Period"
            value={periodFilter}
            onValueChange={setPeriodFilter}
            onClear={() => setPeriodFilter('all')}
            options={PERIOD_OPTIONS}
          />
          <EnumSelect
            label="User"
            value={userFilter}
            onValueChange={setUserFilter}
            onClear={() => setUserFilter('all')}
            options={userOptions}
          />
          <EnumSelect
            label="Module"
            value={moduleFilter}
            onValueChange={setModuleFilter}
            onClear={() => setModuleFilter('all')}
            options={MODULE_OPTIONS}
          />
          <EnumSelect
            label="Action"
            value={actionFilter}
            onValueChange={setActionFilter}
            onClear={() => setActionFilter('all')}
            options={ACTION_OPTIONS}
          />
        </div>
      </DataTableFilterBar>

      {/* ── Table ── */}
      <Card>
        {/* Mobile cards */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Loading audit log…</p>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No audit entries"
              description={activeFilterCount > 0 || searchQuery ? 'Try adjusting your filters.' : 'No system changes have been logged yet.'}
              actionLabel={activeFilterCount > 0 || searchQuery ? 'Clear filters' : undefined}
              onAction={activeFilterCount > 0 || searchQuery ? () => { clearFilters(); setSearchQuery('') } : undefined}
            />
          ) : (
            <div className="divide-y divide-border/40">
              {rows.map((r) => {
                const summary = changesSummary(r)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDetailRow(r)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={actionBadgeVariant(r.action)} size="sm">{r.action}</Badge>
                        <Badge variant="secondary" size="sm">{r.module}</Badge>
                      </div>
                      <p className="truncate text-sm font-medium">
                        {recordLabel(r) ?? r.module}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {summary.text}{summary.hint ? ` · ${prettyKey(summary.hint)}` : ''}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        {r.user?.name ?? r.userId} · {formatDateTime(r.createdAt)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="py-4">
                      <div className="h-3 w-full rounded bg-muted animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16">
                    <EmptyState
                      icon={Shield}
                      title="No audit entries"
                      description={activeFilterCount > 0 || searchQuery ? 'Try adjusting your filters.' : 'No system changes have been logged yet.'}
                      actionLabel={activeFilterCount > 0 || searchQuery ? 'Clear filters' : undefined}
                      onAction={activeFilterCount > 0 || searchQuery ? () => { clearFilters(); setSearchQuery('') } : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const summary = changesSummary(r)
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => setDetailRow(r)}
                    >
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium leading-tight">{r.user?.name ?? r.userId}</p>
                          {r.user?.role && (
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {ROLE_LABEL[r.user.role] ?? r.user.role}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" size="sm">{r.module}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionBadgeVariant(r.action)} size="sm">{r.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-44">
                        <span className="block truncate font-medium" title={recordLabel(r) ?? undefined}>
                          {recordLabel(r) ?? <span className="text-muted-foreground/60">—</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{summary.text}</span>
                          {summary.hint && (
                            <span className="text-[10px] text-muted-foreground">{prettyKey(summary.hint)}</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={total}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* ── Detail Sheet ── */}
      <AuditDetailSheet row={detailRow} onClose={() => setDetailRow(null)} />
    </motion.div>
  )
}

// ─── Detail Sheet ────────────────────────────────────────────────────

function AuditDetailSheet({ row, onClose }: { row: AuditLogRow | null; onClose: () => void }) {
  const open = !!row

  // Diff: for UPDATE, list keys whose JSON-serialised value changed. For
  // CREATE / DELETE the full single-side payload is shown unchanged.
  const diff = useMemo(() => {
    if (!row) return []
    const action = row.action.toUpperCase()
    if (action !== 'UPDATE') return []
    const newVal = (row.newValue as Record<string, unknown> | null) ?? {}
    const oldVal = (row.oldValue as Record<string, unknown> | null) ?? {}
    // Only consider the fields that were actually submitted in this update
    // (the keys present in newValue). Comparing against the captured
    // oldValue snapshot, keep just the ones whose value genuinely changed.
    // Iterating newValue (not the union with oldValue) avoids flagging
    // server-only columns (loyaltyPoints, currentOutstanding, …) that the
    // form never sent. Hidden/system keys are skipped entirely.
    return Object.keys(newVal)
      .filter((k) => !isHiddenKey(k))
      .filter((k) => JSON.stringify(newVal[k]) !== JSON.stringify(oldVal[k]))
      .map((k) => ({ key: k, oldVal: oldVal[k], newVal: newVal[k] }))
  }, [row])

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="p-0 gap-0 w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl flex flex-col h-dvh overflow-hidden"
      >
        {row && (
          <>
            <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-muted/20">
              <div className="flex items-start gap-3 pr-8">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 dark:bg-rose-500/15">
                  <Shield className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <SheetTitle className="text-base">
                    {recordLabel(row) ?? 'Audit Entry Details'}
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {formatDateTime(row.createdAt)} · by {row.user?.name ?? row.userId}
                    {row.user?.role ? ` (${ROLE_LABEL[row.user.role] ?? row.user.role})` : ''}
                  </SheetDescription>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Badge variant={actionBadgeVariant(row.action)} size="sm">{row.action}</Badge>
                    <Badge variant="secondary" size="sm">{row.module}</Badge>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Changes — readable field tables. Opaque DB ids (entity id, IP,
                  foreign keys) are deliberately not shown; only human-meaningful
                  fields and values appear. */}
              <div className="px-6 py-5 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What changed</p>
                {row.action.toUpperCase() === 'UPDATE' ? (
                  diff.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No field differences detected.</p>
                  ) : (
                    <FieldDiffTable rows={diff} />
                  )
                ) : row.action.toUpperCase() === 'CREATE' ? (
                  <FieldValueTable value={row.newValue} variant="success" emptyLabel="No fields recorded." />
                ) : row.action.toUpperCase() === 'DELETE' ? (
                  <FieldValueTable value={row.oldValue} variant="destructive" emptyLabel="No fields recorded." />
                ) : (
                  // Workflow actions (APPROVE / REJECT / SUBMIT / …). These
                  // change status, not document fields, and often carry no
                  // body. Show whatever payload exists (e.g. a rejection
                  // reason); otherwise a clear status line beats an empty box.
                  (() => {
                    const hasOld = visibleEntries(row.oldValue).length > 0
                    const hasNew = visibleEntries(row.newValue).length > 0
                    if (!hasOld && !hasNew) {
                      return (
                        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                          <Badge variant={actionBadgeVariant(row.action)} size="sm">{row.action}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {prettyAction(row.action)} action — no field-level changes were recorded.
                          </span>
                        </div>
                      )
                    }
                    return (
                      <div className="space-y-3">
                        {hasOld && <FieldValueTable value={row.oldValue} variant="destructive" heading="Before" />}
                        {hasNew && <FieldValueTable value={row.newValue} variant="success" heading="After" />}
                      </div>
                    )
                  })()
                )}
              </div>
            </div>

          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Pretty rendering helpers ────────────────────────────────────────
//
// The raw audit payloads are camelCase JSON like `{ batchNumber: 'B-1989',
// expiryDate: '2026-07-01T…', mrp: 1250 }`. The helpers below turn that into
// readable rows: "Batch Number → B-1989", "Expiry Date → 01/07/2026",
// "MRP → 1250". prettyKey covers the common pharma acronyms so they stay
// upper-case; prettyValue formats by inferred type.

// Common acronyms / proper nouns that should not be title-cased to "Mrp".
const KEY_ACRONYMS = new Set([
  'mrp', 'gst', 'gstin', 'hsn', 'id', 'po', 'grn', 'ip', 'sku', 'upi',
  'cgst', 'sgst', 'igst', 'dl', 'pan', 'tan', 'mfg', 'qty',
])

// Keys we never want to surface in the readable view — opaque identifiers,
// audit/back-reference fields, internal flags. They stay in the CSV export
// but are skipped in the field table. `productId` is opaque (PRD-HQ-002 /
// CUID strings) and always rides alongside `productName`, so it's redundant
// in the human-readable view.
const HIDDEN_KEYS = new Set([
  'id', 'createdAt', 'updatedAt', 'deletedAt', 'branchId', 'companyId',
  'isDeleted', '__v', 'productId',
  // Security: never render secrets in the audit UI, even if a payload
  // happens to carry one (defence-in-depth — the backend shouldn't log
  // these either, but the viewer must not surface them regardless).
  'password', 'passwordHash', 'hashedPassword', 'currentPassword',
  'newPassword', 'token', 'refreshToken', 'resetToken', 'otp',
])

// A key is hidden if it's in the explicit set OR it's an opaque foreign-key
// id (anything ending in "Id" — productId, batchId, grnId, invoiceId, …).
// These DB references are never meaningful to a human reading the audit, and
// the human label (productName, batchNumber, …) is always shown alongside.
function isHiddenKey(k: string): boolean {
  return HIDDEN_KEYS.has(k) || /Id$/.test(k)
}

// Preferred column order for object-array tables (e.g. GRN items, sale
// lines). Keys not listed here fall to the end in whatever order the first
// item carries them. Tweak this list to reshuffle the items table without
// touching the renderer.
const COLUMN_PRIORITY = [
  'name', 'productName', 'customerName', 'supplierName',
  'batchNumber', 'expiryDate', 'mfgDate',
  'orderedQty', 'receivedQty', 'freeQty', 'quantity',
  'mrp', 'rate', 'purchaseRate', 'sellingRate', 'wholesaleRate',
  'discountPercent', 'gstPercent', 'amount',
]

function prettyKey(key: string): string {
  // Snake → space, camel → space, then word-by-word: acronym → UPPER, else Title.
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (KEY_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
// Values like `2026-07-01T00:00:00.000Z` are date-only semantically — they
// just got stored with a midnight-UTC stamp. Render them with formatDate so
// the items table doesn't carry a useless "05:30 am" on every expiry row.
const ISO_MIDNIGHT_RE = /T00:00:00(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

// Single-line string formatter — used for the table's Changes column hint
// where we only have room for one short line of plain text.
function prettyValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (value === '') return '—'
    if (ISO_DATE_RE.test(value)) {
      if (value.length <= 10 || ISO_MIDNIGHT_RE.test(value)) return formatDate(value)
      return formatDateTime(value)
    }
    return value
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Empty'
    return value.length === 1 ? '1 item' : `${value.length} items`
  }
  if (typeof value === 'object') {
    try {
      const compact = JSON.stringify(value)
      return compact.length > 80 ? compact.slice(0, 77) + '…' : compact
    } catch {
      return '—'
    }
  }
  return String(value)
}

// Rich JSX renderer for the detail sheet — expands arrays of objects into
// numbered cards with their own field tables, and nested objects into
// inline mini-tables. This is what makes "Items: 5 items" become a real
// listing of every batch / qty / rate the user actually added.
function RichValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/70">—</span>
  }
  if (typeof value === 'boolean') {
    return <span>{value ? 'Yes' : 'No'}</span>
  }
  if (typeof value === 'number') {
    return <span className="tabular-nums">{value}</span>
  }
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) {
      const dateOnly = value.length <= 10 || ISO_MIDNIGHT_RE.test(value)
      return <span className="tabular-nums">{dateOnly ? formatDate(value) : formatDateTime(value)}</span>
    }
    return <span>{value}</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/70">Empty</span>
    // Array of primitives → comma-separated list (cheap, scannable).
    const allPrimitive = value.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    if (allPrimitive) {
      return <span>{value.map((v) => prettyValue(v)).join(', ')}</span>
    }
    // Array of objects (GRN items, sale lines, etc.) — render as one
    // horizontal table: headers across the top, one row per item. Much
    // easier to compare values across items than stacked cards. Cap
    // nesting at depth 2 so deeply recursive payloads don't render
    // unbounded.
    if (depth >= 2) {
      return <span className="text-muted-foreground/70">{value.length} items (collapsed)</span>
    }
    return <ObjectArrayTable items={value as Record<string, unknown>[]} depth={depth + 1} />
  }
  if (typeof value === 'object') {
    return <NestedObjectTable value={value} depth={depth + 1} />
  }
  return <span>{String(value)}</span>
}

function NestedObjectTable({ value, depth }: { value: unknown; depth: number }) {
  const entries = visibleEntries(value)
  if (entries.length === 0) {
    return <span className="px-2 py-1 text-muted-foreground/70 text-[11px]">—</span>
  }
  return (
    <table className="w-full text-[11px]">
      <tbody className="divide-y divide-border/30">
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td className="px-2 py-1 text-muted-foreground align-top whitespace-nowrap">{prettyKey(k)}</td>
            <td className="px-2 py-1 wrap-break-word w-full"><RichValue value={v} depth={depth} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Horizontal table for arrays of homogeneous objects (e.g. GRN items, sale
// invoice line items). Columns are the union of keys across all items,
// preserving the first item's key order and appending any extras at the
// end. Overflows scroll horizontally for wide records.
function ObjectArrayTable({
  items,
  depth,
}: {
  items: Record<string, unknown>[]
  depth: number
}) {
  // Build the column list: union of keys across all items minus HIDDEN_KEYS,
  // sorted so that COLUMN_PRIORITY keys come first (in their listed order)
  // and any leftover keys keep the order they appeared in the data.
  const columns = (() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      for (const k of Object.keys(item)) {
        if (isHiddenKey(k)) continue
        if (!seen.has(k)) {
          seen.add(k)
          ordered.push(k)
        }
      }
    }
    const priorityIndex = (k: string) => {
      const idx = COLUMN_PRIORITY.indexOf(k)
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
    }
    return ordered
      .map((k, i) => ({ k, pri: priorityIndex(k), seen: i }))
      .sort((a, b) => (a.pri - b.pri) || (a.seen - b.seen))
      .map((x) => x.k)
  })()

  if (columns.length === 0) {
    return <span className="text-muted-foreground/70 text-[11px]">No fields</span>
  }

  return (
    <div className="rounded-md border border-border/40 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/30">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-1.5 text-center font-semibold w-8">#</th>
            {columns.map((c) => (
              <th key={c} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                {prettyKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {items.map((item, i) => (
            <tr key={i} className="align-top">
              <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{i + 1}</td>
              {columns.map((c) => (
                <td key={c} className="px-2 py-1.5 wrap-break-word">
                  <RichValue value={item?.[c]} depth={depth} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function visibleEntries(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).filter(([k]) => !isHiddenKey(k))
}

function FieldValueTable({
  value,
  variant,
  heading,
  emptyLabel,
}: {
  value: unknown
  variant: 'success' | 'destructive'
  heading?: string
  emptyLabel?: string
}) {
  const entries = visibleEntries(value)
  const border = variant === 'success' ? 'border-emerald-500/25' : 'border-rose-500/25'
  const tint = variant === 'success' ? 'bg-emerald-500/5' : 'bg-rose-500/5'
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{emptyLabel ?? 'Nothing to show.'}</p>
  }
  return (
    <div className="space-y-1.5">
      {heading && (
        <p className={cn(
          'text-[10px] font-semibold uppercase tracking-wider',
          variant === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        )}>{heading}</p>
      )}
      <div className={cn('rounded-lg border overflow-hidden', border, tint)}>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-border/40">
            {entries.map(([key, val]) => (
              <tr key={key}>
                <td className="px-3 py-2 text-muted-foreground font-medium align-top whitespace-nowrap">
                  {prettyKey(key)}
                </td>
                <td className="px-3 py-2 wrap-break-word align-top w-full">
                  <RichValue value={val} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FieldDiffTable({
  rows,
}: {
  rows: Array<{ key: string; oldVal: unknown; newVal: unknown }>
}) {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold w-1/3">Field</th>
            <th className="px-3 py-2 text-left font-semibold">Old value</th>
            <th className="px-3 py-2 text-left font-semibold">New value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map(({ key, oldVal, newVal }) => (
            <tr key={key}>
              <td className="px-3 py-2 font-medium align-top">{prettyKey(key)}</td>
              <td className="px-3 py-2 align-top wrap-break-word">
                <div className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-400 inline-block max-w-full">
                  <RichValue value={oldVal} />
                </div>
              </td>
              <td className="px-3 py-2 align-top wrap-break-word">
                <div className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 inline-block max-w-full">
                  <RichValue value={newVal} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
