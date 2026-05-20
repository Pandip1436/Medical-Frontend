/* eslint-disable */
// One-off script: generates a realistic sample customer-import workbook.
// Run from medical_frontend/: `node scripts/generate-sample-customer-import.cjs`
// Output: ../sample-customer-import.xlsx (in the project root)

// xlsx-js-style is a drop-in superset of `xlsx` with cell-style support.
const XLSX = require('xlsx-js-style')
const path = require('path')
const {
  SHEET_COLORS,
  applyInstructionsFormatting,
  applySheetFormatting,
} = require('./lib/excelTemplateFormat.cjs')

const CUSTOMER_COLUMNS = [
  'customer_code', 'name', 'phone', 'alternate_phone', 'email', 'address',
  'type', 'gstin', 'dl_number', 'registration_number', 'referred_by',
  'credit_limit', 'opening_balance', 'loyalty_points', 'whatsapp_opt_in',
  'whatsapp_number', 'notes',
]
const INVOICE_COLUMNS = [
  'customer_code', 'invoice_ref', 'invoice_number', 'date', 'billing_type',
  'subtotal', 'product_discount', 'taxable_amount', 'cgst', 'sgst', 'igst',
  'delivery_charge', 'round_off', 'grand_total', 'amount_paid', 'payment_mode',
  'status', 'notes',
]
const INVOICE_ITEM_COLUMNS = [
  'invoice_ref', 'product_name', 'batch_number', 'expiry_date', 'quantity',
  'mrp', 'rate', 'discount_percent', 'gst_percent', 'amount',
]
const PAYMENT_COLUMNS = [
  'customer_code', 'date', 'amount', 'payment_mode', 'reference_number',
  'receipt_number', 'notes',
]
const ACTIVITY_COLUMNS = [
  'customer_code', 'type', 'title', 'notes', 'occurred_at', 'due_at',
  'contact_name', 'subject', 'status',
]
const PRESCRIPTION_COLUMNS = [
  'customer_code', 'doctor_name', 'notes', 'valid_until',
]
const QUOTATION_COLUMNS = [
  'customer_code', 'quotation_ref', 'quotation_number', 'date', 'valid_until',
  'subtotal', 'cgst', 'sgst', 'delivery_charge', 'total', 'status', 'notes',
]
const QUOTATION_ITEM_COLUMNS = [
  'quotation_ref', 'product_name', 'quantity', 'mrp', 'rate',
  'discount_percent', 'gst_percent', 'amount',
]
const CREDIT_NOTE_COLUMNS = [
  'customer_code', 'credit_note_ref', 'credit_note_no', 'invoice_number',
  'date', 'reason', 'subtotal', 'cgst', 'sgst', 'igst', 'total_amount',
  'settlement_mode', 'notes',
]
const CREDIT_NOTE_ITEM_COLUMNS = [
  'credit_note_ref', 'product_name', 'batch_number', 'expiry_date',
  'returned_qty', 'rate', 'gst_percent', 'amount',
]

