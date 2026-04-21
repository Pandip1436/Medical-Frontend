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
  type: 'WALK_IN' | 'REGULAR' | 'HOSPITAL' | 'WHOLESALE' | 'DOCTOR'
  doctorRef?: string
  creditLimit: number
  currentOutstanding: number
  loyaltyPoints: number
  gstin?: string
  dlNumber?: string
  notes?: string
  createdAt: string
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
}

export interface Product {
  id: string
  name: string
  genericName: string
  saltComposition?: string
  manufacturer: string
  category: 'NEPHROLOGY' | 'ONCOLOGY' | 'GENERAL' | 'OTC' | 'SURGICAL'
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
  roundOff: number
  grandTotal: number
  paymentMode: 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT'
  paymentDetails?: Record<string, unknown>
  status: 'DRAFT' | 'PAID' | 'CREDIT' | 'PARTIAL' | 'RETURNED' | 'CANCELLED'
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
  timestamp: string
  actionUrl?: string
}

export type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT'
export type BillingType = 'RETAIL' | 'WHOLESALE'
