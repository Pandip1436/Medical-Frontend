/* eslint-disable */
// One-off script: generates a realistic sample supplier-import workbook.
// Run from medical_frontend/: `node scripts/generate-sample-supplier-import.cjs`
// Output: ../sample-supplier-import.xlsx (in the project root)

const XLSX = require('xlsx-js-style')
const path = require('path')
const {
  SHEET_COLORS,
  applyInstructionsFormatting,
  applySheetFormatting,
} = require('./lib/excelTemplateFormat.cjs')

const SUPPLIER_COLUMNS = [
  'supplier_code', 'name', 'phone', 'contact_person', 'email', 'gstin',
  'drug_license', 'address', 'payment_terms', 'bank_details', 'is_active',
  'opening_balance',
]
const PO_COLUMNS = [
  'supplier_code', 'po_ref', 'po_number', 'date', 'expected_delivery',
  'total_amount', 'status',
]
const PO_ITEM_COLUMNS = [
  'po_ref', 'product_name', 'required_qty', 'last_purchase_rate',
  'expected_rate', 'received_qty', 'remarks',
]
const GRN_COLUMNS = [
  'supplier_code', 'grn_ref', 'grn_number', 'date', 'supplier_invoice_no',
  'supplier_invoice_date', 'supplier_invoice_amount', 'total_amount', 'status',
  'is_replacement',
]
const GRN_ITEM_COLUMNS = [
  'grn_ref', 'product_name', 'ordered_qty', 'received_qty', 'free_qty',
  'batch_number', 'mfg_date', 'expiry_date', 'purchase_rate', 'mrp',
  'damage_qty',
]
const DN_COLUMNS = [
  'supplier_code', 'debit_note_ref', 'debit_note_no', 'grn_number', 'date',
  'reason', 'subtotal', 'cgst', 'sgst', 'igst', 'total_amount', 'status',
  'settlement_mode', 'notes',
]
const DN_ITEM_COLUMNS = [
  'debit_note_ref', 'product_name', 'batch_number', 'expiry_date',
  'returned_qty', 'purchase_rate', 'gst_percent', 'amount',
]
const ACTIVITY_COLUMNS = [
  'supplier_code', 'type', 'title', 'notes', 'occurred_at', 'due_at',
  'contact_name', 'subject', 'status',
]
const BATCH_COLUMNS = [
  'supplier_code', 'product_id', 'product_name', 'batch_number', 'mfg_date',
  'expiry_date', 'quantity', 'mrp', 'purchase_rate',
]

// ─── Suppliers ───────────────────────────────────────────────────────────────
const suppliers = [
  {
    supplier_code: 'S001',
    name: 'MedTech Distributors',
    phone: '9988776655',
    contact_person: 'R. Mehta',
    email: 'orders@medtech-dist.example',
    gstin: '29ABCDE5678F1Z9',
    drug_license: 'KA-WS-12-3456',
    address: '45, Industrial Estate, Bengaluru, KA 560058',
    payment_terms: 'NET_30',
    bank_details: 'HDFC Bank · A/c 50100123456789 · IFSC HDFC0000123',
    is_active: 'TRUE',
    opening_balance: 18000,
  },
  {
    supplier_code: 'S002',
    name: 'Pharma Wholesale Co.',
    phone: '9001234567',
    contact_person: 'A. Sharma',
    email: 'accounts@pharmawholesale.example',
    gstin: '29XYZAB1122M1Z3',
    drug_license: 'KA-W-15-7788',
    address: '102, Whitefield Main Rd, Bengaluru',
    payment_terms: 'NET_45',
    bank_details: 'ICICI Bank · A/c 0090123456 · IFSC ICIC0000456',
    is_active: 'TRUE',
    opening_balance: 47500,
  },
  {
    supplier_code: 'S003',
    name: 'Surya Surgicals',
    phone: '9876512345',
    contact_person: 'P. Iyer',
    email: 'surya.surg@example.com',
    gstin: '29MNPQR7788K1Z2',
    drug_license: 'KA-WS-18-2233',
    address: '14, Industrial Layout, Hosur Rd, Bengaluru',
    payment_terms: 'NET_30',
    bank_details: '',
    is_active: 'TRUE',
    opening_balance: 0,
  },
  {
    supplier_code: 'S004',
    name: 'Nivedita Pharma Agencies',
    phone: '8800112233',
    contact_person: 'K. Reddy',
    email: 'kreddy@niveditapharma.example',
    gstin: '29JKLMN3344G1Z5',
    drug_license: 'KA-WS-20-5566',
    address: '7, KR Puram, Bengaluru',
    payment_terms: 'NET_60',
    bank_details: 'Axis Bank · A/c 12345678901 · IFSC UTIB0000789',
    is_active: 'TRUE',
    opening_balance: 22500,
  },
]

