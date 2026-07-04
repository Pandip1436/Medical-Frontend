// xlsx-js-style is a drop-in superset of `xlsx` that supports cell-level
// styles (bold, fill, borders). We use it for BOTH read and write here so
// the parse helpers stay in sync with the write helpers. Bundle delta is
// modest and only on the import path.
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

// Synonyms for tolerant header-mapped import (other-ERP flat exports).
const CUSTOMER_ALIAS_GROUPS: LooseAliasGroup[] = [
  { field: 'name', aliases: ['name', 'customer name', 'customer', 'party name', 'party', 'client', 'client name', 'account name', 'ledger name', 'ledger', 'account', 'buyer', 'buyer name'] },
  { field: 'phone', aliases: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone no', 'phone number', 'contact no', 'contact number', 'contact', 'telephone', 'tel', 'cell', 'mob', 'mob no', 'whatsapp'] },
  { field: 'alternatePhone', aliases: ['alternate phone', 'alt phone', 'alternate mobile', 'alternate no', 'phone 2', 'mobile 2', 'second phone'] },
  { field: 'email', aliases: ['email', 'e mail', 'email id', 'mail', 'email address'] },
  { field: 'address', aliases: ['address', 'addr', 'location', 'full address', 'street', 'area', 'city', 'place', 'town'] },
  { field: 'type', aliases: ['type', 'customer type', 'category'] },
  { field: 'source', aliases: ['source', 'acquisition source', 'lead source', 'referred by', 'reference'] },
  { field: 'gstin', aliases: ['gstin', 'gst', 'gst no', 'gst number', 'gstin no', 'gst in', 'gstno', 'tin'] },
  { field: 'dlNumber', aliases: ['dl number', 'dl no', 'drug license', 'drug licence', 'dl', 'license no', 'licence no'] },
  { field: 'creditLimit', aliases: ['credit limit', 'cr limit', 'limit'] },
  { field: 'openingBalance', aliases: ['opening balance', 'balance', 'outstanding', 'opening', 'closing balance', 'os', 'due', 'amount', 'balance amount'] },
]

export type { ExportMetadata }

// ─────────────────────────────────────────────────────────────────────────────
// Customer import workbook — template + parser.
//
// One workbook, seven sheets. Customer rows are linked to invoices/payments/
// activities/prescriptions by a user-typed `customer_code` column (e.g. C001).
// `customer_code` is local to the workbook and never persisted — once the
// import lands, the backend keys everything on the canonical customer id.
//
// Why a structured template (vs. column-mapping like leads):
//   - Customer history has cross-sheet foreign keys (invoice ↔ items, customer
//     ↔ payments). A column-mapping UI can't express those.
//   - A fixed schema means the user knows exactly what to fill in and we can
//     give precise per-row errors back.
// ─────────────────────────────────────────────────────────────────────────────

export type DuplicateHandling = 'UPDATE' | 'SKIP' | 'CREATE'
export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'DOCTOR'
export type CustomerActivityType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'NOTE' | 'REMINDER'
export type InvoiceStatus = 'DRAFT' | 'PAID' | 'UNPAID' | 'PARTIAL' | 'RETURNED' | 'CANCELLED'
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED'
export type SettlementMode = 'REFUND' | 'CREDIT' | 'REPLACEMENT'

export interface ParsedCustomer {
  sourceRow: number
  customerCode?: string
  name: string
  phone: string
  alternatePhone?: string
  email?: string
  address?: string
  type?: CustomerType
  source?: string
  doctorRef?: string
  referredBy?: string
  creditLimit?: number
  openingBalance?: number
  gstin?: string
  dlNumber?: string
  registrationNumber?: string
  notes?: string
  whatsappOptIn?: boolean
  whatsappNumber?: string
  invoices: ParsedInvoice[]
  payments: ParsedPayment[]
  refunds: ParsedRefund[]
  activities: ParsedActivity[]
  prescriptions: ParsedPrescription[]
  quotations: ParsedQuotation[]
  creditNotes: ParsedCreditNote[]
}

export interface ParsedCreditNote {
  sourceRow: number
  creditNoteNo?: string
  invoiceNumber: string
  date?: string
  reason?: string
  notes?: string
  subtotal?: number
  cgst?: number
  sgst?: number
  igst?: number
  totalAmount?: number
  settlementMode?: SettlementMode
  items: ParsedCreditNoteItem[]
}

export interface ParsedCreditNoteItem {
  productName?: string
  batchNumber?: string
  expiryDate?: string
  returnedQty?: number
  rate?: number
  gstPercent?: number
  amount?: number
}

export interface ParsedQuotation {
  sourceRow: number
  quotationNumber?: string
  date?: string
  validUntil?: string
  notes?: string
  subtotal?: number
  cgst?: number
  sgst?: number
  deliveryCharge?: number
  total?: number
  status?: QuotationStatus
  items: ParsedQuotationItem[]
}

export interface ParsedQuotationItem {
  productName?: string
  quantity?: number
  mrp?: number
  rate?: number
  discountPercent?: number
  gstPercent?: number
  amount?: number
}

export interface ParsedInvoice {
  sourceRow: number
  invoiceNumber?: string
  date?: string
  notes?: string
  subtotal?: number
  productDiscount?: number
  taxableAmount?: number
  cgst?: number
  sgst?: number
  igst?: number
  deliveryCharge?: number
  roundOff?: number
  grandTotal?: number
  amountPaid?: number
  paymentMode?: string
  status?: InvoiceStatus
  billingType?: string
  items: ParsedInvoiceItem[]
}

export interface ParsedInvoiceItem {
  productName?: string
  batchNumber?: string
  expiryDate?: string
  quantity?: number
  mrp?: number
  rate?: number
  discountPercent?: number
  gstPercent?: number
  amount?: number
}

export interface ParsedPayment {
  sourceRow: number
  receiptNumber?: string
  date?: string
  amount: number
  paymentMode?: string
  referenceNumber?: string
  notes?: string
  invoiceNumber?: string
}

export interface ParsedRefund {
  sourceRow: number
  refundNumber?: string
  creditNoteNo: string
  date?: string
  amount: number
  paymentMode?: string
  notes?: string
}

export interface ParsedActivity {
  sourceRow: number
  type: CustomerActivityType
  title?: string
  notes?: string
  occurredAt?: string
  dueAt?: string
  contactName?: string
  subject?: string
  status?: 'PENDING' | 'DONE' | 'CANCELLED'
}

export interface ParsedPrescription {
  sourceRow: number
  doctorName: string
  notes?: string
  validUntil?: string
}

export interface ParseError {
  sheet: SheetName
  row: number
  field?: string
  message: string
}

export interface ParseResult {
  customers: ParsedCustomer[]
  // Rows from history sheets that referenced an unknown customer_code —
  // surfaced separately so the user can correct the workbook before commit.
  orphanInvoices: number
  orphanPayments: number
  orphanRefunds: number
  orphanActivities: number
  orphanPrescriptions: number
  orphanQuotations: number
  orphanCreditNotes: number
  errors: ParseError[]
  // Populated when the uploaded file is an Export-flavoured workbook (has the
  // "HOSPITAL SUPPLIERS — Customer Export" marker in the Instructions sheet).
  // Lets the drawer show a round-trip safety banner before commit.
  exportMetadata?: ExportMetadata
}

type SheetName =
  | 'Customers'
  | 'Invoices'
  | 'Invoice Items'
  | 'Payments'
  | 'Refunds'
  | 'Activities'
  | 'Prescriptions'
  | 'Quotations'
  | 'Quotation Items'
  | 'Credit Notes'
  | 'Credit Note Items'
  | 'Instructions'

// ─── Sheet column definitions ────────────────────────────────────────────────
// Listed once here so the template generator, the parser, and the README all
// stay in sync. When a new field gets added to the import surface, update this
// table only — every other artifact picks up the change.

const CUSTOMER_COLUMNS = [
  'customer_code',
  'name',
  'phone',
  'alternate_phone',
  'email',
  'address',
  'type',
  'doctor_ref',
  'source',
  'gstin',
  'dl_number',
  'registration_number',
  'referred_by',
  'credit_limit',
  'opening_balance',
  'whatsapp_opt_in',
  'whatsapp_number',
  'notes',
] as const

// Columns used when EXPORTING live data (not the blank import template). Appends
// read-only financial-summary columns that mirror the Customers list (Total /
// Paid / Outstanding / Pending). These are informational — the importer matches
// by the column names above and ignores these extras on re-upload.
const EXPORT_CUSTOMER_COLUMNS = [
  ...CUSTOMER_COLUMNS,
  'total_billed',
  'total_paid',
  'outstanding',
  'pending_invoices',
] as const

const INVOICE_COLUMNS = [
  'customer_code',
  'invoice_ref',
  'invoice_number',
  'date',
  'billing_type',
  'subtotal',
  'product_discount',
  'taxable_amount',
  'cgst',
  'sgst',
  'igst',
  'delivery_charge',
  'round_off',
  'grand_total',
  'amount_paid',
  'payment_mode',
  'status',
  'notes',
] as const

const INVOICE_ITEM_COLUMNS = [
  'invoice_ref',
  'product_name',
  'batch_number',
  'expiry_date',
  'quantity',
  'mrp',
  'rate',
  'discount_percent',
  'gst_percent',
  'amount',
] as const

const PAYMENT_COLUMNS = [
  'customer_code',
  'invoice_number',
  'date',
  'amount',
  'payment_mode',
  'reference_number',
  'receipt_number',
  'notes',
] as const

const REFUND_COLUMNS = [
  'customer_code',
  'credit_note_no',
  'date',
  'amount',
  'payment_mode',
  'refund_number',
  'notes',
] as const

const ACTIVITY_COLUMNS = [
  'customer_code',
  'type',
  'title',
  'notes',
  'occurred_at',
  'due_at',
  'contact_name',
  'subject',
  'status',
] as const

const PRESCRIPTION_COLUMNS = [
  'customer_code',
  'doctor_name',
  'notes',
  'valid_until',
] as const

const QUOTATION_COLUMNS = [
  'customer_code',
  'quotation_ref',
  'quotation_number',
  'date',
  'valid_until',
  'subtotal',
  'cgst',
  'sgst',
  'delivery_charge',
  'total',
  'status',
  'notes',
] as const

const QUOTATION_ITEM_COLUMNS = [
  'quotation_ref',
  'product_name',
  'quantity',
  'mrp',
  'rate',
  'discount_percent',
  'gst_percent',
  'amount',
] as const

const CREDIT_NOTE_COLUMNS = [
  'customer_code',
  'credit_note_ref',
  'credit_note_no',
  'invoice_number',
  'date',
  'reason',
  'subtotal',
  'cgst',
  'sgst',
  'igst',
  'total_amount',
  'settlement_mode',
  'notes',
] as const

const CREDIT_NOTE_ITEM_COLUMNS = [
  'credit_note_ref',
  'product_name',
  'batch_number',
  'expiry_date',
  'returned_qty',
  'rate',
  'gst_percent',
  'amount',
] as const

// ─── Template generation ─────────────────────────────────────────────────────

const SAMPLE_CUSTOMER_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  name: 'Asha Medical Stores',
  phone: '9876543210',
  alternate_phone: '',
  email: 'asha@example.com',
  address: '12, MG Road, Bengaluru',
  type: 'WHOLESALE',
  // Only meaningful when type is DOCTOR — your own reference for which
  // doctor this customer record belongs to. Leave blank otherwise.
  doctor_ref: '',
  source: 'IndiaMART',
  gstin: '29ABCDE1234F1Z5',
  dl_number: 'KA-B-20-12345',
  registration_number: '',
  referred_by: '',
  credit_limit: 50000,
  opening_balance: 12500,
  whatsapp_opt_in: 'TRUE',
  whatsapp_number: '',
  notes: 'Imported from legacy system',
}