// ─── Customers ───────────────────────────────────────────────────────────────
const customers = [
  {
    customer_code: 'C001',
    name: 'Asha Medical Stores',
    phone: '9876543210',
    alternate_phone: '08023456789',
    email: 'asha.med@example.com',
    address: '12, MG Road, Bengaluru, KA 560001',
    type: 'WHOLESALE',
    gstin: '29ABCDE1234F1Z5',
    dl_number: 'KA-B-20-12345',
    registration_number: '',
    referred_by: 'Suresh K',
    credit_limit: 100000,
    opening_balance: 22500,
    loyalty_points: 0,
    whatsapp_opt_in: 'TRUE',
    whatsapp_number: '',
    notes: 'Long-time wholesale account. Bills monthly.',
  },
  {
    customer_code: 'C002',
    name: 'Ravi Kumar',
    phone: '9912345678',
    alternate_phone: '',
    email: '',
    address: '4, Indiranagar 2nd Stage, Bengaluru',
    type: 'RETAIL',
    gstin: '',
    dl_number: '',
    registration_number: '',
    referred_by: 'Walk-in',
    credit_limit: 0,
    opening_balance: 0,
    loyalty_points: 120,
    whatsapp_opt_in: 'TRUE',
    whatsapp_number: '',
    notes: '',
  },
  {
    customer_code: 'C003',
    name: 'Dr. Priya Nair',
    phone: '9845001122',
    alternate_phone: '',
    email: 'priya.nair@apolloclinic.in',
    address: 'Apollo Clinic, Koramangala, Bengaluru',
    type: 'DOCTOR',
    gstin: '',
    dl_number: '',
    registration_number: 'KMC-78213',
    referred_by: 'Hospital Suppliers Sales',
    credit_limit: 0,
    opening_balance: 0,
    loyalty_points: 0,
    whatsapp_opt_in: 'TRUE',
    whatsapp_number: '',
    notes: 'Refers ~20 prescriptions/week.',
  },
  {
    customer_code: 'C004',
    name: 'Vinayaka Pharmacy',
    phone: '9900123456',
    alternate_phone: '',
    email: 'vinayaka.pharm@gmail.com',
    address: 'Jayanagar 4th Block, Bengaluru',
    type: 'WHOLESALE',
    gstin: '29XYZAB5678K1Z2',
    dl_number: 'KA-B-21-67890',
    registration_number: '',
    referred_by: 'Suresh K',
    credit_limit: 75000,
    opening_balance: 0,
    loyalty_points: 0,
    whatsapp_opt_in: 'TRUE',
    whatsapp_number: '',
    notes: '',
  },
  {
    customer_code: 'C005',
    name: 'Lakshmi Devi',
    phone: '9844112233',
    alternate_phone: '',
    email: '',
    address: '23, RT Nagar, Bengaluru',
    type: 'RETAIL',
    gstin: '',
    dl_number: '',
    registration_number: '',
    referred_by: 'Walk-in',
    credit_limit: 5000,
    opening_balance: 1850,
    loyalty_points: 45,
    whatsapp_opt_in: 'FALSE',
    whatsapp_number: '',
    notes: 'Diabetic — recurring insulin orders.',
  },
  {
    customer_code: 'C006',
    name: 'Sanjeevini Hospital',
    phone: '8023456789',
    alternate_phone: '9886112233',
    email: 'accounts@sanjeevini.com',
    address: 'Whitefield Main Road, Bengaluru',
    type: 'WHOLESALE',
    gstin: '29MNPQR9012L1Z8',
    dl_number: 'KA-W-22-44556',
    registration_number: '',
    referred_by: 'Manjunath BG',
    credit_limit: 250000,
    opening_balance: 67000,
    loyalty_points: 0,
    whatsapp_opt_in: 'TRUE',
    whatsapp_number: '',
    notes: 'NET-30 payment terms.',
  },
  {
    customer_code: 'C007',
    name: 'Arjun Reddy',
    phone: '9700998877',
    alternate_phone: '',
    email: 'arjun.r@example.com',
    address: 'HSR Layout Sector 2, Bengaluru',
    type: 'RETAIL',
    gstin: '',
    dl_number: '',
    registration_number: '',
    referred_by: 'Walk-in',
    credit_limit: 0,
    opening_balance: 0,
    loyalty_points: 80,
    whatsapp_opt_in: 'TRUE',
    whatsapp_number: '',
    notes: '',
  },
  {
    customer_code: 'C008',
    name: 'Dr. Mohan Rao',
    phone: '9008776655',
    alternate_phone: '',
    email: 'mohanrao.gp@gmail.com',
    address: 'Malleshwaram 8th Cross, Bengaluru',
    type: 'DOCTOR',
    gstin: '',
    dl_number: '',
    registration_number: 'KMC-44120',
    referred_by: 'Hospital Suppliers Sales',
    credit_limit: 0,
    opening_balance: 0,
    loyalty_points: 0,
    whatsapp_opt_in: 'TRUE',
    whatsapp_number: '',
    notes: 'General physician, family clinic.',
  },
]

