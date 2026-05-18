import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  RotateCcw,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn, formatDate } from '@/lib/utils'
import { exportToCsv, exportToPdf } from '@/lib/exportUtils'
import { exportToExcel } from '@/lib/excelUtils'

import { USE_MOCK_DATA, mockFilteredLeads, MOCK_LEADS } from '../mockData'
import type { Lead, LeadSource, LeadStage, LeadTab } from '../types'

// ── Props ─────────────────────────────────────────────────────────────
interface ExportLeadsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Mirror of the current list state — used to populate the "Current view"
  // scope count and to forward the exact filter set to the backend.
  filteredCount: number
  totalCount: number | null
  currentFilters: {
    q: string
    tab: LeadTab
    stage: LeadStage[]
    source: LeadSource[]
    assignedToUserId?: string
    createdFrom?: string
    createdTo?: string
    updatedFrom?: string
    updatedTo?: string
  }
  selectedIds: string[]
}

// ── Column registry ──────────────────────────────────────────────────
// Each entry maps a column to (a) its label in the export, (b) the path/
// accessor for pulling the value off a Lead object. Defining this once
// here keeps the column-picker UI and the actual flattening loop in sync.
interface ExportColumn {
  key: string
  label: string
  group: 'Lead' | 'Contact' | 'Company' | 'System'
  defaultChecked?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  read: (lead: any) => string | number
}

const COLUMNS: ExportColumn[] = [
  { key: 'leadNumber', label: 'Lead Number', group: 'Lead', defaultChecked: true, read: (l) => l.leadNumber ?? '' },
  { key: 'title', label: 'Title', group: 'Lead', defaultChecked: true, read: (l) => l.title ?? '' },
  { key: 'description', label: 'Description', group: 'Lead', read: (l) => l.description ?? '' },
  { key: 'stage', label: 'Stage', group: 'Lead', defaultChecked: true, read: (l) => l.stage ?? '' },
  { key: 'status', label: 'Status', group: 'Lead', read: (l) => l.status ?? '' },
  { key: 'pipeline', label: 'Pipeline', group: 'Lead', read: (l) => l.pipeline ?? '' },
  { key: 'source', label: 'Source', group: 'Lead', defaultChecked: true, read: (l) => l.source ?? '' },
  { key: 'score', label: 'Score', group: 'Lead', defaultChecked: true, read: (l) => Number(l.score ?? 0) },
  { key: 'value', label: 'Value', group: 'Lead', defaultChecked: true, read: (l) => Number(l.value ?? 0) },
  { key: 'currency', label: 'Currency', group: 'Lead', read: (l) => l.currency ?? 'INR' },
  { key: 'touchStatus', label: 'Touch Status', group: 'Lead', read: (l) => l.touchStatus ?? '' },
  { key: 'expectedCloseDate', label: 'Expected Close', group: 'Lead', read: (l) => l.expectedCloseDate ? formatDate(l.expectedCloseDate) : '' },
  { key: 'validUntil', label: 'Valid Until', group: 'Lead', read: (l) => l.validUntil ? formatDate(l.validUntil) : '' },

  { key: 'firstName', label: 'First Name', group: 'Contact', defaultChecked: true, read: (l) => l.contact?.firstName ?? '' },
  { key: 'lastName', label: 'Last Name', group: 'Contact', defaultChecked: true, read: (l) => l.contact?.lastName ?? '' },
  { key: 'phone', label: 'Phone', group: 'Contact', defaultChecked: true, read: (l) => l.contact?.phone ? `${l.contact.phoneCountryCode ?? ''}${l.contact.phone}` : '' },
  { key: 'email', label: 'Email', group: 'Contact', defaultChecked: true, read: (l) => l.contact?.email ?? '' },
  { key: 'jobTitle', label: 'Job Title', group: 'Contact', read: (l) => l.contact?.jobTitle ?? '' },
  { key: 'address', label: 'Address', group: 'Contact', read: (l) => l.contact?.address ?? '' },
  { key: 'city', label: 'City', group: 'Contact', defaultChecked: true, read: (l) => l.contact?.city ?? '' },
  { key: 'state', label: 'State', group: 'Contact', read: (l) => l.contact?.state ?? '' },
  { key: 'country', label: 'Country', group: 'Contact', read: (l) => l.contact?.country ?? '' },

  { key: 'company', label: 'Company', group: 'Company', read: (l) => l.company?.name ?? '' },
  { key: 'industry', label: 'Industry', group: 'Company', read: (l) => l.company?.industry ?? '' },

  { key: 'assignedTo', label: 'Assigned To', group: 'System', defaultChecked: true, read: (l) => l.assignedToUser?.name ?? '' },
  { key: 'createdAt', label: 'Created', group: 'System', defaultChecked: true, read: (l) => l.createdAt ? formatDate(l.createdAt) : '' },
  { key: 'updatedAt', label: 'Updated', group: 'System', read: (l) => l.updatedAt ? formatDate(l.updatedAt) : '' },
]