// ─── Purchase Orders ─────────────────────────────────────────────────────────
const purchaseOrders = [
  // MedTech — fully received PO that became GRN-A
  { supplier_code: 'S001', po_ref: 'PO-A', po_number: 'HS/PO/25-26/0210', date: '2026-04-02',
    expected_delivery: '2026-04-10', total_amount: 25000, status: 'FULLY_RECEIVED' },
  // Pharma Wholesale — partially received
  { supplier_code: 'S002', po_ref: 'PO-B', po_number: 'HS/PO/25-26/0218', date: '2026-04-05',
    expected_delivery: '2026-04-14', total_amount: 45000, status: 'PARTIALLY_RECEIVED' },
  // Surya — sent but not yet received
  { supplier_code: 'S003', po_ref: 'PO-C', po_number: 'HS/PO/25-26/0225', date: '2026-04-18',
    expected_delivery: '2026-04-28', total_amount: 8000, status: 'SENT' },
  // Nivedita — closed (received and closed out)
  { supplier_code: 'S004', po_ref: 'PO-D', po_number: 'HS/PO/25-26/0233', date: '2026-04-22',
    expected_delivery: '2026-05-02', total_amount: 32000, status: 'CLOSED' },
]

const poItems = [
  // PO-A
  { po_ref: 'PO-A', product_name: 'Paracetamol 500mg', required_qty: 500, last_purchase_rate: 18, expected_rate: 17, received_qty: 500, remarks: '' },
  { po_ref: 'PO-A', product_name: 'Cetirizine 10mg', required_qty: 1000, last_purchase_rate: 9, expected_rate: 8, received_qty: 1000, remarks: '' },
  // PO-B
  { po_ref: 'PO-B', product_name: 'Amoxicillin 250mg', required_qty: 300, last_purchase_rate: 60, expected_rate: 58, received_qty: 200, remarks: 'Short delivery; 100 pending' },
  { po_ref: 'PO-B', product_name: 'Pantoprazole 40mg', required_qty: 200, last_purchase_rate: 80, expected_rate: 75, received_qty: 200, remarks: '' },
  // PO-C
  { po_ref: 'PO-C', product_name: 'Surgical Gloves L', required_qty: 1000, last_purchase_rate: 10, expected_rate: 10, received_qty: 0, remarks: '' },
  // PO-D
  { po_ref: 'PO-D', product_name: 'IV Saline 500ml', required_qty: 400, last_purchase_rate: 80, expected_rate: 80, received_qty: 400, remarks: '' },
  { po_ref: 'PO-D', product_name: 'Syringe 5ml Disposable', required_qty: 2000, last_purchase_rate: 5, expected_rate: 5, received_qty: 2000, remarks: '' },
]

// ─── GRNs ────────────────────────────────────────────────────────────────────
const grns = [
  // MedTech — full delivery against PO-A
  { supplier_code: 'S001', grn_ref: 'GRN-A', grn_number: 'HS/GRN/25-26/0188', date: '2026-04-10',
    supplier_invoice_no: 'MTD/INV/0451', supplier_invoice_date: '2026-04-09',
    supplier_invoice_amount: 25000, total_amount: 25000, status: 'VERIFIED', is_replacement: 'FALSE' },
  // Pharma Wholesale — partial against PO-B
  { supplier_code: 'S002', grn_ref: 'GRN-B', grn_number: 'HS/GRN/25-26/0192', date: '2026-04-12',
    supplier_invoice_no: 'PWC-2026-0078', supplier_invoice_date: '2026-04-11',
    supplier_invoice_amount: 27600, total_amount: 27600, status: 'VERIFIED', is_replacement: 'FALSE' },
  // Nivedita — full delivery against PO-D
  { supplier_code: 'S004', grn_ref: 'GRN-D', grn_number: 'HS/GRN/25-26/0205', date: '2026-05-01',
    supplier_invoice_no: 'NPA/2526/0341', supplier_invoice_date: '2026-04-30',
    supplier_invoice_amount: 32000, total_amount: 32000, status: 'VERIFIED', is_replacement: 'FALSE' },
]