// ─── Invoices ────────────────────────────────────────────────────────────────
// invoice_number is the ORIGINAL number from the legacy system (Marg / Tally /
// hand-written book). We preserve it verbatim so reconciliation with the
// customer's physical bill copy keeps working after migration. Auto-generation
// is only a fallback — never the intended path for historical data.
const invoices = [
  // Asha Medical Stores — 3 invoices from legacy Marg ERP
  { customer_code: 'C001', invoice_ref: 'A-INV1', invoice_number: 'HS/25-26/0421', date: '2026-04-12', billing_type: 'WHOLESALE',
    subtotal: 25000, product_discount: 0, taxable_amount: 25000, cgst: 1500, sgst: 1500, igst: 0,
    delivery_charge: 0, round_off: 0, grand_total: 28000, amount_paid: 28000, payment_mode: 'UPI',
    status: 'PAID', notes: 'Routine April stock' },
  { customer_code: 'C001', invoice_ref: 'A-INV2', invoice_number: 'HS/25-26/0438', date: '2026-04-28', billing_type: 'WHOLESALE',
    subtotal: 18000, product_discount: 500, taxable_amount: 17500, cgst: 1050, sgst: 1050, igst: 0,
    delivery_charge: 0, round_off: 0, grand_total: 19600, amount_paid: 10000, payment_mode: 'CREDIT',
    status: 'PARTIAL', notes: 'Discount given on bulk antibiotic order' },
  { customer_code: 'C001', invoice_ref: 'A-INV3', invoice_number: 'HS/25-26/0467', date: '2026-05-10', billing_type: 'WHOLESALE',
    subtotal: 12500, product_discount: 0, taxable_amount: 12500, cgst: 750, sgst: 750, igst: 0,
    delivery_charge: 0, round_off: 0, grand_total: 14000, amount_paid: 0, payment_mode: 'CREDIT',
    status: 'UNPAID', notes: '' },

  // Ravi Kumar — 1 retail bill from POS register
  { customer_code: 'C002', invoice_ref: 'R-INV1', invoice_number: 'HS/25-26/0455', date: '2026-05-02', billing_type: 'RETAIL',
    subtotal: 450, product_discount: 0, taxable_amount: 450, cgst: 27, sgst: 27, igst: 0,
    delivery_charge: 0, round_off: -4, grand_total: 500, amount_paid: 500, payment_mode: 'CASH',
    status: 'PAID', notes: '' },

  // Vinayaka Pharmacy — 2 invoices
  { customer_code: 'C004', invoice_ref: 'V-INV1', invoice_number: 'HS/25-26/0429', date: '2026-04-18', billing_type: 'WHOLESALE',
    subtotal: 8000, product_discount: 0, taxable_amount: 8000, cgst: 480, sgst: 480, igst: 0,
    delivery_charge: 0, round_off: 0, grand_total: 8960, amount_paid: 8960, payment_mode: 'UPI',
    status: 'PAID', notes: '' },
  { customer_code: 'C004', invoice_ref: 'V-INV2', invoice_number: 'HS/25-26/0461', date: '2026-05-08', billing_type: 'WHOLESALE',
    subtotal: 15000, product_discount: 0, taxable_amount: 15000, cgst: 900, sgst: 900, igst: 0,
    delivery_charge: 0, round_off: 0, grand_total: 16800, amount_paid: 5000, payment_mode: 'CREDIT',
    status: 'PARTIAL', notes: '' },

  // Lakshmi Devi — 1 retail credit invoice
  { customer_code: 'C005', invoice_ref: 'L-INV1', invoice_number: 'HS/25-26/0434', date: '2026-04-25', billing_type: 'RETAIL',
    subtotal: 1650, product_discount: 0, taxable_amount: 1650, cgst: 99, sgst: 99, igst: 0,
    delivery_charge: 0, round_off: 2, grand_total: 1850, amount_paid: 0, payment_mode: 'CREDIT',
    status: 'UNPAID', notes: 'Monthly insulin' },

  // Sanjeevini Hospital — 2 large institutional invoices
  { customer_code: 'C006', invoice_ref: 'S-INV1', invoice_number: 'HS/25-26/0426', date: '2026-04-15', billing_type: 'WHOLESALE',
    subtotal: 85000, product_discount: 2000, taxable_amount: 83000, cgst: 4980, sgst: 4980, igst: 0,
    delivery_charge: 500, round_off: 0, grand_total: 93460, amount_paid: 93460, payment_mode: 'UPI',
    status: 'PAID', notes: 'NEFT settlement' },
  { customer_code: 'C006', invoice_ref: 'S-INV2', invoice_number: 'HS/25-26/0458', date: '2026-05-05', billing_type: 'WHOLESALE',
    subtotal: 67000, product_discount: 0, taxable_amount: 67000, cgst: 4020, sgst: 4020, igst: 0,
    delivery_charge: 500, round_off: 0, grand_total: 75540, amount_paid: 0, payment_mode: 'CREDIT',
    status: 'UNPAID', notes: 'NET-30, due 5-June' },

  // Arjun Reddy — 1 retail card sale
  { customer_code: 'C007', invoice_ref: 'AR-INV1', invoice_number: 'HS/25-26/0470', date: '2026-05-12', billing_type: 'RETAIL',
    subtotal: 780, product_discount: 0, taxable_amount: 780, cgst: 47, sgst: 47, igst: 0,
    delivery_charge: 0, round_off: -4, grand_total: 870, amount_paid: 870, payment_mode: 'CARD',
    status: 'PAID', notes: '' },
]

