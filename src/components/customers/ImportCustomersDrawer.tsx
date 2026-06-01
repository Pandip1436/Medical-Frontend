import { useCallback, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload as UploadIcon,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatCurrency } from '@/lib/utils'

import {
  type DuplicateHandling,
  type ParseError,
  type ParseResult,
  type ParsedCustomer,
  downloadCustomerImportTemplate,
  parseCustomerImportWorkbook,
} from '@/lib/customerImportTemplate'

// ─────────────────────────────────────────────────────────────────────────────
// Backend result shape — mirrors backend/src/customers/dto/import-customers.dto.ts
// Keep this in lockstep with that file. We don't import from the backend (no
// shared package) so any drift becomes a UI bug; the preview banner is the
// only thing that breaks visibly.
// ─────────────────────────────────────────────────────────────────────────────

type SheetName =
  | 'Customers'
  | 'Invoices'
  | 'Invoice Items'
  | 'Payments'
  | 'Activities'
  | 'Prescriptions'
  | 'Quotations'
  | 'Quotation Items'
  | 'Credit Notes'
  | 'Credit Note Items'

interface ImportRowError {
  sheet: SheetName
  row: number
  customerCode?: string
  field?: string
  message: string
}

interface ImportRowWarning extends ImportRowError {
  kind: 'duplicate' | 'missing-link' | 'coerced'
}

interface ImportDuplicateMatch {
  customerCode?: string
  sourceRow: number
  action: 'will-update' | 'will-skip' | 'will-create-new'
  existingCustomer: { id: string; name: string; phone: string }
}

interface ImportSummary {
  customers: { created: number; updated: number; skipped: number; failed: number }
  invoices: { created: number; skipped: number; failed: number }
  invoiceItems: { created: number }
  payments: { created: number; skipped: number; failed: number }
  activities: { created: number; failed: number }
  prescriptions: { created: number; failed: number }
  quotations: { created: number; skipped: number; failed: number }
  quotationItems: { created: number }
  creditNotes: { created: number; skipped: number; failed: number }
  creditNoteItems: { created: number }
  openingBalanceApplied: number
}

interface ImportResult {
  dryRun: boolean
  summary: ImportSummary
  duplicates: ImportDuplicateMatch[]
  errors: ImportRowError[]
  warnings: ImportRowWarning[]
}

interface ImportCustomersDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

type Stage = 'upload' | 'parsing' | 'preview' | 'committing' | 'done'

const DUPLICATE_OPTIONS: Array<{
  value: DuplicateHandling
  label: string
  hint: string
}> = [
  {
    value: 'UPDATE',
    label: 'Update existing',
    hint: 'If a phone matches, refresh that customer\'s details from the file.',
  },
  {
    value: 'SKIP',
    label: 'Skip duplicates',
    hint: 'Leave matching customers untouched. Their history rows are skipped too.',
  },
  {
    value: 'CREATE',
    label: 'Create new only',
    hint: 'Refuse to import a row if the phone is already used. Safest option.',
  },
]