const SAMPLE_INVOICE_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  invoice_ref: 'INV-A',
  // Original invoice number from your legacy system (Marg / Tally / manual
  // book). REQUIRED so the imported record matches the bill copy the customer
  // already has. Leave blank only if you genuinely have no old number — we
  // will then auto-generate one (which won't match your physical records).
  invoice_number: 'HS/25-26/0421',
  // Include the time (HH:mm:ss) so transactions keep their exact order in the
  // ledger. Date-only ("2026-04-12") also works — same-day rows just group.
  date: '2026-04-12T10:30:00',
  billing_type: 'WHOLESALE',
  subtotal: 10000,
  product_discount: 0,
  taxable_amount: 10000,
  cgst: 600,
  sgst: 600,
  igst: 0,
  delivery_charge: 0,
  round_off: 0,
  grand_total: 11200,
  amount_paid: 0,
  payment_mode: 'CREDIT',
  status: 'UNPAID',
  notes: '',
}

const SAMPLE_INVOICE_ITEM_ROW: Record<string, string | number> = {
  invoice_ref: 'INV-A',
  product_name: 'Paracetamol 500mg',
  batch_number: 'BX-001',
  expiry_date: '2027-12-31',
  quantity: 100,
  mrp: 110,
  rate: 100,
  discount_percent: 0,
  gst_percent: 12,
  amount: 10000,
}

const SAMPLE_PAYMENT_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  // The invoice this receipt paid — must match an invoice_number in the
  // Invoices sheet for the same customer. Leave blank for a customer-level
  // (unallocated) lump payment.
  invoice_number: 'HS/25-26/0421',
  date: '2026-04-20T15:45:00',
  amount: 5000,
  payment_mode: 'UPI',
  reference_number: 'UTR123456',
  // Original receipt number from your legacy system. Leave blank to auto-
  // generate. Filling it in lets you reconcile against the customer's old
  // receipt copy.
  receipt_number: 'RCPT/25-26/0312',
  notes: 'Part payment for INV-A',
}

const SAMPLE_REFUND_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  credit_note_no: 'CN/25-26/0044',
  date: '2026-05-02T11:15:00',
  amount: 500,
  payment_mode: 'CASH',
  // Original refund reference from your legacy system. Leave blank to auto-
  // generate.
  refund_number: 'REF/25-26/0015',
  notes: 'Cash refund for returned item',
}

const SAMPLE_ACTIVITY_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  type: 'CALL',
  title: '',
  notes: 'Discussed pending dues',
  occurred_at: '2026-05-01',
  due_at: '',
  contact_name: 'Asha (owner)',
  subject: '',
  status: '',
}

const SAMPLE_PRESCRIPTION_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  doctor_name: 'Dr. R. Kumar',
  notes: '',
  valid_until: '2026-10-01',
}

const SAMPLE_QUOTATION_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  quotation_ref: 'QT-A',
  // Original quotation number from your legacy system. Leave blank to auto-
  // generate; we recommend filling it in to match the customer's stored copy.
  quotation_number: 'QTN/25-26/0118',
  date: '2026-04-05T10:00:00',
  valid_until: '2026-05-05',
  subtotal: 8000,
  cgst: 480,
  sgst: 480,
  delivery_charge: 0,
  total: 8960,
  status: 'SENT',
  notes: 'Bulk antibiotics pre-quote',
}

const SAMPLE_QUOTATION_ITEM_ROW: Record<string, string | number> = {
  quotation_ref: 'QT-A',
  product_name: 'Amoxicillin 500mg',
  quantity: 100,
  mrp: 95,
  rate: 80,
  discount_percent: 0,
  gst_percent: 12,
  amount: 8000,
}

const SAMPLE_CREDIT_NOTE_ROW: Record<string, string | number> = {
  customer_code: 'C001',
  credit_note_ref: 'CN-A',
  // Legacy credit-note number — fill in to match the customer's return copy.
  credit_note_no: 'CN/25-26/0007',
  // REQUIRED: which invoice this return is against. Must match the
  // invoice_number you used in the Invoices sheet for the same customer.
  invoice_number: 'HS/25-26/0421',
  date: '2026-04-20T16:20:00',
  reason: 'Damaged stock returned',
  subtotal: 500,
  cgst: 30,
  sgst: 30,
  igst: 0,
  total_amount: 560,
  settlement_mode: 'CREDIT',
  notes: '',
}

