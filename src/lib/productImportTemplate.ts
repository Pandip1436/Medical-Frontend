// xlsx-js-style for cell-level styles (see customerImportTemplate.ts for rationale).
import * as XLSX from 'xlsx-js-style'
import {
  type ExportMetadata,
  type LooseAliasGroup,
  SHEET_COLORS,
  applyInstructionsFormatting,
  applySheetFormatting,
  buildExportMetadataRows,
  parseLooseSheet,
  readExportMetadata,
} from './excelTemplateFormat'

export type { ExportMetadata }

// Tolerant header map for flat product exports that aren't our template —
// MARG/Marg-style item masters, supplier price lists, a plain sheet someone
// typed by hand. Customers and suppliers already had this; products didn't, so
// an ordinary one-sheet product list parsed to zero rows.
//
// Two matching rules from parseLooseSheet shape these lists: exact matches are
// tried across every group before any substring match, and the first column to
// claim a field keeps it. So no-space spellings ("hsncode", "itemcode") need
// listing explicitly, and short generic aliases ("gst", "tax") are avoided —
// they would substring-match SGST/CGST/OldTax and mis-assign the tax columns.
const PRODUCT_ALIAS_GROUPS: LooseAliasGroup[] = [
  // No bare 'item' / 'product' alias: substring matching is bidirectional, so
  // 'item' would swallow an `ItemID` column sitting to the left of `Name` and
  // claim the name field with a database id.
  { field: 'name', aliases: ['name', 'product name', 'productname', 'item name', 'itemname', 'item description', 'itemdescription', 'description', 'particulars'] },
  { field: 'productCode', aliases: ['item code', 'itemcode', 'product code', 'productcode', 'code', 'sku', 'article code'] },
  { field: 'manufacturer', aliases: ['company', 'company name', 'companyname', 'manufacturer', 'mfr', 'mfg', 'make', 'brand', 'marketed by'] },
  { field: 'genericName', aliases: ['generic name', 'genericname', 'generic', 'salt', 'salt name', 'molecule'] },
  { field: 'saltComposition', aliases: ['salt composition', 'saltcomposition', 'composition'] },
  { field: 'categoryName', aliases: ['category', 'category name', 'categoryname', 'group', 'group name', 'drug group'] },
  { field: 'hsnCode', aliases: ['hsn code', 'hsncode', 'hsn', 'hsn sac', 'hsnsac'] },
  { field: 'packSize', aliases: ['pack size', 'packsize', 'pack', 'packing', 'unit size'] },
  { field: 'unitOfMeasure', aliases: ['unit of measure', 'unitofmeasure', 'uom', 'unit'] },
  { field: 'mrp', aliases: ['m r p', 'mrp', 'mrp rate', 'maximum retail price', 'retail price'] },
  { field: 'purchaseRate', aliases: ['p rate', 'prate', 'purchase rate', 'purchaserate', 'pur rate', 'purchase price', 'cost price', 'cost', 'buying rate'] },
  { field: 'sellingRate', aliases: ['rate', 'sale rate', 'salerate', 'selling rate', 'sellingrate', 'sell rate', 'sale price', 'selling price'] },
  { field: 'wholesaleRate', aliases: ['wholesale rate', 'wholesalerate', 'w rate', 'ws rate', 'wholesale price'] },
  // IGST carries the full GST percent on an intra-state MARG export (SGST 2.5 +
  // CGST 2.5 → IGST 5), so it is the single best column when present. SGST/CGST
  // are captured separately and summed only as a fallback.
  { field: 'gstRate', aliases: ['gst rate', 'gstrate', 'igst', 'gst percent', 'tax rate', 'taxrate'] },
  { field: 'sgst', aliases: ['sgst'] },
  { field: 'cgst', aliases: ['cgst'] },
  // Retained even though `barcode` is no longer a template column: the alias
  // matcher falls back to substring matching, and "barcode" CONTAINS "code",
  // so without this group a barcode column would be silently read as the item
  // code. Files that do carry barcodes still import them; we just stopped
  // asking for them.
  { field: 'barcode', aliases: ['barcode', 'bar code', 'ean', 'upc'] },
  { field: 'rackLocation', aliases: ['rack', 'rack location', 'racklocation', 'shelf'] },
  // Deliberately no minStock / stock group. Every sensible alias for it
  // ('min stock', 'minstock') substring-matches a plain `Stock` column, and
  // stock-on-hand must not enter this way — it comes from GRN only.
]

// ─────────────────────────────────────────────────────────────────────────────
// Product import workbook — template + parser. Mirror of customer/supplier
// templates but flatter: products have no history sub-entities (batches come
// from GRN, alternatives are managed in the product form). So we have just
// three sheets: Instructions, Categories (optional pre-create), Products.
// ─────────────────────────────────────────────────────────────────────────────