// ─── Invoice Items ───────────────────────────────────────────────────────────
const invoiceItems = [
  // A-INV1
  { invoice_ref: 'A-INV1', product_name: 'Paracetamol 500mg', batch_number: 'PCM-2401', expiry_date: '2027-08-31',
    quantity: 200, mrp: 30, rate: 25, discount_percent: 0, gst_percent: 12, amount: 5000 },
  { invoice_ref: 'A-INV1', product_name: 'Azithromycin 500mg', batch_number: 'AZM-2402', expiry_date: '2027-06-30',
    quantity: 100, mrp: 110, rate: 100, discount_percent: 0, gst_percent: 12, amount: 10000 },
  { invoice_ref: 'A-INV1', product_name: 'Cetirizine 10mg', batch_number: 'CTZ-2401', expiry_date: '2028-01-31',
    quantity: 500, mrp: 25, rate: 20, discount_percent: 0, gst_percent: 12, amount: 10000 },

  // A-INV2
  { invoice_ref: 'A-INV2', product_name: 'Amoxicillin 250mg', batch_number: 'AMX-2403', expiry_date: '2027-09-30',
    quantity: 300, mrp: 65, rate: 60, discount_percent: 0, gst_percent: 12, amount: 18000 },

  // A-INV3
  { invoice_ref: 'A-INV3', product_name: 'Vitamin D3 60K', batch_number: 'VTD-2401', expiry_date: '2028-03-31',
    quantity: 50, mrp: 280, rate: 250, discount_percent: 0, gst_percent: 12, amount: 12500 },

  // R-INV1 (retail walk-in)
  { invoice_ref: 'R-INV1', product_name: 'Paracetamol 500mg', batch_number: 'PCM-2401', expiry_date: '2027-08-31',
    quantity: 15, mrp: 30, rate: 30, discount_percent: 0, gst_percent: 12, amount: 450 },

  // V-INV1
  { invoice_ref: 'V-INV1', product_name: 'Pantoprazole 40mg', batch_number: 'PNT-2401', expiry_date: '2027-12-31',
    quantity: 100, mrp: 95, rate: 80, discount_percent: 0, gst_percent: 12, amount: 8000 },

  // V-INV2
  { invoice_ref: 'V-INV2', product_name: 'Atorvastatin 10mg', batch_number: 'ATR-2401', expiry_date: '2028-02-28',
    quantity: 200, mrp: 85, rate: 75, discount_percent: 0, gst_percent: 12, amount: 15000 },

  // L-INV1
  { invoice_ref: 'L-INV1', product_name: 'Insulin Glargine Pen', batch_number: 'ING-2401', expiry_date: '2027-04-30',
    quantity: 3, mrp: 600, rate: 550, discount_percent: 0, gst_percent: 12, amount: 1650 },

  // S-INV1
  { invoice_ref: 'S-INV1', product_name: 'IV Saline 500ml', batch_number: 'NSL-2401', expiry_date: '2027-06-30',
    quantity: 500, mrp: 90, rate: 80, discount_percent: 0, gst_percent: 12, amount: 40000 },
  { invoice_ref: 'S-INV1', product_name: 'Surgical Gloves L', batch_number: 'SGL-2401', expiry_date: '2030-12-31',
    quantity: 1000, mrp: 12, rate: 10, discount_percent: 0, gst_percent: 18, amount: 10000 },
  { invoice_ref: 'S-INV1', product_name: 'Syringe 5ml Disposable', batch_number: 'SYR-2401', expiry_date: '2029-12-31',
    quantity: 2500, mrp: 6, rate: 5, discount_percent: 0, gst_percent: 18, amount: 12500 },
  { invoice_ref: 'S-INV1', product_name: 'Cefixime 200mg', batch_number: 'CFX-2402', expiry_date: '2027-10-31',
    quantity: 250, mrp: 130, rate: 110, discount_percent: 0, gst_percent: 12, amount: 27500 },

  // S-INV2
  { invoice_ref: 'S-INV2', product_name: 'IV Saline 500ml', batch_number: 'NSL-2402', expiry_date: '2027-08-31',
    quantity: 600, mrp: 90, rate: 80, discount_percent: 0, gst_percent: 12, amount: 48000 },
  { invoice_ref: 'S-INV2', product_name: 'Surgical Mask N95', batch_number: 'MSK-2401', expiry_date: '2029-06-30',
    quantity: 1000, mrp: 25, rate: 19, discount_percent: 0, gst_percent: 18, amount: 19000 },

  // AR-INV1
  { invoice_ref: 'AR-INV1', product_name: 'Multivitamin Tab', batch_number: 'MVT-2401', expiry_date: '2027-11-30',
    quantity: 30, mrp: 28, rate: 26, discount_percent: 0, gst_percent: 12, amount: 780 },
]

