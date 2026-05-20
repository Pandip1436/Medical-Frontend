// xlsx-js-style for cell-level styles (see customerImportTemplate.ts for rationale).
import * as XLSX from 'xlsx-js-style'
import {
  type ExportMetadata,
  SHEET_COLORS,
  applyInstructionsFormatting,
  applySheetFormatting,
  buildExportMetadataRows,
  readExportMetadata,
} from './excelTemplateFormat'

export type { ExportMetadata }

// ─────────────────────────────────────────────────────────────────────────────
// Product import workbook — template + parser. Mirror of customer/supplier
// templates but flatter: products have no history sub-entities (batches come
// from GRN, alternatives are managed in the product form). So we have just
// three sheets: Instructions, Categories (optional pre-create), Products.
// ─────────────────────────────────────────────────────────────────────────────

export type DuplicateHandling = 'UPDATE' | 'SKIP' | 'CREATE'
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

export interface ParseResult {
  categories: ParsedCategory[]
  products: ParsedProduct[]
  errors: ParseError[]
  exportMetadata?: ExportMetadata
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
  'barcode',
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
  barcode: '8901030712345',
  total_stock: 0,
  is_active: 'TRUE',
}

const INSTRUCTIONS_ROWS: Array<[string, string]> = [
  ['HOSPITAL SUPPLIERS — Product Import Template', ''],
  ['', ''],
  ['How to use', 'Fill the sheets below, then upload from the Import drawer.'],
  ['', ''],
  ['Sheet: Categories', 'OPTIONAL. Pre-define categories with description/colour. Products referencing a category by `category_name` will auto-link; missing categories get auto-created with empty description.'],
  ['Sheet: Products', 'One row per product. Required fields: name. Everything else has a safe default if missing — the operator can fix via the product form later.'],
  ['', ''],
  ['Match key', 'Duplicate detection: name (case-insensitive, branch-scoped) — and barcode as a secondary key. Two products with the same name in this file → only the first imports.'],
  ['', ''],
  ['Allowed values', ''],
  ['schedule', 'NONE · H · H1 · X'],
  ['storage_condition', 'ROOM_TEMP · COOL_DRY · REFRIGERATED · FROZEN'],
  ['Booleans', 'TRUE / FALSE'],
  ['Money / rates', 'Plain numbers — no ₹ symbols or commas. gst_rate is a percent (12, not 0.12).'],
  ['', ''],
  ['total_stock', 'OPTIONAL opening stock. NOTE: the canonical source of stock is Batches (created via GRN). If you load real GRNs after this import, the totals will drift apart. Recommended: leave blank and load opening stock via the supplier import (GRN sheet).'],
  ['category_id vs category_name', 'Either one. If both present, category_id wins. If you only have a name, we auto-create the category in your active branch.'],
  ['Defaults for missing fields', 'generic_name → "Unknown" · manufacturer → "Unknown" · pack_size → "1" · unit_of_measure → "NOS" · hsn_code → "" · rack_location → "GENERAL" · schedule → NONE · storage_condition → ROOM_TEMP'],
  ['', ''],
  ['Duplicate handling', 'UPDATE (rewrite mutable fields on a name match), SKIP (leave existing alone), CREATE (refuses if name already exists in this branch).'],
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

function toBool(v: unknown): boolean | undefined {
  if (v === undefined || v === '' || v === null) return undefined
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === 'yes' || s === '1' || s === 'y') return true
  if (s === 'false' || s === 'no' || s === '0' || s === 'n') return false
  return undefined
}

function normaliseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | undefined {
  const s = toStr(raw).toUpperCase()
  if (!s) return undefined
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined
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
      schedule: normaliseEnum(raw.schedule, ['NONE', 'H', 'H1', 'X'] as const),
      hsnCode: toOptionalStr(raw.hsn_code),
      isNarcotic: toBool(raw.is_narcotic),
      storageCondition: normaliseEnum(raw.storage_condition, [
        'ROOM_TEMP',
        'COOL_DRY',
        'REFRIGERATED',
        'FROZEN',
      ] as const),
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

  return { categories, products, errors, exportMetadata }
}

// ─── Export → Re-import workflow ────────────────────────────────────────────

interface ExportProductInput {
  id: string
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

  const productRows = payload.products.map((p, i) => ({
    product_code: `P${String(i + 1).padStart(3, '0')}`,
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
    barcode: p.barcode ?? '',
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
    ['Sheet: Products', 'One row per product. Edit any field; on re-import "Update existing" rewrites them. Don\'t rename columns. total_stock is denormalised — don\'t expect editing it to change live stock.'],
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
