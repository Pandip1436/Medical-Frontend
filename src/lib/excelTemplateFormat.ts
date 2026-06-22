import type * as XLSX from 'xlsx-js-style'

// Shared workbook-formatting utilities used by every import template + every
// sample-data script.
//
// We use the `xlsx-js-style` fork (a drop-in superset of the community
// `xlsx` library) on the *write* side because it supports cell-level styles
// (bold, fill, borders) that the base `xlsx` writer drops. Google Sheets +
// Excel both honor these styles on import.
//
// Parsing still uses the base `xlsx` library — the parse path doesn't need
// styles and keeping it on the smaller dep saves bundle bytes there.

// Tunables for the content-based auto-sizer below.
//   FILTER_ARROW_PADDING — the auto-filter dropdown in the header consumes
//     ~3 character widths; without padding the arrow truncates the label.
//   MIN_WIDTH — short numeric/boolean columns still need this minimum so
//     the filter arrow doesn't clip.
//   MAX_WIDTH — caps long free-text values (notes / address) so a single
//     stray paragraph can't blow the column to 200ch wide.
//   DATA_PADDING — small visual breathing room past the longest data cell.
const FILTER_ARROW_PADDING = 4
const MIN_WIDTH = 10
const MAX_WIDTH = 50
const DATA_PADDING = 1

// Auto-size a single column by walking its cells in the given sheet. The
// header (row 1) gets extra padding for the filter dropdown arrow + bold.
// This measures actual content, so renamed columns / new fields auto-fit
// without anyone updating a regex.
function autoSizeColumn(
  ws: Record<string, unknown>,
  colName: string,
  colIndex: number,
  lastRow: number,
): number {
  const letter = columnLetter(colIndex)
  let maxLen = colName.length + FILTER_ARROW_PADDING
  for (let r = 2; r <= lastRow; r++) {
    const cell = ws[`${letter}${r}`] as { v?: unknown } | undefined
    if (cell?.v === undefined || cell.v === null) continue
    const s = String(cell.v)
    if (s.length > maxLen - DATA_PADDING) maxLen = s.length + DATA_PADDING
  }
  return Math.max(MIN_WIDTH, Math.min(maxLen, MAX_WIDTH))
}

// 0-indexed column → Excel column letter ('A', 'Z', 'AA', etc.).
export function columnLetter(index0: number): string {
  let n = index0
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

// ─── Style objects ──────────────────────────────────────────────────────────
// Concrete cell-style objects xlsx-js-style consumes. Kept as helpers so the
// same look is applied consistently across every sheet.

// Bold white text on a coloured fill — the "header band" look.
function headerStyle(tabColor: string): unknown {
  const rgb = tabColor.replace('#', '').toUpperCase()
  return {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: rgb } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
    border: {
      top: { style: 'thin', color: { rgb: 'D1D5DB' } },
      bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
      left: { style: 'thin', color: { rgb: 'D1D5DB' } },
      right: { style: 'thin', color: { rgb: 'D1D5DB' } },
    },
  }
}

// Light alternating-row fill for the (single) sample row in the downloadable
// template. Makes it obvious that's the data row, not the header.
function sampleRowStyle(): unknown {
  return {
    font: { name: 'Calibri', sz: 11, color: { rgb: '111827' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F9FAFB' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E5E7EB' } },
      bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
      left: { style: 'thin', color: { rgb: 'E5E7EB' } },
      right: { style: 'thin', color: { rgb: 'E5E7EB' } },
    },
  }
}

// Instructions-sheet title cell: large bold text on emerald.
function instructionsTitleStyle(): unknown {
  return {
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '047857' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
}

// Instructions section label ("Sheet: Customers" etc.) — bold + light fill
// so the eye can scan section breaks.
function instructionsSectionStyle(): unknown {
  return {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '111827' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'ECFDF5' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }
}

// Instructions normal body cell.
function instructionsBodyStyle(): unknown {
  return {
    font: { name: 'Calibri', sz: 11, color: { rgb: '374151' } },
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  }
}

// Instructions field-label (left column) — semi-bold for readability.
function instructionsLabelStyle(): unknown {
  return {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '065F46' } },
    alignment: { horizontal: 'left', vertical: 'top' },
  }
}

// ─── Sheet formatting (data sheets) ─────────────────────────────────────────