const SAMPLE_CREDIT_NOTE_ITEM_ROW: Record<string, string | number> = {
  credit_note_ref: 'CN-A',
  product_name: 'Paracetamol 500mg',
  batch_number: 'PCM-2401',
  expiry_date: '2027-08-31',
  returned_qty: 20,
  rate: 25,
  gst_percent: 12,
  amount: 500,
}

const INSTRUCTIONS_ROWS: Array<[string, string]> = [
  ['HOSPITAL SUPPLIERS — Customer Import Template', ''],
  ['', ''],
  ['How to use', 'Fill in the sheets below, then upload this file from the Import drawer. "Customers" is the only mandatory sheet — all the others are optional history. Blank sheets are ignored.'],
  ['Required vs optional', 'Each sheet lists its REQUIRED fields — a row missing any of them is skipped with an error. Every other column is optional: leave it blank and a sensible default is used.'],
  ['Linking rows', '`customer_code` (e.g. C001) is YOUR own reference that ties a customer to its invoices / payments / etc. `invoice_ref`, `quotation_ref`, `credit_note_ref` link a parent row to its line-item sheet. These *_ref / *_code values only connect rows inside this file — they are not stored.'],
  ['', ''],
  ['Sheet: Customers  (mandatory)', 'REQUIRED: name, phone.  Recommended: customer_code (needed to attach any invoices/payments below), type, opening_balance (sets the current outstanding). `doctor_ref` applies only when type = DOCTOR.'],
  ['', ''],
  ['Sheet: Invoices', 'REQUIRED: customer_code.  Recommended: invoice_number (original bill no.), grand_total, date. `invoice_ref` links its line items. If invoice_number is blank a number is auto-generated (will NOT match the physical bill).'],
  ['Sheet: Invoice Items', 'Optional. REQUIRED per row: invoice_ref, product_name, quantity. Header-only invoices are accepted if line detail is gone.'],
  ['', ''],
  ['Sheet: Payments', 'REQUIRED: customer_code, amount (greater than 0).  Recommended: invoice_number (the bill this receipt paid — keeps it attributed correctly), date, payment_mode, receipt_number.'],
  ['', ''],
  ['Sheet: Refunds', 'REQUIRED: customer_code, credit_note_no (must match a Credit Notes row for the same customer), amount.'],
  ['', ''],
  ['Sheet: Activities', 'Optional. REQUIRED per row: customer_code, type.'],
  ['', ''],
  ['Sheet: Prescriptions', 'Optional. REQUIRED per row: customer_code. File uploads are not supported here — attach docs from the customer page after import.'],
  ['', ''],
  ['Sheet: Quotations', 'Optional. REQUIRED: customer_code. `quotation_ref` links its line items; fill quotation_number to match the stored copy.'],
  ['Sheet: Quotation Items', 'Optional. REQUIRED per row: quotation_ref.'],
  ['', ''],
  ['Sheet: Credit Notes', 'REQUIRED: customer_code, invoice_number (must match an Invoices row for the same customer). `credit_note_ref` links its line items.'],
  ['Sheet: Credit Note Items', 'Optional. REQUIRED per row: credit_note_ref.'],
  ['', ''],
  ['Allowed values', ''],
  ['customer.type', 'RETAIL · WHOLESALE · DOCTOR'],
  ['customer.source', 'Acquisition source, e.g. IndiaMART · JustDial · Walk-in · Referral (free text — optional).'],
  ['invoice.status', 'DRAFT · PAID · UNPAID · PARTIAL · RETURNED · CANCELLED'],
  ['invoice.payment_mode', 'CASH · CARD · UPI · CREDIT · SPLIT'],
  ['quotation.status', 'DRAFT · SENT · ACCEPTED · REJECTED · CONVERTED'],
  ['credit_note.settlement_mode', 'REFUND · CREDIT · REPLACEMENT'],
  ['activity.type', 'CALL · WHATSAPP · EMAIL · NOTE · REMINDER'],
  ['activity.status', 'PENDING · DONE · CANCELLED (REMINDER only)'],
  ['whatsapp_opt_in', 'TRUE / FALSE — defaults TRUE'],
  ['Dates', 'YYYY-MM-DD recommended. dd/mm/yyyy and Excel date cells also accepted.'],
  ['Money', 'Plain numbers — no ₹ symbols or commas.'],
  ['', ''],
  ['Duplicate handling', 'Phone number is the dedupe key. Choose UPDATE (rewrite mutable fields), SKIP (leave existing record alone), or CREATE (refuses if phone already exists — pick UPDATE/SKIP instead).'],
]

