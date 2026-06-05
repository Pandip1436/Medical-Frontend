import { useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Upload as UploadIcon,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import { USE_MOCK_DATA, mockImportLeads } from '../mockData'
import type { LeadSource, LeadStage } from '../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface ImportLeadsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

// The set of lead fields a CSV column can be mapped to. `key` matches the
// payload shape POST /leads/import expects; `label` is what users see.
type FieldKey =
  | 'skip'
  | 'title'
  | 'description'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'phoneCountryCode'
  | 'jobTitle'
  | 'company'
  | 'address'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'source'
  | 'stage'
  | 'value'
  | 'score'

const FIELD_OPTIONS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'skip', label: 'Skip column' },
  { key: 'title', label: 'Lead Title', required: true },
  { key: 'description', label: 'Description' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'phoneCountryCode', label: 'Phone Country Code' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'company', label: 'Company' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
  { key: 'source', label: 'Source' },
  { key: 'stage', label: 'Stage' },
  { key: 'value', label: 'Value' },
  { key: 'score', label: 'Score' },
]

// Header-name heuristic → FieldKey + confidence. Used for both the auto-mapping
// default and the "Match" pill in the mapping table.
function detectField(header: string): { field: FieldKey; match: 'High' | 'Medium' | 'None' } {
  const h = header.toLowerCase().replace(/[\s_-]+/g, '')
  const exact: Record<string, FieldKey> = {
    title: 'title',
    leadtitle: 'title',
    description: 'description',
    notes: 'description',
    firstname: 'firstName',
    lastname: 'lastName',
    fullname: 'firstName',
    name: 'firstName',
    email: 'email',
    emailaddress: 'email',
    phone: 'phone',
    mobile: 'phone',
    contact: 'phone',
    phonenumber: 'phone',
    jobtitle: 'jobTitle',
    role: 'jobTitle',
    designation: 'jobTitle',
    company: 'company',
    companyname: 'company',
    organization: 'company',
    address: 'address',
    addressline1: 'address',
    city: 'city',
    state: 'state',
    province: 'state',
    postalcode: 'postalCode',
    pincode: 'postalCode',
    zip: 'postalCode',
    zipcode: 'postalCode',
    country: 'country',
    source: 'source',
    leadsource: 'source',
    stage: 'stage',
    status: 'stage',
    value: 'value',
    amount: 'value',
    score: 'score',
  }
  if (exact[h]) return { field: exact[h], match: 'High' }
  for (const [k, v] of Object.entries(exact)) {
    if (h.includes(k)) return { field: v, match: 'Medium' }
  }
  return { field: 'skip', match: 'None' }
}

// Minimal CSV parser — handles quoted cells, escaped quotes, CRLF, blank lines.
// Good enough for typical CRM exports; capped at 25 MB on the input.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let i = 0
  let inQuotes = false
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      cur.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n' || c === '\r') {
      cur.push(field)
      field = ''
      if (cur.some((x) => x.length > 0)) rows.push(cur)
      cur = []
      if (c === '\r' && text[i + 1] === '\n') i++
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    if (cur.some((x) => x.length > 0)) rows.push(cur)
  }
  return rows
}

const TEMPLATE_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
  'company',
  'title',
  'description',
  'source',
  'value',
  'score',
  'city',
  'state',
  'country',
]
const TEMPLATE_SAMPLE_ROW = [
  'John',
  'Doe',
  'john@example.com',
  '9999999999',
  'Procurement Officer',
  'Acme Inc',
  'Requirement for X 100 units',
  'Annual contract opportunity',
  'WEBSITE',
  '50000',
  '50',
  'Hyderabad',
  'Telangana',
  'India',
]