export function ImportCustomersDrawer({
  open,
  onOpenChange,
  onImported,
}: ImportCustomersDrawerProps) {
  const [stage, setStage] = useState<Stage>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<ImportResult | null>(null)
  const [commitResult, setCommitResult] = useState<ImportResult | null>(null)
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>('UPDATE')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStage('upload')
    setFile(null)
    setParseResult(null)
    setParseError(null)
    setPreviewResult(null)
    setCommitResult(null)
    setDuplicateHandling('UPDATE')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const closeDrawer = useCallback(() => {
    onOpenChange(false)
    // Defer reset so the drawer-exit animation doesn't visibly flip back to
    // the upload state mid-animation.
    setTimeout(reset, 300)
  }, [onOpenChange, reset])

  // ── Parse & preview ──────────────────────────────────────────────────────

  const buildPayload = useCallback(
    (parsed: ParseResult, handling: DuplicateHandling, dryRun: boolean) => ({
      duplicateHandling: handling,
      dryRun,
      customers: parsed.customers.map((c) => ({
        sourceRow: c.sourceRow,
        customerCode: c.customerCode,
        name: c.name,
        phone: c.phone,
        alternatePhone: c.alternatePhone,
        email: c.email,
        address: c.address,
        type: c.type,
        doctorRef: c.doctorRef,
        referredBy: c.referredBy,
        creditLimit: c.creditLimit,
        openingBalance: c.openingBalance,
        gstin: c.gstin,
        dlNumber: c.dlNumber,
        registrationNumber: c.registrationNumber,
        notes: c.notes,
        whatsappOptIn: c.whatsappOptIn,
        whatsappNumber: c.whatsappNumber,
        invoices: c.invoices,
        payments: c.payments,
        activities: c.activities,
        prescriptions: c.prescriptions,
        quotations: c.quotations,
        creditNotes: c.creditNotes,
      })),
    }),
    [],
  )

  const runPreview = useCallback(
    async (parsed: ParseResult, handling: DuplicateHandling) => {
      try {
        const payload = buildPayload(parsed, handling, true)
        if (payload.customers.length === 0) {
          setPreviewResult(null)
          return
        }
        const res = await api.post<ImportResult>(
          '/customers/import/preview',
          payload,
        )
        setPreviewResult(res.data)
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err instanceof Error ? err.message : 'Failed to preview import')
        toast.error(String(msg))
      }
    },
    [buildPayload],
  )

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f)
      setParseError(null)
      setParseResult(null)
      setPreviewResult(null)
      setStage('parsing')
      try {
        const parsed = await parseCustomerImportWorkbook(f)
        setParseResult(parsed)
        if (parsed.customers.length === 0) {
          setParseError(
            'No usable customer rows found. Did you upload the right file? Use the "Download template" button on the upload screen for the expected format.',
          )
          setStage('upload')
          return
        }
        setStage('preview')
        await runPreview(parsed, duplicateHandling)
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : 'Failed to read the file',
        )
        setStage('upload')
      }
    },
    [duplicateHandling, runPreview],
  )

  const onChangeHandling = useCallback(
    async (h: DuplicateHandling) => {
      setDuplicateHandling(h)
      if (parseResult) {
        await runPreview(parseResult, h)
      }
    },
    [parseResult, runPreview],
  )

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }, [handleFile])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  // ── Commit ───────────────────────────────────────────────────────────────

  const commitImport = useCallback(async () => {
    if (!parseResult) return
    setStage('committing')
    try {
      const res = await api.post<ImportResult>(
        '/customers/import/commit',
        buildPayload(parseResult, duplicateHandling, false),
      )
      setCommitResult(res.data)
      setStage('done')
      const s = res.data.summary
      toast.success(
        `Imported ${s.customers.created} new customers, updated ${s.customers.updated}, with ${s.invoices.created} invoices and ${s.payments.created} payments.`,
      )
      onImported()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Import failed')
      toast.error(String(msg))
      setStage('preview')
    }
  }, [buildPayload, duplicateHandling, onImported, parseResult])

  // ── Derived counts for preview banner ────────────────────────────────────

  const parsedCounts = useMemo(() => {
    if (!parseResult) return null
    const cs = parseResult.customers
    return {
      customers: cs.length,
      invoices: cs.reduce((s, c) => s + c.invoices.length, 0),
      invoiceItems: cs.reduce(
        (s, c) => s + c.invoices.reduce((ss, inv) => ss + inv.items.length, 0),
        0,
      ),
      payments: cs.reduce((s, c) => s + c.payments.length, 0),
      activities: cs.reduce((s, c) => s + c.activities.length, 0),
      prescriptions: cs.reduce((s, c) => s + c.prescriptions.length, 0),
      quotations: cs.reduce((s, c) => s + c.quotations.length, 0),
      creditNotes: cs.reduce((s, c) => s + c.creditNotes.length, 0),
    }
  }, [parseResult])

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : closeDrawer())}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-160 lg:max-w-190 p-0 gap-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-4 pr-12 border-b border-border/40 shrink-0 space-y-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Import Customers
            </SheetTitle>
            <Badge variant="secondary" size="sm" className="font-mono">
              {stage === 'upload' && 'Step 1 of 2 · Upload'}
              {stage === 'parsing' && 'Reading file…'}
              {stage === 'preview' && 'Step 2 of 2 · Review'}
              {stage === 'committing' && 'Importing…'}
              {stage === 'done' && 'Done'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Import customers and their full history — past invoices, payments, activities and prescriptions — in one go.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {stage === 'upload' || stage === 'parsing' ? (
            <UploadStage
              file={file}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              onDrop={onDrop}
              onPickFile={onPickFile}
              fileInputRef={fileInputRef}
              parseError={parseError}
              duplicateHandling={duplicateHandling}
              onChangeHandling={setDuplicateHandling}
              parsing={stage === 'parsing'}
            />
          ) : null}

          {stage === 'preview' && parseResult && parsedCounts ? (
            <PreviewStage
              parsed={parseResult}
              parsedCounts={parsedCounts}
              previewResult={previewResult}
              duplicateHandling={duplicateHandling}
              onChangeHandling={onChangeHandling}
            />
          ) : null}

          {stage === 'committing' ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-sm text-muted-foreground">
                Importing customers and history into the database…
              </p>
              <p className="text-xs text-muted-foreground">
                Don't close this drawer.
              </p>
            </div>
          ) : null}

          {stage === 'done' && commitResult ? (
            <DoneStage result={commitResult} />
          ) : null}
        </div>

        {/* Footer — buttons */}
        <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-3 bg-background border-t border-border/40">
          {stage === 'upload' || stage === 'parsing' ? (
            <>
              <Button variant="outline" onClick={closeDrawer}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadCustomerImportTemplate()}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Download template
              </Button>
            </>
          ) : null}

          {stage === 'preview' ? (
            <>
              <Button variant="outline" onClick={reset}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Choose another file
              </Button>
              <Button
                onClick={commitImport}
                disabled={
                  !parseResult ||
                  parseResult.customers.length === 0 ||
                  (previewResult?.errors.length ?? 0) >=
                    (parsedCounts?.customers ?? 0)
                }
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Import {parsedCounts?.customers ?? 0} customers
              </Button>
            </>
          ) : null}

          {stage === 'done' ? (
            <Button onClick={closeDrawer}>
              Close
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload stage
// ─────────────────────────────────────────────────────────────────────────────

interface UploadStageProps {
  file: File | null
  isDragging: boolean
  setIsDragging: (v: boolean) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  parseError: string | null
  duplicateHandling: DuplicateHandling
  onChangeHandling: (h: DuplicateHandling) => void
  parsing: boolean
}

function UploadStage({
  file,
  isDragging,
  setIsDragging,
  onDrop,
  onPickFile,
  fileInputRef,
  parseError,
  duplicateHandling,
  onChangeHandling,
  parsing,
}: UploadStageProps) {
  return (
    <>
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors',
          isDragging
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
            : 'border-border/50 bg-muted/10',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
          {parsing ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <UploadIcon className="h-6 w-6" />
          )}
        </div>
        <p className="text-sm font-medium">
          {parsing
            ? 'Reading the workbook…'
            : 'Drop your customer workbook (.xlsx) here'}
        </p>
        <p className="text-xs text-muted-foreground">
          {file ? file.name : 'or click to pick a file from your computer'}
        </p>
        <label className="cursor-pointer">
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".xlsx,.xls"
            onChange={onPickFile}
            disabled={parsing}
          />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
            <UploadIcon className="h-3.5 w-3.5" />
            Choose file
          </span>
        </label>
      </div>

      {parseError ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{parseError}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          What if a customer's phone is already in the system?
        </Label>
        <DuplicateHandlingRadio
          value={duplicateHandling}
          onChange={onChangeHandling}
        />
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs space-y-2">
        <p className="font-semibold flex items-center gap-1.5">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          What goes in the template?
        </p>
        <ul className="ml-5 space-y-1 list-disc text-muted-foreground">
          <li><span className="text-foreground font-medium">Customers</span> — name, phone, type, GSTIN, opening balance, credit limit, etc.</li>
          <li><span className="text-foreground font-medium">Invoices</span> + <span className="text-foreground font-medium">Invoice Items</span> — past bills with line items, linked by an invoice reference.</li>
          <li><span className="text-foreground font-medium">Payments</span> — historical receipts with mode + reference.</li>
          <li><span className="text-foreground font-medium">Activities</span> — calls, WhatsApp, emails, notes, reminders.</li>
          <li><span className="text-foreground font-medium">Prescriptions</span> — doctor name and validity.</li>
        </ul>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview stage
// ─────────────────────────────────────────────────────────────────────────────

interface PreviewStageProps {
  parsed: ParseResult
  parsedCounts: {
    customers: number
    invoices: number
    invoiceItems: number
    payments: number
    activities: number
    prescriptions: number
    quotations: number
    creditNotes: number
  }
  previewResult: ImportResult | null
  duplicateHandling: DuplicateHandling
  onChangeHandling: (h: DuplicateHandling) => void
}

function PreviewStage({
  parsed,
  parsedCounts,
  previewResult,
  duplicateHandling,
  onChangeHandling,
}: PreviewStageProps) {
  const errors = previewResult?.errors ?? []
  const warnings = previewResult?.warnings ?? []
  const duplicates = previewResult?.duplicates ?? []
  const summary = previewResult?.summary

  // Combine client-side parse errors with server-side validation errors so the
  // user sees one unified problem list.
  const allErrors: (ParseError | ImportRowError)[] = [
    ...parsed.errors,
    ...errors,
  ]

  return (
    <>
      {/* Round-trip safety banner — only shown when the uploaded file is an
          exported workbook (has the export metadata block on the Instructions
          sheet). Helps the operator catch "this is from a different branch"
          or "someone edited the file unexpectedly" cases before commit. */}
      {parsed.exportMetadata ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            This file is a {parsed.exportMetadata.entity.toLowerCase()} export
            {parsed.exportMetadata.branchName
              ? ` from ${parsed.exportMetadata.branchName}`
              : ''}
            {parsed.exportMetadata.exportedAt
              ? `, taken on ${parsed.exportMetadata.exportedAt.slice(0, 10)}`
              : ''}
            {parsed.exportMetadata.exportedBy
              ? ` by ${parsed.exportMetadata.exportedBy}`
              : ''}
            . Choose "Update existing" to write your edits back. Make sure no
            one else has changed these records since the export.
          </p>
        </div>
      ) : null}

      {/* Summary banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Customers" value={parsedCounts.customers} tone="emerald" />
        <StatCard label="Invoices" value={parsedCounts.invoices} tone="blue" />
        <StatCard label="Invoice items" value={parsedCounts.invoiceItems} tone="blue" />
        <StatCard label="Payments" value={parsedCounts.payments} tone="purple" />
        <StatCard label="Activities" value={parsedCounts.activities} tone="amber" />
        <StatCard label="Prescriptions" value={parsedCounts.prescriptions} tone="rose" />
        <StatCard label="Quotations" value={parsedCounts.quotations} tone="blue" />
        <StatCard label="Credit Notes" value={parsedCounts.creditNotes} tone="purple" />
      </div>

      {/* What-will-happen banner */}
      {summary ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-medium flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            On import this file will create {summary.customers.created} new customer{summary.customers.created === 1 ? '' : 's'}
            {summary.customers.updated > 0 ? `, update ${summary.customers.updated}` : ''}
            {summary.customers.skipped > 0 ? `, skip ${summary.customers.skipped}` : ''}
            , and add {summary.invoices.created} invoices, {summary.payments.created} payments, {summary.activities.created} activities, {summary.prescriptions.created} prescriptions, {summary.quotations.created} quotations, {summary.creditNotes.created} credit notes.
            {summary.openingBalanceApplied > 0
              ? ` Total opening balance: ${formatCurrency(summary.openingBalanceApplied)}.`
              : ''}
          </p>
        </div>
      ) : null}

      {/* Duplicate handling — adjustable here too so the user can compare strategies */}
      <div className="space-y-2">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          On duplicate (matched by phone)
        </Label>
        <DuplicateHandlingRadio
          value={duplicateHandling}
          onChange={onChangeHandling}
        />
      </div>

      {/* Duplicates list */}
      {duplicates.length > 0 ? (
        <CollapsibleSection
          title={`Duplicate matches (${duplicates.length})`}
          tone="amber"
          icon={ShieldAlert}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Customer in file</TableHead>
                <TableHead>Existing customer</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {duplicates.map((d) => {
                const fromFile = parsed.customers.find(
                  (c) => c.sourceRow === d.sourceRow,
                )
                return (
                  <TableRow key={`${d.sourceRow}-${d.existingCustomer.id}`}>
                    <TableCell className="font-mono text-xs">{d.sourceRow}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{fromFile?.name ?? '—'}</div>
                      <div className="text-muted-foreground">{fromFile?.phone}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{d.existingCustomer.name}</div>
                      <div className="text-muted-foreground">{d.existingCustomer.phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          d.action === 'will-update'
                            ? 'info'
                            : d.action === 'will-skip'
                              ? 'secondary'
                              : 'warning'
                        }
                        size="sm"
                      >
                        {d.action === 'will-update'
                          ? 'Update'
                          : d.action === 'will-skip'
                            ? 'Skip'
                            : 'Rejected'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CollapsibleSection>
      ) : null}

      {/* Errors */}
      {allErrors.length > 0 ? (
        <CollapsibleSection
          title={`Errors (${allErrors.length})`}
          tone="rose"
          icon={XCircle}
          defaultOpen
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sheet</TableHead>
                <TableHead>Row</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allErrors.slice(0, 50).map((e, i) => (
                <TableRow key={`${e.sheet}-${e.row}-${i}`}>
                  <TableCell className="text-xs font-mono">{e.sheet}</TableCell>
                  <TableCell className="text-xs font-mono">{e.row}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {e.field ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-rose-700 dark:text-rose-300">
                    {e.message}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {allErrors.length > 50 ? (
            <p className="text-xs text-muted-foreground mt-2">
              Showing first 50 of {allErrors.length} errors. Fix these in Excel and re-upload.
            </p>
          ) : null}
        </CollapsibleSection>
      ) : null}

      {/* Warnings */}
      {warnings.length > 0 ? (
        <CollapsibleSection
          title={`Warnings (${warnings.length})`}
          tone="amber"
          icon={AlertTriangle}
        >
          <ul className="space-y-1 text-xs">
            {warnings.slice(0, 30).map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-muted-foreground shrink-0">
                  {w.sheet}:{w.row}
                </span>
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {/* Tabbed preview of parsed data */}
      <CollapsibleSection
        title={`Preview parsed data`}
        tone="slate"
        icon={ChevronRight}
        defaultOpen
      >
        <Tabs defaultValue="customers">
          <TabsList>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
            <TabsTrigger value="prescriptions">Rx</TabsTrigger>
            <TabsTrigger value="quotations">Quotations</TabsTrigger>
            <TabsTrigger value="creditNotes">Credit Notes</TabsTrigger>
          </TabsList>
          <TabsContent value="customers">
            <PreviewCustomerTable customers={parsed.customers} />
          </TabsContent>
          <TabsContent value="invoices">
            <PreviewInvoiceTable customers={parsed.customers} />
          </TabsContent>
          <TabsContent value="payments">
            <PreviewPaymentTable customers={parsed.customers} />
          </TabsContent>
          <TabsContent value="activities">
            <PreviewActivityTable customers={parsed.customers} />
          </TabsContent>
          <TabsContent value="prescriptions">
            <PreviewPrescriptionTable customers={parsed.customers} />
          </TabsContent>
          <TabsContent value="quotations">
            <PreviewQuotationTable customers={parsed.customers} />
          </TabsContent>
          <TabsContent value="creditNotes">
            <PreviewCreditNoteTable customers={parsed.customers} />
          </TabsContent>
        </Tabs>
      </CollapsibleSection>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Done stage
// ─────────────────────────────────────────────────────────────────────────────

function DoneStage({ result }: { result: ImportResult }) {
  const s = result.summary
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center gap-2 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-semibold">Import complete</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {s.customers.created + s.customers.updated} customer
          {s.customers.created + s.customers.updated === 1 ? '' : 's'} processed.
          Their history is now visible on each customer's detail page.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="New customers" value={s.customers.created} tone="emerald" />
        <StatCard label="Updated" value={s.customers.updated} tone="blue" />
        <StatCard label="Skipped" value={s.customers.skipped} tone="amber" />
        <StatCard
          label={
            s.invoices.skipped > 0
              ? `Invoices (created / already existed)`
              : 'Invoices created'
          }
          value={
            s.invoices.skipped > 0
              ? `${s.invoices.created} / ${s.invoices.skipped}`
              : s.invoices.created
          }
          tone="blue"
        />
        <StatCard
          label={
            s.payments.skipped > 0
              ? `Payments (created / already existed)`
              : 'Payments created'
          }
          value={
            s.payments.skipped > 0
              ? `${s.payments.created} / ${s.payments.skipped}`
              : s.payments.created
          }
          tone="purple"
        />
        <StatCard label="Activities created" value={s.activities.created} tone="amber" />
        <StatCard
          label={
            s.quotations.skipped > 0
              ? `Quotations (created / already existed)`
              : 'Quotations created'
          }
          value={
            s.quotations.skipped > 0
              ? `${s.quotations.created} / ${s.quotations.skipped}`
              : s.quotations.created
          }
          tone="blue"
        />
        <StatCard
          label={
            s.creditNotes.skipped > 0
              ? `Credit notes (created / already existed)`
              : 'Credit notes created'
          }
          value={
            s.creditNotes.skipped > 0
              ? `${s.creditNotes.created} / ${s.creditNotes.skipped}`
              : s.creditNotes.created
          }
          tone="purple"
        />
      </div>

      {result.errors.length > 0 ? (
        <CollapsibleSection
          title={`${result.errors.length} row${result.errors.length === 1 ? '' : 's'} failed`}
          tone="rose"
          icon={XCircle}
          defaultOpen
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sheet</TableHead>
                <TableHead>Row</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.errors.slice(0, 50).map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs font-mono">{e.sheet}</TableCell>
                  <TableCell className="text-xs font-mono">{e.row}</TableCell>
                  <TableCell className="text-xs">{e.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CollapsibleSection>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function DuplicateHandlingRadio({
  value,
  onChange,
}: {
  value: DuplicateHandling
  onChange: (h: DuplicateHandling) => void
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as DuplicateHandling)}
      className="grid grid-cols-1 sm:grid-cols-3 gap-2"
    >
      {DUPLICATE_OPTIONS.map((opt) => (
        <Label
          key={opt.value}
          htmlFor={`dup-${opt.value}`}
          className={cn(
            'flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs',
            value === opt.value
              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
              : 'border-border/50 hover:bg-muted/40',
          )}
        >
          <RadioGroupItem id={`dup-${opt.value}`} value={opt.value} className="mt-0.5" />
          <span>
            <span className="block font-medium">{opt.label}</span>
            <span className="block text-muted-foreground mt-0.5">{opt.hint}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  )
}

type StatTone = 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'slate'

const TONE_BG: Record<StatTone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  // string accepted so callers can pass composite values like "10 / 3".
  value: number | string
  tone: StatTone
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className={cn('text-xl font-bold font-mono', TONE_BG[tone], 'bg-transparent')}>
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </div>
    </div>
  )
}

interface CollapsibleSectionProps {
  title: string
  tone: StatTone
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  tone,
  icon: Icon,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-xs font-medium',
          TONE_BG[tone],
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
        <span className="flex-1 text-left">{title}</span>
        <X
          className={cn(
            'h-3 w-3 transition-transform',
            open ? 'rotate-0' : 'rotate-45',
          )}
        />
      </button>
      {open ? <div className="px-3 py-2.5 max-h-72 overflow-y-auto">{children}</div> : null}
    </div>
  )
}

// ─── Tab tables ──────────────────────────────────────────────────────────────

function PreviewCustomerTable({ customers }: { customers: ParsedCustomer[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Opening</TableHead>
          <TableHead className="text-right">Items</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.slice(0, 50).map((c) => (
          <TableRow key={c.sourceRow}>
            <TableCell className="font-mono text-xs">{c.customerCode ?? '—'}</TableCell>
            <TableCell className="text-xs font-medium">{c.name}</TableCell>
            <TableCell className="text-xs font-mono">{c.phone}</TableCell>
            <TableCell className="text-xs">{c.type ?? 'RETAIL'}</TableCell>
            <TableCell className="text-xs font-mono text-right">
              {c.openingBalance ? formatCurrency(c.openingBalance) : '—'}
            </TableCell>
            <TableCell className="text-xs text-right text-muted-foreground">
              {c.invoices.length}i · {c.payments.length}p · {c.activities.length}a
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewInvoiceTable({ customers }: { customers: ParsedCustomer[] }) {
  const rows = customers.flatMap((c) =>
    c.invoices.map((inv) => ({ inv, customer: c })),
  )
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No invoices in this file.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Inv #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ inv, customer }) => (
          <TableRow key={inv.sourceRow}>
            <TableCell className="text-xs">{customer.name}</TableCell>
            <TableCell className="text-xs font-mono">{inv.invoiceNumber ?? '(auto)'}</TableCell>
            <TableCell className="text-xs font-mono">
              {inv.date ? inv.date.slice(0, 10) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {inv.grandTotal !== undefined ? formatCurrency(inv.grandTotal) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {inv.amountPaid !== undefined ? formatCurrency(inv.amountPaid) : '—'}
            </TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{inv.status ?? 'UNPAID'}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewPaymentTable({ customers }: { customers: ParsedCustomer[] }) {
  const rows = customers.flatMap((c) => c.payments.map((p) => ({ p, customer: c })))
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No payments in this file.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Reference</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ p, customer }) => (
          <TableRow key={p.sourceRow}>
            <TableCell className="text-xs">{customer.name}</TableCell>
            <TableCell className="text-xs font-mono">
              {p.date ? p.date.slice(0, 10) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {formatCurrency(p.amount)}
            </TableCell>
            <TableCell className="text-xs">{p.paymentMode ?? '—'}</TableCell>
            <TableCell className="text-xs font-mono text-muted-foreground">
              {p.referenceNumber ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewActivityTable({ customers }: { customers: ParsedCustomer[] }) {
  const rows = customers.flatMap((c) => c.activities.map((a) => ({ a, customer: c })))
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No activities in this file.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>When</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ a, customer }) => (
          <TableRow key={a.sourceRow}>
            <TableCell className="text-xs">{customer.name}</TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{a.type}</Badge>
            </TableCell>
            <TableCell className="text-xs font-mono">
              {a.occurredAt?.slice(0, 10) ?? a.dueAt?.slice(0, 10) ?? '—'}
            </TableCell>
            <TableCell className="text-xs max-w-[280px] truncate">
              {a.title ?? a.notes ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewPrescriptionTable({ customers }: { customers: ParsedCustomer[] }) {
  const rows = customers.flatMap((c) => c.prescriptions.map((r) => ({ r, customer: c })))
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No prescriptions in this file.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Doctor</TableHead>
          <TableHead>Valid until</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ r, customer }) => (
          <TableRow key={r.sourceRow}>
            <TableCell className="text-xs">{customer.name}</TableCell>
            <TableCell className="text-xs">{r.doctorName}</TableCell>
            <TableCell className="text-xs font-mono">
              {r.validUntil?.slice(0, 10) ?? '—'}
            </TableCell>
            <TableCell className="text-xs max-w-[280px] truncate">
              {r.notes ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewQuotationTable({ customers }: { customers: ParsedCustomer[] }) {
  const rows = customers.flatMap((c) =>
    c.quotations.map((q) => ({ q, customer: c })),
  )
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No quotations in this file.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Qtn #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ q, customer }) => (
          <TableRow key={q.sourceRow}>
            <TableCell className="text-xs">{customer.name}</TableCell>
            <TableCell className="text-xs font-mono">{q.quotationNumber ?? '(auto)'}</TableCell>
            <TableCell className="text-xs font-mono">
              {q.date ? q.date.slice(0, 10) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {q.total !== undefined ? formatCurrency(q.total) : '—'}
            </TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{q.status ?? 'DRAFT'}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewCreditNoteTable({ customers }: { customers: ParsedCustomer[] }) {
  const rows = customers.flatMap((c) =>
    c.creditNotes.map((cn) => ({ cn, customer: c })),
  )
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No credit notes in this file.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>CN #</TableHead>
          <TableHead>Against</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Mode</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ cn, customer }) => (
          <TableRow key={cn.sourceRow}>
            <TableCell className="text-xs">{customer.name}</TableCell>
            <TableCell className="text-xs font-mono">{cn.creditNoteNo ?? '(auto)'}</TableCell>
            <TableCell className="text-xs font-mono">{cn.invoiceNumber}</TableCell>
            <TableCell className="text-xs font-mono">
              {cn.date ? cn.date.slice(0, 10) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {cn.totalAmount !== undefined ? formatCurrency(cn.totalAmount) : '—'}
            </TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{cn.settlementMode ?? 'REFUND'}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
