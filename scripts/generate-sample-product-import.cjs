/* eslint-disable */
// One-off script: generates a realistic sample product-import workbook.
// Run from medical_frontend/: `node scripts/generate-sample-product-import.cjs`
// Output: ../sample-product-import.xlsx

const XLSX = require('xlsx-js-style')
const path = require('path')
const {
  SHEET_COLORS,
  applyInstructionsFormatting,
  applySheetFormatting,
} = require('./lib/excelTemplateFormat.cjs')

const CATEGORY_COLUMNS = ['name', 'description', 'color', 'is_active']

const PRODUCT_COLUMNS = [
  'product_code', 'name', 'generic_name', 'salt_composition', 'manufacturer',
  'category_id', 'category_name', 'sub_category', 'pack_size', 'unit_of_measure',
  'schedule', 'hsn_code', 'is_narcotic', 'storage_condition',
  'mrp', 'purchase_rate', 'selling_rate', 'wholesale_rate', 'gst_rate',
  'min_stock', 'max_stock', 'reorder_qty', 'rack_location', 'barcode',
  'total_stock', 'is_active',
]

// ─── Categories ──────────────────────────────────────────────────────────────
// Five categories covering common medical-supply buckets. Products below
// reference these by `category_name` — if any are missing in your DB, the
// service auto-creates them based on these rows.
const categories = [
  { name: 'Analgesics', description: 'Pain relief medications', color: '#EF4444', is_active: 'TRUE' },
  { name: 'Antibiotics', description: 'Antibacterial medications', color: '#6366F1', is_active: 'TRUE' },
  { name: 'Antacids', description: 'GI / acid-reflux relief', color: '#10B981', is_active: 'TRUE' },
  { name: 'Diabetes Care', description: 'Insulin & oral antidiabetics', color: '#F59E0B', is_active: 'TRUE' },
  { name: 'Cardiac', description: 'Cardiovascular medications', color: '#EC4899', is_active: 'TRUE' },
]