export type DuplicateHandling = 'UPDATE' | 'SKIP' | 'CREATE' | 'UPDATE_ONLY'
export type Schedule = 'NONE' | 'H' | 'H1' | 'X'
export type StorageCondition =
  | 'ROOM_TEMP'
  | 'COOL_DRY'
  | 'REFRIGERATED'
  | 'FROZEN'

export interface ParsedProduct {
  sourceRow: number
  productCode?: string
  name: string
  genericName?: string
  saltComposition?: string
  manufacturer?: string
  categoryId?: string
  categoryName?: string
  subCategory?: string
  packSize?: string
  unitOfMeasure?: string
  schedule?: Schedule
  hsnCode?: string
  isNarcotic?: boolean
  storageCondition?: StorageCondition
  mrp?: number
  purchaseRate?: number
  sellingRate?: number
  wholesaleRate?: number
  gstRate?: number
  minStock?: number
  maxStock?: number
  reorderQty?: number
  rackLocation?: string
  barcode?: string
  totalStock?: number
  isActive?: boolean
}

export interface ParsedCategory {
  sourceRow: number
  name: string
  description?: string
  color?: string
  isActive?: boolean
}

export interface ParseError {
  sheet: SheetName
  row: number
  field?: string
  message: string
}

/** Which of the four parser strategies actually produced the rows. */
export type ParsePath = 'template' | 'marg' | 'marg-hsn' | 'loose'

export interface ParseResult {
  categories: ParsedCategory[]
  products: ParsedProduct[]
  errors: ParseError[]
  exportMetadata?: ExportMetadata
  parsePath?: ParsePath
}

// ─── Gap predicates ─────────────────────────────────────────────────────────
// These mirror the backend's own definition of "missing" so the UI and any
// generated report can describe a file WITHOUT waiting for a dry-run, and can
// describe it correctly.
//
// Why not just read the warning text: ImportRowWarning carries no `field`
// array on either of the two high-volume warnings, so the only way to know
// which fields a row is missing would be to regex an English sentence.

export interface MissingProductFields {
  /** Non-money gaps worth mentioning. */
  cosmetic: string[]
  /** Money and tax. These change what the product bills at. */
  pricing: string[]
  all: string[]
}

/**
 * MIRRORS WARN_ON_MISSING_TEXT / WARN_ON_MISSING_PRICE in
 * product-import.service.ts — the text list uses `!x?.trim()` and the price
 * list uses `=== undefined`, so a deliberately-entered 0 counts as supplied.
 * If the backend's lists change, change this one.
 *
 * Only fields that mis-bill or hide a product from a filter are listed. The
 * defaulted ones (generic_name, manufacturer, pack_size, unit_of_measure,
 * rack_location) and wholesale_rate are deliberately silent — see the backend
 * comment for why.
 */
export function missingProductFields(p: ParsedProduct): MissingProductFields {
  const cosmetic: string[] = []
  if (!p.saltComposition?.trim()) cosmetic.push('salt_composition')
  if (!p.hsnCode?.trim()) cosmetic.push('hsn_code')
  if (!p.categoryName?.trim()) cosmetic.push('category_name')

  const pricing: string[] = []
  if (p.mrp === undefined) pricing.push('mrp')
  if (p.purchaseRate === undefined) pricing.push('purchase_rate')
  if (p.sellingRate === undefined) pricing.push('selling_rate')
  if (p.gstRate === undefined) pricing.push('gst_rate')

  return { cosmetic, pricing, all: [...cosmetic, ...pricing] }
}

export type PricingOutcome =
  /** Retail rate supplied and at or above cost. */
  | 'ok'
  /** No selling rate, but an MRP — retail bills at full MRP. */
  | 'bills-at-mrp'
  /** No retail rate at all, or an explicit 0 — retail bills at zero. */
  | 'bills-at-zero'
  /** The rate retail will actually charge is below the purchase rate. */
  | 'below-cost'

/**
 * What the product will ACTUALLY bill at on retail, mirroring buildCreateData's
 * `sellingRate ?? mrp ?? 0`.
 *
 * Judged on the EFFECTIVE rate, not on what the file supplies: a row that
 * inherits an MRP lower than its own purchase rate is below cost even though
 * its selling_rate cell is blank. `below-cost` is reported ahead of
 * `bills-at-mrp` because losing money on every sale is the worse outcome.
 *
 * Wholesale has its own fallback (wholesaleRate ?? purchaseRate ?? 0) and is
 * not covered by this enum — see missingProductFields().
 */
export function pricingOutcome(p: ParsedProduct): PricingOutcome {
  const retail = p.sellingRate ?? p.mrp ?? 0
  if (retail <= 0) return 'bills-at-zero'
  if (p.purchaseRate !== undefined && retail < p.purchaseRate) return 'below-cost'
  if (p.sellingRate === undefined) return 'bills-at-mrp'
  return 'ok'
}

