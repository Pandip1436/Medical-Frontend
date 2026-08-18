// xlsx-js-style for cell-level styles (see customerImportTemplate.ts for rationale).
import * as XLSX from 'xlsx-js-style'
import {
  type ExportMetadata,
  SHEET_COLORS,
  applyInstructionsFormatting,
  applySheetFormatting,
  buildExportMetadataRows,
  readExportMetadata,
  looksLikeMargAddressBook,
  parseMargAddressBook,
  looksLikeMargPartyTable,
  parseMargPartyTable,
  parseLooseSheet,
  type LooseAliasGroup,
} from './excelTemplateFormat'
import {
  type PartyPhone,
  collectPartyPhones,
  normalizePartyPhones,
  parsePhonesCell,
  phonesFromLegacy,
  primaryOf,
  serializePhonesCell,
} from './phones'

/**
 * Fold a row's separate phone columns into one list. Ordered mobile-first so
 * normalizePartyPhones promotes a real mobile to primary when the row has one;
 * a row with only an office landline still gets a valid primary from it.
 *
 * `phonesCell` is our own template's round-trip column and wins outright when
 * present — it already carries the operator's chosen order and labels.
 */
function buildImportedPhones(v: {
  phonesCell?: string
  phone?: string
  phoneOffice?: string
  alternatePhone?: string
  phoneHome?: string
}): PartyPhone[] {
  const roundTripped = parsePhonesCell(v.phonesCell)
  if (roundTripped.length) return roundTripped
  return collectPartyPhones([
    { value: v.phone },
    { value: v.alternatePhone },
    { value: v.phoneOffice, label: 'OFFICE' },
    { value: v.phoneHome, label: 'HOME' },
  ])
}

export type { ExportMetadata }

