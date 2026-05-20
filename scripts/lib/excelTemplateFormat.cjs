/* eslint-disable */
// CommonJS twin of src/lib/excelTemplateFormat.ts. Kept in sync manually.
// Used by sample-data scripts; the in-app templates use the TS version.

// Content-based auto-sizer — measures header + every data cell so columns
// fit their actual content. See the TS twin for the rationale comment.
const FILTER_ARROW_PADDING = 4
const MIN_WIDTH = 10
const MAX_WIDTH = 50
const DATA_PADDING = 1

function autoSizeColumn(ws, colName, colIndex, lastRow) {
  const letter = columnLetter(colIndex)
  let maxLen = String(colName).length + FILTER_ARROW_PADDING
  for (let r = 2; r <= lastRow; r++) {
    const cell = ws[`${letter}${r}`]
    if (!cell || cell.v === undefined || cell.v === null) continue
    const s = String(cell.v)
    if (s.length > maxLen - DATA_PADDING) maxLen = s.length + DATA_PADDING
  }
  return Math.max(MIN_WIDTH, Math.min(maxLen, MAX_WIDTH))
}

function columnLetter(index0) {
  let n = index0
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

function headerStyle(tabColor) {
  const rgb = String(tabColor).replace('#', '').toUpperCase()
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

function dataRowStyle() {
  return {
    font: { name: 'Calibri', sz: 11, color: { rgb: '111827' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E5E7EB' } },
      bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
      left: { style: 'thin', color: { rgb: 'E5E7EB' } },
      right: { style: 'thin', color: { rgb: 'E5E7EB' } },
    },
  }
}

function dataRowStyleStriped() {
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

function instructionsTitleStyle() {
  return {
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '047857' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
}

function instructionsSectionStyle() {
  return {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '111827' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'ECFDF5' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }
}

function instructionsBodyStyle() {
  return {
    font: { name: 'Calibri', sz: 11, color: { rgb: '374151' } },
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
  }
}

function instructionsLabelStyle() {
  return {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '065F46' } },
    alignment: { horizontal: 'left', vertical: 'top' },
  }
}

function applySheetFormatting(ws, opts) {
  const cols = opts.columns
  // Find the last row so we can measure data lengths for auto-sizing.
  const initialRef = ws['!ref'] || 'A1:A1'
  const lastRowMatch = initialRef.match(/[A-Z]+(\d+)$/)
  const lastRow = lastRowMatch ? parseInt(lastRowMatch[1], 10) : 1
  ws['!cols'] = cols.map((c, i) => ({
    wch: autoSizeColumn(ws, c, i, lastRow),
  }))
  ws['!rows'] = [{ hpt: 24 }]
  if (opts.freezeHeader !== false) {
    ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  }
  if (opts.autoFilter !== false && cols.length > 0) {
    const lastCol = columnLetter(cols.length - 1)
    ws['!autofilter'] = { ref: `A1:${lastCol}1` }
  }
  if (opts.tabColor) {
    ws['!tabColor'] = { rgb: String(opts.tabColor).replace('#', '').toUpperCase() }
  }

  const headerFill = opts.tabColor || '047857'
  const hStyle = headerStyle(headerFill)
  for (let c = 0; c < cols.length; c++) {
    const addr = `${columnLetter(c)}1`
    const cell = ws[addr] || { t: 's', v: cols[c] }
    cell.s = hStyle
    ws[addr] = cell
  }

  // Stripe data rows. `lastRow` was already computed for the auto-sizer above.
  const normal = dataRowStyle()
  const striped = dataRowStyleStriped()
  for (let r = 2; r <= lastRow; r++) {
    const style = r % 2 === 0 ? striped : normal
    for (let c = 0; c < cols.length; c++) {
      const addr = `${columnLetter(c)}${r}`
      const existing = ws[addr]
      if (!existing) continue
      existing.s = style
    }
  }
}

const INSTRUCTIONS_COL_B_CHARS = 100

function computeBodyHeight(bVal) {
  if (!bVal) return { hpt: 8 }
  const lines = Math.max(1, Math.ceil(String(bVal).length / INSTRUCTIONS_COL_B_CHARS))
  return { hpt: Math.min(90, lines * 15 + 4) }
}

function applyInstructionsFormatting(ws, tabColor) {
  ws['!cols'] = [{ wch: 36 }, { wch: INSTRUCTIONS_COL_B_CHARS }]
  ws['!tabColor'] = { rgb: String(tabColor || '64748B').replace('#', '').toUpperCase() }

  const ref = ws['!ref'] || 'A1:B1'
  const lastRowMatch = ref.match(/[A-Z]+(\d+)$/)
  const lastRow = lastRowMatch ? parseInt(lastRowMatch[1], 10) : 1

  const hStyle = headerStyle('047857')
  for (const addr of ['A1', 'B1']) {
    const cell = ws[addr] || { t: 's', v: '' }
    cell.s = hStyle
    ws[addr] = cell
  }

  // Build per-row heights up-front. Google Sheets doesn't auto-grow rows
  // from xlsx imports, so wrapped text needs an explicit row height.
  const rows = [{ hpt: 24 }]

  for (let r = 2; r <= lastRow; r++) {
    const a = ws[`A${r}`]
    const b = ws[`B${r}`]
    const aVal = a && a.v
    const bVal = b && b.v

    if (aVal && /^HOSPITAL\s+SUPPLIERS/i.test(String(aVal)) && !bVal) {
      const merges = ws['!merges'] || []
      merges.push({ s: { r: r - 1, c: 0 }, e: { r: r - 1, c: 1 } })
      ws['!merges'] = merges
      rows[r - 1] = { hpt: 32 }
      a.s = instructionsTitleStyle()
      if (!ws[`B${r}`]) ws[`B${r}`] = { t: 's', v: '' }
      ws[`B${r}`].s = instructionsTitleStyle()
      continue
    }

    if (aVal && /^Sheet:/i.test(String(aVal))) {
      if (a) a.s = instructionsSectionStyle()
      if (b) b.s = instructionsSectionStyle()
      rows[r - 1] = computeBodyHeight(bVal)
      continue
    }

    if (a && aVal) a.s = instructionsLabelStyle()
    if (b && bVal) b.s = instructionsBodyStyle()
    rows[r - 1] = computeBodyHeight(bVal)
  }

  ws['!rows'] = rows
}

const SHEET_COLORS = {
  instructions: '047857',
  customers: '047857',
  suppliers: '047857',
  products: '047857',
  categories: '4338CA',
  invoices: '1D4ED8',
  invoiceItems: '3B82F6',
  payments: '6D28D9',
  activities: 'B45309',
  prescriptions: 'BE185D',
  quotations: '0E7490',
  quotationItems: '06B6D4',
  creditNotes: 'B91C1C',
  creditNoteItems: 'EF4444',
  purchaseOrders: '1D4ED8',
  poItems: '3B82F6',
  grns: '6D28D9',
  grnItems: '8B5CF6',
  debitNotes: 'B91C1C',
  debitNoteItems: 'EF4444',
  batches: '475569',
}

module.exports = {
  columnLetter,
  applySheetFormatting,
  applyInstructionsFormatting,
  SHEET_COLORS,
}