type SheetName = 'Categories' | 'Products' | 'Instructions'

// ─── Column schemas ──────────────────────────────────────────────────────────

const CATEGORY_COLUMNS = [
  'name',
  'description',
  'color',
  'is_active',
] as const

const PRODUCT_COLUMNS = [
  'product_code',
  'name',
  'generic_name',
  'salt_composition',
  'manufacturer',
  'category_id',
  'category_name',
  'sub_category',
  'pack_size',
  'unit_of_measure',
  'schedule',
  'hsn_code',
  'is_narcotic',
  'storage_condition',
  'mrp',
  'purchase_rate',
  'selling_rate',
  'wholesale_rate',
  'gst_rate',
  'min_stock',
  'max_stock',
  'reorder_qty',
  'rack_location',
  // No `barcode` column. The field still exists on Product and is still parsed
  // when a file supplies it, but nothing in this business populates it (0 of
  // 3,046 products) and carrying an always-blank column through the template,
  // the export and every generated report was pure noise.
  'total_stock',
  'is_active',
] as const

// ─── Sample rows for the downloaded template ────────────────────────────────

const SAMPLE_CATEGORY_ROW: Record<string, string | number> = {
  name: 'Antibiotics',
  description: 'Antibacterial medications',
  color: '#6366F1',
  is_active: 'TRUE',
}

const SAMPLE_PRODUCT_ROW: Record<string, string | number> = {
  product_code: 'P001',
  name: 'Paracetamol 500mg',
  generic_name: 'Paracetamol',
  salt_composition: 'Paracetamol 500mg',
  manufacturer: 'GSK',
  category_id: '', // leave blank — we'll match by category_name
  category_name: 'Analgesics',
  sub_category: 'Pain relief',
  pack_size: '10 tabs',
  unit_of_measure: 'STRIP',
  schedule: 'NONE',
  hsn_code: '30049099',
  is_narcotic: 'FALSE',
  storage_condition: 'ROOM_TEMP',
  mrp: 30,
  purchase_rate: 17,
  selling_rate: 28,
  wholesale_rate: 22,
  gst_rate: 12,
  min_stock: 50,
  max_stock: 500,
  reorder_qty: 100,
  rack_location: 'A1',
  total_stock: 0,
  is_active: 'TRUE',
}

const INSTRUCTIONS_ROWS: Array<[string, string]> = [
  ['HOSPITAL SUPPLIERS — Product Import Template', ''],
  ['', ''],
  ['How to use', 'Fill in the sheets below, then upload from the Import drawer. "Products" is the only mandatory sheet; Categories is optional.'],
  ['Required vs optional', 'The Products sheet needs only `name` per row — a row without it is skipped with an error. Every other column is optional: leave it blank and a sensible default is used (see "Defaults for missing fields" below).'],
  ['', ''],
  ['Sheet: Products  (mandatory)', 'REQUIRED per row: name.  Recommended: mrp, purchase_rate, gst_rate, hsn_code, category_name. Everything else defaults if missing and can be fixed on the product form later.'],
  ['Sheet: Categories', 'Optional. REQUIRED per row: name. Pre-define categories with description/colour, or just reference a category by `category_name` on a Products row and it is auto-created.'],
  ['', ''],
  ['Match key', 'Duplicate detection: name AND product_code together, branch-scoped, name compared case-insensitively. Two rows are the same product only when both match — the same name under two different codes imports as two products. Rows with no product_code fall back to name alone, so only the first of them imports.'],
  ['', ''],
  ['Allowed values', ''],
  ['schedule', 'NONE · H · H1 · X'],
  ['storage_condition', 'ROOM_TEMP · COOL_DRY · REFRIGERATED · FROZEN'],
  ['Booleans', 'TRUE / FALSE'],
  ['Money / rates', 'Plain numbers — no ₹ symbols or commas. gst_rate is a percent (12, not 0.12).'],
  ['', ''],
  ['total_stock', 'READ-ONLY reference column on export (auto-filled). IGNORED on import — stock enters only via GRNs / Purchases.'],
  ['category_id vs category_name', 'Either one. If both present, category_id wins. If you only have a name, we auto-create the category in your active branch.'],
  ['Defaults for missing fields', 'generic_name → "Unknown" · manufacturer → "Unknown" · pack_size → "1" · unit_of_measure → "NOS" · hsn_code → "" · rack_location → "GENERAL" · schedule → NONE · storage_condition → ROOM_TEMP'],
  ['', ''],
  ['Duplicate handling', 'UPDATE (rewrite mutable fields on a match), UPDATE_ONLY (refresh matches, skip rows with no match), SKIP (leave existing alone), CREATE (refuses a row that matches an existing product). "Match" is the Match key rule above — name AND product_code, not name alone.'],
]