// ─── Payments ────────────────────────────────────────────────────────────────
// receipt_number preserves the legacy receipt id (e.g. from the old POS or
// manual receipt book). reference_number is the bank/UPI/UTR/cheque reference
// — two separate fields because a single payment carries both.
const payments = [
  { customer_code: 'C001', date: '2026-04-15', amount: 28000, payment_mode: 'UPI',
    reference_number: 'UTR-2026041500123', receipt_number: 'RCPT/25-26/0312', notes: 'Settles HS/25-26/0421' },
  { customer_code: 'C001', date: '2026-05-02', amount: 10000, payment_mode: 'UPI',
    reference_number: 'UTR-2026050200876', receipt_number: 'RCPT/25-26/0331', notes: 'Part payment HS/25-26/0438' },
  { customer_code: 'C002', date: '2026-05-02', amount: 500, payment_mode: 'CASH',
    reference_number: '', receipt_number: 'RCPT/25-26/0332', notes: '' },
  { customer_code: 'C004', date: '2026-04-19', amount: 8960, payment_mode: 'UPI',
    reference_number: 'UTR-2026041900445', receipt_number: 'RCPT/25-26/0315', notes: 'HS/25-26/0429 settlement' },
  { customer_code: 'C004', date: '2026-05-10', amount: 5000, payment_mode: 'UPI',
    reference_number: 'UTR-2026051001112', receipt_number: 'RCPT/25-26/0339', notes: 'Part payment HS/25-26/0461' },
  { customer_code: 'C006', date: '2026-04-20', amount: 93460, payment_mode: 'UPI',
    reference_number: 'NEFT-AXIS-202604200012', receipt_number: 'RCPT/25-26/0316', notes: 'HS/25-26/0426 full' },
  { customer_code: 'C006', date: '2026-04-30', amount: 30000, payment_mode: 'UPI',
    reference_number: 'NEFT-AXIS-202604300087', receipt_number: 'RCPT/25-26/0325', notes: 'Advance against May orders' },
  { customer_code: 'C007', date: '2026-05-12', amount: 870, payment_mode: 'CARD',
    reference_number: 'POS-RAZORPAY-XYZ123', receipt_number: 'RCPT/25-26/0341', notes: '' },
]

// ─── Activities ──────────────────────────────────────────────────────────────
const activities = [
  { customer_code: 'C001', type: 'CALL', title: '', notes: 'Called to confirm April month-end balance.',
    occurred_at: '2026-04-30', due_at: '', contact_name: 'Asha (owner)', subject: '', status: '' },
  { customer_code: 'C001', type: 'WHATSAPP', title: '', notes: 'Sent April invoice PDFs.',
    occurred_at: '2026-04-12', due_at: '', contact_name: 'Asha (owner)', subject: '', status: '' },
  { customer_code: 'C001', type: 'REMINDER', title: 'Collect A-INV3 payment', notes: '14k pending on May invoice',
    occurred_at: '', due_at: '2026-05-25', contact_name: '', subject: '', status: 'PENDING' },
  { customer_code: 'C003', type: 'EMAIL', title: '', notes: 'Sent monthly stock catalogue.',
    occurred_at: '2026-05-01', due_at: '', contact_name: 'Dr. Priya', subject: 'May 2026 catalogue', status: '' },
  { customer_code: 'C004', type: 'CALL', title: '', notes: 'Follow-up on V-INV2 balance.',
    occurred_at: '2026-05-15', due_at: '', contact_name: 'Vinayaka (owner)', subject: '', status: '' },
  { customer_code: 'C005', type: 'NOTE', title: '', notes: 'Customer prefers insulin pickup on 1st of every month.',
    occurred_at: '2026-04-25', due_at: '', contact_name: '', subject: '', status: '' },
  { customer_code: 'C005', type: 'REMINDER', title: 'Insulin refill due', notes: 'Next pickup ~1-June',
    occurred_at: '', due_at: '2026-06-01', contact_name: '', subject: '', status: 'PENDING' },
  { customer_code: 'C006', type: 'CALL', title: '', notes: 'Discussed expanding to surgical disposables line.',
    occurred_at: '2026-04-18', due_at: '', contact_name: 'Accounts, Sanjeevini', subject: '', status: '' },
  { customer_code: 'C006', type: 'REMINDER', title: 'S-INV2 due', notes: 'NET-30 — due 5 June',
    occurred_at: '', due_at: '2026-06-05', contact_name: '', subject: '', status: 'PENDING' },
  { customer_code: 'C008', type: 'NOTE', title: '', notes: 'Doctor visits clinic 4–6 PM, best time to call.',
    occurred_at: '2026-05-10', due_at: '', contact_name: '', subject: '', status: '' },
]

