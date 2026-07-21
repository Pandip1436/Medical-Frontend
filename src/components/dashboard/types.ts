import type { LucideIcon } from 'lucide-react'

export type DateRangePreset = 'month' | '6m' | 'year'

export interface OverdueCustomer {
  customerId: string
  customerName: string
  customerPhone?: string | null
  overdueAmount: number
  daysOverdue: number
  // The invoice that fell due first — where the Due row navigates when this
  // customer has a single overdue invoice.
  oldestInvoiceId?: string
  oldestInvoiceNumber?: string
  invoiceCount: number
}

export interface LowStockItem {
  id: string
  name: string
  packSize: string
  totalStock: number
  minStock: number
}

export interface ExpiringBatch {
  id: string
  batchNumber: string
  expiryDate: string
  quantity: number
  product: { name: string; packSize: string }
}

export interface DateRange {
  preset: DateRangePreset
  /** YYYY-MM-DD — selected month/year anchor. For 'month' it's the month shown;
   *  for '6m' it's the end month of the 6-month window; for 'year' only the year matters. */
  anchor: string
}

export interface KpiDelta {
  pct: number
  dir: 'up' | 'down' | 'flat'
}

export interface KpiTileData {
  key: string
  title: string
  value: number
  subtitle: string
  icon: LucideIcon
  iconBg: string
  iconColor: string
  sparkColor: string
  href: string
  isCurrency?: boolean
  delta?: KpiDelta
  sparkline?: number[]
}

export interface ActivityItem {
  id: string
  type: 'SALE' | 'PURCHASE' | 'STOCK' | 'PAYMENT' | 'CUSTOMER' | 'SYSTEM'
  // Short label shown in the row (e.g. invoice number)
  action: string
  // Optional secondary context revealed on hover (e.g. customer name)
  detail?: string
  timestamp: string
  user?: string
  // Optional deep-link target. When set, the row becomes clickable.
  href?: string
}