export function downloadCustomerImportTemplate(): void {
  const wb = XLSX.utils.book_new()

  // Small helper — build a sheet from a sample row + apply consistent
  // formatting (column widths, frozen header, auto-filter, tab colour).
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

  // Instructions first so the README is visible the moment Excel opens.
  const instructionsWs = XLSX.utils.aoa_to_sheet([
    ['Field', 'Notes'],
    ...INSTRUCTIONS_ROWS,
  ])
  applyInstructionsFormatting(instructionsWs, SHEET_COLORS.instructions)
  XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions')

  addSheet('Customers',       SAMPLE_CUSTOMER_ROW,       CUSTOMER_COLUMNS,       SHEET_COLORS.customers)
  addSheet('Invoices',        SAMPLE_INVOICE_ROW,        INVOICE_COLUMNS,        SHEET_COLORS.invoices)
  addSheet('Invoice Items',   SAMPLE_INVOICE_ITEM_ROW,   INVOICE_ITEM_COLUMNS,   SHEET_COLORS.invoiceItems)
  addSheet('Payments',        SAMPLE_PAYMENT_ROW,        PAYMENT_COLUMNS,        SHEET_COLORS.payments)
  addSheet('Refunds',         SAMPLE_REFUND_ROW,         REFUND_COLUMNS,         SHEET_COLORS.payments)
  addSheet('Activities',      SAMPLE_ACTIVITY_ROW,       ACTIVITY_COLUMNS,       SHEET_COLORS.activities)
  addSheet('Prescriptions',   SAMPLE_PRESCRIPTION_ROW,   PRESCRIPTION_COLUMNS,   SHEET_COLORS.prescriptions)
  addSheet('Quotations',      SAMPLE_QUOTATION_ROW,      QUOTATION_COLUMNS,      SHEET_COLORS.quotations)
  addSheet('Quotation Items', SAMPLE_QUOTATION_ITEM_ROW, QUOTATION_ITEM_COLUMNS, SHEET_COLORS.quotationItems)
  addSheet('Credit Notes',    SAMPLE_CREDIT_NOTE_ROW,    CREDIT_NOTE_COLUMNS,    SHEET_COLORS.creditNotes)
  addSheet('Credit Note Items', SAMPLE_CREDIT_NOTE_ITEM_ROW, CREDIT_NOTE_ITEM_COLUMNS, SHEET_COLORS.creditNoteItems)

  XLSX.writeFile(wb, 'hospital-suppliers-customer-import-template.xlsx')
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function readSheetByName<T extends Record<string, unknown>>(
  wb: XLSX.WorkBook,
  name: SheetName,
): T[] {
  // Case-insensitive match — Excel users routinely rename sheets in surprising
  // ways. `defval: ''` keeps every column key on every row, even when blank.
  const found = wb.SheetNames.find((s) => s.trim().toLowerCase() === name.toLowerCase())
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

// Excel may give us a Date object (when the cell is date-formatted), a serial
// number, or a string. Normalise to ISO so the backend's parseDate sees a
// predictable shape.
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
  // Return raw string back — the backend's parseDate is also liberal and we'd
  // rather surface a server-side error than silently drop the value.
  return s
}

function normaliseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | undefined {
  const s = toStr(raw).toUpperCase()
  if (!s) return undefined
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined
}

export async function parseCustomerImportWorkbook(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  // `cellDates: true` makes SheetJS return Date objects for date-formatted
  // cells, so our toISODate doesn't have to guess at Excel serial numbers
  // for the common path. Serial fallback in toISODate handles the rest.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  const errors: ParseError[] = []

  // Check for export-metadata block on the Instructions sheet. If present,
  // the drawer will show a yellow round-trip banner before commit.
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

  // ── Customers ──
  const customerRows = readSheetByName<Record<string, unknown>>(wb, 'Customers')
  const customers: ParsedCustomer[] = []
  const byCode = new Map<string, ParsedCustomer>()
  // Index of customers WITHOUT a code, by their workbook position. Linking
  // history rows requires customer_code, so unindexed customers don't get
  // children — but they can still be imported as basic customers.

  customerRows.forEach((raw, idx) => {
    // Row number in Excel: header is row 1, first data row is 2.
    const rowNum = idx + 2

    const name = toStr(raw.name)
    const phone = toStr(raw.phone)

    // Skip totally blank rows silently — empty workbook trailing rows are
    // common and shouldn't pollute the error list.
    if (!name && !phone && !toStr(raw.customer_code) && !toStr(raw.email)) return

    if (!name) {
      errors.push({ sheet: 'Customers', row: rowNum, field: 'name', message: 'Name is required.' })
    }
    if (!phone) {
      errors.push({ sheet: 'Customers', row: rowNum, field: 'phone', message: 'Phone is required.' })
    }
    if (!name || !phone) return

    const c: ParsedCustomer = {
      sourceRow: rowNum,
      customerCode: toOptionalStr(raw.customer_code),
      name,
      phone,
      alternatePhone: toOptionalStr(raw.alternate_phone),
      email: toOptionalStr(raw.email),
      address: toOptionalStr(raw.address),
      type: normaliseEnum(raw.type, ['RETAIL', 'WHOLESALE', 'DOCTOR'] as const),
      source: toOptionalStr(raw.source),
      doctorRef: toOptionalStr(raw.doctor_ref),
      referredBy: toOptionalStr(raw.referred_by),
      creditLimit: toOptionalNumber(raw.credit_limit),
      openingBalance: toOptionalNumber(raw.opening_balance),
      gstin: toOptionalStr(raw.gstin),
      dlNumber: toOptionalStr(raw.dl_number),
      registrationNumber: toOptionalStr(raw.registration_number),
      notes: toOptionalStr(raw.notes),
      whatsappOptIn: toBool(raw.whatsapp_opt_in),
      whatsappNumber: toOptionalStr(raw.whatsapp_number),
      invoices: [],
      payments: [],
      refunds: [],
      activities: [],
      prescriptions: [],
      quotations: [],
      creditNotes: [],
    }
    customers.push(c)
    if (c.customerCode) {
      if (byCode.has(c.customerCode)) {
        errors.push({
          sheet: 'Customers',
          row: rowNum,
          field: 'customer_code',
          message: `Duplicate customer_code "${c.customerCode}".`,
        })
      } else {
        byCode.set(c.customerCode, c)
      }
    }
  })

  // ── Invoice Items (first — so we can attach to invoices by invoice_ref) ──
  const itemsByRef = new Map<string, ParsedInvoiceItem[]>()
  const itemRows = readSheetByName<Record<string, unknown>>(wb, 'Invoice Items')
  itemRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const ref = toStr(raw.invoice_ref)
    if (!ref) {
      if (toStr(raw.product_name)) {
        errors.push({
          sheet: 'Invoice Items',
          row: rowNum,
          field: 'invoice_ref',
          message: 'invoice_ref is required to link this item to an invoice.',
        })
      }
      return
    }
    const item: ParsedInvoiceItem = {
      productName: toOptionalStr(raw.product_name),
      batchNumber: toOptionalStr(raw.batch_number),
      expiryDate: toISODate(raw.expiry_date),
      quantity: toOptionalNumber(raw.quantity),
      mrp: toOptionalNumber(raw.mrp),
      rate: toOptionalNumber(raw.rate),
      discountPercent: toOptionalNumber(raw.discount_percent),
      gstPercent: toOptionalNumber(raw.gst_percent),
      amount: toOptionalNumber(raw.amount),
    }
    const list = itemsByRef.get(ref) ?? []
    list.push(item)
    itemsByRef.set(ref, list)
  })

  // ── Invoices ──
  let orphanInvoices = 0
  const invoiceRows = readSheetByName<Record<string, unknown>>(wb, 'Invoices')
  invoiceRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.customer_code)
    if (!code) {
      if (toOptionalNumber(raw.grand_total) !== undefined) {
        errors.push({
          sheet: 'Invoices',
          row: rowNum,
          field: 'customer_code',
          message: 'customer_code is required to link this invoice.',
        })
      }
      return
    }
    const customer = byCode.get(code)
    if (!customer) {
      orphanInvoices++
      errors.push({
        sheet: 'Invoices',
        row: rowNum,
        field: 'customer_code',
        message: `customer_code "${code}" not found in Customers sheet — invoice skipped.`,
      })
      return
    }
    const invoiceRef = toOptionalStr(raw.invoice_ref)
    const inv: ParsedInvoice = {
      sourceRow: rowNum,
      invoiceNumber: toOptionalStr(raw.invoice_number),
      date: toISODate(raw.date),
      notes: toOptionalStr(raw.notes),
      billingType: toOptionalStr(raw.billing_type),
      subtotal: toOptionalNumber(raw.subtotal),
      productDiscount: toOptionalNumber(raw.product_discount),
      taxableAmount: toOptionalNumber(raw.taxable_amount),
      cgst: toOptionalNumber(raw.cgst),
      sgst: toOptionalNumber(raw.sgst),
      igst: toOptionalNumber(raw.igst),
      deliveryCharge: toOptionalNumber(raw.delivery_charge),
      roundOff: toOptionalNumber(raw.round_off),
      grandTotal: toOptionalNumber(raw.grand_total),
      amountPaid: toOptionalNumber(raw.amount_paid),
      paymentMode: toOptionalStr(raw.payment_mode),
      status: normaliseEnum(raw.status, [
        'DRAFT',
        'PAID',
        'UNPAID',
        'PARTIAL',
        'RETURNED',
        'CANCELLED',
      ] as const),
      items: invoiceRef ? itemsByRef.get(invoiceRef) ?? [] : [],
    }
    customer.invoices.push(inv)
  })

  // ── Payments ──
  let orphanPayments = 0
  const paymentRows = readSheetByName<Record<string, unknown>>(wb, 'Payments')
  paymentRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.customer_code)
    if (!code) {
      if (toOptionalNumber(raw.amount) !== undefined) {
        errors.push({
          sheet: 'Payments',
          row: rowNum,
          field: 'customer_code',
          message: 'customer_code is required to link this payment.',
        })
      }
      return
    }
    const customer = byCode.get(code)
    if (!customer) {
      orphanPayments++
      errors.push({
        sheet: 'Payments',
        row: rowNum,
        field: 'customer_code',
        message: `customer_code "${code}" not found in Customers sheet — payment skipped.`,
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
    customer.payments.push({
      sourceRow: rowNum,
      receiptNumber: toOptionalStr(raw.receipt_number),
      date: toISODate(raw.date),
      amount,
      paymentMode: toOptionalStr(raw.payment_mode),
      referenceNumber: toOptionalStr(raw.reference_number),
      notes: toOptionalStr(raw.notes),
      invoiceNumber: toOptionalStr(raw.invoice_number),
    })
  })

  // ── Activities ──
  let orphanActivities = 0
  const activityRows = readSheetByName<Record<string, unknown>>(wb, 'Activities')
  activityRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.customer_code)
    if (!code) {
      if (toStr(raw.type) || toStr(raw.notes)) {
        errors.push({
          sheet: 'Activities',
          row: rowNum,
          field: 'customer_code',
          message: 'customer_code is required to link this activity.',
        })
      }
      return
    }
    const customer = byCode.get(code)
    if (!customer) {
      orphanActivities++
      errors.push({
        sheet: 'Activities',
        row: rowNum,
        field: 'customer_code',
        message: `customer_code "${code}" not found in Customers sheet — activity skipped.`,
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
    customer.activities.push({
      sourceRow: rowNum,
      type,
      title: toOptionalStr(raw.title),
      notes: toOptionalStr(raw.notes),
      occurredAt: toISODate(raw.occurred_at),
      dueAt: toISODate(raw.due_at),
      contactName: toOptionalStr(raw.contact_name),
      subject: toOptionalStr(raw.subject),
      status: normaliseEnum(raw.status, ['PENDING', 'DONE', 'CANCELLED'] as const),
    })
  })

  // ── Prescriptions ──
  let orphanPrescriptions = 0
  const rxRows = readSheetByName<Record<string, unknown>>(wb, 'Prescriptions')
  rxRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.customer_code)
    if (!code) {
      if (toStr(raw.doctor_name)) {
        errors.push({
          sheet: 'Prescriptions',
          row: rowNum,
          field: 'customer_code',
          message: 'customer_code is required to link this prescription.',
        })
      }
      return
    }
    const customer = byCode.get(code)
    if (!customer) {
      orphanPrescriptions++
      errors.push({
        sheet: 'Prescriptions',
        row: rowNum,
        field: 'customer_code',
        message: `customer_code "${code}" not found in Customers sheet — prescription skipped.`,
      })
      return
    }
    const doctorName = toStr(raw.doctor_name)
    if (!doctorName) {
      errors.push({
        sheet: 'Prescriptions',
        row: rowNum,
        field: 'doctor_name',
        message: 'doctor_name is required.',
      })
      return
    }
    customer.prescriptions.push({
      sourceRow: rowNum,
      doctorName,
      notes: toOptionalStr(raw.notes),
      validUntil: toISODate(raw.valid_until),
    })
  })

  // ── Quotation Items (read first, attach by quotation_ref) ──
  const qItemsByRef = new Map<string, ParsedQuotationItem[]>()
  const qItemRows = readSheetByName<Record<string, unknown>>(wb, 'Quotation Items')
  qItemRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const ref = toStr(raw.quotation_ref)
    if (!ref) {
      if (toStr(raw.product_name)) {
        errors.push({
          sheet: 'Quotation Items',
          row: rowNum,
          field: 'quotation_ref',
          message: 'quotation_ref is required to link this item to a quotation.',
        })
      }
      return
    }
    const item: ParsedQuotationItem = {
      productName: toOptionalStr(raw.product_name),
      quantity: toOptionalNumber(raw.quantity),
      mrp: toOptionalNumber(raw.mrp),
      rate: toOptionalNumber(raw.rate),
      discountPercent: toOptionalNumber(raw.discount_percent),
      gstPercent: toOptionalNumber(raw.gst_percent),
      amount: toOptionalNumber(raw.amount),
    }
    const list = qItemsByRef.get(ref) ?? []
    list.push(item)
    qItemsByRef.set(ref, list)
  })

  // ── Quotations ──
  let orphanQuotations = 0
  const qRows = readSheetByName<Record<string, unknown>>(wb, 'Quotations')
  qRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.customer_code)
    if (!code) {
      if (toOptionalNumber(raw.total) !== undefined) {
        errors.push({
          sheet: 'Quotations',
          row: rowNum,
          field: 'customer_code',
          message: 'customer_code is required to link this quotation.',
        })
      }
      return
    }
    const customer = byCode.get(code)
    if (!customer) {
      orphanQuotations++
      errors.push({
        sheet: 'Quotations',
        row: rowNum,
        field: 'customer_code',
        message: `customer_code "${code}" not found in Customers sheet — quotation skipped.`,
      })
      return
    }
    const quotationRef = toOptionalStr(raw.quotation_ref)
    customer.quotations.push({
      sourceRow: rowNum,
      quotationNumber: toOptionalStr(raw.quotation_number),
      date: toISODate(raw.date),
      validUntil: toISODate(raw.valid_until),
      notes: toOptionalStr(raw.notes),
      subtotal: toOptionalNumber(raw.subtotal),
      cgst: toOptionalNumber(raw.cgst),
      sgst: toOptionalNumber(raw.sgst),
      deliveryCharge: toOptionalNumber(raw.delivery_charge),
      total: toOptionalNumber(raw.total),
      status: normaliseEnum(raw.status, [
        'DRAFT',
        'SENT',
        'ACCEPTED',
        'REJECTED',
        'CONVERTED',
      ] as const),
      items: quotationRef ? (qItemsByRef.get(quotationRef) ?? []) : [],
    })
  })

  // ── Credit Note Items (read first, attach by credit_note_ref) ──
  const cnItemsByRef = new Map<string, ParsedCreditNoteItem[]>()
  const cnItemRows = readSheetByName<Record<string, unknown>>(wb, 'Credit Note Items')
  cnItemRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const ref = toStr(raw.credit_note_ref)
    if (!ref) {
      if (toStr(raw.product_name)) {
        errors.push({
          sheet: 'Credit Note Items',
          row: rowNum,
          field: 'credit_note_ref',
          message: 'credit_note_ref is required to link this item to a credit note.',
        })
      }
      return
    }
    const item: ParsedCreditNoteItem = {
      productName: toOptionalStr(raw.product_name),
      batchNumber: toOptionalStr(raw.batch_number),
      expiryDate: toISODate(raw.expiry_date),
      returnedQty: toOptionalNumber(raw.returned_qty),
      rate: toOptionalNumber(raw.rate),
      gstPercent: toOptionalNumber(raw.gst_percent),
      amount: toOptionalNumber(raw.amount),
    }
    const list = cnItemsByRef.get(ref) ?? []
    list.push(item)
    cnItemsByRef.set(ref, list)
  })

  // ── Credit Notes ──
  let orphanCreditNotes = 0
  const cnRows = readSheetByName<Record<string, unknown>>(wb, 'Credit Notes')
  cnRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.customer_code)
    if (!code) {
      if (toStr(raw.invoice_number) || toOptionalNumber(raw.total_amount) !== undefined) {
        errors.push({
          sheet: 'Credit Notes',
          row: rowNum,
          field: 'customer_code',
          message: 'customer_code is required to link this credit note.',
        })
      }
      return
    }
    const customer = byCode.get(code)
    if (!customer) {
      orphanCreditNotes++
      errors.push({
        sheet: 'Credit Notes',
        row: rowNum,
        field: 'customer_code',
        message: `customer_code "${code}" not found in Customers sheet — credit note skipped.`,
      })
      return
    }
    const invoiceNumber = toStr(raw.invoice_number)
    if (!invoiceNumber) {
      errors.push({
        sheet: 'Credit Notes',
        row: rowNum,
        field: 'invoice_number',
        message: 'invoice_number is required — every credit note is against a specific invoice.',
      })
      return
    }
    const cnRef = toOptionalStr(raw.credit_note_ref)
    customer.creditNotes.push({
      sourceRow: rowNum,
      creditNoteNo: toOptionalStr(raw.credit_note_no),
      invoiceNumber,
      date: toISODate(raw.date),
      reason: toOptionalStr(raw.reason),
      notes: toOptionalStr(raw.notes),
      subtotal: toOptionalNumber(raw.subtotal),
      cgst: toOptionalNumber(raw.cgst),
      sgst: toOptionalNumber(raw.sgst),
      igst: toOptionalNumber(raw.igst),
      totalAmount: toOptionalNumber(raw.total_amount),
      settlementMode: normaliseEnum(raw.settlement_mode, [
        'REFUND',
        'CREDIT',
        'REPLACEMENT',
      ] as const),
      items: cnRef ? (cnItemsByRef.get(cnRef) ?? []) : [],
    })
  })

  // ── Refunds ──
  let orphanRefunds = 0
  const refundRows = readSheetByName<Record<string, unknown>>(wb, 'Refunds')
  refundRows.forEach((raw, idx) => {
    const rowNum = idx + 2
    const code = toStr(raw.customer_code)
    if (!code) {
      if (toOptionalNumber(raw.amount) !== undefined) {
        errors.push({
          sheet: 'Refunds',
          row: rowNum,
          field: 'customer_code',
          message: 'customer_code is required to link this refund.',
        })
      }
      return
    }
    const customer = byCode.get(code)
    if (!customer) {
      orphanRefunds++
      errors.push({
        sheet: 'Refunds',
        row: rowNum,
        field: 'customer_code',
        message: `customer_code "${code}" not found in Customers sheet — refund skipped.`,
      })
      return
    }
    const creditNoteNo = toStr(raw.credit_note_no)
    if (!creditNoteNo) {
      errors.push({
        sheet: 'Refunds',
        row: rowNum,
        field: 'credit_note_no',
        message: 'credit_note_no is required — every refund is against a specific credit note.',
      })
      return
    }
    const amount = toOptionalNumber(raw.amount)
    if (amount === undefined || amount <= 0) {
      errors.push({
        sheet: 'Refunds',
        row: rowNum,
        field: 'amount',
        message: 'amount must be a number greater than zero.',
      })
      return
    }
    customer.refunds.push({
      sourceRow: rowNum,
      refundNumber: toOptionalStr(raw.refund_number),
      creditNoteNo,
      date: toISODate(raw.date),
      amount,
      paymentMode: toOptionalStr(raw.payment_mode),
      notes: toOptionalStr(raw.notes),
    })
  })

  // ── Fallbacks for non-template files (other ERP exports) ──
  const emptyOrphans = {
    orphanInvoices: 0,
    orphanPayments: 0,
    orphanRefunds: 0,
    orphanActivities: 0,
    orphanPrescriptions: 0,
    orphanQuotations: 0,
    orphanCreditNotes: 0,
  }

  // Fallback 1: MARG ERP "address book" (multi-row party blocks). Checked
  // before generic mapping, which would misread its repeated page headers.
  if (customers.length === 0) {
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
      if (!looksLikeMargAddressBook(aoa)) continue
      const abCustomers: ParsedCustomer[] = []
      let skippedNoPhone = 0
      for (const p of parseMargAddressBook(aoa)) {
        if (!p.phone) { skippedNoPhone++; continue }
        abCustomers.push({
          sourceRow: p.sourceRow, name: p.name, phone: p.phone, address: p.address,
          gstin: p.gstin, dlNumber: p.dlNumber,
          invoices: [], payments: [], refunds: [], activities: [], prescriptions: [], quotations: [], creditNotes: [],
        })
      }
      if (abCustomers.length > 0) {
        return {
          customers: abCustomers,
          ...emptyOrphans,
          errors: skippedNoPhone
            ? [{ sheet: 'Customers', row: 0, message: `${skippedNoPhone} parties had no phone number and were skipped (phone is required).` }]
            : [],
          exportMetadata,
        }
      }
    }
  }

  // Fallback 2: MARG ERP "party master" flat export (exact-coded columns).
  // Checked before generic mapping, which would grab `ledger` as the name.
  if (customers.length === 0) {
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
      if (!looksLikeMargPartyTable(aoa)) continue
      const ptCustomers: ParsedCustomer[] = []
      let skippedNoPhone = 0
      for (const p of parseMargPartyTable(aoa)) {
        if (!p.phone) { skippedNoPhone++; continue }
        ptCustomers.push({
          sourceRow: p.sourceRow, name: p.name, phone: p.phone, address: p.address,
          email: p.email, gstin: p.gstin, dlNumber: p.dlNumber,
          invoices: [], payments: [], refunds: [], activities: [], prescriptions: [], quotations: [], creditNotes: [],
        })
      }
      if (ptCustomers.length > 0) {
        return {
          customers: ptCustomers,
          ...emptyOrphans,
          errors: skippedNoPhone
            ? [{ sheet: 'Customers', row: 0, message: `${skippedNoPhone} parties had no phone number and were skipped (phone is required).` }]
            : [],
          exportMetadata,
        }
      }
    }
  }

  // Fallback 3: tolerant header mapping for other flat ERP exports.
  if (customers.length === 0) {
    for (const sheetName of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
      const rows = parseLooseSheet(aoa, CUSTOMER_ALIAS_GROUPS)
      if (rows.length === 0) continue
      const looseCustomers: ParsedCustomer[] = []
      const looseErrors: ParseError[] = []
      for (const { sourceRow, values: v } of rows) {
        const name = v.name ?? ''
        const phone = v.phone ?? ''
        if (!name && !phone) continue
        if (!name || !phone) {
          looseErrors.push({ sheet: 'Customers', row: sourceRow, field: !name ? 'name' : 'phone', message: !name ? 'Name is required.' : 'Phone is required.' })
          continue
        }
        looseCustomers.push({
          sourceRow, name, phone,
          alternatePhone: v.alternatePhone, email: v.email, address: v.address,
          type: normaliseEnum(v.type, ['RETAIL', 'WHOLESALE', 'DOCTOR'] as const),
          source: v.source, gstin: v.gstin, dlNumber: v.dlNumber,
          creditLimit: toOptionalNumber(v.creditLimit), openingBalance: toOptionalNumber(v.openingBalance),
          invoices: [], payments: [], refunds: [], activities: [], prescriptions: [], quotations: [], creditNotes: [],
        })
      }
      if (looseCustomers.length > 0) {
        return { customers: looseCustomers, ...emptyOrphans, errors: looseErrors, exportMetadata }
      }
    }
  }

  return {
    customers,
    orphanInvoices,
    orphanPayments,
    orphanRefunds,
    orphanActivities,
    orphanPrescriptions,
    orphanQuotations,
    orphanCreditNotes,
    errors,
    exportMetadata,
  }
}

