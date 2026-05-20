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