export interface SheetFormatOpts {
  columns: readonly string[]
  tabColor?: string
  freezeHeader?: boolean
  autoFilter?: boolean
  // How many data rows below the header should get the alternating row fill.
  // Pass 0 to disable (e.g. when there are no sample rows yet). Defaults to 1
  // so the template's single sample row stands out.
  styledDataRows?: number
}

// Mutates `ws` in place to apply readability formatting AND cell-level styles.
// Safe to call on any sheet that has a header row in row 1.
export function applySheetFormatting(
  ws: XLSX.WorkSheet,
  opts: SheetFormatOpts,
): void {
  const sheet = ws as unknown as Record<string, unknown>
  const cols = opts.columns

  // Find the last row so we can measure data lengths for auto-sizing.
  const ref = (sheet['!ref'] as string | undefined) ?? 'A1:A1'
  const lastRowMatch = ref.match(/[A-Z]+(\d+)$/)
  const lastRow = lastRowMatch ? parseInt(lastRowMatch[1], 10) : 1

  // Content-based column widths — measure header + every data cell + a
  // padding margin. Beats a regex lookup because it auto-adapts to new
  // columns or longer-than-expected values without anyone tuning a list.
  sheet['!cols'] = cols.map((c, i) => ({
    wch: autoSizeColumn(sheet, c, i, lastRow),
  }))
  sheet['!rows'] = [{ hpt: 24 }] // taller header row

  if (opts.freezeHeader !== false) {
    sheet['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  }
  if (opts.autoFilter !== false && cols.length > 0) {
    const lastCol = columnLetter(cols.length - 1)
    sheet['!autofilter'] = { ref: `A1:${lastCol}1` }
  }
  if (opts.tabColor) {
    sheet['!tabColor'] = { rgb: opts.tabColor.replace('#', '').toUpperCase() }
  }

  // Apply cell-level header style (bold white text on coloured fill).
  const headerFill = opts.tabColor ?? '047857'
  const hStyle = headerStyle(headerFill)
  for (let c = 0; c < cols.length; c++) {
    const addr = `${columnLetter(c)}1`
    const cell = (sheet[addr] ?? { t: 's', v: cols[c] }) as Record<string, unknown>
    cell.s = hStyle
    sheet[addr] = cell
  }

  // Light fill on the first N data rows so the sample is visually distinct.
  const styledRows = opts.styledDataRows ?? 1
  const rowStyle = sampleRowStyle()
  for (let r = 0; r < styledRows; r++) {
    for (let c = 0; c < cols.length; c++) {
      const addr = `${columnLetter(c)}${r + 2}`
      const existing = sheet[addr] as Record<string, unknown> | undefined
      if (!existing) continue // empty cell — skip
      existing.s = rowStyle
    }
  }
}

// ─── Instructions sheet ─────────────────────────────────────────────────────
// The Instructions sheet uses an array-of-arrays input: [Field, Notes].
// We do a richer styling pass here because it's the first thing the user
// sees: title row merged across both columns, section labels (rows that have
// a label in A and empty B, or start with "Sheet:") styled differently.

// Column B width in chars — also drives row-height calculations below.
const INSTRUCTIONS_COL_B_CHARS = 100

export function applyInstructionsFormatting(
  ws: XLSX.WorkSheet,
  tabColor: string = '64748B',
): void {
  const sheet = ws as unknown as Record<string, unknown>
  sheet['!cols'] = [{ wch: 36 }, { wch: INSTRUCTIONS_COL_B_CHARS }]
  sheet['!tabColor'] = { rgb: tabColor.replace('#', '').toUpperCase() }

  // Discover total rows from the sheet's ref range.
  const ref = (sheet['!ref'] as string | undefined) ?? 'A1:B1'
  const lastRowMatch = ref.match(/[A-Z]+(\d+)$/)
  const lastRow = lastRowMatch ? parseInt(lastRowMatch[1], 10) : 1

  // Header row (row 1: "Field" / "Notes")
  const headerFill = '047857' // emerald
  for (const addr of ['A1', 'B1']) {
    const cell = (sheet[addr] ?? { t: 's', v: '' }) as Record<string, unknown>
    cell.s = headerStyle(headerFill)
    sheet[addr] = cell
  }

  // Build the !rows array up-front and size each row based on its body text
  // length. Google Sheets doesn't auto-grow row heights from xlsx imports,
  // so without explicit heights wrapped text gets visually clipped.
  const rows: Array<Record<string, number>> = [{ hpt: 24 }] // row 1 (header)

  for (let r = 2; r <= lastRow; r++) {
    const a = sheet[`A${r}`] as Record<string, unknown> | undefined
    const b = sheet[`B${r}`] as Record<string, unknown> | undefined
    const aVal = a?.v as string | undefined
    const bVal = b?.v as string | undefined

    if (aVal && /^HOSPITAL\s+SUPPLIERS/i.test(aVal) && !bVal) {
      // Title — merge A:B and apply title style.
      const merges = (sheet['!merges'] ?? []) as Array<unknown>
      merges.push({ s: { r: r - 1, c: 0 }, e: { r: r - 1, c: 1 } })
      sheet['!merges'] = merges
      rows[r - 1] = { hpt: 32 }
      ;(a as Record<string, unknown>).s = instructionsTitleStyle()
      if (!sheet[`B${r}`]) sheet[`B${r}`] = { t: 's', v: '' }
      ;(sheet[`B${r}`] as Record<string, unknown>).s = instructionsTitleStyle()
      continue
    }

    if (aVal && /^Sheet:/i.test(aVal)) {
      // Section label like "Sheet: Customers".
      if (a) a.s = instructionsSectionStyle()
      if (b) b.s = instructionsSectionStyle()
      rows[r - 1] = computeBodyHeight(bVal)
      continue
    }

    if (a && aVal) a.s = instructionsLabelStyle()
    if (b && bVal) b.s = instructionsBodyStyle()
    rows[r - 1] = computeBodyHeight(bVal)
  }

  sheet['!rows'] = rows
}

// Pick a row height that fits the wrapped body text. Empty rows act as
// short visual separators. Heights are in xlsx "points" (≈ 1.33px each).
function computeBodyHeight(bVal: string | undefined): { hpt: number } {
  if (!bVal) return { hpt: 8 } // tight separator row
  const lines = Math.max(1, Math.ceil(bVal.length / INSTRUCTIONS_COL_B_CHARS))
  // 15pt per line + 4pt padding. Cap at 90pt so a runaway paragraph can't
  // produce a giant row.
  return { hpt: Math.min(90, lines * 15 + 4) }
}

// ─── Export-file metadata ───────────────────────────────────────────────────
// When the operator exports a list, we prepend a metadata block to the
// Instructions sheet. The block has a recognisable marker title
// ("HOSPITAL SUPPLIERS — Customer Export" etc.) that the parser checks for
// on re-import so the drawer can show a round-trip safety banner.
//
// The marker for ParseResult detection lives in the row that starts with
// "HOSPITAL SUPPLIERS — " followed by " Export" (vs " Template" for the
// non-export template). The metadata rows that follow are key/value pairs.

export interface ExportMetadata {
  // Free-text identifier of which entity was exported.
  entity: 'Customer' | 'Supplier' | 'Product'
  branchName: string | null
  exportedBy: string | null
  exportedAt: string // ISO timestamp
  schemaVersion: string
  // Counts shown in the metadata block for at-a-glance verification.
  counts: Record<string, number>
}

// Build the AOA rows that go into the Instructions sheet. Called BEFORE the
// existing template-instructions rows so the export header lands at the top.
// Result format: a 2D array of `[label, value]` rows.
export function buildExportMetadataRows(
  meta: ExportMetadata,
): Array<[string, string]> {
  const formatNumber = (n: number) => n.toLocaleString('en-IN')
  const countsLine = Object.entries(meta.counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${formatNumber(n)} ${k}`)
    .join(' · ')

  return [
    [`HOSPITAL SUPPLIERS — ${meta.entity} Export`, ''],
    ['', ''],
    ['Export metadata', ''],
    ['Exported from branch', meta.branchName ?? '(no branch / cross-branch)'],
    ['Exported by', meta.exportedBy ?? '(unknown user)'],
    ['Exported at', meta.exportedAt],
    ['Schema version', meta.schemaVersion],
    ['Contains', countsLine || '(empty export)'],
    ['', ''],
    [
      'Round-trip',
      'This file can be re-imported via the Import drawer. Duplicate matches will be detected by phone / name, so edits flow back via Update existing. Don\'t change the column headers.',
    ],
    ['', ''],
  ]
}

// Parser-side: detect whether an uploaded file is an export (vs a hand-filled
// template) and pull metadata back out. Returns undefined when no export
// marker is found. Called from each *ImportTemplate.ts parseXxxWorkbook().
export function readExportMetadata(
  instructionsRows: Array<Array<unknown>>,
): ExportMetadata | undefined {
  if (!instructionsRows || instructionsRows.length === 0) return undefined
  const findRowStarting = (prefix: string) =>
    instructionsRows.find((r) => String(r?.[0] ?? '').trim().startsWith(prefix))

  const titleRow = findRowStarting('HOSPITAL SUPPLIERS — ')
  if (!titleRow) return undefined
  const title = String(titleRow[0] ?? '')
  // Must contain "Export" (not "Template") to be recognised as a round-trip
  // file. Otherwise it's a vanilla download-template file.
  const m = title.match(/HOSPITAL SUPPLIERS — (Customer|Supplier|Product) Export/i)
  if (!m) return undefined

  const getValue = (label: string): string | null => {
    const row = findRowStarting(label)
    if (!row) return null
    const v = String(row[1] ?? '').trim()
    return v || null
  }

  return {
    entity: m[1] as ExportMetadata['entity'],
    branchName: getValue('Exported from branch'),
    exportedBy: getValue('Exported by'),
    exportedAt: getValue('Exported at') ?? '',
    schemaVersion: getValue('Schema version') ?? 'unknown',
    counts: {}, // counts aren't read back — frontend renders the live numbers
  }
}

// Sheet-type → tab colour map. Used consistently across all three workbook
// templates so the operator gets visual continuity.
export const SHEET_COLORS = {
  instructions: '047857', // emerald-700 (deeper to contrast white text)
  customers: '047857',
  suppliers: '047857',
  products: '047857',
  categories: '4338CA',   // indigo-700
  invoices: '1D4ED8',     // blue-700
  invoiceItems: '3B82F6', // blue-500
  payments: '6D28D9',     // violet-700
  activities: 'B45309',   // amber-700
  prescriptions: 'BE185D', // pink-700
  quotations: '0E7490',   // cyan-700
  quotationItems: '06B6D4', // cyan-500
  creditNotes: 'B91C1C',  // red-700
  creditNoteItems: 'EF4444', // red-500
  purchaseOrders: '1D4ED8', // blue-700
  poItems: '3B82F6',      // blue-500
  grns: '6D28D9',         // violet-700
  grnItems: '8B5CF6',     // violet-500
  debitNotes: 'B91C1C',   // red-700
  debitNoteItems: 'EF4444', // red-500
  batches: '475569',      // slate-600
} as const

// ─────────────────────────────────────────────────────────────────────────────
// MARG ERP "ADDRESS BOOK" parser (shared by customer + supplier import)
//
// MARG (a popular Indian chemist ERP) exports its party master as a printed
// address book, NOT a flat table: each party is a multi-row block —
//   row 1: PARTY NAME            | office phone | mobile | fax
//   row 2: address line 1        |              | mobile |
//   row 3: address line 2        | D.L.No. :    | DL no  | DL no
//   row 4: city / address line 3 | GSTIN :      | gstin  | Date :
//   (blank row separates parties; the PARTY NAME/& ADDRESS header repeats per
//   page; a "MARG ERP …" line ends the report)
// We collapse each block into one party record. Works on a raw 2D cell array so
// it stays decoupled from the xlsx reader.
// ─────────────────────────────────────────────────────────────────────────────

export interface MargParty {
  sourceRow: number
  name: string
  phone: string
  address?: string
  gstin?: string
  dlNumber?: string
  email?: string
}

// GSTIN: 2 digits, 5 letters, 4 digits, letter, alnum, 'Z', alnum (15 chars).
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/i
const PHONE10_RE = /\b\d{10}\b/

function mstr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

export function looksLikeMargAddressBook(aoa: unknown[][]): boolean {
  const head = aoa
    .slice(0, 12)
    .map((r) => r.map((c) => String(c ?? '')).join(' '))
    .join(' ')
    .toUpperCase()
  return head.includes('ADDRESS BOOK') && head.includes('PARTY NAME')
}

function buildMargParty(block: unknown[][], sourceRow: number): MargParty | null {
  const name = mstr(block[0]?.[0]).replace(/^#+\s*/, '').trim()
  if (!name) return null

  const cellStrings: string[] = []
  for (const r of block) for (const c of r) { const s = mstr(c); if (s) cellStrings.push(s) }

  // GSTIN — pattern match anywhere in the block.
  let gstin: string | undefined
  for (const s of cellStrings) {
    const m = s.match(GSTIN_RE)
    if (m) { gstin = m[0].toUpperCase(); break }
  }

  // Phone — prefer a 10-digit mobile in the phone columns; else a landline.
  let phone = ''
  for (const r of block) {
    for (let ci = 1; ci < r.length && !phone; ci++) {
      const m = mstr(r[ci]).match(PHONE10_RE)
      if (m) phone = m[0]
    }
    if (phone) break
  }
  if (!phone) {
    const office = mstr(block[0]?.[1]).replace(/\D/g, '')
    if (office.length >= 6) phone = office
  }

  // Drug-license number — labelled "D.L.No. :" in col B, or embedded in col A.
  let dlNumber: string | undefined
  for (const r of block) {
    if (/^d\.?\s*l/i.test(mstr(r[1]))) {
      const a = mstr(r[2])
      const b = mstr(r[3])
      dlNumber = [a, b && !/date/i.test(b) ? b : ''].filter(Boolean).join(' ').trim() || undefined
      break
    }
  }
  if (!dlNumber) {
    for (const r of block) {
      const m = mstr(r[0]).match(/D\.?\s*L\.?\s*No\.?\s*:?\s*([A-Z0-9/.\- ]+?)(?:\s{2,}|GSTIN|$)/i)
      if (m && m[1].trim()) { dlNumber = m[1].trim(); break }
    }
  }

  // Address — column A of the rows after the name, with any inline
  // D.L.No./GSTIN/CST labels trimmed off.
  const address =
    block
      .slice(1)
      .map((r) =>
        mstr(r[0])
          .replace(/\s*D\.?\s*L\.?\s*No\.?\s*:.*$/i, '')
          .replace(/\s*GSTIN\s*:.*$/i, '')
          .replace(/\s*CST\.?\s*NO.*$/i, '')
          .trim(),
      )
      .filter(Boolean)
      .join(', ') || undefined

  return { sourceRow, name, phone, address, gstin, dlNumber }
}

export function parseMargAddressBook(aoa: unknown[][]): MargParty[] {
  // Skip the one-time company header block — real data starts after the first
  // "& ADDRESS" sub-header.
  const headerIdx = aoa.findIndex((r) => mstr(r[0]).toUpperCase().startsWith('& ADDRESS'))
  const start = headerIdx >= 0 ? headerIdx + 1 : 0

  const parties: MargParty[] = []
  let block: unknown[][] = []
  let blockStart = start + 1

  const flush = () => {
    if (block.length) {
      const p = buildMargParty(block, blockStart)
      if (p) parties.push(p)
      block = []
    }
  }

  for (let i = start; i < aoa.length; i++) {
    const row = aoa[i]
    const c0 = mstr(row[0]).toUpperCase()
    const allEmpty = row.every((c) => mstr(c) === '')
    // Blank rows and repeated page headers / the MARG footer end the block.
    const isNoise =
      c0.startsWith('PARTY NAME') ||
      c0.startsWith('& ADDRESS') ||
      c0.includes('ADDRESS BOOK') ||
      c0.includes('MARG ERP')
    if (allEmpty || isNoise) { flush(); continue }
    if (block.length === 0) blockStart = i + 1
    block.push(row)
  }
  flush()

  return parties
}

// ─────────────────────────────────────────────────────────────────────────────
// MARG ERP "party master" flat export (a.k.a. the Tally-style ledger dump).
// One header row of exact field codes — code,type,ledger,city,group,name,
// address1..3,pin,email,phone1,phone2,mobile,resi,licence,tin,… — then one row
// per party. We map it by those known codes rather than fuzzy synonyms, because
// it has several phone columns and both `name` and `ledger` columns (name is
// the clean one; ledger is name+city padded).
// ─────────────────────────────────────────────────────────────────────────────

function looksLikeMargPartyTableRow(keys: string[]): boolean {
  return (
    keys.includes('ledger') &&
    keys.includes('name') &&
    (keys.includes('tin') || keys.includes('licence')) &&
    (keys.includes('mobile') || keys.includes('phone1'))
  )
}

export function looksLikeMargPartyTable(aoa: unknown[][]): boolean {
  for (let i = 0; i < Math.min(aoa.length, 5); i++) {
    if (looksLikeMargPartyTableRow(aoa[i].map((c) => mstr(c).toLowerCase()))) return true
  }
  return false
}

export function parseMargPartyTable(aoa: unknown[][]): MargParty[] {
  let headerIdx = -1
  let keys: string[] = []
  for (let i = 0; i < Math.min(aoa.length, 5); i++) {
    const k = aoa[i].map((c) => mstr(c).toLowerCase())
    if (looksLikeMargPartyTableRow(k)) { headerIdx = i; keys = k; break }
  }
  if (headerIdx < 0) return []

  const col = (row: unknown[], key: string): string => {
    const i = keys.indexOf(key)
    return i < 0 ? '' : mstr(row[i])
  }

  const parties: MargParty[] = []
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r]
    // `name` is the clean party name; fall back to `ledger` (name + city).
    const name = (col(row, 'name') || col(row, 'ledger')).replace(/\s{2,}/g, ' ').trim()
    if (!name) continue
    // First non-empty phone, mobile preferred over landlines.
    const phone =
      ['mobile', 'phone1', 'phone2', 'resi', 'contact'].map((k) => col(row, k)).find(Boolean) || ''
    const gstin = col(row, 'tin') || col(row, 'gstin') || undefined
    const dlNumber = col(row, 'licence') || undefined
    const email = col(row, 'email') || undefined
    const address =
      ['address1', 'address2', 'address3', 'city', 'pin'].map((k) => col(row, k)).filter(Boolean).join(', ') || undefined
    parties.push({ sourceRow: r + 1, name, phone, address, gstin, dlNumber, email })
  }
  return parties
}

// ─────────────────────────────────────────────────────────────────────────────
// Tolerant header-mapped import (shared by customer + supplier import)
//
// Accepts any flat spreadsheet whose columns have recognizable headers — name,
// phone/mobile, address, gstin, email, etc. — even with title rows above the
// header. Each caller supplies its own field→synonyms map; we return one row
// per record keyed by the matched field names. Used as a fallback when the
// structured template (and MARG address book) don't apply.
// ─────────────────────────────────────────────────────────────────────────────

export interface LooseAliasGroup {
  field: string
  aliases: string[]
}

export interface LooseRow {
  sourceRow: number
  values: Record<string, string>
}

// Lowercase, strip punctuation, collapse whitespace so "GST No." == "gst no".
function normaliseHeaderCell(h: unknown): string {
  return mstr(h).toLowerCase().replace(/[._/\\(),-]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Map a header label to a field: exact synonym first, then substring match.
function matchAliasField(header: string, groups: LooseAliasGroup[]): string | undefined {
  if (!header) return undefined
  for (const g of groups) if (g.aliases.includes(header)) return g.field
  let best: { field: string; len: number } | undefined
  for (const g of groups)
    for (const a of g.aliases)
      if (a.length >= 3 && (header.includes(a) || a.includes(header)))
        if (!best || a.length > best.len) best = { field: g.field, len: a.length }
  return best?.field
}

export function parseLooseSheet(aoa: unknown[][], groups: LooseAliasGroup[]): LooseRow[] {
  // Find a header row in the first 25 rows: ≥2 recognized columns incl. name.
  let headerIdx = -1
  const colMap = new Map<number, string>()
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    const m = new Map<number, string>()
    const used = new Set<string>()
    aoa[i].forEach((cell, ci) => {
      const f = matchAliasField(normaliseHeaderCell(cell), groups)
      if (f && !used.has(f)) { m.set(ci, f); used.add(f) }
    })
    if (m.size >= 2 && [...m.values()].includes('name')) {
      headerIdx = i
      m.forEach((v, k) => colMap.set(k, v))
      break
    }
  }
  if (headerIdx < 0) return []

  const rows: LooseRow[] = []
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r]
    const values: Record<string, string> = {}
    for (const [ci, field] of colMap) {
      const s = mstr(row[ci])
      if (s) values[field] = s
    }
    if (Object.keys(values).length > 0) rows.push({ sourceRow: r + 1, values })
  }
  return rows
}