// ─── Quotations ──────────────────────────────────────────────────────────────
// One quotation per customer where reasonable, covering the full status set
// so the Quotations tab can be visually verified across the lifecycle.
const quotations = [
  // Asha Medical Stores — accepted quote that became A-INV1
  { customer_code: 'C001', quotation_ref: 'Q-A1', quotation_number: 'QTN/25-26/0112', date: '2026-04-05', valid_until: '2026-05-05',
    subtotal: 25000, cgst: 1500, sgst: 1500, delivery_charge: 0, total: 28000, status: 'CONVERTED',
    notes: 'Approved and billed as HS/25-26/0421' },
  // Vinayaka — pending acceptance
  { customer_code: 'C004', quotation_ref: 'Q-V1', quotation_number: 'QTN/25-26/0125', date: '2026-04-12', valid_until: '2026-05-12',
    subtotal: 15000, cgst: 900, sgst: 900, delivery_charge: 0, total: 16800, status: 'SENT',
    notes: 'Awaiting customer confirmation' },
  // Sanjeevini Hospital — rejected (over budget)
  { customer_code: 'C006', quotation_ref: 'Q-S1', quotation_number: 'QTN/25-26/0131', date: '2026-04-08', valid_until: '2026-04-30',
    subtotal: 110000, cgst: 6600, sgst: 6600, delivery_charge: 0, total: 123200, status: 'REJECTED',
    notes: 'Customer wanted 5% discount; not approved.' },
  // Sanjeevini Hospital — accepted, became S-INV1
  { customer_code: 'C006', quotation_ref: 'Q-S2', quotation_number: 'QTN/25-26/0138', date: '2026-04-12', valid_until: '2026-04-22',
    subtotal: 85000, cgst: 5100, sgst: 5100, delivery_charge: 500, total: 95700, status: 'ACCEPTED',
    notes: 'Revised quote — accepted, billed as HS/25-26/0426' },
  // Apollo-style draft (Dr. Priya Nair as a doctor customer)
  { customer_code: 'C003', quotation_ref: 'Q-D1', quotation_number: 'QTN/25-26/0142', date: '2026-05-02', valid_until: '2026-06-02',
    subtotal: 6000, cgst: 360, sgst: 360, delivery_charge: 0, total: 6720, status: 'DRAFT',
    notes: 'Internal draft, not yet sent.' },
]

const quotationItems = [
  // Q-A1
  { quotation_ref: 'Q-A1', product_name: 'Paracetamol 500mg', quantity: 200, mrp: 30, rate: 25, discount_percent: 0, gst_percent: 12, amount: 5000 },
  { quotation_ref: 'Q-A1', product_name: 'Azithromycin 500mg', quantity: 100, mrp: 110, rate: 100, discount_percent: 0, gst_percent: 12, amount: 10000 },
  { quotation_ref: 'Q-A1', product_name: 'Cetirizine 10mg', quantity: 500, mrp: 25, rate: 20, discount_percent: 0, gst_percent: 12, amount: 10000 },
  // Q-V1
  { quotation_ref: 'Q-V1', product_name: 'Atorvastatin 10mg', quantity: 200, mrp: 85, rate: 75, discount_percent: 0, gst_percent: 12, amount: 15000 },
  // Q-S1 (rejected — bigger basket)
  { quotation_ref: 'Q-S1', product_name: 'IV Saline 500ml', quantity: 800, mrp: 90, rate: 80, discount_percent: 0, gst_percent: 12, amount: 64000 },
  { quotation_ref: 'Q-S1', product_name: 'Surgical Gloves L', quantity: 2000, mrp: 12, rate: 10, discount_percent: 0, gst_percent: 18, amount: 20000 },
  { quotation_ref: 'Q-S1', product_name: 'Cefixime 200mg', quantity: 240, mrp: 130, rate: 110, discount_percent: 0, gst_percent: 12, amount: 26000 },
  // Q-S2 (accepted)
  { quotation_ref: 'Q-S2', product_name: 'IV Saline 500ml', quantity: 500, mrp: 90, rate: 80, discount_percent: 0, gst_percent: 12, amount: 40000 },
  { quotation_ref: 'Q-S2', product_name: 'Surgical Gloves L', quantity: 1000, mrp: 12, rate: 10, discount_percent: 0, gst_percent: 18, amount: 10000 },
  { quotation_ref: 'Q-S2', product_name: 'Cefixime 200mg', quantity: 250, mrp: 130, rate: 110, discount_percent: 0, gst_percent: 12, amount: 27500 },
  // Q-D1
  { quotation_ref: 'Q-D1', product_name: 'Multivitamin Tab', quantity: 200, mrp: 28, rate: 26, discount_percent: 0, gst_percent: 12, amount: 5200 },
]