const grnItems = [
  // GRN-A
  { grn_ref: 'GRN-A', product_name: 'Paracetamol 500mg', ordered_qty: 500, received_qty: 500, free_qty: 0, batch_number: 'PCM-MTD-001', mfg_date: '2025-12-01', expiry_date: '2027-12-31', purchase_rate: 17, mrp: 30, damage_qty: 0 },
  { grn_ref: 'GRN-A', product_name: 'Cetirizine 10mg', ordered_qty: 1000, received_qty: 1000, free_qty: 50, batch_number: 'CTZ-MTD-001', mfg_date: '2025-11-15', expiry_date: '2028-01-31', purchase_rate: 8, mrp: 25, damage_qty: 0 },
  // GRN-B (partial — only what was actually received)
  { grn_ref: 'GRN-B', product_name: 'Amoxicillin 250mg', ordered_qty: 300, received_qty: 200, free_qty: 0, batch_number: 'AMX-PWC-019', mfg_date: '2026-01-10', expiry_date: '2027-12-31', purchase_rate: 58, mrp: 65, damage_qty: 5 },
  { grn_ref: 'GRN-B', product_name: 'Pantoprazole 40mg', ordered_qty: 200, received_qty: 200, free_qty: 0, batch_number: 'PNT-PWC-088', mfg_date: '2025-10-20', expiry_date: '2027-09-30', purchase_rate: 75, mrp: 95, damage_qty: 0 },
  // GRN-D
  { grn_ref: 'GRN-D', product_name: 'IV Saline 500ml', ordered_qty: 400, received_qty: 400, free_qty: 0, batch_number: 'NSL-NPA-301', mfg_date: '2026-02-01', expiry_date: '2027-08-31', purchase_rate: 80, mrp: 90, damage_qty: 0 },
  { grn_ref: 'GRN-D', product_name: 'Syringe 5ml Disposable', ordered_qty: 2000, received_qty: 2000, free_qty: 100, batch_number: 'SYR-NPA-118', mfg_date: '2026-01-15', expiry_date: '2029-12-31', purchase_rate: 5, mrp: 6, damage_qty: 0 },
]

// ─── Debit Notes (Purchase Returns) ──────────────────────────────────────────
// Each one references a real GRN by grn_number (must match grns[] above).
const debitNotes = [
  // MedTech — damaged stock from GRN-A, settled via ADJUST (reduces outstanding)
  { supplier_code: 'S001', debit_note_ref: 'DN-A', debit_note_no: 'HS/DN/25-26/0024',
    grn_number: 'HS/GRN/25-26/0188', date: '2026-04-15', reason: 'Damaged strips on receipt',
    subtotal: 500, cgst: 30, sgst: 30, igst: 0, total_amount: 560,
    status: 'SETTLED', settlement_mode: 'ADJUST', notes: 'Adjusted against next invoice' },
  // Pharma Wholesale — wrong batch returned for REFUND
  { supplier_code: 'S002', debit_note_ref: 'DN-B', debit_note_no: 'HS/DN/25-26/0031',
    grn_number: 'HS/GRN/25-26/0192', date: '2026-04-20', reason: 'Wrong batch shipped',
    subtotal: 1160, cgst: 70, sgst: 70, igst: 0, total_amount: 1300,
    status: 'ACCEPTED', settlement_mode: 'REFUND', notes: 'Cheque refund expected next week' },
  // Nivedita — REPLACEMENT for damaged syringes
  { supplier_code: 'S004', debit_note_ref: 'DN-D', debit_note_no: 'HS/DN/25-26/0036',
    grn_number: 'HS/GRN/25-26/0205', date: '2026-05-04', reason: 'Damaged syringe packaging',
    subtotal: 250, cgst: 22.5, sgst: 22.5, igst: 0, total_amount: 295,
    status: 'SETTLED', settlement_mode: 'REPLACEMENT', notes: 'Replacement received via GRN-replacement' },
]