// ── Component ─────────────────────────────────────────────────────────
export function ImportLeadsDrawer({
  open,
  onOpenChange,
  onImported,
}: ImportLeadsDrawerProps) {
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<number, FieldKey>>({})
  const [matches, setMatches] = useState<Record<number, 'High' | 'Medium' | 'None'>>({})
  const [duplicateHandling, setDuplicateHandling] =
    useState<'UPDATE' | 'SKIP' | 'CREATE'>('UPDATE')
  const [defaultStage, setDefaultStage] = useState<string>('NONE')
  const [defaultSource, setDefaultSource] = useState<string>('OTHER')
  const [submitting, setSubmitting] = useState(false)
  // Progress is tracked per row (not per chunk) so the bar advances smoothly
  // even when chunks vary in size due to per-row failures on the backend.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [result, setResult] = useState<{
    imported: number
    updated: number
    skipped: number
    errors: { row: number; message: string }[]
  } | null>(null)

  // Server-side processing is sequential, so chunks much larger than this
  // start to feel laggy in the UI. 500 is a balance — typical 5–10k row
  // imports complete in <30s with smooth progress, and the request payload
  // stays well under any reasonable HTTP body limit.
  const CHUNK_SIZE = 500

  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFile(null)
    setHeaders([])
    setRows([])
    setMapping({})
    setMatches({})
    setDuplicateHandling('UPDATE')
    setDefaultStage('NONE')
    setDefaultSource('OTHER')
    setSubmitting(false)
    setProgress(null)
    setResult(null)
  }

  function handleClose(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleFile(f: File) {
    if (f.size > 25 * 1024 * 1024) {
      toast.error('File too large — maximum is 25 MB')
      return
    }
    const isXlsx = /\.xlsx$/i.test(f.name)
    const isCsv = /\.csv$/i.test(f.name)
    if (!isCsv && !isXlsx) {
      toast.error('Please upload a .csv or .xlsx file')
      return
    }
    let parsed: string[][]
    if (isXlsx) {
      // Parse Excel with the same xlsx lib used for products/suppliers.
      // First sheet, header: 1 → 2D array of strings to match the CSV path.
      try {
        const XLSX = await import('xlsx')
        const buffer = await f.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const firstSheet = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' })
        parsed = raw
          .map((row) => (row as unknown[]).map((c) => String(c ?? '').trim()))
          .filter((row) => row.some((c) => c.length > 0))
      } catch {
        toast.error('Failed to parse the .xlsx file')
        return
      }
    } else {
      const text = await f.text()
      parsed = parseCsv(text)
    }
    if (parsed.length === 0) {
      toast.error(`${isXlsx ? 'Excel sheet' : 'CSV'} is empty`)
      return
    }
    const [hdr, ...rest] = parsed
    setFile(f)
    setHeaders(hdr)
    setRows(rest)
    const initialMapping: Record<number, FieldKey> = {}
    const initialMatches: Record<number, 'High' | 'Medium' | 'None'> = {}
    hdr.forEach((h, i) => {
      const d = detectField(h)
      initialMapping[i] = d.field
      initialMatches[i] = d.match
    })
    setMapping(initialMapping)
    setMatches(initialMatches)
  }

  function clearFile() {
    setFile(null)
    setHeaders([])
    setRows([])
    setMapping({})
    setMatches({})
    setResult(null)
  }

  function downloadTemplate() {
    const csv =
      TEMPLATE_HEADERS.join(',') + '\n' + TEMPLATE_SAMPLE_ROW.join(',') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lead-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const titleMapped = useMemo(
    () => Object.values(mapping).includes('title'),
    [mapping],
  )
  const mappedCount = useMemo(
    () => Object.values(mapping).filter((v) => v !== 'skip').length,
    [mapping],
  )

  async function startImport() {
    setSubmitting(true)
    setProgress({ done: 0, total: rows.length })

    // Project each CSV row to the typed payload shape the backend wants.
    // Done once up front so the chunk loop only slices arrays.
    const allLeads = rows.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: Record<string, any> = {}
      headers.forEach((_, i) => {
        const field = mapping[i]
        if (!field || field === 'skip') return
        const cell = (r[i] ?? '').trim()
        if (!cell) return
        if (field === 'value' || field === 'score') {
          const n = Number(cell)
          if (!Number.isNaN(n)) obj[field] = n
        } else {
          obj[field] = cell
        }
      })
      if (!obj.title) {
        obj.title = obj.firstName || obj.lastName || obj.company || 'Imported lead'
      }
      return obj
    })

    // Cumulative result rolled up across every chunk. Errors carry the
    // *global* row index (1-based) so they remain meaningful after merge.
    const cumulative: {
      imported: number
      updated: number
      skipped: number
      errors: { row: number; message: string }[]
    } = { imported: 0, updated: 0, skipped: 0, errors: [] }

    try {
      for (let start = 0; start < allLeads.length; start += CHUNK_SIZE) {
        const slice = allLeads.slice(start, start + CHUNK_SIZE)
        const payload: Record<string, unknown> = {
          leads: slice,
          duplicateHandling,
        }
        if (defaultStage !== 'NONE') payload.defaultStage = defaultStage
        if (defaultSource && defaultSource !== 'NONE') {
          payload.defaultSource = defaultSource
        }

        try {
          if (USE_MOCK_DATA) {
            // Mock mode: bypass the network and append rows directly to
            // MOCK_LEADS. The helper returns the same { imported, updated,
            // skipped, errors } shape the backend would.
            const mockResult = mockImportLeads(
              slice.map((row) => ({
                title: row.title || 'Imported lead',
                description: row.description,
                source: row.source as LeadSource | undefined,
                pipeline: row.pipeline,
                stage: row.stage as LeadStage | undefined,
                score: row.score,
                value: row.value,
                currency: row.currency,
                contact: {
                  firstName: row.firstName || 'Imported',
                  lastName: row.lastName,
                  phone: row.phone || '',
                  phoneCountryCode: row.phoneCountryCode,
                  email: row.email,
                  jobTitle: row.jobTitle,
                  city: row.city,
                  state: row.state,
                  country: row.country,
                },
              })),
            )
            cumulative.imported += mockResult.imported
            cumulative.updated += mockResult.updated
            cumulative.skipped += mockResult.skipped
            for (let i = 0; i < mockResult.errors.length; i++) {
              cumulative.errors.push({ row: start + i, message: mockResult.errors[i] })
            }
          } else {
            const res = await api.post('/leads/import', payload)
            const r = res.data as typeof cumulative
            cumulative.imported += r.imported
            cumulative.updated += r.updated
            cumulative.skipped += r.skipped
            // Re-base the per-chunk row numbers onto the global row index.
            for (const e of r.errors) {
              cumulative.errors.push({
                row: start + e.row,
                message: e.message,
              })
            }
          }
        } catch (err: unknown) {
          // Whole-chunk failure — flag every row in the chunk as errored so
          // the user can see what happened.
          const e = err as {
            response?: { data?: { message?: string | string[] } }
          }
          const raw = e?.response?.data?.message
          const msg = Array.isArray(raw) ? raw.join(' • ') : (raw ?? 'Request failed')
          slice.forEach((_, idx) => {
            cumulative.errors.push({
              row: start + idx + 1,
              message: msg,
            })
          })
          // Cap visible errors so the result view doesn't blow up on a
          // catastrophic failure — we still show the count accurately.
          if (cumulative.errors.length > 200) {
            cumulative.errors = cumulative.errors.slice(0, 200)
          }
        }

        setProgress({
          done: Math.min(start + slice.length, allLeads.length),
          total: allLeads.length,
        })
      }

      setResult(cumulative)
      onImported()
    } finally {
      setSubmitting(false)
    }
  }

  // After a successful import, the body switches to the result view and the
  // footer's primary action becomes "Done" instead of "Start Import".
  const showingResult = result !== null

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-160"
      >
        <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>Import Leads from CSV</span>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Upload a CSV, confirm the column mapping, and start the import — all
            in one place.
          </p>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {submitting && progress ? (
            <ProgressView progress={progress} />
          ) : showingResult ? (
            <ResultView result={result!} onReset={reset} />
          ) : (
            <div className="space-y-5">
              {/* Section 1: File upload */}
              <Section
                title="1. Upload CSV"
                subtitle="Drag-and-drop or browse a .csv file (max 25 MB)."
                accessory={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadTemplate}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Template</span>
                  </Button>
                }
              >
                <UploadBlock
                  file={file}
                  rowCount={rows.length}
                  inputRef={inputRef}
                  onFile={handleFile}
                  onClear={clearFile}
                />
              </Section>

              {/* Section 2: Column mapping — only revealed after a successful parse */}
              {file && rows.length > 0 && (
                <Section
                  title="2. Map columns"
                  subtitle={`We detected ${rows.length} row${rows.length === 1 ? '' : 's'}. Confirm or adjust how each CSV column maps to a lead field.`}
                >
                  <MappingTable
                    headers={headers}
                    rows={rows}
                    mapping={mapping}
                    matches={matches}
                    onMappingChange={(idx, field) =>
                      setMapping((prev) => ({ ...prev, [idx]: field }))
                    }
                  />
                  {!titleMapped && (
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                      At least one column must be mapped to{' '}
                      <strong>Lead Title</strong> before you can import.
                    </p>
                  )}
                </Section>
              )}

              {/* Section 3: Options — revealed once mapping has a title */}
              {file && rows.length > 0 && titleMapped && (
                <Section
                  title="3. Options"
                  subtitle="Choose what happens when a row matches an existing contact, and set defaults for rows that don't carry their own stage / source."
                >
                  <OptionsBlock
                    duplicateHandling={duplicateHandling}
                    onDuplicateHandlingChange={setDuplicateHandling}
                    defaultStage={defaultStage}
                    onDefaultStageChange={setDefaultStage}
                    defaultSource={defaultSource}
                    onDefaultSourceChange={setDefaultSource}
                    rowCount={rows.length}
                    mappedCount={mappedCount}
                  />
                </Section>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 bg-background px-5 py-3">
          {showingResult ? (
            <>
              <Button variant="outline" onClick={reset} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Import another file</span>
              </Button>
              <Button
                onClick={() => handleClose(false)}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={startImport}
                disabled={
                  !file || rows.length === 0 || !titleMapped || submitting
                }
                className="gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      Importing
                      {progress
                        ? ` ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
                        : '…'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      Start Import
                      {rows.length > 0 && ` · ${rows.length.toLocaleString()}`}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Section header + body wrapper ────────────────────────────────────
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

// ── Upload block ─────────────────────────────────────────────────────
function UploadBlock({
  file,
  rowCount,
  inputRef,
  onFile,
  onClear,
}: {
  file: File | null
  rowCount: number
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File) => void
  onClear: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  if (file) {
    // Compact file-loaded state — replaces the big drop zone so the rest of
    // the form (mapping + options) gets vertical room.
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/6 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <FileText className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB ·{' '}
              {rowCount} row{rowCount === 1 ? '' : 's'} detected
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          <span>Replace</span>
        </Button>
      </div>
    )
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) onFile(f)
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/15 px-4 py-8 text-center transition-colors',
        dragOver ? 'border-primary/60 bg-primary/4' : 'border-border',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <UploadIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">Drag &amp; drop a CSV file here</p>
      <p className="text-xs text-muted-foreground">
        or <span className="text-primary hover:underline">browse from your computer</span>
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Mapping table ────────────────────────────────────────────────────
function MappingTable({
  headers,
  rows,
  mapping,
  matches,
  onMappingChange,
}: {
  headers: string[]
  rows: string[][]
  mapping: Record<number, FieldKey>
  matches: Record<number, 'High' | 'Medium' | 'None'>
  onMappingChange: (idx: number, next: FieldKey) => void
}) {
  return (
    // max-h-[320px] caps the mapping list when a CSV has many columns
    // (say 30+) so the Options section below remains visible without
    // forcing the user to scroll the whole drawer. The table body
    // scrolls inside; the header row stays pinned via `position: sticky`.
    <div className="max-h-[min(320px,60vh)] overflow-y-auto rounded-lg border border-border/40">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/95 text-left backdrop-blur-sm">
          <tr>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              CSV Column
            </th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sample
            </th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Map To
            </th>
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Match
            </th>
          </tr>
        </thead>
        <tbody>
          {headers.map((h, i) => {
            // Pull up to 3 non-empty cell values from this column so the user
            // can sanity-check the mapping. Stacked vertically below — much
            // more informative than a single-row preview.
            const samples = rows
              .map((r) => (r[i] ?? '').trim())
              .filter((s) => s.length > 0)
              .slice(0, 3)
            const moreCount = Math.max(
              0,
              rows.filter((r) => (r[i] ?? '').trim().length > 0).length - samples.length,
            )
            const match = matches[i] ?? 'None'
            const tone =
              match === 'High'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : match === 'Medium'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
            return (
              <tr key={i} className="border-t border-border/40">
                <td className="px-3 py-2 align-top text-sm font-medium">
                  {h}
                </td>
                <td className="max-w-45 px-3 py-2 align-top text-xs">
                  {samples.length === 0 ? (
                    <span className="italic text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5 text-muted-foreground">
                      {samples.map((s, idx) => (
                        <span key={idx} className="truncate" title={s}>
                          {s}
                        </span>
                      ))}
                      {moreCount > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">
                          +{moreCount.toLocaleString()} more
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <Select
                    value={mapping[i] ?? 'skip'}
                    onValueChange={(v) => onMappingChange(i, v as FieldKey)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                          {opt.required && (
                            <span className="ml-1 text-rose-500">*</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 align-top">
                  <Badge size="sm" className={cn('text-[10px]', tone)}>
                    {match}
                  </Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Options block ────────────────────────────────────────────────────
function OptionsBlock({
  duplicateHandling,
  onDuplicateHandlingChange,
  defaultStage,
  onDefaultStageChange,
  defaultSource,
  onDefaultSourceChange,
  rowCount,
  mappedCount,
}: {
  duplicateHandling: 'UPDATE' | 'SKIP' | 'CREATE'
  onDuplicateHandlingChange: (v: 'UPDATE' | 'SKIP' | 'CREATE') => void
  defaultStage: string
  onDefaultStageChange: (v: string) => void
  defaultSource: string
  onDefaultSourceChange: (v: string) => void
  rowCount: number
  mappedCount: number
}) {
  const dupHelper =
    duplicateHandling === 'UPDATE'
      ? 'Existing leads with matching email or phone will be updated in place.'
      : duplicateHandling === 'SKIP'
        ? 'Rows matching an existing contact will be skipped — no leads created for them.'
        : 'Every row becomes a new lead, even when an existing contact matches.'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Duplicate Handling
          </label>
          <Select
            value={duplicateHandling}
            onValueChange={(v) =>
              onDuplicateHandlingChange(v as 'UPDATE' | 'SKIP' | 'CREATE')
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UPDATE">Update existing leads</SelectItem>
              <SelectItem value="SKIP">Skip duplicates</SelectItem>
              <SelectItem value="CREATE">Create new (allow duplicates)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{dupHelper}</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Default Stage
          </label>
          <Select value={defaultStage} onValueChange={onDefaultStageChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No default</SelectItem>
              <SelectItem value="LEAD">Lead</SelectItem>
              <SelectItem value="QUALIFIED">Qualified</SelectItem>
              <SelectItem value="PROPOSAL">Proposal</SelectItem>
              <SelectItem value="NEGOTIATION">Negotiation</SelectItem>
              <SelectItem value="WON">Won</SelectItem>
              <SelectItem value="LOST">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Default Source
          </label>
          <Select value={defaultSource} onValueChange={onDefaultSourceChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="INDIAMART">IndiaMART</SelectItem>
              <SelectItem value="REFERRAL">Referral</SelectItem>
              <SelectItem value="WEBSITE">Website</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="CALL">Cold Call</SelectItem>
              <SelectItem value="EMAIL">Email Campaign</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col justify-end space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Summary
          </label>
          <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 text-xs tabular-nums">
            <strong>{rowCount}</strong>
            <span className="text-muted-foreground">rows</span>
            <span className="text-muted-foreground/40">·</span>
            <strong>{mappedCount}</strong>
            <span className="text-muted-foreground">cols</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Result view ──────────────────────────────────────────────────────
function ResultView({
  result,
  onReset,
}: {
  result: {
    imported: number
    updated: number
    skipped: number
    errors: { row: number; message: string }[]
  }
  onReset: () => void
}) {
  const total =
    result.imported + result.updated + result.skipped + result.errors.length
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/6 p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-base font-semibold">Import finished</p>
        <p className="text-xs text-muted-foreground">
          Processed {total} row{total === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Imported" value={result.imported} tone="emerald" />
        <Stat label="Updated" value={result.updated} tone="blue" />
        <Stat label="Skipped" value={result.skipped} tone="amber" />
        <Stat label="Errors" value={result.errors.length} tone="rose" />
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-lg border border-rose-300/40 bg-rose-500/5 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            Errors
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-rose-700 dark:text-rose-400">
            {result.errors.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Row {e.row}: {e.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Use{' '}
        <button
          onClick={onReset}
          className="text-primary underline-offset-2 hover:underline"
        >
          Import another file
        </button>{' '}
        to keep going, or close this drawer to return to the leads list.
      </p>
    </div>
  )
}

// In-progress view shown in the drawer body while the import is running.
// Drives off the same per-row `progress` state the footer button reads, so
// the percentage stays in sync with the "Importing X / Y" label.
function ProgressView({
  progress,
}: {
  progress: { done: number; total: number }
}) {
  const pct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 py-12 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="space-y-1">
        <p className="text-base font-semibold">Importing your leads…</p>
        <p className="text-xs text-muted-foreground">
          Don&apos;t close this drawer until it finishes. Large files are
          uploaded in batches of 500 rows.
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm space-y-2">
        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="font-medium">
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows
          </span>
          <span className="font-semibold text-primary">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'emerald' | 'blue' | 'amber' | 'rose'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : tone === 'blue'
        ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
        : tone === 'amber'
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-md p-3 text-center',
        toneClass,
      )}
    >
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
    </div>
  )
}