// Synonyms for tolerant header-mapped import (other-ERP flat exports).
const SUPPLIER_ALIAS_GROUPS: LooseAliasGroup[] = [
  { field: 'name', aliases: ['name', 'supplier name', 'supplier', 'party name', 'party', 'company', 'company name', 'firm', 'firm name', 'vendor', 'vendor name', 'account name', 'ledger name', 'ledger', 'account', 'dealer', 'distributor'] },
  // A supplier's numbers arrive spread across several columns in other-ERP
  // exports (mobile / phone1 / phone2 / resi), and plenty of rows carry only a
  // landline. Each column maps to its own field so the label survives the
  // import; buildImportedPhones then folds them into one list. `fax` is
  // deliberately unmapped — it can't be called or messaged.
  //
  // Order matters twice: matchAliasField takes the first EXACT hit across
  // groups, and the mobile group is first so a plain "phone" column is read as
  // the mobile rather than being claimed by the landline group.
  // 'contact' maps to the PERSON, not the number — see the customer template for
  // why (it used to claim the phone slot and starve the real `mobile` column).
  { field: 'phone', aliases: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone no', 'phone number', 'contact no', 'contact number', 'cell', 'mob', 'mob no', 'whatsapp'] },
  { field: 'phoneOffice', aliases: ['phone1', 'phone 1', 'telephone', 'tel', 'landline', 'land line', 'office', 'office no', 'office phone', 'shop', 'shop no'] },
  { field: 'alternatePhone', aliases: ['phone2', 'alternate phone', 'alt phone', 'alternate mobile', 'alternate no', 'phone 2', 'mobile 2', 'second phone'] },
  { field: 'phoneHome', aliases: ['resi', 'resi no', 'residence', 'residence no', 'residence phone', 'home', 'home no', 'home phone'] },
  { field: 'contactPerson', aliases: ['contact person', 'contact name', 'contact', 'person', 'owner', 'proprietor', 'representative'] },
  { field: 'email', aliases: ['email', 'e mail', 'email id', 'mail', 'email address'] },
  { field: 'gstin', aliases: ['gstin', 'gst', 'gst no', 'gst number', 'gstin no', 'gst in', 'gstno', 'tin'] },
  { field: 'drugLicense', aliases: ['drug license', 'drug licence', 'dl no', 'dl number', 'dl', 'license no', 'licence no', 'drug lic'] },
  { field: 'address', aliases: ['address', 'addr', 'location', 'full address', 'street', 'area', 'city', 'place', 'town'] },
  { field: 'openingBalance', aliases: ['opening balance', 'balance', 'outstanding', 'opening', 'closing balance', 'os', 'due', 'amount', 'balance amount'] },
]

// ─────────────────────────────────────────────────────────────────────────────
// Supplier import workbook — template + parser. Mirror of the customer side.
//
// One workbook, nine sheets. Supplier rows link to history sheets by a
// user-typed `supplier_code` (e.g. S001). Code is local to the workbook and
// never persisted — once the import lands, the backend keys everything on the
// canonical supplier id.
//
// Why a structured template (vs column-mapping): supplier history has cross-
// sheet FKs (PO ↔ items, GRN ↔ items, DN ↔ GRN). A column-mapping UI can't
// express those. Fixed schema → precise per-row errors.
// ─────────────────────────────────────────────────────────────────────────────

export type DuplicateHandling = 'UPDATE' | 'SKIP' | 'CREATE'
export type PaymentTerms = 'NET_30' | 'NET_45' | 'NET_60'
export type POStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_RECEIVED'
  | 'FULLY_RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'
export type GRNStatus = 'DRAFT' | 'RECEIVED' | 'VERIFIED'
export type PurchaseReturnStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'SETTLED'
export type PurchaseReturnSettlement = 'REFUND' | 'REPLACEMENT' | 'ADJUST'
export type SupplierActivityType =
  | 'CALL'
  | 'WHATSAPP'
  | 'EMAIL'
  | 'NOTE'
  | 'REMINDER'

export interface ParsedSupplier {
  sourceRow: number
  supplierCode?: string
  name: string
  /** The primary number — mirrored from `phones`, kept for existing consumers. */
  phone: string
  /** Every number found for this row, primary first. */
  phones?: PartyPhone[]
  /** @deprecated Superseded by `phones`; still read from legacy sheets. */
  alternatePhone?: string
  contactPerson?: string
  email?: string
  gstin?: string
  drugLicense?: string
  address?: string
  paymentTerms?: PaymentTerms
  bankDetails?: string
  bankAccountName?: string
  bankName?: string
  bankAccountNumber?: string
  bankIfsc?: string
  bankUpiId?: string
  notes?: string
  isActive?: boolean
  openingBalance?: number
  purchaseOrders: ParsedPurchaseOrder[]
  grns: ParsedGrn[]
  debitNotes: ParsedDebitNote[]
  payments: ParsedPayment[]
  activities: ParsedActivity[]
  batches: ParsedBatch[]
  prescriptions: ParsedSupplierDocument[] // uploaded documents (re-attached to the twin)
}

// A supplier document row from the Documents sheet. Documents physically live on
// the supplier's linked CUSTOMER twin as Prescription rows; on import we re-attach
// each to that twin. The file itself already lives in R2 — imageUrl is its link.
export interface ParsedSupplierDocument {
  sourceRow: number
  doctorName: string // document title
  notes?: string
  validUntil?: string
  imageUrl?: string
}

export interface ParsedBatch {
  sourceRow: number
  productId?: string
  productName?: string
  batchNumber: string
  mfgDate?: string
  expiryDate?: string
  quantity?: number
  mrp?: number
  purchaseRate?: number
}

export interface ParsedPurchaseOrder {
  sourceRow: number
  poNumber?: string
  date?: string
  expectedDelivery?: string
  totalAmount?: number
  status?: POStatus
  items: ParsedPurchaseOrderItem[]
}

export interface ParsedPurchaseOrderItem {
  productName?: string
  requiredQty?: number
  lastPurchaseRate?: number
  expectedRate?: number
  receivedQty?: number
  remarks?: string
}

export interface ParsedGrn {
  sourceRow: number
  grnNumber?: string
  date?: string
  supplierInvoiceNo: string
  supplierInvoiceDate?: string
  supplierInvoiceAmount?: number
  amountPaid?: number
  totalAmount?: number
  status?: GRNStatus
  isReplacement?: boolean
  items: ParsedGrnItem[]
}

export interface ParsedGrnItem {
  productName?: string
  orderedQty?: number
  receivedQty?: number
  freeQty?: number
  batchNumber?: string
  mfgDate?: string
  expiryDate?: string
  purchaseRate?: number
  mrp?: number
  damageQty?: number
}

export interface ParsedDebitNote {
  sourceRow: number
  debitNoteNo?: string
  grnNumber?: string
  date?: string
  reason?: string
  notes?: string
  subtotal?: number
  cgst?: number
  sgst?: number
  igst?: number
  totalAmount?: number
  status?: PurchaseReturnStatus
  settlementMode?: PurchaseReturnSettlement
  items: ParsedDebitNoteItem[]
}

export interface ParsedDebitNoteItem {
  productName?: string
  batchNumber?: string
  expiryDate?: string
  returnedQty?: number
  purchaseRate?: number
  gstPercent?: number
  amount?: number
}

export interface ParsedPayment {
  sourceRow: number
  paymentNumber?: string
  grnNumber?: string
  date?: string
  amount: number
  paymentMode?: string
  referenceNumber?: string
  notes?: string
}

export interface ParsedActivity {
  sourceRow: number
  type: SupplierActivityType
  title?: string
  notes?: string
  occurredAt?: string
  dueAt?: string
  contactName?: string
  subject?: string
  status?: 'PENDING' | 'DONE' | 'CANCELLED'
}

export interface ParseError {
  sheet: SheetName
  row: number
  field?: string
  message: string
}

export interface ParseResult {
  suppliers: ParsedSupplier[]
  orphanPOs: number
  orphanGRNs: number
  orphanDebitNotes: number
  orphanPayments: number
  orphanActivities: number
  orphanBatches: number
  orphanDocuments: number
  errors: ParseError[]
  exportMetadata?: ExportMetadata
}

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
  | 'Documents'
  | 'Instructions'

// ─── Column schemas (single source of truth) ─────────────────────────────────

const SUPPLIER_COLUMNS = [
  'supplier_code',
  'name',
  'phone',
  // Whole phone list, round-tripped as "MOBILE:9988776655|OFFICE:080-25551234"
  // (primary first) — one column keeps every number AND its label. `phone` and
  // `alternate_phone` stay readable for sheets written before this.
  'phones',
  'alternate_phone',
  'contact_person',
  'email',
  'gstin',
  'drug_license',
  'address',
  'payment_terms',
  // Legacy free-text bank field (kept for back-compat) + the structured fields.
  'bank_details',
  'bank_account_name',
  'bank_name',
  'bank_account_number',
  'bank_ifsc',
  'bank_upi_id',
  'notes',
  'is_active',
  'opening_balance',
] as const

const PO_COLUMNS = [
  'supplier_code',
  'po_ref',
  'po_number',
  'date',
  'expected_delivery',
  'total_amount',
  'status',
] as const

const PO_ITEM_COLUMNS = [
  'po_ref',
  'product_name',
  'required_qty',
  'last_purchase_rate',
  'expected_rate',
  'received_qty',
  'remarks',
] as const

const GRN_COLUMNS = [
  'supplier_code',
  'grn_ref',
  'grn_number',
  'date',
  'supplier_invoice_no',
  'supplier_invoice_date',
  'supplier_invoice_amount',
  'amount_paid',
  'total_amount',
  'status',
  'is_replacement',
] as const

const GRN_ITEM_COLUMNS = [
  'grn_ref',
  'product_name',
  'ordered_qty',
  'received_qty',
  'free_qty',
  'batch_number',
  'mfg_date',
  'expiry_date',
  'purchase_rate',
  'mrp',
  'damage_qty',
] as const

const DN_COLUMNS = [
  'supplier_code',
  'debit_note_ref',
  'debit_note_no',
  'grn_number',
  'date',
  'reason',
  'subtotal',
  'cgst',
  'sgst',
  'igst',
  'total_amount',
  'status',
  'settlement_mode',
  'notes',
] as const

const DN_ITEM_COLUMNS = [
  'debit_note_ref',
  'product_name',
  'batch_number',
  'expiry_date',
  'returned_qty',
  'purchase_rate',
  'gst_percent',
  'amount',
] as const

const PAYMENT_COLUMNS = [
  'supplier_code',
  'grn_number',
  'date',
  'amount',
  'payment_mode',
  'reference_number',
  'payment_number',
  'notes',
] as const

const ACTIVITY_COLUMNS = [
  'supplier_code',
  'type',
  'title',
  'notes',
  'occurred_at',
  'due_at',
  'contact_name',
  'subject',
  'status',
] as const

const BATCH_COLUMNS = [
  'supplier_code',
  'product_id',
  'product_name',
  'batch_number',
  'mfg_date',
  'expiry_date',
  'quantity',
  'mrp',
  'purchase_rate',
] as const

// ─── Template generation ─────────────────────────────────────────────────────

const SAMPLE_SUPPLIER_ROW: Record<string, string | number> = {
  supplier_code: 'S001',
  name: 'MedTech Distributors',
  phone: '9988776655',
  phones: 'MOBILE:9988776655|OFFICE:080-25551234',
  alternate_phone: '9988776600',
  contact_person: 'R. Mehta',
  email: 'orders@medtech-dist.example',
  gstin: '29ABCDE5678F1Z9',
  drug_license: 'KA-WS-12-3456',
  address: '45, Industrial Estate, Bengaluru, KA 560058',
  payment_terms: 'NET_30',
  bank_details: 'HDFC Bank · A/c 50100123456789 · IFSC HDFC0000123',
  bank_account_name: 'MedTech Distributors',
  bank_name: 'HDFC Bank',
  bank_account_number: '50100123456789',
  bank_ifsc: 'HDFC0000123',
  bank_upi_id: 'medtech@okhdfcbank',
  notes: 'Preferred for surgical consumables',
  is_active: 'TRUE',
  opening_balance: 18000,
}

const SAMPLE_PO_ROW: Record<string, string | number> = {
  supplier_code: 'S001',
  po_ref: 'PO-A',
  po_number: 'HS/PO/25-26/0210',
  date: '2026-04-02T09:00:00',
  expected_delivery: '2026-04-10',
  total_amount: 25000,
  status: 'FULLY_RECEIVED',
}

const SAMPLE_PO_ITEM_ROW: Record<string, string | number> = {
  po_ref: 'PO-A',
  product_name: 'Paracetamol 500mg',
  required_qty: 500,
  last_purchase_rate: 18,
  expected_rate: 17,
  received_qty: 500,
  remarks: '',
}

const SAMPLE_GRN_ROW: Record<string, string | number> = {
  supplier_code: 'S001',
  grn_ref: 'GRN-A',
  grn_number: 'HS/GRN/25-26/0188',
  // Include the time (HH:mm:ss) so transactions keep their exact order in the
  // ledger. Date-only ("2026-04-10") also works — same-day rows just group.
  date: '2026-04-10T09:15:00',
  supplier_invoice_no: 'MTD/INV/0451',
  supplier_invoice_date: '2026-04-09',
  supplier_invoice_amount: 25000,
  amount_paid: 10000,
  total_amount: 25000,
  status: 'VERIFIED',
  is_replacement: 'FALSE',
}

const SAMPLE_GRN_ITEM_ROW: Record<string, string | number> = {
  grn_ref: 'GRN-A',
  product_name: 'Paracetamol 500mg',
  ordered_qty: 500,
  received_qty: 500,
  free_qty: 0,
  batch_number: 'PCM-MTD-001',
  mfg_date: '2025-12-01',
  expiry_date: '2027-12-31',
  purchase_rate: 17,
  mrp: 30,
  damage_qty: 0,
}

const SAMPLE_DN_ROW: Record<string, string | number> = {
  supplier_code: 'S001',
  debit_note_ref: 'DN-A',
  debit_note_no: 'HS/DN/25-26/0024',
  grn_number: 'HS/GRN/25-26/0188',
  date: '2026-04-15T14:00:00',
  reason: 'Damaged stock on receipt',
  subtotal: 500,
  cgst: 30,
  sgst: 30,
  igst: 0,
  total_amount: 560,
  status: 'SETTLED',
  settlement_mode: 'ADJUST',
  notes: 'Adjusted against next invoice',
}

const SAMPLE_DN_ITEM_ROW: Record<string, string | number> = {
  debit_note_ref: 'DN-A',
  product_name: 'Paracetamol 500mg',
  batch_number: 'PCM-MTD-001',
  expiry_date: '2027-12-31',
  returned_qty: 30,
  purchase_rate: 17,
  gst_percent: 12,
  amount: 500,
}

const SAMPLE_PAYMENT_ROW: Record<string, string | number> = {
  supplier_code: 'S001',
  grn_number: 'HS/GRN/25-26/0188',
  date: '2026-04-20T16:30:00',
  amount: 12000,
  payment_mode: 'NEFT_UPI',
  reference_number: 'UTR998877',
  // Original payment reference from your legacy system. Leave blank to
  // auto-generate. Filling it in lets you reconcile against old records.
  payment_number: 'SPAY/25-26/0041',
  notes: 'Part payment against GRN 0188',
}

const SAMPLE_ACTIVITY_ROW: Record<string, string | number> = {
  supplier_code: 'S001',
  type: 'CALL',
  title: '',
  notes: 'Called to confirm next dispatch',
  occurred_at: '2026-04-12',
  due_at: '',
  contact_name: 'R. Mehta',
  subject: '',
  status: '',
}

const SAMPLE_BATCH_ROW: Record<string, string | number> = {
  supplier_code: 'S001',
  // Either provide product_id (the live Product row id) OR product_name
  // (case-insensitive match within the active branch). product_id wins.
  product_id: '',
  product_name: 'Paracetamol 500mg',
  batch_number: 'PCM-MTD-001',
  mfg_date: '2025-12-01',
  expiry_date: '2027-12-31',
  quantity: 500,
  mrp: 30,
  purchase_rate: 17,
}

const INSTRUCTIONS_ROWS: Array<[string, string]> = [
  ['HOSPITAL SUPPLIERS — Supplier Import Template', ''],
  ['', ''],
  ['How to use', 'Fill in the sheets below, then upload this file from the Import drawer. "Suppliers" is the only mandatory sheet — the rest are optional history. Blank sheets are ignored.'],
  ['Required vs optional', 'Each sheet lists its REQUIRED fields — a row missing any of them is skipped with an error. Every other column is optional: leave it blank and a sensible default is used.'],
  ['Linking rows', '`supplier_code` (e.g. S001) is YOUR own reference that ties a supplier to its POs / GRNs / debit notes / payments. `po_ref`, `grn_ref`, `debit_note_ref` link a parent row to its line-item sheet. These *_ref / *_code values only connect rows inside this file — they are not stored.'],
  ['', ''],
  ['Sheet: Suppliers  (mandatory)', 'REQUIRED: name, phone.  Recommended: supplier_code (needed to attach any POs/GRNs/payments below), gstin, payment_terms, opening_balance.'],
  ['   ↳ read-only columns', 'total_purchases, paid_amount, outstanding are REFERENCE ONLY — auto-filled on export and IGNORED on import. Leave them blank; the real balance comes from opening_balance + the GRNs / Payments sheets.'],
  ['   ↳ bank details (optional)', 'bank_account_name, bank_name, bank_account_number (9–18 digits), bank_ifsc (e.g. HDFC0001234), bank_upi_id (name@bank). The legacy free-text bank_details column is still accepted. alternate_phone and notes are also optional.'],
  ['', ''],
  ['Sheet: Purchase Orders', 'Optional. REQUIRED: supplier_code.  Recommended: po_number (original PO no.), date, total_amount. `po_ref` links its line items; leave po_number blank to auto-generate.'],
  ['Sheet: PO Items', 'Optional. REQUIRED per row: po_ref, product_name.'],
  ['', ''],
  ['Sheet: GRNs', 'REQUIRED: supplier_code, supplier_invoice_no (the supplier\'s bill number).  Recommended: supplier_invoice_amount, amount_paid, date. `grn_ref` links its line items. A GRN with items matching a product creates a real stock batch — do NOT also add the same stock via the Batches sheet or it is counted twice.'],
  ['Sheet: GRN Items', 'Optional. REQUIRED per row: grn_ref, product_name, received_qty.'],
  ['', ''],
  ['Sheet: Debit Notes', 'Optional. REQUIRED: supplier_code, total_amount.  Optional grn_number links the return to a specific GRN (that GRN must exist already or be in this same file). `debit_note_ref` links its line items.'],
  ['Sheet: Debit Note Items', 'Optional. REQUIRED per row: debit_note_ref.'],
  ['', ''],
  ['Sheet: Payments', 'REQUIRED: supplier_code, amount (greater than 0).  Recommended: date, payment_mode. Optional grn_number links it to a specific GRN — leave blank for a lump-sum payment.'],
  ['', ''],
  ['Sheet: Activities', 'Optional. REQUIRED per row: supplier_code, type.'],
  ['', ''],
  ['Sheet: Batches', 'Optional — use ONLY for stock NOT already reported via a GRN row above (GRNs create their own batch). REQUIRED: batch_number, plus product_id (preferred — the live Product id) OR product_name (matched in your branch). The product must already exist (add it first, or use the products import).'],
  ['', ''],
  ['Allowed values', ''],
  ['supplier.payment_terms', 'NET_30 · NET_45 · NET_60'],
  ['po.status', 'DRAFT · SENT · ACKNOWLEDGED · PARTIALLY_RECEIVED · FULLY_RECEIVED · CLOSED · CANCELLED'],
  ['grn.status', 'DRAFT · RECEIVED · VERIFIED'],
  ['debit_note.status', 'DRAFT · SENT · ACCEPTED · SETTLED'],
  ['debit_note.settlement_mode', 'REFUND · REPLACEMENT · ADJUST'],
  ['activity.type', 'CALL · WHATSAPP · EMAIL · NOTE · REMINDER'],
  ['activity.status', 'PENDING · DONE · CANCELLED (REMINDER only)'],
  ['Booleans', 'TRUE / FALSE'],
  ['Dates', 'YYYY-MM-DD recommended. dd/mm/yyyy and Excel date cells also accepted.'],
  ['Money', 'Plain numbers — no ₹ symbols or commas.'],
  ['', ''],
  ['Duplicate handling', 'Phone number is the dedupe key. UPDATE (rewrite mutable fields), SKIP (leave existing alone), CREATE (refuses if phone exists).'],
]

export function downloadSupplierImportTemplate(): void {
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

  // Blank template mirrors the EXPORT layout. total_purchases / paid_amount /
  // outstanding are read-only reference columns — computed on export, ignored on
  // import (see Instructions). Leave them blank when filling by hand.
  addSheet('Suppliers',        SAMPLE_SUPPLIER_ROW, [...SUPPLIER_COLUMNS, 'total_purchases', 'paid_amount', 'outstanding'], SHEET_COLORS.suppliers)
  addSheet('Purchase Orders',  SAMPLE_PO_ROW,       PO_COLUMNS,       SHEET_COLORS.purchaseOrders)
  addSheet('PO Items',         SAMPLE_PO_ITEM_ROW,  PO_ITEM_COLUMNS,  SHEET_COLORS.poItems)
  addSheet('GRNs',             SAMPLE_GRN_ROW,      GRN_COLUMNS,      SHEET_COLORS.grns)
  addSheet('GRN Items',        SAMPLE_GRN_ITEM_ROW, GRN_ITEM_COLUMNS, SHEET_COLORS.grnItems)
  addSheet('Debit Notes',      SAMPLE_DN_ROW,       DN_COLUMNS,       SHEET_COLORS.debitNotes)
  addSheet('Debit Note Items', SAMPLE_DN_ITEM_ROW,  DN_ITEM_COLUMNS,  SHEET_COLORS.debitNoteItems)
  addSheet('Payments',         SAMPLE_PAYMENT_ROW,  PAYMENT_COLUMNS,  SHEET_COLORS.payments)
  addSheet('Activities',       SAMPLE_ACTIVITY_ROW, ACTIVITY_COLUMNS, SHEET_COLORS.activities)
  addSheet('Batches',          SAMPLE_BATCH_ROW,    BATCH_COLUMNS,    SHEET_COLORS.batches)

  XLSX.writeFile(wb, 'hospital-suppliers-supplier-import-template.xlsx')
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
  const n = Number(String(v).replace(/[, ₹$]/g, ''))
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

function toISODate(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString()
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date((v - 25569) * 86400 * 1000)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const s = String(v).trim()
  if (!s) return undefined
  const direct = new Date(s)
  if (!isNaN(direct.getTime())) return direct.toISOString()
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    let year = Number(m[3])
    if (year < 100) year += 2000
    const d = new Date(year, month - 1, day)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return s
}

interface CoerceCtx {
  errors: ParseError[]
  sheet: SheetName
  row: number
  field: string
}

/**
 * Blank means "apply the default" and stays silent. An unrecognised value used
 * to look identical to blank — `NET 30` (space instead of underscore) fell
 * through to the default terms, quietly shifting every bill's due date.
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
    message: `"${toStr(raw)}" isn't a valid ${ctx.field}. Use one of: ${allowed.join(' · ')}. Leave blank to use the default.`,
  })
  return undefined
}

export async function parseSupplierImportWorkbook(
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

  // ── Suppliers ──
  const supplierRows = readSheetByName<Record<string, unknown>>(wb, 'Suppliers')
  const suppliers: ParsedSupplier[] = []
  const byCode = new Map<string, ParsedSupplier>()

  supplierRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const name = toStr(raw.name)
    // Every phone column on the row folds into one list; `phone` is then the
    // primary of that list rather than a column read on its own. A row whose
    // only number sits in phone1 / resi is now importable.
    const phones = buildImportedPhones({
      phonesCell: toStr(raw.phones),
      phone: toStr(raw.phone),
      phoneOffice: toStr(raw.phone_office),
      alternatePhone: toStr(raw.alternate_phone),
      phoneHome: toStr(raw.phone_home),
    })
    const phone = primaryOf(phones) ?? ''
    if (!name && !phone && !toStr(raw.supplier_code) && !toStr(raw.email)) {
      return // skip totally-blank trailing rows
    }
    if (!name) {
      errors.push({ sheet: 'Suppliers', row: rowNum, field: 'name', message: 'Name is required.' })
    }
    // Phone is optional on import — a supplier may have no number on file. Only
    // the name is mandatory. (Phone-based dedup simply won't match rows without
    // a number; they import as new suppliers.)
    if (!name) return

    const s: ParsedSupplier = {
      sourceRow: rowNum,
      supplierCode: toOptionalStr(raw.supplier_code),
      name,
      phone,
      phones,
      alternatePhone: toOptionalStr(raw.alternate_phone),
      contactPerson: toOptionalStr(raw.contact_person),
      email: toOptionalStr(raw.email),
      gstin: toOptionalStr(raw.gstin),
      drugLicense: toOptionalStr(raw.drug_license),
      address: toOptionalStr(raw.address),
      paymentTerms: normaliseEnum(raw.payment_terms, [
        'NET_30',
        'NET_45',
        'NET_60',
      ] as const, {
        errors, sheet: 'Suppliers', row: rowNum, field: 'payment_terms',
      }),
      bankDetails: toOptionalStr(raw.bank_details),
      bankAccountName: toOptionalStr(raw.bank_account_name),
      bankName: toOptionalStr(raw.bank_name),
      bankAccountNumber: toOptionalStr(raw.bank_account_number),
      bankIfsc: toOptionalStr(raw.bank_ifsc),
      bankUpiId: toOptionalStr(raw.bank_upi_id),
      notes: toOptionalStr(raw.notes),
      isActive: toBool(raw.is_active),
      openingBalance: toOptionalNumber(raw.opening_balance),
      purchaseOrders: [],
      grns: [],
      debitNotes: [],
      payments: [],
      activities: [],
      batches: [],
      prescriptions: [],
    }
    suppliers.push(s)
    if (s.supplierCode) {
      if (byCode.has(s.supplierCode)) {
        errors.push({
          sheet: 'Suppliers',
          row: rowNum,
          field: 'supplier_code',
          message: `Duplicate supplier_code "${s.supplierCode}".`,
        })
      } else {
        byCode.set(s.supplierCode, s)
      }
    }
  })

  // ── PO Items (read first, attach by po_ref) ──
  const poItemsByRef = new Map<string, ParsedPurchaseOrderItem[]>()
  const poItemRows = readSheetByName<Record<string, unknown>>(wb, 'PO Items')
  poItemRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const ref = toStr(raw.po_ref)
    if (!ref) {
      if (toStr(raw.product_name)) {
        errors.push({
          sheet: 'PO Items',
          row: rowNum,
          field: 'po_ref',
          message: 'po_ref is required to link this item to a purchase order.',
        })
      }
      return
    }
    const item: ParsedPurchaseOrderItem = {
      productName: toOptionalStr(raw.product_name),
      requiredQty: toOptionalNumber(raw.required_qty),
      lastPurchaseRate: toOptionalNumber(raw.last_purchase_rate),
      expectedRate: toOptionalNumber(raw.expected_rate),
      receivedQty: toOptionalNumber(raw.received_qty),
      remarks: toOptionalStr(raw.remarks),
    }
    const list = poItemsByRef.get(ref) ?? []
    list.push(item)
    poItemsByRef.set(ref, list)
  })

  // ── Purchase Orders ──
  let orphanPOs = 0
  const poRows = readSheetByName<Record<string, unknown>>(wb, 'Purchase Orders')
  poRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.supplier_code)
    if (!code) {
      if (toOptionalNumber(raw.total_amount) !== undefined) {
        errors.push({
          sheet: 'Purchase Orders',
          row: rowNum,
          field: 'supplier_code',
          message: 'supplier_code is required to link this purchase order.',
        })
      }
      return
    }
    const supplier = byCode.get(code)
    if (!supplier) {
      orphanPOs++
      errors.push({
        sheet: 'Purchase Orders',
        row: rowNum,
        field: 'supplier_code',
        message: `supplier_code "${code}" not found in Suppliers sheet — purchase order skipped.`,
      })
      return
    }
    const poRef = toOptionalStr(raw.po_ref)
    supplier.purchaseOrders.push({
      sourceRow: rowNum,
      poNumber: toOptionalStr(raw.po_number),
      date: toISODate(raw.date),
      expectedDelivery: toISODate(raw.expected_delivery),
      totalAmount: toOptionalNumber(raw.total_amount),
      status: normaliseEnum(raw.status, [
        'DRAFT',
        'SENT',
        'ACKNOWLEDGED',
        'PARTIALLY_RECEIVED',
        'FULLY_RECEIVED',
        'CLOSED',
        'CANCELLED',
      ] as const),
      items: poRef ? (poItemsByRef.get(poRef) ?? []) : [],
    })
  })

  // ── GRN Items ──
  const grnItemsByRef = new Map<string, ParsedGrnItem[]>()
  const grnItemRows = readSheetByName<Record<string, unknown>>(wb, 'GRN Items')
  grnItemRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const ref = toStr(raw.grn_ref)
    if (!ref) {
      if (toStr(raw.product_name)) {
        errors.push({
          sheet: 'GRN Items',
          row: rowNum,
          field: 'grn_ref',
          message: 'grn_ref is required to link this item to a GRN.',
        })
      }
      return
    }
    const item: ParsedGrnItem = {
      productName: toOptionalStr(raw.product_name),
      orderedQty: toOptionalNumber(raw.ordered_qty),
      receivedQty: toOptionalNumber(raw.received_qty),
      freeQty: toOptionalNumber(raw.free_qty),
      batchNumber: toOptionalStr(raw.batch_number),
      mfgDate: toISODate(raw.mfg_date),
      expiryDate: toISODate(raw.expiry_date),
      purchaseRate: toOptionalNumber(raw.purchase_rate),
      mrp: toOptionalNumber(raw.mrp),
      damageQty: toOptionalNumber(raw.damage_qty),
    }
    const list = grnItemsByRef.get(ref) ?? []
    list.push(item)
    grnItemsByRef.set(ref, list)
  })

  // ── GRNs ──
  let orphanGRNs = 0
  const grnRows = readSheetByName<Record<string, unknown>>(wb, 'GRNs')
  grnRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.supplier_code)
    if (!code) {
      if (toStr(raw.supplier_invoice_no)) {
        errors.push({
          sheet: 'GRNs',
          row: rowNum,
          field: 'supplier_code',
          message: 'supplier_code is required to link this GRN.',
        })
      }
      return
    }
    const supplier = byCode.get(code)
    if (!supplier) {
      orphanGRNs++
      errors.push({
        sheet: 'GRNs',
        row: rowNum,
        field: 'supplier_code',
        message: `supplier_code "${code}" not found in Suppliers sheet — GRN skipped.`,
      })
      return
    }
    const supplierInvoiceNo = toStr(raw.supplier_invoice_no)
    if (!supplierInvoiceNo) {
      errors.push({
        sheet: 'GRNs',
        row: rowNum,
        field: 'supplier_invoice_no',
        message: 'supplier_invoice_no is required — that\'s the supplier\'s bill number.',
      })
      return
    }
    const grnRef = toOptionalStr(raw.grn_ref)
    supplier.grns.push({
      sourceRow: rowNum,
      grnNumber: toOptionalStr(raw.grn_number),
      date: toISODate(raw.date),
      supplierInvoiceNo,
      supplierInvoiceDate: toISODate(raw.supplier_invoice_date),
      supplierInvoiceAmount: toOptionalNumber(raw.supplier_invoice_amount),
      amountPaid: toOptionalNumber(raw.amount_paid),
      totalAmount: toOptionalNumber(raw.total_amount),
      status: normaliseEnum(raw.status, [
        'DRAFT',
        'RECEIVED',
        'VERIFIED',
      ] as const),
      isReplacement: toBool(raw.is_replacement),
      items: grnRef ? (grnItemsByRef.get(grnRef) ?? []) : [],
    })
  })

  // ── Debit Note Items ──
  const dnItemsByRef = new Map<string, ParsedDebitNoteItem[]>()
  const dnItemRows = readSheetByName<Record<string, unknown>>(wb, 'Debit Note Items')
  dnItemRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const ref = toStr(raw.debit_note_ref)
    if (!ref) {
      if (toStr(raw.product_name)) {
        errors.push({
          sheet: 'Debit Note Items',
          row: rowNum,
          field: 'debit_note_ref',
          message: 'debit_note_ref is required to link this item to a debit note.',
        })
      }
      return
    }
    const item: ParsedDebitNoteItem = {
      productName: toOptionalStr(raw.product_name),
      batchNumber: toOptionalStr(raw.batch_number),
      expiryDate: toISODate(raw.expiry_date),
      returnedQty: toOptionalNumber(raw.returned_qty),
      purchaseRate: toOptionalNumber(raw.purchase_rate),
      gstPercent: toOptionalNumber(raw.gst_percent),
      amount: toOptionalNumber(raw.amount),
    }
    const list = dnItemsByRef.get(ref) ?? []
    list.push(item)
    dnItemsByRef.set(ref, list)
  })

  // ── Debit Notes ──
  let orphanDebitNotes = 0
  const dnRows = readSheetByName<Record<string, unknown>>(wb, 'Debit Notes')
  dnRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.supplier_code)
    if (!code) {
      if (toStr(raw.reason) || toOptionalNumber(raw.total_amount) !== undefined) {
        errors.push({
          sheet: 'Debit Notes',
          row: rowNum,
          field: 'supplier_code',
          message: 'supplier_code is required to link this debit note.',
        })
      }
      return
    }
    const supplier = byCode.get(code)
    if (!supplier) {
      orphanDebitNotes++
      errors.push({
        sheet: 'Debit Notes',
        row: rowNum,
        field: 'supplier_code',
        message: `supplier_code "${code}" not found in Suppliers sheet — debit note skipped.`,
      })
      return
    }
    const dnRef = toOptionalStr(raw.debit_note_ref)
    supplier.debitNotes.push({
      sourceRow: rowNum,
      debitNoteNo: toOptionalStr(raw.debit_note_no),
      grnNumber: toOptionalStr(raw.grn_number),
      date: toISODate(raw.date),
      reason: toOptionalStr(raw.reason),
      notes: toOptionalStr(raw.notes),
      subtotal: toOptionalNumber(raw.subtotal),
      cgst: toOptionalNumber(raw.cgst),
      sgst: toOptionalNumber(raw.sgst),
      igst: toOptionalNumber(raw.igst),
      totalAmount: toOptionalNumber(raw.total_amount),
      status: normaliseEnum(raw.status, [
        'DRAFT',
        'SENT',
        'ACCEPTED',
        'SETTLED',
      ] as const),
      settlementMode: normaliseEnum(raw.settlement_mode, [
        'REFUND',
        'REPLACEMENT',
        'ADJUST',
      ] as const),
      items: dnRef ? (dnItemsByRef.get(dnRef) ?? []) : [],
    })
  })

  // ── Payments ──
  let orphanPayments = 0
  const paymentRows = readSheetByName<Record<string, unknown>>(wb, 'Payments')
  paymentRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.supplier_code)
    if (!code) {
      if (toOptionalNumber(raw.amount) !== undefined) {
        errors.push({
          sheet: 'Payments',
          row: rowNum,
          field: 'supplier_code',
          message: 'supplier_code is required to link this payment.',
        })
      }
      return
    }
    const supplier = byCode.get(code)
    if (!supplier) {
      orphanPayments++
      errors.push({
        sheet: 'Payments',
        row: rowNum,
        field: 'supplier_code',
        message: `supplier_code "${code}" not found in Suppliers sheet — payment skipped.`,
      })
      return
    }
    const amount = toOptionalNumber(raw.amount)
    if (amount === undefined || amount <= 0) {
      errors.push({
        sheet: 'Payments',
        row: rowNum,
        field: 'amount',
        message: 'amount must be a number greater than zero.',
      })
      return
    }
    supplier.payments.push({
      sourceRow: rowNum,
      paymentNumber: toOptionalStr(raw.payment_number),
      grnNumber: toOptionalStr(raw.grn_number),
      date: toISODate(raw.date),
      amount,
      paymentMode: toOptionalStr(raw.payment_mode),
      referenceNumber: toOptionalStr(raw.reference_number),
      notes: toOptionalStr(raw.notes),
    })
  })

  // ── Activities ──
  let orphanActivities = 0
  const activityRows = readSheetByName<Record<string, unknown>>(wb, 'Activities')
  activityRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.supplier_code)
    if (!code) {
      if (toStr(raw.type) || toStr(raw.notes)) {
        errors.push({
          sheet: 'Activities',
          row: rowNum,
          field: 'supplier_code',
          message: 'supplier_code is required to link this activity.',
        })
      }
      return
    }
    const supplier = byCode.get(code)
    if (!supplier) {
      orphanActivities++
      errors.push({
        sheet: 'Activities',
        row: rowNum,
        field: 'supplier_code',
        message: `supplier_code "${code}" not found in Suppliers sheet — activity skipped.`,
      })
      return
    }
    const type = normaliseEnum(raw.type, [
      'CALL',
      'WHATSAPP',
      'EMAIL',
      'NOTE',
      'REMINDER',
    ] as const)
    if (!type) {
      errors.push({
        sheet: 'Activities',
        row: rowNum,
        field: 'type',
        message: 'type must be one of CALL, WHATSAPP, EMAIL, NOTE, REMINDER.',
      })
      return
    }
    supplier.activities.push({
      sourceRow: rowNum,
      type,
      title: toOptionalStr(raw.title),
      notes: toOptionalStr(raw.notes),
      occurredAt: toISODate(raw.occurred_at),
      dueAt: toISODate(raw.due_at),
      contactName: toOptionalStr(raw.contact_name),
      subject: toOptionalStr(raw.subject),
      status: normaliseEnum(raw.status, [
        'PENDING',
        'DONE',
        'CANCELLED',
      ] as const),
    })
  })

  // ── Documents (uploaded files → re-attached to the supplier's customer twin) ──
  let orphanDocuments = 0
  const documentRows = readSheetByName<Record<string, unknown>>(wb, 'Documents')
  documentRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.supplier_code)
    if (!code) {
      // A blank code with any real content is a linking error; a fully blank row is ignored.
      if (toStr(raw.doctor_name) || toStr(raw.image_url)) {
        errors.push({
          sheet: 'Documents',
          row: rowNum,
          field: 'supplier_code',
          message: 'supplier_code is required to link this document.',
        })
      }
      return
    }
    const supplier = byCode.get(code)
    if (!supplier) {
      orphanDocuments++
      errors.push({
        sheet: 'Documents',
        row: rowNum,
        field: 'supplier_code',
        message: `supplier_code "${code}" not found in Suppliers sheet — document skipped.`,
      })
      return
    }
    // doctor_name is the document title and is required (matches the Prescription model).
    const doctorName = toStr(raw.doctor_name)
    if (!doctorName) {
      errors.push({
        sheet: 'Documents',
        row: rowNum,
        field: 'doctor_name',
        message: 'doctor_name (document title) is required.',
      })
      return
    }
    supplier.prescriptions.push({
      sourceRow: rowNum,
      doctorName,
      notes: toOptionalStr(raw.notes),
      validUntil: toISODate(raw.valid_until),
      imageUrl: toOptionalStr(raw.image_url),
    })
  })

  // ── Batches ──
  let orphanBatches = 0
  const batchRows = readSheetByName<Record<string, unknown>>(wb, 'Batches')
  batchRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.supplier_code)
    if (!code) {
      if (toStr(raw.batch_number) || toStr(raw.product_name)) {
        errors.push({
          sheet: 'Batches',
          row: rowNum,
          field: 'supplier_code',
          message: 'supplier_code is required to link this batch.',
        })
      }
      return
    }
    const supplier = byCode.get(code)
    if (!supplier) {
      orphanBatches++
      errors.push({
        sheet: 'Batches',
        row: rowNum,
        field: 'supplier_code',
        message: `supplier_code "${code}" not found in Suppliers sheet — batch skipped.`,
      })
      return
    }
    const batchNumber = toStr(raw.batch_number)
    if (!batchNumber) {
      errors.push({
        sheet: 'Batches',
        row: rowNum,
        field: 'batch_number',
        message: 'batch_number is required.',
      })
      return
    }
    const productId = toOptionalStr(raw.product_id)
    const productName = toOptionalStr(raw.product_name)
    if (!productId && !productName) {
      errors.push({
        sheet: 'Batches',
        row: rowNum,
        field: 'product_name',
        message: 'Either product_id or product_name is required.',
      })
      return
    }
    supplier.batches.push({
      sourceRow: rowNum,
      productId,
      productName,
      batchNumber,
      mfgDate: toISODate(raw.mfg_date),
      expiryDate: toISODate(raw.expiry_date),
      quantity: toOptionalNumber(raw.quantity),
      mrp: toOptionalNumber(raw.mrp),
      purchaseRate: toOptionalNumber(raw.purchase_rate),
    })
  })

  // ── Fallbacks for non-template files (other ERP exports) ──
  const emptyOrphans = {
    orphanPOs: 0,
    orphanGRNs: 0,
    orphanDebitNotes: 0,
    orphanPayments: 0,
    orphanActivities: 0,
    orphanBatches: 0,
    orphanDocuments: 0,
  }

  // Fallback 1: MARG ERP "address book" (multi-row party blocks). Checked
  // before generic mapping, which would misread its repeated page headers.
  if (suppliers.length === 0) {
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
      if (!looksLikeMargAddressBook(aoa)) continue
      const abSuppliers: ParsedSupplier[] = []
      for (const p of parseMargAddressBook(aoa)) {
        if (!p.name) continue // name is the only hard requirement; phone optional
        abSuppliers.push({
          sourceRow: p.sourceRow, name: p.name, phone: p.phone || '', address: p.address,
          gstin: p.gstin, drugLicense: p.dlNumber,
          purchaseOrders: [], grns: [], debitNotes: [], payments: [], activities: [], batches: [], prescriptions: [],
        })
      }
      if (abSuppliers.length > 0) {
        return { suppliers: abSuppliers, ...emptyOrphans, errors: [], exportMetadata }
      }
    }
  }

  // Fallback 2: MARG ERP "party master" flat export (exact-coded columns).
  // Checked before generic mapping, which would grab `ledger` as the name.
  if (suppliers.length === 0) {
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
      if (!looksLikeMargPartyTable(aoa)) continue
      const ptSuppliers: ParsedSupplier[] = []
      for (const p of parseMargPartyTable(aoa)) {
        if (!p.name) continue // name is the only hard requirement; phone optional
        ptSuppliers.push({
          sourceRow: p.sourceRow, name: p.name, phone: p.phone || '', address: p.address,
          email: p.email, gstin: p.gstin, drugLicense: p.dlNumber,
          purchaseOrders: [], grns: [], debitNotes: [], payments: [], activities: [], batches: [], prescriptions: [],
        })
      }
      if (ptSuppliers.length > 0) {
        return { suppliers: ptSuppliers, ...emptyOrphans, errors: [], exportMetadata }
      }
    }
  }

  // Fallback 3: tolerant header mapping for other flat ERP exports.
  if (suppliers.length === 0) {
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
      const rows = parseLooseSheet(aoa, SUPPLIER_ALIAS_GROUPS)
      if (rows.length === 0) continue
      const looseSuppliers: ParsedSupplier[] = []
      const looseErrors: ParseError[] = []
      for (const { sourceRow, values: v } of rows) {
        const name = v.name ?? ''
        // Same fold as the structured path — mobile / phone1 / phone2 / resi all
        // land in one list, and the primary comes out of it.
        const phones = buildImportedPhones({
          phone: v.phone,
          phoneOffice: v.phoneOffice,
          alternatePhone: v.alternatePhone,
          phoneHome: v.phoneHome,
        })
        const phone = primaryOf(phones) ?? ''
        if (!name && !phone) continue
        // Phone optional on import — only the name is mandatory (see structured path).
        if (!name) {
          looseErrors.push({ sheet: 'Suppliers', row: sourceRow, field: 'name', message: 'Name is required.' })
          continue
        }
        looseSuppliers.push({
          sourceRow, name, phone, phones,
          alternatePhone: v.alternatePhone,
          contactPerson: v.contactPerson, email: v.email, gstin: v.gstin,
          drugLicense: v.drugLicense, address: v.address,
          openingBalance: toOptionalNumber(v.openingBalance),
          purchaseOrders: [], grns: [], debitNotes: [], payments: [], activities: [], batches: [], prescriptions: [],
        })
      }
      if (looseSuppliers.length > 0) {
        return { suppliers: looseSuppliers, ...emptyOrphans, errors: looseErrors, exportMetadata }
      }
    }
  }

  return {
    suppliers,
    orphanPOs,
    orphanGRNs,
    orphanDebitNotes,
    orphanPayments,
    orphanActivities,
    orphanBatches,
    orphanDocuments,
    errors,
    exportMetadata,
  }
}

// ─── Export → Re-import workflow ────────────────────────────────────────────

interface ExportSupplierInput {
  id: string
  customerId?: string | null // linked customer twin — documents hang off this
  name: string
  phone: string
  phones?: unknown
  alternatePhone?: string | null
  contactPerson?: string | null
  email?: string | null
  gstin?: string | null
  drugLicense?: string | null
  address?: string | null
  paymentTerms?: string | null
  bankDetails?: string | null
  bankAccountName?: string | null
  bankName?: string | null
  bankAccountNumber?: string | null
  bankIfsc?: string | null
  bankUpiId?: string | null
  notes?: string | null
  isActive?: boolean | null
  currentOutstanding?: number | string | null
}

interface ExportPurchaseOrderInput {
  id: string
  poNumber: string
  supplierId: string
  date: string | Date
  expectedDelivery?: string | Date | null
  totalAmount?: number | string
  status?: string
}

interface ExportPOItemInput {
  poNumber: string
  productName?: string
  requiredQty?: number
  lastPurchaseRate?: number | string
  expectedRate?: number | string
  receivedQty?: number
  remarks?: string | null
}

interface ExportGrnInput {
  id: string
  grnNumber: string
  supplierId: string
  date: string | Date
  supplierInvoiceNo: string
  supplierInvoiceDate?: string | Date | null
  supplierInvoiceAmount?: number | string
  amountPaid?: number | string
  totalAmount?: number | string
  status?: string
  isReplacement?: boolean
}

interface ExportGrnItemInput {
  grnNumber: string
  productName?: string
  orderedQty?: number
  receivedQty?: number
  freeQty?: number
  batchNumber?: string
  mfgDate?: string | Date | null
  expiryDate?: string | Date | null
  purchaseRate?: number | string
  mrp?: number | string
  damageQty?: number
}

interface ExportDebitNoteInput {
  id: string
  debitNoteNo: string
  supplierId: string
  grnId?: string | null
  date: string | Date
  reason?: string
  notes?: string | null
  subtotal?: number | string
  cgst?: number | string
  sgst?: number | string
  igst?: number | string
  totalAmount?: number | string
  status?: string
  settlementMode?: string
}

interface ExportDebitNoteItemInput {
  debitNoteNo: string
  productName?: string
  batchNumber?: string
  expiryDate?: string | Date | null
  returnedQty?: number
  purchaseRate?: number | string
  gstPercent?: number | string
  amount?: number | string
}

interface ExportSupplierPaymentInput {
  id: string
  paymentNumber: string
  supplierId: string
  grnId?: string | null
  createdAt: string | Date
  amount: number | string
  paymentMode?: string
  referenceNumber?: string | null
  notes?: string | null
}

interface ExportSupplierActivityInput {
  id: string
  supplierId: string
  type: string
  title?: string | null
  notes?: string | null
  occurredAt?: string | Date | null
  dueAt?: string | Date | null
  contactName?: string | null
  subject?: string | null
  status?: string | null
}

interface ExportBatchInput {
  id: string
  supplierId: string
  productId: string
  product?: { id: string; name: string } | null
  batchNumber: string
  mfgDate: string | Date
  expiryDate: string | Date
  quantity: number
  mrp: number | string
  purchaseRate: number | string
}

// Uploaded documents (GST cert, drug licence, bank proof, prescriptions).
// Stored as Prescription rows on the linked customer twin; the file lives in
// R2 and imageUrl carries its link.
interface ExportSupplierDocumentInput {
  id: string
  customerId: string
  doctorName?: string | null // used as the document title
  notes?: string | null
  validUntil?: string | Date | null
  imageUrl?: string | null
}

// Documents sheet columns — mirror the customer export's Prescriptions sheet,
// but keyed by supplier_code instead of customer_code.
const DOCUMENT_COLUMNS = ['supplier_code', 'doctor_name', 'notes', 'valid_until', 'image_url'] as const

export interface SupplierExportPayload {
  suppliers: ExportSupplierInput[]
  purchaseOrders: ExportPurchaseOrderInput[]
  poItems: ExportPOItemInput[]
  grns: ExportGrnInput[]
  grnItems: ExportGrnItemInput[]
  debitNotes: ExportDebitNoteInput[]
  debitNoteItems: ExportDebitNoteItemInput[]
  payments: ExportSupplierPaymentInput[]
  activities: ExportSupplierActivityInput[]
  batches: ExportBatchInput[]
  prescriptions?: ExportSupplierDocumentInput[] // supplier documents (via twin)
}

function isoDate(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// Full-precision timestamp for fields the supplier ledger sorts on (GRN date,
// debit-note date, payment date). Keeping the time-of-day means the exact
// transaction order round-trips through export → import; date-only would land
// every same-day row at midnight and lose the sequence.
function isoDateTime(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return ''
  return d.toISOString()
}

function num(v: unknown): number | '' {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : ''
}

function refCode(prefix: string, index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `${prefix}-${s}`
}

export function exportSuppliersToWorkbook(
  payload: SupplierExportPayload,
  metadata: Omit<ExportMetadata, 'entity' | 'counts'>,
): void {
  const wb = XLSX.utils.book_new()

  // Stable codes per supplier and per document for cross-sheet linking.
  const codeFor = new Map<string, string>()
  payload.suppliers.forEach((s, i) => {
    codeFor.set(s.id, `S${String(i + 1).padStart(3, '0')}`)
  })
  const poRefFor = new Map<string, string>()
  payload.purchaseOrders.forEach((po, i) => {
    poRefFor.set(po.poNumber, refCode('PO', i))
  })
  const grnRefFor = new Map<string, string>()
  payload.grns.forEach((g, i) => {
    grnRefFor.set(g.grnNumber, refCode('GRN', i))
  })
  const dnRefFor = new Map<string, string>()
  payload.debitNotes.forEach((d, i) => {
    dnRefFor.set(d.debitNoteNo, refCode('DN', i))
  })
  const grnNumberById = new Map<string, string>()
  payload.grns.forEach((g) => grnNumberById.set(g.id, g.grnNumber))
  // Documents hang off the supplier's linked customer twin, so map the twin's
  // customerId → the supplier's S00x code to place each document on the right row.
  const codeForCustomerId = new Map<string, string>()
  payload.suppliers.forEach((s) => {
    const code = codeFor.get(s.id)
    if (s.customerId && code) codeForCustomerId.set(s.customerId, code)
  })

  // Per-supplier money, computed live from non-replacement GRNs — the exact
  // same basis as the Suppliers list (withLiveOutstanding): Total = Σ invoice,
  // Paid = Σ amount_paid, Outstanding = Σ max(0, invoice − paid). These three
  // Suppliers-sheet columns are informational on re-import (the parser ignores
  // them); the paid state now round-trips via the GRN sheet's amount_paid.
  const purchaseTotalBySupplier = new Map<string, number>()
  const paidBySupplier = new Map<string, number>()
  const outstandingBySupplier = new Map<string, number>()
  for (const g of payload.grns) {
    if (g.isReplacement) continue
    const inv = Number(g.supplierInvoiceAmount ?? 0)
    const paid = Number(g.amountPaid ?? 0)
    purchaseTotalBySupplier.set(g.supplierId, (purchaseTotalBySupplier.get(g.supplierId) ?? 0) + inv)
    paidBySupplier.set(g.supplierId, (paidBySupplier.get(g.supplierId) ?? 0) + paid)
    const due = inv - paid
    if (due > 0.01) outstandingBySupplier.set(g.supplierId, (outstandingBySupplier.get(g.supplierId) ?? 0) + due)
  }

  const supplierRows = payload.suppliers.map((s) => {
    const totalPurchases = purchaseTotalBySupplier.get(s.id) ?? 0
    const paidAmount = paidBySupplier.get(s.id) ?? 0
    const outstandingNum = outstandingBySupplier.get(s.id) ?? 0
    return {
      supplier_code: codeFor.get(s.id) ?? '',
      name: s.name,
      phone: s.phone,
      // Round-trips the whole list with labels. Falls back to the legacy pair so
      // a supplier written before `phones` existed still exports its numbers.
      phones: serializePhonesCell(
        normalizePartyPhones(s.phones).length
          ? normalizePartyPhones(s.phones)
          : phonesFromLegacy(s.phone, s.alternatePhone),
      ),
      alternate_phone: s.alternatePhone ?? '',
      contact_person: s.contactPerson ?? '',
      email: s.email ?? '',
      gstin: s.gstin ?? '',
      drug_license: s.drugLicense ?? '',
      address: s.address ?? '',
      payment_terms: s.paymentTerms ?? '',
      bank_details: s.bankDetails ?? '',
      bank_account_name: s.bankAccountName ?? '',
      bank_name: s.bankName ?? '',
      bank_account_number: s.bankAccountNumber ?? '',
      bank_ifsc: s.bankIfsc ?? '',
      bank_upi_id: s.bankUpiId ?? '',
      notes: s.notes ?? '',
      is_active: s.isActive === false ? 'FALSE' : 'TRUE',
      opening_balance: num(s.currentOutstanding),
      total_purchases: totalPurchases,
      paid_amount: paidAmount,
      outstanding: outstandingNum,
    }
  })

  const poRows = payload.purchaseOrders.map((po) => ({
    supplier_code: codeFor.get(po.supplierId) ?? '',
    po_ref: poRefFor.get(po.poNumber) ?? '',
    po_number: po.poNumber,
    date: isoDate(po.date),
    expected_delivery: isoDate(po.expectedDelivery),
    total_amount: num(po.totalAmount),
    status: po.status ?? '',
  }))

  const poItemRows = payload.poItems.map((it) => ({
    po_ref: poRefFor.get(it.poNumber) ?? '',
    product_name: it.productName ?? '',
    required_qty: it.requiredQty ?? 0,
    last_purchase_rate: num(it.lastPurchaseRate),
    expected_rate: num(it.expectedRate),
    received_qty: it.receivedQty ?? 0,
    remarks: it.remarks ?? '',
  }))

  const grnRows = payload.grns.map((g) => ({
    supplier_code: codeFor.get(g.supplierId) ?? '',
    grn_ref: grnRefFor.get(g.grnNumber) ?? '',
    grn_number: g.grnNumber,
    date: isoDateTime(g.date),
    supplier_invoice_no: g.supplierInvoiceNo,
    supplier_invoice_date: isoDate(g.supplierInvoiceDate),
    supplier_invoice_amount: num(g.supplierInvoiceAmount),
    amount_paid: num(g.amountPaid),
    total_amount: num(g.totalAmount),
    status: g.status ?? '',
    is_replacement: g.isReplacement ? 'TRUE' : 'FALSE',
  }))

  const grnItemRows = payload.grnItems.map((it) => ({
    grn_ref: grnRefFor.get(it.grnNumber) ?? '',
    product_name: it.productName ?? '',
    ordered_qty: it.orderedQty ?? 0,
    received_qty: it.receivedQty ?? 0,
    free_qty: it.freeQty ?? 0,
    batch_number: it.batchNumber ?? '',
    mfg_date: isoDate(it.mfgDate),
    expiry_date: isoDate(it.expiryDate),
    purchase_rate: num(it.purchaseRate),
    mrp: num(it.mrp),
    damage_qty: it.damageQty ?? 0,
  }))

  const dnRows = payload.debitNotes.map((d) => ({
    supplier_code: codeFor.get(d.supplierId) ?? '',
    debit_note_ref: dnRefFor.get(d.debitNoteNo) ?? '',
    debit_note_no: d.debitNoteNo,
    grn_number: d.grnId ? (grnNumberById.get(d.grnId) ?? '') : '',
    date: isoDateTime(d.date),
    reason: d.reason ?? '',
    subtotal: num(d.subtotal),
    cgst: num(d.cgst),
    sgst: num(d.sgst),
    igst: num(d.igst),
    total_amount: num(d.totalAmount),
    status: d.status ?? '',
    settlement_mode: d.settlementMode ?? '',
    notes: d.notes ?? '',
  }))

  const dnItemRows = payload.debitNoteItems.map((it) => ({
    debit_note_ref: dnRefFor.get(it.debitNoteNo) ?? '',
    product_name: it.productName ?? '',
    batch_number: it.batchNumber ?? '',
    expiry_date: isoDate(it.expiryDate),
    returned_qty: it.returnedQty ?? 0,
    purchase_rate: num(it.purchaseRate),
    gst_percent: num(it.gstPercent),
    amount: num(it.amount),
  }))

  const paymentRows = payload.payments.map((p) => ({
    supplier_code: codeFor.get(p.supplierId) ?? '',
    grn_number: p.grnId ? (grnNumberById.get(p.grnId) ?? '') : '',
    date: isoDateTime(p.createdAt),
    amount: num(p.amount),
    payment_mode: p.paymentMode ?? '',
    reference_number: p.referenceNumber ?? '',
    payment_number: p.paymentNumber,
    notes: p.notes ?? '',
  }))

  const activityRows = payload.activities.map((a) => ({
    supplier_code: codeFor.get(a.supplierId) ?? '',
    type: a.type,
    title: a.title ?? '',
    notes: a.notes ?? '',
    occurred_at: isoDate(a.occurredAt),
    due_at: isoDate(a.dueAt),
    contact_name: a.contactName ?? '',
    subject: a.subject ?? '',
    status: a.status ?? '',
  }))

  const batchRows = payload.batches.map((b) => ({
    supplier_code: codeFor.get(b.supplierId) ?? '',
    product_id: b.productId,
    product_name: b.product?.name ?? '',
    batch_number: b.batchNumber,
    mfg_date: isoDate(b.mfgDate),
    expiry_date: isoDate(b.expiryDate),
    quantity: b.quantity,
    mrp: num(b.mrp),
    purchase_rate: num(b.purchaseRate),
  }))

  const meta: ExportMetadata = {
    entity: 'Supplier',
    branchName: metadata.branchName,
    exportedBy: metadata.exportedBy,
    exportedAt: metadata.exportedAt,
    schemaVersion: metadata.schemaVersion,
    counts: {
      suppliers: supplierRows.length,
      POs: poRows.length,
      'PO items': poItemRows.length,
      GRNs: grnRows.length,
      'GRN items': grnItemRows.length,
      'debit notes': dnRows.length,
      payments: paymentRows.length,
      activities: activityRows.length,
      batches: batchRows.length,
    },
  }

  const instructionsWs = XLSX.utils.aoa_to_sheet([
    ['Field', 'Notes'],
    ...buildExportMetadataRows(meta),
    ['Sheet: Suppliers', 'One row per supplier. On re-import "Update existing" rewrites mutable fields.'],
    ['Sheet: Purchase Orders', 'Past POs linked by supplier_code. po_number is the dedupe key.'],
    ['Sheet: PO Items', 'Line items linked to POs by po_ref.'],
    ['Sheet: GRNs', 'Goods received notes linked by supplier_code. grn_number is the dedupe key.'],
    ['Sheet: GRN Items', 'Line items linked to GRNs by grn_ref.'],
    ['Sheet: Debit Notes', 'Purchase returns linked by supplier_code (+ optional grn_number to link to a GRN).'],
    ['Sheet: Debit Note Items', 'Returned items linked to debit notes by debit_note_ref.'],
    ['Sheet: Payments', 'Past payments made to this supplier, linked by supplier_code (+ optional grn_number). payment_number is the dedupe key.'],
    ['Sheet: Activities', 'Call / WhatsApp / Email / Note / Reminder log.'],
    ['Sheet: Batches', 'Stock batches. product_id is the live Product row id.'],
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

  // Export-only: append the derived Total Purchases + Paid + Outstanding columns
  // after the round-trip ones. The import template / parser uses plain
  // SUPPLIER_COLUMNS, so these read-only summary columns are ignored on
  // re-import — the actual paid/outstanding state round-trips via the GRN
  // sheet's amount_paid column.
  addSheet('Suppliers',        supplierRows, [...SUPPLIER_COLUMNS, 'total_purchases', 'paid_amount', 'outstanding'],  SHEET_COLORS.suppliers)
  addSheet('Purchase Orders',  poRows,       PO_COLUMNS,        SHEET_COLORS.purchaseOrders)
  addSheet('PO Items',         poItemRows,   PO_ITEM_COLUMNS,   SHEET_COLORS.poItems)
  addSheet('GRNs',             grnRows,      GRN_COLUMNS,       SHEET_COLORS.grns)
  addSheet('GRN Items',        grnItemRows,  GRN_ITEM_COLUMNS,  SHEET_COLORS.grnItems)
  addSheet('Debit Notes',      dnRows,       DN_COLUMNS,        SHEET_COLORS.debitNotes)
  addSheet('Debit Note Items', dnItemRows,   DN_ITEM_COLUMNS,   SHEET_COLORS.debitNoteItems)
  addSheet('Payments',         paymentRows,  PAYMENT_COLUMNS,   SHEET_COLORS.payments)
  addSheet('Activities',       activityRows, ACTIVITY_COLUMNS,  SHEET_COLORS.activities)
  addSheet('Batches',          batchRows,    BATCH_COLUMNS,     SHEET_COLORS.batches)

  // Documents — each uploaded file's R2 link, linked to its supplier via the
  // twin customerId. Mirrors the customer export's Prescriptions sheet.
  const documentRows = (payload.prescriptions ?? []).map((doc) => ({
    supplier_code: codeForCustomerId.get(doc.customerId) ?? '',
    doctor_name: doc.doctorName ?? '',
    notes: doc.notes ?? '',
    valid_until: isoDate(doc.validUntil),
    image_url: doc.imageUrl ?? '',
  }))
  addSheet('Documents',        documentRows, DOCUMENT_COLUMNS,  SHEET_COLORS.prescriptions)

  const date = new Date()
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  XLSX.writeFile(wb, `suppliers-export-${stamp}.xlsx`)
}
