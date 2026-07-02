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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  type ParsedSupplier,
  downloadSupplierImportTemplate,
  parseSupplierImportWorkbook,
} from '@/lib/supplierImportTemplate'

// ─────────────────────────────────────────────────────────────────────────────
// Backend result shape — mirrors backend/src/suppliers/dto/import-suppliers.dto.ts
// Kept in lockstep with that file manually (no shared package).
// ─────────────────────────────────────────────────────────────────────────────

type SheetName =
  | 'Suppliers'
  | 'Purchase Orders'
  | 'PO Items'
  | 'GRNs'
  | 'GRN Items'
  | 'Debit Notes'
  | 'Debit Note Items'
  | 'Payments'
  | 'Activities'
  | 'Batches'

interface ImportRowError {
  sheet: SheetName
  row: number
  supplierCode?: string
  field?: string
  message: string
}

interface ImportRowWarning extends ImportRowError {
  kind: 'duplicate' | 'missing-link' | 'coerced'
}

interface ImportDuplicateMatch {
  supplierCode?: string
  sourceRow: number
  action: 'will-update' | 'will-skip' | 'will-create-new'
  existingSupplier: { id: string; name: string; phone: string }
}

interface ImportSummary {
  suppliers: { created: number; updated: number; skipped: number; failed: number }
  purchaseOrders: { created: number; skipped: number; failed: number }
  poItems: { created: number }
  grns: { created: number; skipped: number; failed: number }
  grnItems: { created: number }
  debitNotes: { created: number; skipped: number; failed: number }
  debitNoteItems: { created: number }
  payments: { created: number; failed: number }
  activities: { created: number; failed: number }
  batches: { created: number; skipped: number; failed: number }
  openingBalanceApplied: number
}

interface ImportResult {
  dryRun: boolean
  summary: ImportSummary
  duplicates: ImportDuplicateMatch[]
  errors: ImportRowError[]
  warnings: ImportRowWarning[]
}

// The backend caps each request at 2000 suppliers (one bounded transaction per
// call). Large files (e.g. a full MARG address book) are sent in sequential
// chunks and the per-chunk results merged. Sequential commit also means chunk
// N+1 sees chunk N's just-created rows, so cross-chunk phone dedup still works.
const IMPORT_CHUNK_SIZE = 1000

function addNumberTree<T>(a: T, b: T): T {
  if (typeof a === 'number') return (a + (typeof b === 'number' ? b : 0)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(a as Record<string, unknown>)) {
    out[k] = addNumberTree(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown> | undefined)?.[k],
    )
  }
  return out as unknown as T
}

function mergeImportResults(results: ImportResult[]): ImportResult {
  const [first, ...rest] = results
  let summary = first.summary
  const duplicates = [...first.duplicates]
  const errors = [...first.errors]
  const warnings = [...first.warnings]
  for (const r of rest) {
    summary = addNumberTree(summary, r.summary)
    duplicates.push(...r.duplicates)
    errors.push(...r.errors)
    warnings.push(...r.warnings)
  }
  return { dryRun: first.dryRun, summary, duplicates, errors, warnings }
}

async function postImportChunked(
  endpoint: string,
  payload: { duplicateHandling: DuplicateHandling; dryRun: boolean; suppliers: unknown[] },
): Promise<ImportResult> {
  const { suppliers, ...rest } = payload
  if (suppliers.length <= IMPORT_CHUNK_SIZE) {
    return (await api.post<ImportResult>(endpoint, payload)).data
  }
  const results: ImportResult[] = []
  for (let i = 0; i < suppliers.length; i += IMPORT_CHUNK_SIZE) {
    const chunk = suppliers.slice(i, i + IMPORT_CHUNK_SIZE)
    results.push((await api.post<ImportResult>(endpoint, { ...rest, suppliers: chunk })).data)
  }
  return mergeImportResults(results)
}

