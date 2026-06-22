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
  type ParsedProduct,
  type ParsedCategory,
  downloadProductImportTemplate,
  parseProductImportWorkbook,
} from '@/lib/productImportTemplate'

// ─────────────────────────────────────────────────────────────────────────────
// Backend result shape — mirrors backend/src/products/dto/import-products.dto.ts
// Kept in lockstep manually (no shared package).
// ─────────────────────────────────────────────────────────────────────────────

type SheetName = 'Products' | 'Categories'

interface ImportRowError {
  sheet: SheetName
  row: number
  productCode?: string
  field?: string
  message: string
}

interface ImportRowWarning extends ImportRowError {
  kind: 'duplicate' | 'missing-link' | 'coerced'
}

interface ImportDuplicateMatch {
  productCode?: string
  sourceRow: number
  action: 'will-update' | 'will-skip' | 'will-create-new'
  existingProduct: { id: string; name: string; barcode: string | null }
}

interface ImportSummary {
  products: { created: number; updated: number; skipped: number; failed: number }
  categories: { created: number; reused: number }
  openingStockApplied: number
}

interface ImportResult {
  dryRun: boolean
  summary: ImportSummary
  duplicates: ImportDuplicateMatch[]
  errors: ImportRowError[]
  warnings: ImportRowWarning[]
}

interface ImportProductsDrawerProps {
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
    hint: "If a name matches, refresh that product's details from the file. New names are added.",
  },
  {
    value: 'UPDATE_ONLY',
    label: 'Update matches only',
    hint: 'Update existing products by name; skip (don\'t add) any name that doesn\'t exist. Best for HSN/GST top-ups.',
  },
  {
    value: 'SKIP',
    label: 'Skip duplicates',
    hint: 'Leave matching products untouched. New names are added.',
  },
  {
    value: 'CREATE',
    label: 'Create new only',
    hint: 'Refuse to import a row if the name is already used in this branch.',
  },
]