// ─── Export → Re-import workflow ────────────────────────────────────────────
// Build a workbook from the live database tree, in the same shape as the
// import template. The operator downloads it, edits in Excel, and re-uploads
// via the import drawer. Duplicates are matched by phone so edits flow back
// via the "Update existing" strategy.

interface ExportCustomerInput {
  id: string
  name: string
  phone: string
  alternatePhone?: string | null
  email?: string | null
  address?: string | null
  type?: string | null
  source?: string | null
  doctorRef?: string | null
  referredBy?: string | null
  creditLimit?: number | string | null
  currentOutstanding?: number | string | null
  gstin?: string | null
  dlNumber?: string | null
  registrationNumber?: string | null
  notes?: string | null
  whatsappOptIn?: boolean | null
  whatsappNumber?: string | null
}

interface ExportInvoiceInput {
  id: string
  invoiceNumber: string
  date: string | Date
  customerId: string | null
  billingType?: string
  subtotal?: number | string
  productDiscount?: number | string
  taxableAmount?: number | string
  cgst?: number | string
  sgst?: number | string
  igst?: number | string
  deliveryCharge?: number | string
  roundOff?: number | string
  grandTotal?: number | string
  amountPaid?: number | string
  paymentMode?: string
  status?: string
}

interface ExportInvoiceItemInput {
  invoiceNumber: string
  productName?: string
  batchNumber?: string
  expiryDate?: string | Date | null
  quantity?: number
  mrp?: number | string
  rate?: number | string
  discountPercent?: number | string
  gstPercent?: number | string
  amount?: number | string
}