interface ImportSuppliersDrawerProps {
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
    hint: "If a phone matches, refresh that supplier's details from the file.",
  },
  {
    value: 'SKIP',
    label: 'Skip duplicates',
    hint: 'Leave matching suppliers untouched. Their history rows are skipped too.',
  },
  {
    value: 'CREATE',
    label: 'Create new only',
    hint: 'Refuse to import a row if the phone is already used. Safest option.',
  },
]

export function ImportSuppliersDrawer({
  open,
  onOpenChange,
  onImported,
}: ImportSuppliersDrawerProps) {
  const [stage, setStage] = useState<Stage>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<ImportResult | null>(null)
  const [commitResult, setCommitResult] = useState<ImportResult | null>(null)
  const [duplicateHandling, setDuplicateHandling] =
    useState<DuplicateHandling>('UPDATE')
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
    setTimeout(reset, 300)
  }, [onOpenChange, reset])

  const buildPayload = useCallback(
    (parsed: ParseResult, handling: DuplicateHandling, dryRun: boolean) => ({
      duplicateHandling: handling,
      dryRun,
      suppliers: parsed.suppliers.map((s) => ({
        sourceRow: s.sourceRow,
        supplierCode: s.supplierCode,
        name: s.name,
        phone: s.phone,
        contactPerson: s.contactPerson,
        email: s.email,
        gstin: s.gstin,
        drugLicense: s.drugLicense,
        address: s.address,
        paymentTerms: s.paymentTerms,
        bankDetails: s.bankDetails,
        isActive: s.isActive,
        openingBalance: s.openingBalance,
        purchaseOrders: s.purchaseOrders,
        grns: s.grns,
        debitNotes: s.debitNotes,
        payments: s.payments,
        activities: s.activities,
        batches: s.batches,
      })),
    }),
    [],
  )

  const runPreview = useCallback(
    async (parsed: ParseResult, handling: DuplicateHandling) => {
      try {
        const payload = buildPayload(parsed, handling, true)
        if (payload.suppliers.length === 0) {
          setPreviewResult(null)
          return
        }
        const data = await postImportChunked('/suppliers/import/preview', payload)
        setPreviewResult(data)
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ??
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
        const parsed = await parseSupplierImportWorkbook(f)
        setParseResult(parsed)
        if (parsed.suppliers.length === 0) {
          setParseError(
            'No usable supplier rows found. Did you upload the right file? Use the "Download template" button on the upload screen for the expected format.',
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
      if (parseResult) await runPreview(parseResult, h)
    },
    [parseResult, runPreview],
  )

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  const commitImport = useCallback(async () => {
    if (!parseResult) return
    setStage('committing')
    try {
      const data = await postImportChunked(
        '/suppliers/import/commit',
        buildPayload(parseResult, duplicateHandling, false),
      )
      setCommitResult(data)
      setStage('done')
      const s = data.summary
      toast.success(
        `Imported ${s.suppliers.created} new suppliers, updated ${s.suppliers.updated}, with ${s.grns.created} GRNs, ${s.purchaseOrders.created} POs, ${s.debitNotes.created} debit notes, ${s.payments.created} payments, ${s.batches.created} batches.`,
      )
      onImported()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err instanceof Error ? err.message : 'Import failed')
      toast.error(String(msg))
      setStage('preview')
    }
  }, [buildPayload, duplicateHandling, onImported, parseResult])

  const parsedCounts = useMemo(() => {
    if (!parseResult) return null
    const ss = parseResult.suppliers
    return {
      suppliers: ss.length,
      purchaseOrders: ss.reduce((s, c) => s + c.purchaseOrders.length, 0),
      poItems: ss.reduce(
        (s, c) =>
          s + c.purchaseOrders.reduce((ss2, po) => ss2 + po.items.length, 0),
        0,
      ),
      grns: ss.reduce((s, c) => s + c.grns.length, 0),
      grnItems: ss.reduce(
        (s, c) => s + c.grns.reduce((ss2, g) => ss2 + g.items.length, 0),
        0,
      ),
      debitNotes: ss.reduce((s, c) => s + c.debitNotes.length, 0),
      payments: ss.reduce((s, c) => s + c.payments.length, 0),
      activities: ss.reduce((s, c) => s + c.activities.length, 0),
      batches: ss.reduce((s, c) => s + c.batches.length, 0),
    }
  }, [parseResult])

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : closeDrawer())}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-[760px] p-0 gap-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-4 pr-12 border-b border-border/40 shrink-0 space-y-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Import Suppliers
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
            Import suppliers and their full history — purchase orders, GRNs, debit notes, activities and batches — in one go.
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
                Importing suppliers and history into the database…
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

        <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-3 bg-background border-t border-border/40">
          {stage === 'upload' || stage === 'parsing' ? (
            <>
              <Button variant="outline" onClick={closeDrawer}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadSupplierImportTemplate()}
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
                  parseResult.suppliers.length === 0 ||
                  (previewResult?.errors.length ?? 0) >=
                    (parsedCounts?.suppliers ?? 0)
                }
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Import {parsedCounts?.suppliers ?? 0} suppliers
              </Button>
            </>
          ) : null}

          {stage === 'done' ? <Button onClick={closeDrawer}>Close</Button> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Upload stage ───────────────────────────────────────────────────────────

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
            : 'Drop your supplier workbook (.xlsx) here'}
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
          What if a supplier's phone is already in the system?
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
          <li>
            <span className="text-foreground font-medium">Suppliers</span> —
            name, phone, GSTIN, drug license, payment terms, opening balance.
          </li>
          <li>
            <span className="text-foreground font-medium">Purchase Orders</span>
            {' + '}
            <span className="text-foreground font-medium">PO Items</span> — past
            orders placed.
          </li>
          <li>
            <span className="text-foreground font-medium">GRNs</span>
            {' + '}
            <span className="text-foreground font-medium">GRN Items</span> —
            goods-received notes with the supplier's bill number.
          </li>
          <li>
            <span className="text-foreground font-medium">Debit Notes</span>
            {' + '}items — purchase returns / debits raised against the supplier.
          </li>
          <li>
            <span className="text-foreground font-medium">Payments</span> —
            past payments made to the supplier, optionally linked to a GRN.
          </li>
          <li>
            <span className="text-foreground font-medium">Activities</span> —
            calls, WhatsApp, emails, notes, reminders.
          </li>
          <li>
            <span className="text-foreground font-medium">Batches</span> — stock
            batches received (links to existing Products).
          </li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Other ERP files</span> also work — upload a
          MARG address-book export, or any spreadsheet whose columns have recognizable headers
          (name, mobile/phone, GSTIN, address, email…). We auto-detect the layout and map the
          supplier master (transaction history isn't read in this mode).
        </p>
      </div>
    </>
  )
}