export function downloadProductImportTemplate(): void {
  const wb = XLSX.utils.book_new()

  const addSheet = (
    name: string,
    sample: Record<string, string | number>,
    columns: readonly string[],
    tabColor: string,
  ) => {
    const ws = XLSX.utils.json_to_sheet([sample], { header: [...columns] })
    applySheetFormatting(ws, { columns, tabColor })
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const instructionsWs = XLSX.utils.aoa_to_sheet([
    ['Field', 'Notes'],
    ...INSTRUCTIONS_ROWS,
  ])
  applyInstructionsFormatting(instructionsWs, SHEET_COLORS.instructions)
  XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions')

  addSheet('Categories', SAMPLE_CATEGORY_ROW, CATEGORY_COLUMNS, SHEET_COLORS.categories)
  addSheet('Products',   SAMPLE_PRODUCT_ROW,  PRODUCT_COLUMNS,  SHEET_COLORS.products)

  XLSX.writeFile(wb, 'hospital-suppliers-product-import-template.xlsx')
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function readSheetByName<T extends Record<string, unknown>>(
  wb: XLSX.WorkBook,
  name: SheetName,
): T[] {
  const found = wb.SheetNames.find(
    (s) => s.trim().toLowerCase() === name.toLowerCase(),
  )
  if (!found) return []
  const ws = wb.Sheets[found]
  return XLSX.utils.sheet_to_json<T>(ws, { defval: '', raw: true })
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function toOptionalStr(v: unknown): string | undefined {
  const s = toStr(v)
  return s ? s : undefined
}

function toOptionalNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const n = Number(String(v).replace(/[, ₹$%]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

// Same blank-vs-unparseable distinction as normaliseEnum. `is_narcotic:
// "narcotic"` used to fall through to undefined → false, so a narcotic
// imported as non-narcotic with nothing said about it.
function toBool(v: unknown, ctx?: CoerceCtx): boolean | undefined {
  if (v === undefined || v === '' || v === null) return undefined
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === 'yes' || s === '1' || s === 'y') return true
  if (s === 'false' || s === 'no' || s === '0' || s === 'n') return false
  ctx?.errors.push({
    sheet: ctx.sheet,
    row: ctx.row,
    field: ctx.field,
    message: `"${String(v).trim()}" isn't a valid ${ctx.field}. Use TRUE or FALSE. Left blank to use the default.`,
  })
  return undefined
}

// Context for reporting a value we couldn't parse. Optional so call sites that
// genuinely don't care (or have no errors array in scope) stay unchanged.
interface CoerceCtx {
  errors: ParseError[]
  sheet: SheetName
  row: number
  field: string
}

/**
 * A blank cell and an unrecognised value both used to return `undefined`, so
 * the importer couldn't tell "operator left this empty, apply the default"
 * from "operator wrote something we don't understand". The second case now
 * reports. This matters most on `schedule` and `is_narcotic`: `Schedule H`
 * silently became NONE, quietly stripping a controlled drug's classification.
 *
 * Blank still returns undefined with no error — that's a deliberate "use the
 * default" and is left alone.
 */
function normaliseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  ctx?: CoerceCtx,
): T | undefined {
  const s = toStr(raw).toUpperCase()
  if (!s) return undefined
  if ((allowed as readonly string[]).includes(s)) return s as T
  ctx?.errors.push({
    sheet: ctx.sheet,
    row: ctx.row,
    field: ctx.field,
    message: `"${toStr(raw)}" isn't a valid ${ctx.field}. Use one of: ${allowed.join(' · ')}. Left blank to use the default.`,
  })
  return undefined
}

// ─── MARG ERP price-list import ──────────────────────────────────────────────
// MARG ERP (a popular Indian chemist ERP) exports a fixed-width ASCII price
// list — drug-group section headers, "+---+---+" separators, and data rows laid
// out as:  S.NO  ITEM DESCRIPTION  PACK | PURCHASE  M.R.P. | SALES TAX  COST.
// It has no named "Products" sheet, so we detect the layout and parse it
// positionally into the same ParsedProduct shape.

// A trailing token like 15'S, 8X20'S, 10*15'S is a pack size, not part of the
// name — a digit plus one of ' * X S.
function isMargPack(token: string): boolean {
  return /\d/.test(token) && /['*xs]/i.test(token)
}

// Pull every numeric value out of the price columns (everything after the
// description cell). Handles both "18.51 24.30" packed in one cell and the
// numbers split across separate cells. Order = purchase, MRP, tax, cost.
function collectMargNumbers(cells: unknown[]): number[] {
  const out: number[] = []
  for (const c of cells) {
    if (typeof c === 'number') {
      if (Number.isFinite(c)) out.push(c)
      continue
    }
    const s = String(c ?? '').trim()
    if (!s) continue
    const matches = s.match(/\d+(?:\.\d+)?/g)
    if (matches) for (const m of matches) out.push(Number(m))
  }
  return out
}

// Split the description cell into serial / name / pack. Description and pack are
// separated by a fixed-width gap (2+ spaces); the name keeps its single spaces.
function parseMargDescription(cellA: string): { name: string; pack?: string } {
  let rest = cellA.trim()
  const serial = rest.match(/^(\d+)\s+(.*)$/)
  if (serial) rest = serial[2].trim()
  const chunks = rest.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
  let name = chunks.join(' ')
  let pack: string | undefined
  if (chunks.length > 1 && isMargPack(chunks[chunks.length - 1])) {
    pack = chunks[chunks.length - 1]
    name = chunks.slice(0, -1).join(' ').trim()
  }
  return { name, pack }
}

const MARG_SKIP_RE =
  /ITEM DESCRIPTION|PRICE LIST|PURCHASE|M\.?R\.?P|PAGE\s*NO|MARG ERP|SALES\s*TAX|\bCOST\b/i

function looksLikeMargSheet(aoa: unknown[][]): boolean {
  // Scan the first ~200 rows for the signature header tokens — MARG repeats the
  // header on every page, but the title block can push the first one well down.
  // Require M.R.P so this only matches the PRICE list (the HSN master has the
  // same "ITEM DESCRIPTION" header but no price columns).
  const head = aoa.slice(0, 200).map((r) => r.map((c) => String(c ?? '')).join(' ')).join(' ').toUpperCase()
  return head.includes('ITEM DESCRIPTION') && head.includes('M.R.P')
}

function parseMargSheet(aoa: unknown[][]): { products: ParsedProduct[]; errors: ParseError[] } {
  const products: ParsedProduct[] = []
  const errors: ParseError[] = []
  let currentGeneric: string | undefined

  aoa.forEach((row, idx) => {
    const rowNum = idx + 1
    const cellA = toStr(row[0])
    const numbers = collectMargNumbers(row.slice(1))
    const joined = row.map(toStr).join(' ')

    // Blank rows and pure +---+---+ separators carry no letters/digits.
    if (!/[A-Za-z0-9]/.test(joined.replace(/[+\-|=_]/g, ''))) return
    // Titles / column headers / page markers.
    if (MARG_SKIP_RE.test(joined)) return

    const hasSerial = /^\d+\s/.test(cellA)

    // Section header: text in column A, no price numbers, not a numbered row →
    // the drug group, used as the generic name for the rows beneath it.
    if (cellA && numbers.length === 0 && !hasSerial) {
      currentGeneric = cellA.replace(/\s{2,}/g, ' ').trim()
      return
    }

    // Data row: a name plus at least purchase + MRP.
    if (cellA && numbers.length >= 2) {
      const { name, pack } = parseMargDescription(cellA)
      if (!name) return
      const [purchase, mrp] = numbers
      const tax = numbers.length >= 3 ? numbers[2] : undefined
      // The 4th column ("COST") is the rate the business actually sells at —
      // typically between purchase and MRP. Use it as the selling price when
      // present. When the row only has purchase + MRP (+ tax) we deliberately
      // leave sellingRate UNSET rather than copying MRP into it. The backend
      // applies exactly the same fallback (sellingRate ?? mrp), so the stored
      // price is identical either way — but substituting it here made the row
      // look priced, which silenced the backend's "will bill at MRP" warning
      // and hid the over-billing on every MARG price list we import.
      const cost = numbers.length >= 4 ? numbers[3] : undefined
      products.push({
        sourceRow: rowNum,
        name,
        genericName: currentGeneric,
        packSize: pack,
        purchaseRate: purchase,
        mrp,
        sellingRate: cost && cost > 0 ? cost : undefined,
        gstRate: tax,
      })
    }
  })

  return { products, errors }
}

// Try every sheet; parse the first that matches the MARG layout.
function parseMargWorkbook(wb: XLSX.WorkBook): { products: ParsedProduct[]; errors: ParseError[] } {
  for (const sheetName of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    })
    if (looksLikeMargSheet(aoa)) return parseMargSheet(aoa)
  }
  return { products: [], errors: [] }
}

// ─── MARG ERP "ITEM WISE HSN/SAC MASTER" import ──────────────────────────────
// A flat product list with columns: ITEM DESCRIPTION | OLD TAX% | GST % |
// HSN/SAC | HSN GST%. No prices — just name, GST and HSN code. GST cells read
// like "2.5+2.5  5" (CGST+SGST  total) so we take the last number; HSN cells
// like "30049099   12%" so we take the leading code.
function looksLikeMargHsnSheet(aoa: unknown[][]): boolean {
  const head = aoa.slice(0, 20).map((r) => r.map((c) => String(c ?? '')).join(' ')).join(' ').toUpperCase()
  return head.includes('ITEM DESCRIPTION') && head.includes('HSN')
}

function parseMargHsnSheet(aoa: unknown[][]): { products: ParsedProduct[]; errors: ParseError[] } {
  // Locate the header row and its columns.
  let headerIdx = -1
  let descCol = 0
  let gstCol = -1
  let hsnCol = -1
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    const lower = aoa[i].map((c) => toStr(c).toLowerCase())
    if (lower.some((x) => x.includes('item description')) && lower.some((x) => x.includes('hsn'))) {
      headerIdx = i
      descCol = lower.findIndex((x) => x.includes('item description'))
      gstCol = lower.findIndex((x) => x.includes('gst'))
      hsnCol = lower.findIndex((x) => x.includes('hsn'))
      break
    }
  }
  if (headerIdx < 0) return { products: [], errors: [] }

  const products: ParsedProduct[] = []
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r]
    const raw = toStr(row[descCol])
    if (!raw) continue

    // Name + pack — split on the fixed-width gap; do NOT strip a leading number
    // (names like "10 LITRE O2" / "3-KAT" legitimately start with digits).
    const chunks = raw.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
    let name = chunks.join(' ')
    let pack: string | undefined
    if (chunks.length > 1 && isMargPack(chunks[chunks.length - 1])) {
      pack = chunks[chunks.length - 1]
      name = chunks.slice(0, -1).join(' ').trim()
    }
    if (!name) continue

    // GST = the total (last number) in "2.5+2.5  5".
    let gstRate: number | undefined
    if (gstCol >= 0) {
      const nums = toStr(row[gstCol]).match(/\d+(?:\.\d+)?/g)
      if (nums) gstRate = Number(nums[nums.length - 1])
    }
    // HSN = the leading 4–8 digit code in "30049099   12%".
    let hsnCode: string | undefined
    if (hsnCol >= 0) {
      const m = toStr(row[hsnCol]).match(/\d{4,8}/)
      if (m) hsnCode = m[0]
    }

    // Skip repeated page headers / company block / footer — real item rows
    // always carry an HSN code and/or a GST rate; noise rows carry neither.
    if (hsnCode === undefined && gstRate === undefined) continue

    products.push({ sourceRow: r + 1, name, packSize: pack, gstRate, hsnCode })
  }
  return { products, errors: [] }
}