const debitNoteItems = [
  // DN-A: 30 strips Paracetamol returned
  { debit_note_ref: 'DN-A', product_name: 'Paracetamol 500mg', batch_number: 'PCM-MTD-001', expiry_date: '2027-12-31', returned_qty: 30, purchase_rate: 17, gst_percent: 12, amount: 500 },
  // DN-B: 20 strips Amoxicillin returned
  { debit_note_ref: 'DN-B', product_name: 'Amoxicillin 250mg', batch_number: 'AMX-PWC-019', expiry_date: '2027-12-31', returned_qty: 20, purchase_rate: 58, gst_percent: 12, amount: 1160 },
  // DN-D: 50 damaged syringes
  { debit_note_ref: 'DN-D', product_name: 'Syringe 5ml Disposable', batch_number: 'SYR-NPA-118', expiry_date: '2029-12-31', returned_qty: 50, purchase_rate: 5, gst_percent: 18, amount: 250 },
]

// ─── Activities ──────────────────────────────────────────────────────────────
const activities = [
  { supplier_code: 'S001', type: 'CALL', title: '', notes: 'Confirmed next delivery slot.', occurred_at: '2026-04-12', due_at: '', contact_name: 'R. Mehta', subject: '', status: '' },
  { supplier_code: 'S001', type: 'REMINDER', title: 'Settle April outstanding', notes: '₹18k payable', occurred_at: '', due_at: '2026-05-15', contact_name: '', subject: '', status: 'PENDING' },
  { supplier_code: 'S002', type: 'EMAIL', title: '', notes: 'Sent damaged-stock photos for DN-B', occurred_at: '2026-04-20', due_at: '', contact_name: 'Accounts', subject: 'DN-B supporting photos', status: '' },
  { supplier_code: 'S002', type: 'WHATSAPP', title: '', notes: 'Asked for ETA on pending Amoxicillin shipment.', occurred_at: '2026-05-02', due_at: '', contact_name: 'A. Sharma', subject: '', status: '' },
  { supplier_code: 'S003', type: 'NOTE', title: '', notes: 'New supplier — vetted by inventory team. First order placed.', occurred_at: '2026-04-18', due_at: '', contact_name: '', subject: '', status: '' },
  { supplier_code: 'S004', type: 'CALL', title: '', notes: 'Discussed switching to monthly invoicing.', occurred_at: '2026-05-01', due_at: '', contact_name: 'K. Reddy', subject: '', status: '' },
  { supplier_code: 'S004', type: 'REMINDER', title: 'Follow up on DN-D settlement', notes: 'Replacement received but DN-D status still open in their system', occurred_at: '', due_at: '2026-05-20', contact_name: '', subject: '', status: 'PENDING' },
]

// ─── Batches ─────────────────────────────────────────────────────────────────
// Batches require an existing Product. We use product_name (case-insensitive
// match within the active branch). If the products don't exist in your DB,
// these rows will fail with a clear "Product X not found" error — that's
// expected behaviour. Create the products first (or use the product import).
const batches = [
  { supplier_code: 'S001', product_id: '', product_name: 'Paracetamol 500mg', batch_number: 'PCM-MTD-002', mfg_date: '2026-01-15', expiry_date: '2028-01-31', quantity: 200, mrp: 30, purchase_rate: 17 },
  { supplier_code: 'S001', product_id: '', product_name: 'Cetirizine 10mg', batch_number: 'CTZ-MTD-002', mfg_date: '2026-02-01', expiry_date: '2028-02-28', quantity: 500, mrp: 25, purchase_rate: 8 },
  { supplier_code: 'S002', product_id: '', product_name: 'Pantoprazole 40mg', batch_number: 'PNT-PWC-089', mfg_date: '2026-02-15', expiry_date: '2027-12-31', quantity: 300, mrp: 95, purchase_rate: 75 },
  { supplier_code: 'S004', product_id: '', product_name: 'IV Saline 500ml', batch_number: 'NSL-NPA-302', mfg_date: '2026-03-01', expiry_date: '2027-09-30', quantity: 500, mrp: 90, purchase_rate: 80 },
]