interface ExportPaymentInput {
  id: string
  receiptNumber: string
  customerId: string
  invoiceId?: string | null
  createdAt: string | Date
  amount: number | string
  paymentMode?: string
  referenceNumber?: string | null
  notes?: string | null
}

interface ExportRefundInput {
  id: string
  refundNumber: string
  customerId: string | null
  creditNoteId: string
  createdAt: string | Date
  amount: number | string
  paymentMode?: string
  notes?: string | null
}

interface ExportActivityInput {
  id: string
  customerId: string
  type: string
  title?: string | null
  notes?: string | null
  occurredAt?: string | Date | null
  dueAt?: string | Date | null
  contactName?: string | null
  subject?: string | null
  status?: string | null
}

interface ExportPrescriptionInput {
  id: string
  customerId: string
  doctorName: string
  notes?: string | null
  validUntil?: string | Date | null
}

interface ExportQuotationInput {
  id: string
  quotationNumber: string
  customerId: string | null
  date: string | Date
  validUntil?: string | Date | null
  notes?: string | null
  subtotal?: number | string
  cgst?: number | string
  sgst?: number | string
  deliveryCharge?: number | string
  total?: number | string
  status?: string
}

interface ExportQuotationItemInput {
  quotationNumber: string
  productName?: string
  quantity?: number
  mrp?: number | string
  rate?: number | string
  discountPercent?: number | string
  gstPercent?: number | string
  amount?: number | string
}