const COLUMN_GROUPS: Array<ExportColumn['group']> = [
  'Lead',
  'Contact',
  'Company',
  'System',
]

const DEFAULT_KEYS = COLUMNS.filter((c) => c.defaultChecked).map((c) => c.key)

type Scope = 'all' | 'filtered' | 'selected'
type Format = 'csv' | 'xlsx' | 'pdf'

// ── Component ─────────────────────────────────────────────────────────
export function ExportLeadsDrawer({
  open,
  onOpenChange,
  filteredCount,
  totalCount,
  currentFilters,
  selectedIds,
}: ExportLeadsDrawerProps) {
  const [scope, setScope] = useState<Scope>('filtered')
  const [pickedKeys, setPickedKeys] = useState<string[]>(DEFAULT_KEYS)
  const [format, setFormat] = useState<Format>('csv')
  const [busy, setBusy] = useState(false)

  // When the drawer opens, reset to sensible defaults so each session starts
  // fresh and doesn't leak the last user's choices.
  useEffect(() => {
    if (!open) return
    setScope(selectedIds.length > 0 ? 'selected' : 'filtered')
    setPickedKeys(DEFAULT_KEYS)
    setFormat('csv')
  }, [open, selectedIds.length])

  // ── Row count for the chosen scope ──
  // Used for the footer button label and for sanity-checking the user's
  // selection before we hit the backend. We don't know the absolute count
  // of "all leads in branch" until the API returns — so we show a `?` until
  // the request completes if totalCount wasn't supplied.
  const scopeCount = useMemo(() => {
    if (scope === 'selected') return selectedIds.length
    if (scope === 'filtered') return filteredCount
    return totalCount ?? filteredCount
  }, [scope, selectedIds.length, filteredCount, totalCount])

  const scopeDisabled: Record<Scope, boolean> = {
    all: false,
    filtered: false,
    selected: selectedIds.length === 0,
  }

  const toggleKey = (key: string) =>
    setPickedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )

  // Reset the column picker to the originally-checked defaults.
  const resetColumns = () => setPickedKeys(DEFAULT_KEYS)
  const selectAllColumns = () => setPickedKeys(COLUMNS.map((c) => c.key))
  const clearColumns = () => setPickedKeys([])

  async function fetchRows(): Promise<Lead[]> {
    // Mock mode short circuit — works against the in-memory MOCK_LEADS so
    // the user can still see the export drawer behave realistically without
    // hitting the API.
    if (USE_MOCK_DATA) {
      if (scope === 'selected') {
        return MOCK_LEADS.filter((l) => selectedIds.includes(l.id))
      }
      if (scope === 'all') return MOCK_LEADS
      return mockFilteredLeads({
        q: currentFilters.q,
        tab: currentFilters.tab,
        stage: currentFilters.stage,
        source: currentFilters.source,
      })
    }

    const params: Record<string, string> = {}
    if (scope === 'selected') {
      params.ids = selectedIds.join(',')
    } else if (scope === 'filtered') {
      if (currentFilters.q) params.q = currentFilters.q
      if (currentFilters.tab) params.tab = currentFilters.tab
      if (currentFilters.stage.length > 0) params.stage = currentFilters.stage.join(',')
      if (currentFilters.source.length > 0) params.source = currentFilters.source.join(',')
      if (currentFilters.assignedToUserId) params.assignedToUserId = currentFilters.assignedToUserId
      if (currentFilters.createdFrom) params.createdFrom = currentFilters.createdFrom
      if (currentFilters.createdTo) params.createdTo = currentFilters.createdTo
      if (currentFilters.updatedFrom) params.updatedFrom = currentFilters.updatedFrom
      if (currentFilters.updatedTo) params.updatedTo = currentFilters.updatedTo
    }
    // scope === 'all' → no filter params, backend returns everything in branch
    const res = await api.get('/leads/export', { params })
    return Array.isArray(res.data) ? res.data : []
  }

  // Flatten Lead objects to plain string-keyed rows in the order the user
  // picked. The order of `pickedKeys` is the column order in the output.
  function buildRows(leads: Lead[]): Record<string, string | number>[] {
    const cols = pickedKeys
      .map((k) => COLUMNS.find((c) => c.key === k))
      .filter((c): c is ExportColumn => Boolean(c))
    return leads.map((l) => {
      const row: Record<string, string | number> = {}
      for (const c of cols) {
        row[c.label] = c.read(l)
      }
      return row
    })
  }

  async function startExport() {
    if (pickedKeys.length === 0) {
      toast.error('Pick at least one column to export')
      return
    }
    setBusy(true)
    try {
      const leads = await fetchRows()
      if (leads.length === 0) {
        toast.info('Nothing to export — no leads matched the current scope')
        return
      }
      const rows = buildRows(leads)
      const ts = new Date()
        .toISOString()
        .replace(/[:T]/g, '-')
        .slice(0, 16)
      const filename = `leads-export-${ts}`
      if (format === 'csv') exportToCsv(rows, filename)
      else if (format === 'xlsx') exportToExcel(rows, filename)
      else exportToPdf(rows, 'Leads', filename)
      toast.success(
        `Downloaded ${leads.length.toLocaleString()} lead${leads.length === 1 ? '' : 's'}`,
      )
      onOpenChange(false)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string | string[] } } }
      const raw = e?.response?.data?.message
      toast.error(
        Array.isArray(raw) ? raw.join(' • ') : (raw ?? 'Export failed'),
      )
    } finally {
      setBusy(false)
    }
  }

  // ── Render ──
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]"
      >
        <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <Download className="h-4 w-4 text-muted-foreground" />
            <span>Export Leads</span>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Pick what to export, which columns, and the file format — then
            download.
          </p>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            {/* Section 1: Scope */}
            <Section
              title="1. What to export"
              subtitle="Choose which leads end up in the file."
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ScopeCard
                  active={scope === 'filtered'}
                  disabled={scopeDisabled.filtered}
                  title="Current view"
                  description="Matches the filters/tab/search applied right now"
                  count={filteredCount}
                  onClick={() => setScope('filtered')}
                />
                <ScopeCard
                  active={scope === 'selected'}
                  disabled={scopeDisabled.selected}
                  title="Selected rows"
                  description={
                    selectedIds.length === 0
                      ? 'Select rows in the table to enable'
                      : 'Just the rows you checked'
                  }
                  count={selectedIds.length}
                  onClick={() => setScope('selected')}
                />
                <ScopeCard
                  active={scope === 'all'}
                  disabled={scopeDisabled.all}
                  title="All leads"
                  description="Every lead in this branch (capped at 50,000)"
                  count={totalCount ?? null}
                  onClick={() => setScope('all')}
                />
              </div>
            </Section>

            {/* Section 2: Columns */}
            <Section
              title="2. Columns"
              subtitle={`${pickedKeys.length} of ${COLUMNS.length} fields selected.`}
              accessory={
                // Visible-border buttons with icons so they read as actions,
                // not labels. Kept compact (h-7) so they don't dwarf the
                // section header text on their left.
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={selectAllColumns}
                  >
                    <CheckSquare className="h-3 w-3" />
                    <span>All</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={clearColumns}
                  >
                    <Square className="h-3 w-3" />
                    <span>None</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={resetColumns}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </Button>
                </div>
              }
            >
              <div className="space-y-3">
                {COLUMN_GROUPS.map((group) => {
                  const cols = COLUMNS.filter((c) => c.group === group)
                  return (
                    <div key={group}>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {cols.map((c) => {
                          const checked = pickedKeys.includes(c.key)
                          return (
                            <label
                              key={c.key}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                                checked
                                  ? 'border-primary/40 bg-primary/[0.05] text-foreground'
                                  : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleKey(c.key)}
                              />
                              <span className="truncate">{c.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>

            {/* Section 3: Format */}
            <Section
              title="3. Format"
              subtitle="CSV opens anywhere. Excel preserves number/date formatting. PDF is best for printed reports."
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <FormatCard
                  active={format === 'csv'}
                  icon={FileText}
                  title="CSV"
                  hint=".csv — universal, opens in any spreadsheet"
                  onClick={() => setFormat('csv')}
                />
                <FormatCard
                  active={format === 'xlsx'}
                  icon={FileSpreadsheet}
                  title="Excel"
                  hint=".xlsx — keeps types, native in Excel/Sheets"
                  onClick={() => setFormat('xlsx')}
                />
                <FormatCard
                  active={format === 'pdf'}
                  icon={Printer}
                  title="PDF"
                  hint=".pdf — printable report layout"
                  onClick={() => setFormat('pdf')}
                />
              </div>
            </Section>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 bg-background px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={startExport}
            disabled={busy || pickedKeys.length === 0 || scopeCount === 0}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Preparing…</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>
                  Download {scopeCount > 0 && `${scopeCount.toLocaleString()} as `}
                  {format === 'csv' ? 'CSV' : format === 'xlsx' ? 'Excel' : 'PDF'}
                </span>
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────
function Section({
  title,
  subtitle,
  accessory,
  children,
}: {
  title: string
  subtitle?: string
  accessory?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border/40 bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {accessory}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

// ── Scope card ───────────────────────────────────────────────────────
function ScopeCard({
  active,
  disabled,
  title,
  description,
  count,
  onClick,
}: {
  active: boolean
  disabled: boolean
  title: string
  description: string
  count: number | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed border-border/40 bg-muted/15 opacity-60'
          : active
            ? 'border-primary bg-primary/[0.06]'
            : 'border-border hover:border-border/80 hover:bg-muted/30',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {active && !disabled && (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        )}
      </div>
      <Badge size="sm" variant="secondary" className="font-mono text-[10px]">
        {count === null ? '—' : count.toLocaleString()}
        {' rows'}
      </Badge>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {description}
      </p>
    </button>
  )
}

// ── Format card ──────────────────────────────────────────────────────
function FormatCard({
  active,
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  active: boolean
  icon: typeof FileText
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/[0.06]'
          : 'border-border hover:border-border/80 hover:bg-muted/30',
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </button>
  )
}