// ─── Products ────────────────────────────────────────────────────────────────
// 10 products covering: full-field rich rows, sparse rows (testing defaults),
// every Schedule value, every StorageCondition, narcotic + non-narcotic,
// missing category (auto-create), pre-existing-category (Analgesics), and
// barcode-on-some.
const products = [
  // P1 — fully populated, NONE schedule, ROOM_TEMP
  {
    product_code: 'P001',
    name: 'Paracetamol 500mg',
    generic_name: 'Paracetamol',
    salt_composition: 'Paracetamol 500mg',
    manufacturer: 'GSK',
    category_id: '',
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
  },
  // P2 — Schedule H antibiotic
  {
    product_code: 'P002',
    name: 'Amoxicillin 500mg',
    generic_name: 'Amoxicillin',
    salt_composition: 'Amoxicillin trihydrate 500mg',
    manufacturer: 'Cipla',
    category_id: '',
    category_name: 'Antibiotics',
    sub_category: 'Penicillin',
    pack_size: '10 caps',
    unit_of_measure: 'STRIP',
    schedule: 'H',
    hsn_code: '30041020',
    is_narcotic: 'FALSE',
    storage_condition: 'ROOM_TEMP',
    mrp: 80,
    purchase_rate: 55,
    selling_rate: 75,
    wholesale_rate: 65,
    gst_rate: 12,
    min_stock: 30,
    max_stock: 200,
    reorder_qty: 50,
    rack_location: 'B2',
    barcode: '8901030712346',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P3 — Pantoprazole, antacid
  {
    product_code: 'P003',
    name: 'Pantoprazole 40mg',
    generic_name: 'Pantoprazole',
    salt_composition: 'Pantoprazole sodium 40mg',
    manufacturer: 'Sun Pharma',
    category_id: '',
    category_name: 'Antacids',
    sub_category: 'PPI',
    pack_size: '10 tabs',
    unit_of_measure: 'STRIP',
    schedule: 'NONE',
    hsn_code: '30049011',
    is_narcotic: 'FALSE',
    storage_condition: 'ROOM_TEMP',
    mrp: 95,
    purchase_rate: 75,
    selling_rate: 90,
    wholesale_rate: 85,
    gst_rate: 12,
    min_stock: 20,
    max_stock: 150,
    reorder_qty: 40,
    rack_location: 'B1',
    barcode: '',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P4 — Cetirizine, generic anti-allergy
  {
    product_code: 'P004',
    name: 'Cetirizine 10mg',
    generic_name: 'Cetirizine',
    salt_composition: 'Cetirizine HCl 10mg',
    manufacturer: 'Dr. Reddy\'s',
    category_id: '',
    category_name: 'Analgesics', // intentionally reusing pre-existing category
    sub_category: 'Antihistamine',
    pack_size: '10 tabs',
    unit_of_measure: 'STRIP',
    schedule: 'NONE',
    hsn_code: '30049099',
    is_narcotic: 'FALSE',
    storage_condition: 'ROOM_TEMP',
    mrp: 25,
    purchase_rate: 8,
    selling_rate: 22,
    wholesale_rate: 15,
    gst_rate: 12,
    min_stock: 50,
    max_stock: 500,
    reorder_qty: 100,
    rack_location: 'A2',
    barcode: '8901030712347',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P5 — REFRIGERATED insulin
  {
    product_code: 'P005',
    name: 'Insulin Glargine Pen',
    generic_name: 'Insulin Glargine',
    salt_composition: 'Insulin glargine 100 IU/mL',
    manufacturer: 'Sanofi',
    category_id: '',
    category_name: 'Diabetes Care',
    sub_category: 'Long-acting insulin',
    pack_size: '3mL pen',
    unit_of_measure: 'PEN',
    schedule: 'H',
    hsn_code: '30043190',
    is_narcotic: 'FALSE',
    storage_condition: 'REFRIGERATED',
    mrp: 600,
    purchase_rate: 480,
    selling_rate: 570,
    wholesale_rate: 540,
    gst_rate: 5,
    min_stock: 10,
    max_stock: 50,
    reorder_qty: 15,
    rack_location: 'FRIDGE-1',
    barcode: '8901030712348',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P6 — Schedule H1, narcotic
  {
    product_code: 'P006',
    name: 'Tramadol 50mg',
    generic_name: 'Tramadol',
    salt_composition: 'Tramadol HCl 50mg',
    manufacturer: 'Mankind',
    category_id: '',
    category_name: 'Analgesics',
    sub_category: 'Opioid',
    pack_size: '10 caps',
    unit_of_measure: 'STRIP',
    schedule: 'H1',
    hsn_code: '30049063',
    is_narcotic: 'TRUE',
    storage_condition: 'ROOM_TEMP',
    mrp: 120,
    purchase_rate: 80,
    selling_rate: 110,
    wholesale_rate: 95,
    gst_rate: 12,
    min_stock: 20,
    max_stock: 100,
    reorder_qty: 30,
    rack_location: 'NARC-1',
    barcode: '8901030712349',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P7 — Schedule X
  {
    product_code: 'P007',
    name: 'Diazepam 5mg',
    generic_name: 'Diazepam',
    salt_composition: 'Diazepam 5mg',
    manufacturer: 'Abbott',
    category_id: '',
    category_name: 'Cardiac', // misc category, just for variety
    sub_category: 'Anxiolytic',
    pack_size: '10 tabs',
    unit_of_measure: 'STRIP',
    schedule: 'X',
    hsn_code: '30049063',
    is_narcotic: 'TRUE',
    storage_condition: 'ROOM_TEMP',
    mrp: 45,
    purchase_rate: 25,
    selling_rate: 40,
    wholesale_rate: 32,
    gst_rate: 12,
    min_stock: 10,
    max_stock: 50,
    reorder_qty: 15,
    rack_location: 'SCHED-X',
    barcode: '',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P8 — Atorvastatin, cardiac
  {
    product_code: 'P008',
    name: 'Atorvastatin 10mg',
    generic_name: 'Atorvastatin',
    salt_composition: 'Atorvastatin calcium 10mg',
    manufacturer: 'Pfizer',
    category_id: '',
    category_name: 'Cardiac',
    sub_category: 'Statin',
    pack_size: '10 tabs',
    unit_of_measure: 'STRIP',
    schedule: 'NONE',
    hsn_code: '30049099',
    is_narcotic: 'FALSE',
    storage_condition: 'ROOM_TEMP',
    mrp: 85,
    purchase_rate: 60,
    selling_rate: 78,
    wholesale_rate: 70,
    gst_rate: 12,
    min_stock: 30,
    max_stock: 200,
    reorder_qty: 60,
    rack_location: 'C1',
    barcode: '8901030712350',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P9 — IV Saline, COOL_DRY storage, no batches
  {
    product_code: 'P009',
    name: 'IV Saline 500ml',
    generic_name: 'Sodium Chloride 0.9%',
    salt_composition: 'NaCl 0.9% w/v 500mL',
    manufacturer: 'Baxter',
    category_id: '',
    category_name: 'Cardiac', // disposables go here for this sample
    sub_category: 'IV Solutions',
    pack_size: '500mL bottle',
    unit_of_measure: 'BOTTLE',
    schedule: 'NONE',
    hsn_code: '30049019',
    is_narcotic: 'FALSE',
    storage_condition: 'COOL_DRY',
    mrp: 90,
    purchase_rate: 70,
    selling_rate: 85,
    wholesale_rate: 78,
    gst_rate: 12,
    min_stock: 50,
    max_stock: 500,
    reorder_qty: 100,
    rack_location: 'IV-1',
    barcode: '',
    total_stock: 0,
    is_active: 'TRUE',
  },
  // P10 — SPARSE row: only name + mrp + purchase_rate. Tests the "defaults
  // are applied with warnings" path. Operator can fix the rest via the form.
  {
    product_code: 'P010',
    name: 'Multivitamin Tab',
    generic_name: '',
    salt_composition: '',
    manufacturer: '',
    category_id: '',
    category_name: '',
    sub_category: '',
    pack_size: '',
    unit_of_measure: '',
    schedule: '',
    hsn_code: '',
    is_narcotic: '',
    storage_condition: '',
    mrp: 28,
    purchase_rate: 18,
    selling_rate: '',
    wholesale_rate: '',
    gst_rate: '',
    min_stock: '',
    max_stock: '',
    reorder_qty: '',
    rack_location: '',
    barcode: '',
    total_stock: '',
    is_active: '',
  },
]

// ─── Instructions sheet ──────────────────────────────────────────────────────
const instructions = [
  ['Field', 'Notes'],
  ['HOSPITAL SUPPLIERS — Sample Product Import', ''],
  ['', ''],
  ['How to use', 'Open this workbook, edit rows as you like, then upload via Products → Import.'],
  ['', ''],
  ['Sheet: Categories', 'Pre-defines categories with description/colour. Products below also reference these by name. Missing-in-DB categories get auto-created.'],
  ['Sheet: Products', 'Main sheet. Only `name` is required — everything else has a safe default if missing (see row P010 for a sparse example).'],
  ['', ''],
  ['Allowed values', ''],
  ['schedule', 'NONE · H · H1 · X'],
  ['storage_condition', 'ROOM_TEMP · COOL_DRY · REFRIGERATED · FROZEN'],
  ['Booleans', 'TRUE / FALSE'],
  ['Dates', 'YYYY-MM-DD (products have no dates, but batches/expiry do — those come via the supplier import / GRN)'],
  ['Money / rates', 'Plain numbers — no ₹ symbols. gst_rate is a percent (12, not 0.12).'],
  ['', ''],
  ['This sample contains', `${categories.length} categories · ${products.length} products covering every Schedule (NONE/H/H1/X), every StorageCondition (ROOM_TEMP/COOL_DRY/REFRIGERATED), narcotic vs not, and one fully-sparse "defaults" row (P010 Multivitamin Tab).`],
]

// ─── Build workbook ──────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()
const addSheet = (name, data, columns, tabColor) => {
  const ws = XLSX.utils.json_to_sheet(data, { header: columns })
  applySheetFormatting(ws, { columns, tabColor })
  XLSX.utils.book_append_sheet(wb, ws, name)
}

const instructionsWs = XLSX.utils.aoa_to_sheet(instructions)
applyInstructionsFormatting(instructionsWs, SHEET_COLORS.instructions)
XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions')

addSheet('Categories', categories, CATEGORY_COLUMNS, SHEET_COLORS.categories)
addSheet('Products',   products,   PRODUCT_COLUMNS,  SHEET_COLORS.products)

const outPath = path.resolve(__dirname, '..', '..', 'sample-product-import.xlsx')
XLSX.writeFile(wb, outPath)
console.log('Wrote:', outPath)
console.log(`  ${categories.length} categories`)
console.log(`  ${products.length} products`)