interface ExportCreditNoteInput {
  id: string
  creditNoteNo: string
  customerId: string | null
  invoiceNumber: string
  date: string | Date
  reason?: string
  notes?: string | null
  subtotal?: number | string
  cgst?: number | string
  sgst?: number | string
  igst?: number | string
  totalAmount?: number | string
  settlementMode?: string
}

interface ExportCreditNoteItemInput {
  creditNoteNo: string
  productName?: string
  batchNumber?: string
  expiryDate?: string | Date | null
  returnedQty?: number
  rate?: number | string
  gstPercent?: number | string
  amount?: number | string
}

export interface CustomerExportPayload {
  customers: ExportCustomerInput[]
  invoices: ExportInvoiceInput[]
  invoiceItems: ExportInvoiceItemInput[]
  payments: ExportPaymentInput[]
  refunds: ExportRefundInput[]
  activities: ExportActivityInput[]
  prescriptions: ExportPrescriptionInput[]
  quotations: ExportQuotationInput[]
  quotationItems: ExportQuotationItemInput[]
  creditNotes: ExportCreditNoteInput[]
  creditNoteItems: ExportCreditNoteItemInput[]
}

// Convert a Date/ISO string to the yyyy-mm-dd format. Excel renders these
// naturally as dates without forcing a timestamp.
function isoDate(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// Full-precision timestamp for fields the ledger sorts on (invoice date,
// payment/refund/credit-note dates). Keeping the time-of-day means the exact
// transaction order round-trips through export → import; date-only would land
// every same-day row at midnight and lose the sequence. The parser
// (toISODate) and backend (parseDate) already preserve time.
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

export function exportCustomersToWorkbook(
  payload: CustomerExportPayload,
  metadata: Omit<ExportMetadata, 'entity' | 'counts'>,
): void {
  const wb = XLSX.utils.book_new()

  // Build a stable customer_code per customer (C001, C002, ...). Re-export
  // can produce different codes — that's fine, the import matches by phone.
  const codeFor = new Map<string, string>()
  payload.customers.forEach((c, i) => {
    codeFor.set(c.id, `C${String(i + 1).padStart(3, '0')}`)
  })

  // Build a stable invoice_ref per invoice (INV-A, INV-B, ...) so the line
  // items sheet links back. Same for quotations and credit notes.
  const invRefFor = new Map<string, string>()
  const invNumberById = new Map<string, string>()
  payload.invoices.forEach((inv, i) => {
    invRefFor.set(inv.invoiceNumber, refCode('INV', i))
    invNumberById.set(inv.id, inv.invoiceNumber)
  })
  const qtnRefFor = new Map<string, string>()
  payload.quotations.forEach((q, i) => {
    qtnRefFor.set(q.quotationNumber, refCode('QTN', i))
  })
  const cnRefFor = new Map<string, string>()
  payload.creditNotes.forEach((cn, i) => {
    cnRefFor.set(cn.creditNoteNo, refCode('CN', i))
  })

  // Per-customer financial summary from the exported invoices — mirrors the
  // Customers list columns. DRAFT/CANCELLED excluded; outstanding counts the
  // unpaid balance of UNPAID/PARTIAL invoices only.
  const summaryFor = new Map<
    string,
    { billed: number; paid: number; outstanding: number; pending: number }
  >()
  for (const inv of payload.invoices) {
    if (!inv.customerId) continue
    const status = inv.status ?? ''
    if (status === 'DRAFT' || status === 'CANCELLED') continue
    const gt = Number(inv.grandTotal ?? 0)
    const ap = Number(inv.amountPaid ?? 0)
    const s =
      summaryFor.get(inv.customerId) ??
      { billed: 0, paid: 0, outstanding: 0, pending: 0 }
    s.billed += gt
    s.paid += ap
    if (status === 'UNPAID' || status === 'PARTIAL') {
      s.outstanding += Math.max(0, gt - ap)
      s.pending += 1
    }
    summaryFor.set(inv.customerId, s)
  }

  const customerRows = payload.customers.map((c) => {
    const s = summaryFor.get(c.id) ?? { billed: 0, paid: 0, outstanding: 0, pending: 0 }
    return {
      customer_code: codeFor.get(c.id) ?? '',
      name: c.name,
      phone: c.phone,
      alternate_phone: c.alternatePhone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      type: c.type ?? '',
      doctor_ref: c.doctorRef ?? '',
      gstin: c.gstin ?? '',
      dl_number: c.dlNumber ?? '',
      registration_number: c.registrationNumber ?? '',
      referred_by: c.referredBy ?? '',
      credit_limit: num(c.creditLimit),
      opening_balance: num(c.currentOutstanding),
      whatsapp_opt_in: c.whatsappOptIn === false ? 'FALSE' : 'TRUE',
      whatsapp_number: c.whatsappNumber ?? '',
      notes: c.notes ?? '',
      // Read-only summary columns (ignored on re-import).
      source: c.source ?? '',
      total_billed: num(s.billed),
      total_paid: num(s.paid),
      outstanding: num(s.outstanding),
      pending_invoices: s.pending,
    }
  })

  const invoiceRows = payload.invoices.map((inv) => ({
    customer_code: inv.customerId ? (codeFor.get(inv.customerId) ?? '') : '',
    invoice_ref: invRefFor.get(inv.invoiceNumber) ?? '',
    invoice_number: inv.invoiceNumber,
    date: isoDateTime(inv.date),
    billing_type: inv.billingType ?? '',
    subtotal: num(inv.subtotal),
    product_discount: num(inv.productDiscount),
    taxable_amount: num(inv.taxableAmount),
    cgst: num(inv.cgst),
    sgst: num(inv.sgst),
    igst: num(inv.igst),
    delivery_charge: num(inv.deliveryCharge),
    round_off: num(inv.roundOff),
    grand_total: num(inv.grandTotal),
    amount_paid: num(inv.amountPaid),
    payment_mode: inv.paymentMode ?? '',
    status: inv.status ?? '',
    notes: '',
  }))

  const invoiceItemRows = payload.invoiceItems.map((it) => ({
    invoice_ref: invRefFor.get(it.invoiceNumber) ?? '',
    product_name: it.productName ?? '',
    batch_number: it.batchNumber ?? '',
    expiry_date: isoDate(it.expiryDate),
    quantity: it.quantity ?? 0,
    mrp: num(it.mrp),
    rate: num(it.rate),
    discount_percent: num(it.discountPercent),
    gst_percent: num(it.gstPercent),
    amount: num(it.amount),
  }))

  const paymentRows = payload.payments.map((p) => ({
    customer_code: codeFor.get(p.customerId) ?? '',
    // The invoice this receipt paid — keeps it attributed to its invoice on
    // re-import (otherwise the ledger double-counts it against amountPaid).
    invoice_number: p.invoiceId ? (invNumberById.get(p.invoiceId) ?? '') : '',
    date: isoDateTime(p.createdAt),
    amount: num(p.amount),
    payment_mode: p.paymentMode ?? '',
    reference_number: p.referenceNumber ?? '',
    receipt_number: p.receiptNumber,
    notes: p.notes ?? '',
  }))

  const creditNoteNoById = new Map<string, string>()
  payload.creditNotes.forEach((cn) => creditNoteNoById.set(cn.id, cn.creditNoteNo))

  const refundRows = payload.refunds.map((r) => ({
    customer_code: r.customerId ? (codeFor.get(r.customerId) ?? '') : '',
    credit_note_no: creditNoteNoById.get(r.creditNoteId) ?? '',
    date: isoDateTime(r.createdAt),
    amount: num(r.amount),
    payment_mode: r.paymentMode ?? '',
    refund_number: r.refundNumber,
    notes: r.notes ?? '',
  }))

  const activityRows = payload.activities.map((a) => ({
    customer_code: codeFor.get(a.customerId) ?? '',
    type: a.type,
    title: a.title ?? '',
    notes: a.notes ?? '',
    occurred_at: isoDate(a.occurredAt),
    due_at: isoDate(a.dueAt),
    contact_name: a.contactName ?? '',
    subject: a.subject ?? '',
    status: a.status ?? '',
  }))

  const prescriptionRows = payload.prescriptions.map((rx) => ({
    customer_code: codeFor.get(rx.customerId) ?? '',
    doctor_name: rx.doctorName,
    notes: rx.notes ?? '',
    valid_until: isoDate(rx.validUntil),
  }))

  const quotationRows = payload.quotations.map((q) => ({
    customer_code: q.customerId ? (codeFor.get(q.customerId) ?? '') : '',
    quotation_ref: qtnRefFor.get(q.quotationNumber) ?? '',
    quotation_number: q.quotationNumber,
    date: isoDate(q.date),
    valid_until: isoDate(q.validUntil),
    subtotal: num(q.subtotal),
    cgst: num(q.cgst),
    sgst: num(q.sgst),
    delivery_charge: num(q.deliveryCharge),
    total: num(q.total),
    status: q.status ?? '',
    notes: q.notes ?? '',
  }))

  const quotationItemRows = payload.quotationItems.map((it) => ({
    quotation_ref: qtnRefFor.get(it.quotationNumber) ?? '',
    product_name: it.productName ?? '',
    quantity: it.quantity ?? 0,
    mrp: num(it.mrp),
    rate: num(it.rate),
    discount_percent: num(it.discountPercent),
    gst_percent: num(it.gstPercent),
    amount: num(it.amount),
  }))

  const creditNoteRows = payload.creditNotes.map((cn) => ({
    customer_code: cn.customerId ? (codeFor.get(cn.customerId) ?? '') : '',
    credit_note_ref: cnRefFor.get(cn.creditNoteNo) ?? '',
    credit_note_no: cn.creditNoteNo,
    invoice_number: cn.invoiceNumber,
    date: isoDateTime(cn.date),
    reason: cn.reason ?? '',
    subtotal: num(cn.subtotal),
    cgst: num(cn.cgst),
    sgst: num(cn.sgst),
    igst: num(cn.igst),
    total_amount: num(cn.totalAmount),
    status: '',
    settlement_mode: cn.settlementMode ?? '',
    notes: cn.notes ?? '',
  }))

  const creditNoteItemRows = payload.creditNoteItems.map((it) => ({
    credit_note_ref: cnRefFor.get(it.creditNoteNo) ?? '',
    product_name: it.productName ?? '',
    batch_number: it.batchNumber ?? '',
    expiry_date: isoDate(it.expiryDate),
    returned_qty: it.returnedQty ?? 0,
    rate: num(it.rate),
    gst_percent: num(it.gstPercent),
    amount: num(it.amount),
  }))

  // Instructions sheet — prepend export metadata block.
  const meta: ExportMetadata = {
    entity: 'Customer',
    branchName: metadata.branchName,
    exportedBy: metadata.exportedBy,
    exportedAt: metadata.exportedAt,
    schemaVersion: metadata.schemaVersion,
    counts: {
      customers: customerRows.length,
      invoices: invoiceRows.length,
      'invoice items': invoiceItemRows.length,
      payments: paymentRows.length,
      refunds: refundRows.length,
      activities: activityRows.length,
      prescriptions: prescriptionRows.length,
      quotations: quotationRows.length,
      'credit notes': creditNoteRows.length,
    },
  }
  const instructionsWs = XLSX.utils.aoa_to_sheet([
    ['Field', 'Notes'],
    ...buildExportMetadataRows(meta),
    ['Sheet: Customers', 'One row per customer. Edit any field; on re-import "Update existing" will write changes back. Don\'t rename columns.'],
    ['Sheet: Invoices', 'Past invoices linked by customer_code. Edit money fields, status, payment_mode, notes. invoice_number is the dedupe key on re-import.'],
    ['Sheet: Invoice Items', 'Line items linked to invoices by invoice_ref.'],
    ['Sheet: Payments', 'Past receipts. receipt_number is the dedupe key.'],
    ['Sheet: Refunds', 'Past cash refunds, linked to credit notes by credit_note_no. refund_number is the dedupe key.'],
    ['Sheet: Activities', 'Call / WhatsApp / Email / Note / Reminder log.'],
    ['Sheet: Prescriptions', 'Doctor + validity. File uploads not supported via this round-trip.'],
    ['Sheet: Quotations', 'Past quotes. quotation_number is the dedupe key.'],
    ['Sheet: Credit Notes', 'Returns / credit notes linked to invoices by invoice_number.'],
  ])
  applyInstructionsFormatting(instructionsWs, SHEET_COLORS.instructions)
  XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions')

  const addSheet = <T extends Record<string, unknown>>(
    name: string,
    data: T[],
    columns: readonly string[],
    tabColor: string,
  ) => {
    // Even when data is empty, write an empty sheet with headers so a fresh
    // re-import would still parse cleanly (treats it as zero rows).
    const ws =
      data.length > 0
        ? XLSX.utils.json_to_sheet(data, { header: [...columns] })
        : XLSX.utils.aoa_to_sheet([[...columns]])
    applySheetFormatting(ws, { columns, tabColor })
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  addSheet('Customers',         customerRows,        EXPORT_CUSTOMER_COLUMNS,  SHEET_COLORS.customers)
  addSheet('Invoices',          invoiceRows,         INVOICE_COLUMNS,          SHEET_COLORS.invoices)
  addSheet('Invoice Items',     invoiceItemRows,     INVOICE_ITEM_COLUMNS,     SHEET_COLORS.invoiceItems)
  addSheet('Payments',          paymentRows,         PAYMENT_COLUMNS,          SHEET_COLORS.payments)
  addSheet('Refunds',           refundRows,          REFUND_COLUMNS,           SHEET_COLORS.payments)
  addSheet('Activities',        activityRows,        ACTIVITY_COLUMNS,         SHEET_COLORS.activities)
  addSheet('Prescriptions',     prescriptionRows,    PRESCRIPTION_COLUMNS,     SHEET_COLORS.prescriptions)
  addSheet('Quotations',        quotationRows,       QUOTATION_COLUMNS,        SHEET_COLORS.quotations)
  addSheet('Quotation Items',   quotationItemRows,   QUOTATION_ITEM_COLUMNS,   SHEET_COLORS.quotationItems)
  addSheet('Credit Notes',      creditNoteRows,      CREDIT_NOTE_COLUMNS,      SHEET_COLORS.creditNotes)
  addSheet('Credit Note Items', creditNoteItemRows,  CREDIT_NOTE_ITEM_COLUMNS, SHEET_COLORS.creditNoteItems)

  const date = new Date()
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  XLSX.writeFile(wb, `customers-export-${stamp}.xlsx`)
}

// Build a per-document ref code: INV-A, INV-B, …, INV-AA, INV-AB, …
// Used for cross-sheet linking in the workbook.
function refCode(prefix: string, index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `${prefix}-${s}`
}
