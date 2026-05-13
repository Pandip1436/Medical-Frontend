import type { LucideIcon } from 'lucide-react'

export type DateRangePreset = 'week' | 'month' | 'year'

export interface OverdueCustomer {
  customerId: string
  customerName: string
  overdueAmount: number
  daysOverdue: number
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
  from?: string
  to?: string
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