export function ImportProductsDrawer({
  open,
  onOpenChange,
  onImported,
}: ImportProductsDrawerProps) {
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
      categories: parsed.categories.map((c) => ({
        sourceRow: c.sourceRow,
        name: c.name,
        description: c.description,
        color: c.color,
        isActive: c.isActive,
      })),
      products: parsed.products.map((p) => ({ ...p })),
    }),
    [],
  )

  const runPreview = useCallback(
    async (parsed: ParseResult, handling: DuplicateHandling) => {
      try {
        const payload = buildPayload(parsed, handling, true)
        if (payload.products.length === 0) {
          setPreviewResult(null)
          return
        }
        const res = await api.post<ImportResult>(
          '/products/import/preview',
          payload,
        )
        setPreviewResult(res.data)
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
        const parsed = await parseProductImportWorkbook(f)
        setParseResult(parsed)
        if (parsed.products.length === 0) {
          setParseError(
            'No usable product rows found. Did you upload the right file? Use the "Download template" button on the upload screen for the expected format.',
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
      const res = await api.post<ImportResult>(
        '/products/import/commit',
        buildPayload(parseResult, duplicateHandling, false),
      )
      setCommitResult(res.data)
      setStage('done')
      const s = res.data.summary
      toast.success(
        `Imported ${s.products.created} new products, updated ${s.products.updated}, with ${s.categories.created} new categories.`,
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
    return {
      products: parseResult.products.length,
      categories: parseResult.categories.length,
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
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0 space-y-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Import Products
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
            Import products + (optional) categories. Stock batches come from GRN — they are not part of this import.
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
                Importing products into the catalogue…
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
                onClick={() => downloadProductImportTemplate()}
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
              {(() => {
                // Reflect what will actually be written: created + updated from
                // the live preview (so UPDATE_ONLY shows only the matches, not
                // the skipped rows). Falls back to the parsed total pre-preview.
                const willWrite = previewResult
                  ? previewResult.summary.products.created + previewResult.summary.products.updated
                  : parsedCounts?.products ?? 0
                const verb = duplicateHandling === 'UPDATE_ONLY' ? 'Update' : 'Import'
                return (
                  <Button
                    onClick={commitImport}
                    disabled={
                      !parseResult ||
                      parseResult.products.length === 0 ||
                      willWrite === 0
                    }
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    {verb} {willWrite} products
                  </Button>
                )
              })()}
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
            : 'Drop your product workbook (.xlsx) here'}
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
          What if a product name already exists in this branch?
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
            <span className="text-foreground font-medium">Categories</span> — optional. Pre-create with description / colour, or auto-create by name from the Products sheet.
          </li>
          <li>
            <span className="text-foreground font-medium">Products</span> — only `name` is required. Sparse rows get safe defaults (genericName=Unknown, unit=NOS, schedule=NONE, etc.) and warnings.
          </li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Stock batches</span> are NOT imported here — they come via GRN. Set <code className="px-1 bg-muted rounded">total_stock</code> as a starting number if you want, but it'll drift from real batch quantities once GRNs land.
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">MARG ERP exports</span> are also supported — upload the MARG <code className="px-1 bg-muted rounded">.xls</code>/<code className="px-1 bg-muted rounded">.xlsx</code> directly. We auto-detect both the <span className="font-medium text-foreground">price list</span> (name, pack, purchase, MRP, GST) and the <span className="font-medium text-foreground">HSN/SAC master</span> (name, pack, GST, HSN code).
        </p>
      </div>
    </>
  )
}

// ─── Preview stage ──────────────────────────────────────────────────────────

interface PreviewStageProps {
  parsed: ParseResult
  parsedCounts: { products: number; categories: number }
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatCard label="Products" value={parsedCounts.products} tone="emerald" />
        <StatCard label="Categories" value={parsedCounts.categories} tone="blue" />
      </div>

      {summary ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-medium flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            On import this file will create {summary.products.created} new product
            {summary.products.created === 1 ? '' : 's'}
            {summary.products.updated > 0
              ? `, update ${summary.products.updated}`
              : ''}
            {summary.products.skipped > 0
              ? `, skip ${summary.products.skipped}`
              : ''}
            , and {summary.categories.created} new categor{summary.categories.created === 1 ? 'y' : 'ies'} will be auto-created.
            {summary.openingStockApplied > 0
              ? ` Total opening stock: ${formatCurrency(summary.openingStockApplied)} units.`
              : ''}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          On duplicate (matched by name)
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
                <TableHead>Product in file</TableHead>
                <TableHead>Existing product</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {duplicates.map((d) => {
                const fromFile = parsed.products.find(
                  (p) => p.sourceRow === d.sourceRow,
                )
                return (
                  <TableRow key={`${d.sourceRow}-${d.existingProduct.id}`}>
                    <TableCell className="font-mono text-xs">
                      {d.sourceRow}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{fromFile?.name ?? '—'}</div>
                      <div className="text-muted-foreground">
                        {fromFile?.barcode ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{d.existingProduct.name}</div>
                      <div className="text-muted-foreground">
                        {d.existingProduct.barcode ?? '—'}
                      </div>
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
              Showing first 50 of {allErrors.length} errors.
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
        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            <PreviewProductTable products={parsed.products} />
          </TabsContent>
          <TabsContent value="categories">
            <PreviewCategoryTable categories={parsed.categories} />
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
          {s.products.created + s.products.updated} product
          {s.products.created + s.products.updated === 1 ? '' : 's'} processed.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatCard label="New products" value={s.products.created} tone="emerald" />
        <StatCard label="Updated" value={s.products.updated} tone="blue" />
        <StatCard label="Skipped" value={s.products.skipped} tone="amber" />
        <StatCard label="New categories" value={s.categories.created} tone="purple" />
        <StatCard label="Reused categories" value={s.categories.reused} tone="slate" />
        <StatCard label="Opening stock units" value={s.openingStockApplied} tone="rose" />
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
      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
    >
      {DUPLICATE_OPTIONS.map((opt) => (
        <Label
          key={opt.value}
          htmlFor={`prod-dup-${opt.value}`}
          className={cn(
            'flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs',
            value === opt.value
              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
              : 'border-border/50 hover:bg-muted/40',
          )}
        >
          <RadioGroupItem
            id={`prod-dup-${opt.value}`}
            value={opt.value}
            className="mt-0.5"
          />
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

function PreviewProductTable({ products }: { products: ParsedProduct[] }) {
  if (products.length === 0)
    return <p className="text-xs text-muted-foreground py-2">No products.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">MRP</TableHead>
          <TableHead className="text-right">Purchase</TableHead>
          <TableHead className="text-right">GST</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.slice(0, 50).map((p) => (
          <TableRow key={p.sourceRow}>
            <TableCell className="font-mono text-xs">
              {p.productCode ?? '—'}
            </TableCell>
            <TableCell className="text-xs font-medium">{p.name}</TableCell>
            <TableCell className="text-xs">{p.categoryName ?? '—'}</TableCell>
            <TableCell className="text-xs font-mono text-right">
              {p.mrp !== undefined ? formatCurrency(p.mrp) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {p.purchaseRate !== undefined ? formatCurrency(p.purchaseRate) : '—'}
            </TableCell>
            <TableCell className="text-xs font-mono text-right">
              {p.gstRate !== undefined ? `${p.gstRate}%` : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PreviewCategoryTable({ categories }: { categories: ParsedCategory[] }) {
  if (categories.length === 0)
    return (
      <p className="text-xs text-muted-foreground py-2">
        No categories sheet. Categories will be auto-created on demand from product rows.
      </p>
    )
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Color</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categories.slice(0, 50).map((c) => (
          <TableRow key={c.sourceRow}>
            <TableCell className="text-xs font-medium">{c.name}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {c.description ?? '—'}
            </TableCell>
            <TableCell className="text-xs font-mono">{c.color ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