function parseMargHsnWorkbook(wb: XLSX.WorkBook): { products: ParsedProduct[]; errors: ParseError[] } {
  for (const sheetName of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    })
    if (looksLikeMargHsnSheet(aoa)) return parseMargHsnSheet(aoa)
  }
  return { products: [], errors: [] }
}

export async function parseProductImportWorkbook(
  file: File,
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const errors: ParseError[] = []

  // Detect export-flavoured workbooks via the Instructions metadata block.
  const instructionsName = wb.SheetNames.find(
    (s) => s.trim().toLowerCase() === 'instructions',
  )
  let exportMetadata: ExportMetadata | undefined
  if (instructionsName) {
    const ws = wb.Sheets[instructionsName]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
    })
    exportMetadata = readExportMetadata(aoa)
  }

  // ── Categories ──
  const categories: ParsedCategory[] = []
  const seenCategoryNames = new Set<string>()
  const catRows = readSheetByName<Record<string, unknown>>(wb, 'Categories')
  catRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const name = toStr(raw.name)
    if (!name) return // skip blank trailing rows
    const key = name.toLowerCase()
    if (seenCategoryNames.has(key)) {
      errors.push({
        sheet: 'Categories',
        row: rowNum,
        field: 'name',
        message: `Duplicate category name "${name}" in this file.`,
      })
      return
    }
    seenCategoryNames.add(key)
    categories.push({
      sourceRow: rowNum,
      name,
      description: toOptionalStr(raw.description),
      color: toOptionalStr(raw.color),
      isActive: toBool(raw.is_active),
    })
  })

  // ── Products ──
  const products: ParsedProduct[] = []
  const productRows = readSheetByName<Record<string, unknown>>(wb, 'Products')
  productRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const name = toStr(raw.name)
    // Skip totally-blank trailing rows silently.
    if (!name && !toStr(raw.product_code) && !toStr(raw.barcode)) return
    if (!name) {
      errors.push({
        sheet: 'Products',
        row: rowNum,
        field: 'name',
        message: 'Name is required.',
      })
      return
    }
    products.push({
      sourceRow: rowNum,
      productCode: toOptionalStr(raw.product_code),
      name,
      genericName: toOptionalStr(raw.generic_name),
      saltComposition: toOptionalStr(raw.salt_composition),
      manufacturer: toOptionalStr(raw.manufacturer),
      categoryId: toOptionalStr(raw.category_id),
      categoryName: toOptionalStr(raw.category_name),
      subCategory: toOptionalStr(raw.sub_category),
      packSize: toOptionalStr(raw.pack_size),
      unitOfMeasure: toOptionalStr(raw.unit_of_measure),
      schedule: normaliseEnum(raw.schedule, ['NONE', 'H', 'H1', 'X'] as const, {
        errors, sheet: 'Products', row: rowNum, field: 'schedule',
      }),
      hsnCode: toOptionalStr(raw.hsn_code),
      isNarcotic: toBool(raw.is_narcotic, {
        errors, sheet: 'Products', row: rowNum, field: 'is_narcotic',
      }),
      storageCondition: normaliseEnum(raw.storage_condition, [
        'ROOM_TEMP',
        'COOL_DRY',
        'REFRIGERATED',
        'FROZEN',
      ] as const, {
        errors, sheet: 'Products', row: rowNum, field: 'storage_condition',
      }),
      mrp: toOptionalNumber(raw.mrp),
      purchaseRate: toOptionalNumber(raw.purchase_rate),
      sellingRate: toOptionalNumber(raw.selling_rate),
      wholesaleRate: toOptionalNumber(raw.wholesale_rate),
      gstRate: toOptionalNumber(raw.gst_rate),
      minStock: toOptionalNumber(raw.min_stock),
      maxStock: toOptionalNumber(raw.max_stock),
      reorderQty: toOptionalNumber(raw.reorder_qty),
      rackLocation: toOptionalStr(raw.rack_location),
      barcode: toOptionalStr(raw.barcode),
      totalStock: toOptionalNumber(raw.total_stock),
      isActive: toBool(raw.is_active),
    })
  })

  // Fallback 1: MARG ERP price-list layout (fixed-width, drug-group sections).
  if (products.length === 0) {
    const marg = parseMargWorkbook(wb)
    if (marg.products.length > 0) {
      return { categories: [], products: marg.products, errors: marg.errors, exportMetadata, parsePath: 'marg' }
    }
  }

  // Fallback 2: MARG ERP "ITEM WISE HSN/SAC MASTER" layout (name + GST + HSN,
  // no prices).
  if (products.length === 0) {
    const hsn = parseMargHsnWorkbook(wb)
    if (hsn.products.length > 0) {
      return { categories: [], products: hsn.products, errors: hsn.errors, exportMetadata, parsePath: 'marg-hsn' }
    }
  }

  // Fallback 3: tolerant header mapping for any other flat product sheet.
  if (products.length === 0) {
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: true,
      })
      const rows = parseLooseSheet(aoa, PRODUCT_ALIAS_GROUPS)
      if (rows.length === 0) continue

      const looseProducts: ParsedProduct[] = []
      const looseErrors: ParseError[] = []
      for (const { sourceRow, values: v } of rows) {
        const name = v.name ?? ''
        if (!name) continue // blank/total rows at the foot of a printed list

        // Prefer a single combined GST column; otherwise add the state + centre
        // halves back together.
        let gstRate = toOptionalNumber(v.gstRate)
        if (gstRate === undefined) {
          const s = toOptionalNumber(v.sgst)
          const c = toOptionalNumber(v.cgst)
          if (s !== undefined || c !== undefined) gstRate = (s ?? 0) + (c ?? 0)
        }

        // ERP dumps leave unset rate columns as a literal 0 rather than blank.
        // Importing that verbatim would price the product at ₹0 and it would
        // bill at zero, so treat 0 as "not supplied" and let the backend apply
        // its default (and its missing-price warning).
        const rate = (x: unknown): number | undefined => {
          const n = toOptionalNumber(x)
          return n === undefined || n === 0 ? undefined : n
        }

        looseProducts.push({
          sourceRow,
          name,
          productCode: v.productCode,
          genericName: v.genericName,
          saltComposition: v.saltComposition,
          manufacturer: v.manufacturer,
          categoryName: v.categoryName,
          hsnCode: v.hsnCode,
          packSize: v.packSize,
          unitOfMeasure: v.unitOfMeasure,
          mrp: rate(v.mrp),
          purchaseRate: rate(v.purchaseRate),
          sellingRate: rate(v.sellingRate),
          wholesaleRate: rate(v.wholesaleRate),
          gstRate,
          barcode: v.barcode,
          rackLocation: v.rackLocation,
        })
      }
      if (looseProducts.length > 0) {
        return { categories: [], products: looseProducts, errors: looseErrors, exportMetadata, parsePath: 'loose' }
      }
    }
  }

  return { categories, products, errors, exportMetadata, parsePath: 'template' }
}

