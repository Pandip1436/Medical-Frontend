export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'PHARMACIST' | 'INVENTORY_MANAGER' | 'ACCOUNTANT' | 'SALESPERSON'

export interface UserBranchRef {
  id: string
  name: string
  code: string
}

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole // primary role (highest-precedence of `roles`) — kept for display
  roles?: UserRole[] // full role set — drives all permission checks
  branchId?: string | null // home/default branch
  branchIds?: string[] // allowed branch set (empty for SUPER_ADMIN = all)
  branches?: UserBranchRef[]
  isSuperAdmin?: boolean
  avatar?: string
  isActive: boolean
  lastLogin?: string
  commissionRate?: number
}

// Highest privilege first — mirrors the backend ROLE_PRECEDENCE.
export const ROLE_PRECEDENCE: UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'SALESPERSON',
]

/** The full role set for a user, falling back to the singular `role`. */
export function userRoles(user: Pick<User, 'roles' | 'role'> | null | undefined): UserRole[] {
  if (!user) return []
  return user.roles?.length ? user.roles : (user.role ? [user.role] : [])
}

/** Highest-precedence role — used for display and default landing route. */
export function primaryRole(user: Pick<User, 'roles' | 'role'> | null | undefined): UserRole | undefined {
  const roles = userRoles(user)
  return ROLE_PRECEDENCE.find((r) => roles.includes(r)) ?? roles[0]
}

/** True if the user has ADMIN or SUPER_ADMIN — gates admin-only UI. */
export function isAdminish(user: Pick<User, 'roles' | 'role'> | null | undefined): boolean {
  const roles = userRoles(user)
  return roles.includes('ADMIN') || roles.includes('SUPER_ADMIN')
}

export function isSuperAdmin(user: Pick<User, 'roles' | 'role'> | null | undefined): boolean {
  return userRoles(user).includes('SUPER_ADMIN')
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
  source?: string   // how the customer was acquired (Walk-in, Referral, …)
  creditLimit: number
  currentOutstanding: number
  gstin?: string
  dlNumber?: string
  notes?: string
  createdAt: string
  isActive?: boolean            // false = soft-disabled (deactivated)
  pendingCreditCount?: number   // number of CREDIT/PARTIAL invoices
  totalAmount?: number          // sum of grandTotal across real invoices
  paidAmount?: number           // sum of amountPaid across real invoices
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
  totalPurchases?: number   // Σ supplier-invoice amounts across the supplier's GRNs
  paidAmount?: number       // Σ amounts paid against those GRNs
  // Consent + alternate channel for low-stock WhatsApp alerts (mirrors the
  // pattern on Customer). Optional on the frontend so older API responses
  // that don't include them still type-check.
  whatsappOptIn?: boolean
  whatsappNumber?: string | null
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
  // Live JOIN from the Customer table on list/detail endpoints. Optional
  // because legacy / DRAFT records may pre-date the join, and walk-in flows
  // can have no customer attached.
  customerPhone?: string | null
  // Customer address / GSTIN — populated on the New Sale print path from the
  // selected customer so the printed PDF carries full bill-to details.
  customerAddress?: string | null
  customerGstin?: string | null
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
  // Credit-sale payment due date (ISO). Set on CREDIT invoices.
  dueDate?: string | null
  paymentDetails?: Record<string, unknown>
  status: 'DRAFT' | 'PAID' | 'UNPAID' | 'PARTIAL' | 'RETURNED' | 'CANCELLED'
  amountPaid: number
  changeReturned: number
  salespersonId?: string
  salespersonName?: string
  createdBy: string
  createdAt: string
  // True when this invoice was issued to fulfil a REPLACEMENT credit note
  // (a no-charge replacement). Surfaced by the billing list for badging.
  isReplacement?: boolean
  // The credit note this replacement invoice fulfils (detail page only).
  replacementForCreditNote?: string | null
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  date: string
  supplierId: string
  supplierName: string
  items: PurchaseOrderItem[]
  totalAmount: number
  status: 'DRAFT' | 'SENT' | 'ACKNOWLEDGED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CLOSED' | 'CANCELLED'
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
  // GST rate (%) for this line. Purchase rate is GST-inclusive; used to extract
  // the tax for the detail view / PDF. 0 on legacy rows (pre-inclusive-pricing).
  gstPercent?: number
  damageQty?: number
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
  isReplacement?: boolean
  amountPaid?: number
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID'
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
  type: 'LOW_STOCK' | 'EXPIRY' | 'PAYMENT_DUE' | 'SUPPLIER_PAYMENT_DUE' | 'SYSTEM' | 'APPROVAL'
  isRead: boolean
  timestamp: string   // mapped from createdAt on fetch
  createdAt?: string
  actionUrl?: string
  branchId?: string
  snoozedUntil?: string | null
  resolvedAt?: string | null
  resolvedById?: string | null
  // Per-type snapshot the backend stamps when generating the alert. Used by
  // the table view to surface numeric detail (current/min stock, days
  // outstanding, etc.) that isn't preserved in the free-text message.
  // See NotificationsService.generate*Alerts.
  entityState?: Record<string, unknown> | null
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

// ── Delivery Tracking ──────────────────────────────────────────
export type DeliveryStatus =
  | 'BOOKED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'ARRIVED_AT_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURNED'

export interface DeliveryEvent {
  id: string
  deliveryId: string
  status: DeliveryStatus
  location?: string | null
  note?: string | null
  occurredAt: string
  createdAt: string
}

export interface DeliveryTracking {
  id: string
  invoiceId: string
  invoiceNumber: string
  customerName: string
  mobileNumber?: string | null
  deliveryAddress?: string | null
  orderSummary?: string | null
  courierName?: string | null
  trackingId?: string | null
  dispatchDate?: string | null
  receiptName?: string | null
  ocrText?: string | null
  status: DeliveryStatus
  deliveredAt?: string | null
  carrierSlug?: string | null
  lastSyncedAt?: string | null
  branchId?: string | null
  createdById: string
  events: DeliveryEvent[]
  createdAt: string
  updatedAt: string
}