// ─── Credit Notes ────────────────────────────────────────────────────────────
// Each credit note MUST reference an invoice we created above (by its
// invoice_number). Coverage across the SettlementMode enum so the Credit
// Notes tab shows variety.
const creditNotes = [
  // Asha — small damaged-stock return, settled via CREDIT
  { customer_code: 'C001', credit_note_ref: 'CN-A1', credit_note_no: 'CN/25-26/0007', invoice_number: 'HS/25-26/0421',
    date: '2026-04-20', reason: 'Damaged stock (2 strips)', subtotal: 500, cgst: 30, sgst: 30, igst: 0,
    total_amount: 560, settlement_mode: 'CREDIT', notes: 'Adjusted against next bill.' },
  // Vinayaka — full reversal via REFUND
  { customer_code: 'C004', credit_note_ref: 'CN-V1', credit_note_no: 'CN/25-26/0011', invoice_number: 'HS/25-26/0429',
    date: '2026-04-22', reason: 'Wrong SKU shipped', subtotal: 1200, cgst: 72, sgst: 72, igst: 0,
    total_amount: 1344, settlement_mode: 'REFUND', notes: 'UPI refund issued same day.' },
  // Sanjeevini — partial REPLACEMENT
  { customer_code: 'C006', credit_note_ref: 'CN-S1', credit_note_no: 'CN/25-26/0014', invoice_number: 'HS/25-26/0426',
    date: '2026-04-25', reason: 'Near-expiry batch — replacement', subtotal: 4000, cgst: 240, sgst: 240, igst: 0,
    total_amount: 4480, settlement_mode: 'REPLACEMENT', notes: 'Fresh batch delivered against same invoice.' },
]

const creditNoteItems = [
  // CN-A1: 2 strips of Paracetamol
  { credit_note_ref: 'CN-A1', product_name: 'Paracetamol 500mg', batch_number: 'PCM-2401', expiry_date: '2027-08-31',
    returned_qty: 20, rate: 25, gst_percent: 12, amount: 500 },
  // CN-V1: full reversal — 15 strips Pantoprazole returned
  { credit_note_ref: 'CN-V1', product_name: 'Pantoprazole 40mg', batch_number: 'PNT-2401', expiry_date: '2027-12-31',
    returned_qty: 15, rate: 80, gst_percent: 12, amount: 1200 },
  // CN-S1: 50 saline bottles replaced
  { credit_note_ref: 'CN-S1', product_name: 'IV Saline 500ml', batch_number: 'NSL-2401', expiry_date: '2027-06-30',
    returned_qty: 50, rate: 80, gst_percent: 12, amount: 4000 },
]

// ─── Prescriptions ───────────────────────────────────────────────────────────
const prescriptions = [
  { customer_code: 'C003', doctor_name: 'Dr. Priya Nair', notes: 'Reference Rx — generic antibiotics block.',
    valid_until: '2026-11-01' },
  { customer_code: 'C005', doctor_name: 'Dr. Mohan Rao', notes: 'Insulin Glargine 22u OD',
    valid_until: '2026-10-25' },
  { customer_code: 'C007', doctor_name: 'Dr. Mohan Rao', notes: 'Multivitamin 1-OD x 30 days',
    valid_until: '2026-08-12' },
  { customer_code: 'C008', doctor_name: 'Dr. Mohan Rao', notes: 'Anti-diabetic refill, monthly.',
    valid_until: '2026-11-15' },
]