// ─── Preview stage ──────────────────────────────────────────────────────────

interface PreviewStageProps {
  parsed: ParseResult
  parsedCounts: {
    suppliers: number
    purchaseOrders: number
    poItems: number
    grns: number
    grnItems: number
    debitNotes: number
    payments: number
    activities: number
    batches: number
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

  const allErrors: (ParseError | ImportRowError)[] = [
    ...parsed.errors,
    ...errors,
  ]

  return (
    <>
      {/* Round-trip safety banner — shown when the file is an exported workbook. */}
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Suppliers" value={parsedCounts.suppliers} tone="emerald" />
        <StatCard label="POs" value={parsedCounts.purchaseOrders} tone="blue" />
        <StatCard label="PO items" value={parsedCounts.poItems} tone="blue" />
        <StatCard label="GRNs" value={parsedCounts.grns} tone="purple" />
        <StatCard label="GRN items" value={parsedCounts.grnItems} tone="purple" />
        <StatCard label="Debit Notes" value={parsedCounts.debitNotes} tone="rose" />
        <StatCard label="Payments" value={parsedCounts.payments} tone="violet" />
        <StatCard label="Activities" value={parsedCounts.activities} tone="amber" />
        <StatCard label="Batches" value={parsedCounts.batches} tone="slate" />
      </div>

      {summary ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-medium flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            On import this file will create {summary.suppliers.created} new supplier
            {summary.suppliers.created === 1 ? '' : 's'}
            {summary.suppliers.updated > 0
              ? `, update ${summary.suppliers.updated}`
              : ''}
            {summary.suppliers.skipped > 0
              ? `, skip ${summary.suppliers.skipped}`
              : ''}
            , and add {summary.purchaseOrders.created} POs, {summary.grns.created} GRNs, {summary.debitNotes.created} debit notes, {summary.payments.created} payments, {summary.activities.created} activities, {summary.batches.created} batches.
            {summary.openingBalanceApplied > 0
              ? ` Total opening balance: ${formatCurrency(summary.openingBalanceApplied)}.`
              : ''}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          On duplicate (matched by phone)
        </Label>
        <DuplicateHandlingRadio
          value={duplicateHandling}
          onChange={onChangeHandling}
        />
      </div>

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
                <TableHead>Supplier in file</TableHead>
                <TableHead>Existing supplier</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {duplicates.map((d) => {
                const fromFile = parsed.suppliers.find(
                  (s) => s.sourceRow === d.sourceRow,
                )
                return (
                  <TableRow key={`${d.sourceRow}-${d.existingSupplier.id}`}>
                    <TableCell className="font-mono text-xs">{d.sourceRow}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{fromFile?.name ?? '—'}</div>
                      <div className="text-muted-foreground">{fromFile?.phone}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{d.existingSupplier.name}</div>
                      <div className="text-muted-foreground">{d.existingSupplier.phone}</div>
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

      <CollapsibleSection
        title="Preview parsed data"
        tone="slate"
        icon={ChevronRight}
        defaultOpen
      >
        <Tabs defaultValue="suppliers">
          <TabsList>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="pos">POs</TabsTrigger>
            <TabsTrigger value="grns">GRNs</TabsTrigger>
            <TabsTrigger value="dns">Debit Notes</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
          </TabsList>
          <TabsContent value="suppliers">
            <PreviewSupplierTable suppliers={parsed.suppliers} />
          </TabsContent>
          <TabsContent value="pos">
            <PreviewPOTable suppliers={parsed.suppliers} />
          </TabsContent>
          <TabsContent value="grns">
            <PreviewGRNTable suppliers={parsed.suppliers} />
          </TabsContent>
          <TabsContent value="dns">
            <PreviewDNTable suppliers={parsed.suppliers} />
          </TabsContent>
          <TabsContent value="payments">
            <PreviewPaymentTable suppliers={parsed.suppliers} />
          </TabsContent>
          <TabsContent value="activities">
            <PreviewActivityTable suppliers={parsed.suppliers} />
          </TabsContent>
          <TabsContent value="batches">
            <PreviewBatchTable suppliers={parsed.suppliers} />
          </TabsContent>
        </Tabs>
      </CollapsibleSection>
    </>
  )
}

// ─── Done stage ─────────────────────────────────────────────────────────────

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
          {s.suppliers.created + s.suppliers.updated} supplier
          {s.suppliers.created + s.suppliers.updated === 1 ? '' : 's'} processed.
          Their history is now visible on each supplier's detail page.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="New suppliers" value={s.suppliers.created} tone="emerald" />
        <StatCard label="Updated" value={s.suppliers.updated} tone="blue" />
        <StatCard label="Skipped" value={s.suppliers.skipped} tone="amber" />
        <StatCard
          label={
            s.purchaseOrders.skipped > 0
              ? 'POs (created / already existed)'
              : 'POs created'
          }
          value={
            s.purchaseOrders.skipped > 0
              ? `${s.purchaseOrders.created} / ${s.purchaseOrders.skipped}`
              : s.purchaseOrders.created
          }
          tone="blue"
        />
        <StatCard
          label={
            s.grns.skipped > 0
              ? 'GRNs (created / already existed)'
              : 'GRNs created'
          }
          value={
            s.grns.skipped > 0
              ? `${s.grns.created} / ${s.grns.skipped}`
              : s.grns.created
          }
          tone="purple"
        />
        <StatCard
          label={
            s.debitNotes.skipped > 0
              ? 'Debit Notes (created / already existed)'
              : 'Debit Notes created'
          }
          value={
            s.debitNotes.skipped > 0
              ? `${s.debitNotes.created} / ${s.debitNotes.skipped}`
              : s.debitNotes.created
          }
          tone="rose"
        />
        <StatCard label="Payments created" value={s.payments.created} tone="violet" />
        <StatCard label="Activities created" value={s.activities.created} tone="amber" />
        <StatCard
          label={
            s.batches.skipped > 0
              ? 'Batches (created / already existed)'
              : 'Batches created'
          }
          value={
            s.batches.skipped > 0
              ? `${s.batches.created} / ${s.batches.skipped}`
              : s.batches.created
          }
          tone="slate"
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

// ─── Sub-components ─────────────────────────────────────────────────────────

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
          htmlFor={`sup-dup-${opt.value}`}
          className={cn(
            'flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs',
            value === opt.value
              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
              : 'border-border/50 hover:bg-muted/40',
          )}
        >
          <RadioGroupItem id={`sup-dup-${opt.value}`} value={opt.value} className="mt-0.5" />
          <span>
            <span className="block font-medium">{opt.label}</span>
            <span className="block text-muted-foreground mt-0.5">{opt.hint}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  )
}

type StatTone = 'emerald' | 'blue' | 'purple' | 'violet' | 'amber' | 'rose' | 'slate'

const TONE_BG: Record<StatTone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
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
        <X className={cn('h-3 w-3 transition-transform', open ? 'rotate-0' : 'rotate-45')} />
      </button>
      {open ? <div className="px-3 py-2.5 max-h-72 overflow-y-auto">{children}</div> : null}
    </div>
  )
}

// ─── Tab tables ─────────────────────────────────────────────────────────────

function PreviewSupplierTable({ suppliers }: { suppliers: ParsedSupplier[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>GSTIN</TableHead>
          <TableHead className="text-right">Opening</TableHead>
          <TableHead className="text-right">Items</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.slice(0, 50).map((s) => (
          <TableRow key={s.sourceRow}>
            <TableCell className="font-mono text-xs">{s.supplierCode ?? '—'}</TableCell>
            <TableCell className="text-xs font-medium">{s.name}</TableCell>
            <TableCell className="text-xs font-mono">{s.phone}</TableCell>
            <TableCell className="text-xs font-mono">{s.gstin ?? '—'}</TableCell>
            <TableCell className="text-xs font-mono text-right">
              {s.openingBalance ? formatCurrency(s.openingBalance) : '—'}
            </TableCell>
            <TableCell className="text-xs text-right text-muted-foreground">
              {s.purchaseOrders.length}po · {s.grns.length}g · {s.debitNotes.length}dn · {s.payments.length}pay · {s.batches.length}b
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewPOTable({ suppliers }: { suppliers: ParsedSupplier[] }) {
  const rows = suppliers.flatMap((s) =>
    s.purchaseOrders.map((po) => ({ po, supplier: s })),
  )
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground py-2">No purchase orders.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>PO #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ po, supplier }) => (
          <TableRow key={po.sourceRow}>
            <TableCell className="text-xs">{supplier.name}</TableCell>
            <TableCell className="text-xs font-mono">{po.poNumber ?? '(auto)'}</TableCell>
            <TableCell className="text-xs font-mono">
              {po.date ? po.date.slice(0, 10) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {po.totalAmount !== undefined ? formatCurrency(po.totalAmount) : '—'}
            </TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{po.status ?? 'CLOSED'}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewGRNTable({ suppliers }: { suppliers: ParsedSupplier[] }) {
  const rows = suppliers.flatMap((s) => s.grns.map((g) => ({ g, supplier: s })))
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground py-2">No GRNs.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>GRN #</TableHead>
          <TableHead>Inv #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ g, supplier }) => (
          <TableRow key={g.sourceRow}>
            <TableCell className="text-xs">{supplier.name}</TableCell>
            <TableCell className="text-xs font-mono">{g.grnNumber ?? '(auto)'}</TableCell>
            <TableCell className="text-xs font-mono">{g.supplierInvoiceNo}</TableCell>
            <TableCell className="text-xs font-mono">
              {g.date ? g.date.slice(0, 10) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {g.totalAmount !== undefined ? formatCurrency(g.totalAmount) : '—'}
            </TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{g.status ?? 'VERIFIED'}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewDNTable({ suppliers }: { suppliers: ParsedSupplier[] }) {
  const rows = suppliers.flatMap((s) =>
    s.debitNotes.map((d) => ({ d, supplier: s })),
  )
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground py-2">No debit notes.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>DN #</TableHead>
          <TableHead>Against GRN</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Mode</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ d, supplier }) => (
          <TableRow key={d.sourceRow}>
            <TableCell className="text-xs">{supplier.name}</TableCell>
            <TableCell className="text-xs font-mono">{d.debitNoteNo ?? '(auto)'}</TableCell>
            <TableCell className="text-xs font-mono">{d.grnNumber ?? '—'}</TableCell>
            <TableCell className="text-xs font-mono text-right">
              {d.totalAmount !== undefined ? formatCurrency(d.totalAmount) : '—'}
            </TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{d.settlementMode ?? 'REFUND'}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewPaymentTable({ suppliers }: { suppliers: ParsedSupplier[] }) {
  const rows = suppliers.flatMap((s) =>
    s.payments.map((p) => ({ p, supplier: s })),
  )
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground py-2">No payments.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Payment #</TableHead>
          <TableHead>Against GRN</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Mode</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ p, supplier }) => (
          <TableRow key={p.sourceRow}>
            <TableCell className="text-xs">{supplier.name}</TableCell>
            <TableCell className="text-xs font-mono">{p.paymentNumber ?? '(auto)'}</TableCell>
            <TableCell className="text-xs font-mono">{p.grnNumber ?? '—'}</TableCell>
            <TableCell className="text-xs font-mono text-right">
              {formatCurrency(p.amount)}
            </TableCell>
            <TableCell>
              <Badge size="sm" variant="secondary">{p.paymentMode ?? 'CASH'}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewActivityTable({ suppliers }: { suppliers: ParsedSupplier[] }) {
  const rows = suppliers.flatMap((s) =>
    s.activities.map((a) => ({ a, supplier: s })),
  )
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground py-2">No activities.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>When</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ a, supplier }) => (
          <TableRow key={a.sourceRow}>
            <TableCell className="text-xs">{supplier.name}</TableCell>
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

function PreviewBatchTable({ suppliers }: { suppliers: ParsedSupplier[] }) {
  const rows = suppliers.flatMap((s) => s.batches.map((b) => ({ b, supplier: s })))
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground py-2">No batches.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Batch #</TableHead>
          <TableHead>Expiry</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 50).map(({ b, supplier }) => (
          <TableRow key={b.sourceRow}>
            <TableCell className="text-xs">{supplier.name}</TableCell>
            <TableCell className="text-xs">{b.productName ?? b.productId ?? '—'}</TableCell>
            <TableCell className="text-xs font-mono">{b.batchNumber}</TableCell>
            <TableCell className="text-xs font-mono">
              {b.expiryDate ? b.expiryDate.slice(0, 10) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {b.quantity ?? 0}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {b.purchaseRate !== undefined ? formatCurrency(b.purchaseRate) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