// ─── Instructions sheet ──────────────────────────────────────────────────────
const instructions = [
  ['Field', 'Notes'],
  ['HOSPITAL SUPPLIERS — Sample Supplier Import', ''],
  ['', ''],
  ['How to use', 'Open this workbook, edit rows as you like, then upload via Suppliers → Import.'],
  ['', ''],
  ['Sheet: Suppliers', 'One row per supplier. `supplier_code` (e.g. S001) is YOUR own reference used to link this supplier to POs/GRNs/debit notes/activities/batches. Not stored.'],
  ['Sheet: Purchase Orders', 'Past POs. Link items via `po_ref`. `po_number` should be the ORIGINAL number from your previous system.'],
  ['Sheet: PO Items', 'Line items for a Purchase Orders row.'],
  ['Sheet: GRNs', 'Goods Received Notes. REQUIRED: `supplier_invoice_no` (the supplier\'s bill #). `grn_number` should match your old system\'s GRN id.'],
  ['Sheet: GRN Items', 'Line items for a GRNs row.'],
  ['Sheet: Debit Notes', 'Purchase returns / debits raised. Optional `grn_number` to link to a specific GRN (must exist or be in this same file).'],
  ['Sheet: Debit Note Items', 'Line items for a Debit Notes row.'],
  ['Sheet: Activities', 'Call / WhatsApp / email / note / reminder log.'],
  ['Sheet: Batches', 'Historical stock batches. REQUIRED: batch_number AND either product_id (preferred) or product_name (matched in your branch). Products must already exist.'],
  ['', ''],
  ['Allowed values', ''],
  ['supplier.payment_terms', 'NET_30 · NET_45 · NET_60'],
  ['po.status', 'DRAFT · SENT · ACKNOWLEDGED · PARTIALLY_RECEIVED · FULLY_RECEIVED · CLOSED'],
  ['grn.status', 'DRAFT · RECEIVED · VERIFIED'],
  ['debit_note.status', 'DRAFT · SENT · ACCEPTED · SETTLED'],
  ['debit_note.settlement_mode', 'REFUND · REPLACEMENT · ADJUST'],
  ['activity.type', 'CALL · WHATSAPP · EMAIL · NOTE · REMINDER'],
  ['activity.status', 'PENDING · DONE · CANCELLED (REMINDER only)'],
  ['Booleans', 'TRUE / FALSE'],
  ['Dates', 'YYYY-MM-DD recommended. dd/mm/yyyy and Excel date cells also accepted.'],
  ['Money', 'Plain numbers — no ₹ symbols or commas.'],
  ['', ''],
  ['This sample contains', `${suppliers.length} suppliers · ${purchaseOrders.length} POs · ${poItems.length} PO items · ${grns.length} GRNs · ${grnItems.length} GRN items · ${debitNotes.length} debit notes · ${debitNoteItems.length} DN items · ${activities.length} activities · ${batches.length} batches`],
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

addSheet('Suppliers',        suppliers,      SUPPLIER_COLUMNS, SHEET_COLORS.suppliers)
addSheet('Purchase Orders',  purchaseOrders, PO_COLUMNS,       SHEET_COLORS.purchaseOrders)
addSheet('PO Items',         poItems,        PO_ITEM_COLUMNS,  SHEET_COLORS.poItems)
addSheet('GRNs',             grns,           GRN_COLUMNS,      SHEET_COLORS.grns)
addSheet('GRN Items',        grnItems,       GRN_ITEM_COLUMNS, SHEET_COLORS.grnItems)
addSheet('Debit Notes',      debitNotes,     DN_COLUMNS,       SHEET_COLORS.debitNotes)
addSheet('Debit Note Items', debitNoteItems, DN_ITEM_COLUMNS,  SHEET_COLORS.debitNoteItems)
addSheet('Activities',       activities,     ACTIVITY_COLUMNS, SHEET_COLORS.activities)
addSheet('Batches',          batches,        BATCH_COLUMNS,    SHEET_COLORS.batches)

const outPath = path.resolve(__dirname, '..', '..', 'sample-supplier-import.xlsx')
XLSX.writeFile(wb, outPath)
console.log('Wrote:', outPath)
console.log(`  ${suppliers.length} suppliers`)
console.log(`  ${purchaseOrders.length} POs, ${poItems.length} items`)
console.log(`  ${grns.length} GRNs, ${grnItems.length} items`)
console.log(`  ${debitNotes.length} debit notes, ${debitNoteItems.length} items`)
console.log(`  ${activities.length} activities`)
console.log(`  ${batches.length} batches`)