// ─── Instructions sheet (matches the in-app template) ────────────────────────
const instructions = [
  ['Field', 'Notes'],
  ['HOSPITAL SUPPLIERS — Sample Customer Import', ''],
  ['', ''],
  ['How to use', 'Open this workbook in Excel or LibreOffice. Edit rows as you like, then upload via Customers → Import.'],
  ['', ''],
  ['Sheet: Customers', 'One row per customer. customer_code (e.g. C001) is YOUR own reference used to link this customer to its invoices/payments/activities/prescriptions in the other sheets.'],
  ['Sheet: Invoices', 'One row per past invoice. invoice_ref (e.g. A-INV1) links to line items in the Invoice Items sheet. Leave invoice_number blank to auto-generate.'],
  ['Sheet: Invoice Items', 'Line items linked to an Invoices row by invoice_ref. Optional — header-only invoices are accepted.'],
  ['Sheet: Payments', 'Past receipts. Recorded as historical entries; opening balance is set via Customers.opening_balance.'],
  ['Sheet: Activities', 'Call / WhatsApp / email / note / reminder log.'],
  ['Sheet: Prescriptions', 'Doctor name + validity. File uploads must be added after import via the customer detail page.'],
  ['', ''],
  ['customer.type', 'RETAIL · WHOLESALE · DOCTOR'],
  ['invoice.status', 'DRAFT · PAID · UNPAID · PARTIAL · RETURNED · CANCELLED'],
  ['invoice.payment_mode', 'CASH · CARD · UPI · CREDIT · SPLIT'],
  ['activity.type', 'CALL · WHATSAPP · EMAIL · NOTE · REMINDER'],
  ['activity.status', 'PENDING · DONE · CANCELLED (REMINDER only)'],
  ['Dates', 'YYYY-MM-DD recommended. dd/mm/yyyy and Excel date cells also accepted.'],
  ['Money', 'Plain numbers — no ₹ symbols or commas.'],
  ['', ''],
  ['This sample contains', `${customers.length} customers · ${invoices.length} invoices · ${invoiceItems.length} invoice items · ${payments.length} payments · ${activities.length} activities · ${prescriptions.length} prescriptions · ${quotations.length} quotations · ${quotationItems.length} quotation items · ${creditNotes.length} credit notes · ${creditNoteItems.length} credit-note items`],
]

// ─── Build the workbook ──────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()
// Small helper — build a sheet from data + columns + apply formatting.
const addSheet = (name, data, columns, tabColor) => {
  const ws = XLSX.utils.json_to_sheet(data, { header: columns })
  applySheetFormatting(ws, { columns, tabColor })
  XLSX.utils.book_append_sheet(wb, ws, name)
}

const instructionsWs = XLSX.utils.aoa_to_sheet(instructions)
applyInstructionsFormatting(instructionsWs, SHEET_COLORS.instructions)
XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions')

addSheet('Customers',       customers,      CUSTOMER_COLUMNS,       SHEET_COLORS.customers)
addSheet('Invoices',        invoices,       INVOICE_COLUMNS,        SHEET_COLORS.invoices)
addSheet('Invoice Items',   invoiceItems,   INVOICE_ITEM_COLUMNS,   SHEET_COLORS.invoiceItems)
addSheet('Payments',        payments,       PAYMENT_COLUMNS,        SHEET_COLORS.payments)
addSheet('Activities',      activities,     ACTIVITY_COLUMNS,       SHEET_COLORS.activities)
addSheet('Prescriptions',   prescriptions,  PRESCRIPTION_COLUMNS,   SHEET_COLORS.prescriptions)
addSheet('Quotations',      quotations,     QUOTATION_COLUMNS,      SHEET_COLORS.quotations)
addSheet('Quotation Items', quotationItems, QUOTATION_ITEM_COLUMNS, SHEET_COLORS.quotationItems)
addSheet('Credit Notes',    creditNotes,    CREDIT_NOTE_COLUMNS,    SHEET_COLORS.creditNotes)
addSheet('Credit Note Items', creditNoteItems, CREDIT_NOTE_ITEM_COLUMNS, SHEET_COLORS.creditNoteItems)

const outPath = path.resolve(__dirname, '..', '..', 'sample-customer-import.xlsx')
XLSX.writeFile(wb, outPath)
console.log('Wrote:', outPath)
console.log(`  ${customers.length} customers`)
console.log(`  ${invoices.length} invoices, ${invoiceItems.length} items`)
console.log(`  ${payments.length} payments`)
console.log(`  ${activities.length} activities`)
console.log(`  ${prescriptions.length} prescriptions`)
console.log(`  ${quotations.length} quotations, ${quotationItems.length} quotation items`)
console.log(`  ${creditNotes.length} credit notes, ${creditNoteItems.length} credit-note items`)
