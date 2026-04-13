export type UserRole = 'admin' | 'pharmacist' | 'inventory_manager' | 'accountant'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole
  avatar?: string
  isActive: boolean
  lastLogin?: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  alternatePhone?: string
  email?: string
  address?: string
  type: 'walk-in' | 'regular' | 'hospital' | 'wholesale' | 'doctor'
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
  manufacturer: string
  category: 'nephrology' | 'oncology' | 'general' | 'otc' | 'surgical'
  subCategory?: string
  packSize: string
  unitOfMeasure: string
  schedule: 'none' | 'H' | 'H1' | 'X'
  hsnCode: string
  isNarcotic: boolean
  storageCondition: 'room_temp' | 'cool_dry' | 'refrigerated' | 'frozen'
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
  type: 'invoice' | 'quotation'
  billingType: 'retail' | 'wholesale'
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
  paymentMode: 'cash' | 'card' | 'upi' | 'credit' | 'split'
  paymentDetails?: Record<string, unknown>
  status: 'draft' | 'paid' | 'credit' | 'partial' | 'returned' | 'cancelled'
  amountPaid: number
  changeReturned: number
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
  status: 'draft' | 'sent' | 'acknowledged' | 'partially_received' | 'fully_received' | 'closed'
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
  status: 'draft' | 'received' | 'verified'
}

export interface Expense {
  id: string
  date: string
  category: string
  description: string
  amount: number
  paymentMode: string
  receiptImage?: string
}

export interface ActivityItem {
  id: string
  user: string
  userAvatar?: string
  action: string
  timestamp: string
  type: 'sale' | 'purchase' | 'stock' | 'payment' | 'system' | 'customer'
}

export interface Notification {
  id: string
  title: string
  message: string
  type: 'low_stock' | 'expiry' | 'payment_due' | 'system' | 'approval'
  isRead: boolean
  timestamp: string
  actionUrl?: string
}

export type PaymentMode = 'cash' | 'card' | 'upi' | 'credit' | 'split'
export type BillingType = 'retail' | 'wholesale'