// ─── Export → Re-import workflow ────────────────────────────────────────────

interface ExportProductInput {
  id: string
  productCode?: string | null
  name: string
  genericName?: string | null
  saltComposition?: string | null
  manufacturer?: string | null
  categoryId?: string | null
  category?: { id: string; name: string } | null
  subCategory?: string | null
  packSize?: string | null
  unitOfMeasure?: string | null
  schedule?: string | null
  hsnCode?: string | null
  isNarcotic?: boolean | null
  storageCondition?: string | null
  mrp?: number | string | null
  purchaseRate?: number | string | null
  sellingRate?: number | string | null
  wholesaleRate?: number | string | null
  gstRate?: number | string | null
  minStock?: number | null
  maxStock?: number | null
  reorderQty?: number | null
  rackLocation?: string | null
  barcode?: string | null
  totalStock?: number | null
  isActive?: boolean | null
}

interface ExportCategoryInput {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isActive?: boolean | null
}

export interface ProductExportPayload {
  products: ExportProductInput[]
  categories: ExportCategoryInput[]
}

function num(v: unknown): number | '' {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : ''
}

export function exportProductsToWorkbook(
  payload: ProductExportPayload,
  metadata: Omit<ExportMetadata, 'entity' | 'counts'>,
): void {
  const wb = XLSX.utils.book_new()

  const productRows = payload.products.map((p) => ({
    // The product's real stored code, blank when it has none. (This used to be
    // a fabricated row-index sequence — P001, P002… — which looked like a
    // stable identifier but renumbered on every differently-filtered export.)
    // Round-tripping the real value is what lets a re-import match the exact
    // product rather than guessing from the name.
    product_code: p.productCode ?? '',
    name: p.name,
    generic_name: p.genericName ?? '',
    salt_composition: p.saltComposition ?? '',
    manufacturer: p.manufacturer ?? '',
    category_id: p.categoryId ?? '',
    category_name: p.category?.name ?? '',
    sub_category: p.subCategory ?? '',
    pack_size: p.packSize ?? '',
    unit_of_measure: p.unitOfMeasure ?? '',
    schedule: p.schedule ?? '',
    hsn_code: p.hsnCode ?? '',
    is_narcotic: p.isNarcotic ? 'TRUE' : 'FALSE',
    storage_condition: p.storageCondition ?? '',
    mrp: num(p.mrp),
    purchase_rate: num(p.purchaseRate),
    selling_rate: num(p.sellingRate),
    wholesale_rate: num(p.wholesaleRate),
    gst_rate: num(p.gstRate),
    min_stock: p.minStock ?? 0,
    max_stock: p.maxStock ?? 0,
    reorder_qty: p.reorderQty ?? 0,
    rack_location: p.rackLocation ?? '',
    // barcode deliberately not emitted — not a template column any more.
    total_stock: p.totalStock ?? 0,
    is_active: p.isActive === false ? 'FALSE' : 'TRUE',
  }))

  const categoryRows = payload.categories.map((c) => ({
    name: c.name,
    description: c.description ?? '',
    color: c.color ?? '',
    is_active: c.isActive === false ? 'FALSE' : 'TRUE',
  }))

  const meta: ExportMetadata = {
    entity: 'Product',
    branchName: metadata.branchName,
    exportedBy: metadata.exportedBy,
    exportedAt: metadata.exportedAt,
    schemaVersion: metadata.schemaVersion,
    counts: {
      products: productRows.length,
      categories: categoryRows.length,
    },
  }

  const instructionsWs = XLSX.utils.aoa_to_sheet([
    ['Field', 'Notes'],
    ...buildExportMetadataRows(meta),
    ['Sheet: Categories', 'One row per category. Edit description / colour / active flag.'],
    ['Sheet: Products', 'One row per product. Edit any field; on re-import "Update existing" rewrites them. Don\'t rename columns. total_stock is reference-only on export and ignored on import.'],
  ])
  applyInstructionsFormatting(instructionsWs, SHEET_COLORS.instructions)
  XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions')

  const addSheet = <T extends Record<string, unknown>>(
    name: string,
    data: T[],
    columns: readonly string[],
    tabColor: string,
  ) => {
    const ws =
      data.length > 0
        ? XLSX.utils.json_to_sheet(data, { header: [...columns] })
        : XLSX.utils.aoa_to_sheet([[...columns]])
    applySheetFormatting(ws, { columns, tabColor })
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  addSheet('Categories', categoryRows, CATEGORY_COLUMNS, SHEET_COLORS.categories)
  addSheet('Products',   productRows,  PRODUCT_COLUMNS,  SHEET_COLORS.products)

  const date = new Date()
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  XLSX.writeFile(wb, `products-export-${stamp}.xlsx`)
}
