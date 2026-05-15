export type UserRole = 'ADMIN' | 'PHARMACIST' | 'INVENTORY_MANAGER' | 'ACCOUNTANT' | 'SALESPERSON'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole
  avatar?: string
  isActive: boolean
  lastLogin?: string
  commissionRate?: number
}

export interface Salesperson {
  id: string
  name: string
  email: string
  phone: string
  isActive: boolean
  commissionRate: number
  branchId?: string
  lastLogin?: string
  createdAt: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  alternatePhone?: string
  email?: string
  address?: string
  type: 'RETAIL' | 'WHOLESALE' | 'DOCTOR'
  doctorRef?: string
  referredBy?: string
  creditLimit: number
  currentOutstanding: number
  loyaltyPoints: number
  gstin?: string
  dlNumber?: string
  notes?: string
  createdAt: string
  pendingCreditCount?: number   // number of CREDIT/PARTIAL invoices
}

export interface Supplier {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  gstin: string
  drugLicense: string
  address: string
  paymentTerms: 'NET_30' | 'NET_45' | 'NET_60'
  bankDetails?: string
  isActive: boolean
  branchId?: string | null
  // Each supplier row is branch-scoped, so this field is naturally that
  // branch's outstanding — no need for a separate per-branch field.
  currentOutstanding?: number
}

export interface Category {
  id: string
  name: string
  description?: string
  color?: string
  isActive: boolean
  _count?: { products: number }
}

export interface Product {
  id: string
  name: string
  genericName: string
  saltComposition?: string
  manufacturer: string
  categoryId?: string
  category?: Category | string
  subCategory?: string
  packSize: string
  unitOfMeasure: string
  schedule: 'NONE' | 'H' | 'H1' | 'X'
  hsnCode: string
  isNarcotic: boolean
  storageCondition: 'ROOM_TEMP' | 'COOL_DRY' | 'REFRIGERATED' | 'FROZEN'
  mrp: number
  purchaseRate: number
  sellingRate: number
  wholesaleRate: number
  gstRate: number
  minStock: number
  maxStock: number
  reorderQty: number
  rackLocation: string
  barcode?: string
  alternatives?: string[]
  interactions?: string[]
  totalStock: number
}

export interface Batch {
  id: string
  productId: string
  batchNumber: string
  mfgDate: string
  expiryDate: string
  quantity: number
  mrp: number
  purchaseRate: number
  supplierId: string
  productName?: string
}

export interface InvoiceItem {
  id: string
  productId: string
  productName: string
  batchId: string
  batchNumber: string
  expiryDate: string
  quantity: number
  mrp: number
  rate: number
  discountPercent: number
  gstPercent: number
  amount: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  date: string
  type: 'INVOICE' | 'QUOTATION'
  billingType: 'RETAIL' | 'WHOLESALE'
  customerId?: string
  customerName: string
  doctorName?: string
  items: InvoiceItem[]
  subtotal: number
  productDiscount: number
  taxableAmount: number
  cgst: number
  sgst: number
  igst: number
  deliveryCharge?: number
  roundOff: number
  grandTotal: number
  paymentMode: 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT'
  paymentDetails?: Record<string, unknown>
  status: 'DRAFT' | 'PAID' | 'UNPAID' | 'PARTIAL' | 'RETURNED' | 'CANCELLED'
  amountPaid: number
  changeReturned: number
  salespersonId?: string
  salespersonName?: string
  createdBy: string
  createdAt: string
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  date: string
  supplierId: string
  supplierName: string
  items: PurchaseOrderItem[]
  totalAmount: number
  status: 'DRAFT' | 'SENT' | 'ACKNOWLEDGED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CLOSED'
  expectedDelivery: string
  createdBy: string
}

export interface PurchaseOrderItem {
  id: string
  productId: string
  productName: string
  requiredQty: number
  lastPurchaseRate: number
  expectedRate: number
  receivedQty: number
  remarks?: string
}

export interface GRNItem {
  id: string
  productId: string
  productName: string
  orderedQty: number
  receivedQty: number
  freeQty: number
  batchNumber: string
  mfgDate: string
  expiryDate: string
  purchaseRate: number
  mrp: number
  damageQty: number
}

export interface GRN {
  id: string
  grnNumber: string
  date: string
  poId?: string
  supplierId: string
  supplierName: string
  supplierInvoiceNo: string
  supplierInvoiceDate: string
  supplierInvoiceAmount: number
  items: GRNItem[]
  totalAmount: number
  status: 'DRAFT' | 'RECEIVED' | 'VERIFIED'
  purchaseReturns?: Array<{
    id: string
    debitNoteNo: string
    settlementMode?: 'REFUND' | 'REPLACEMENT' | 'ADJUST'
    status: string
    reason: string
    items: Array<{ productId: string; returnedQty: number }>
  }>
}

export type ExpenseCategory =
  | 'RENT'
  | 'SALARY'
  | 'ELECTRICITY'
  | 'TRANSPORT'
  | 'INSURANCE'
  | 'MAINTENANCE'
  | 'TELEPHONE_INTERNET'
  | 'STATIONERY_PRINTING'
  | 'SOFTWARE_IT'
  | 'LICENSE_COMPLIANCE'
  | 'MISCELLANEOUS'

export type ExpensePaymentMode = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'

export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  description: string
  amount: number
  paymentMode: ExpensePaymentMode
  receiptImage?: string
}

export interface ActivityItem {
  id: string
  user: string
  userAvatar?: string
  action: string
  timestamp: string
  type: 'SALE' | 'PURCHASE' | 'STOCK' | 'PAYMENT' | 'SYSTEM' | 'CUSTOMER'
}

export interface Notification {
  id: string
  title: string
  message: string
  type: 'LOW_STOCK' | 'EXPIRY' | 'PAYMENT_DUE' | 'SYSTEM' | 'APPROVAL'
  isRead: boolean
  timestamp: string   // mapped from createdAt on fetch
  createdAt?: string
  actionUrl?: string
  branchId?: string
  snoozedUntil?: string | null
  resolvedAt?: string | null
  resolvedById?: string | null
}

export type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT'
export type BillingType = 'RETAIL' | 'WHOLESALE'

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED'

export interface QuotationItem {
  id: string
  productId?: string
  productName: string
  batchId?: string
  batchNumber?: string
  quantity: number
  mrp?: number
  rate: number
  discountPercent?: number
  gstPercent?: number
  amount: number
}

export interface Quotation {
  id: string
  quotationNumber: string
  date: string
  customerId?: string
  customerName: string
  customerPhone?: string
  items: QuotationItem[]
  subtotal: number
  cgst: number
  sgst: number
  deliveryCharge?: number
  total: number
  validUntil?: string
  notes?: string
  status: QuotationStatus
  createdAt: string
  updatedAt: string
}

