import { formatDate } from '@/lib/utils'

// Row shapes consumed by the export builder below — mirror the fields that
// ProductHistoryPage / ProductDetailContent already derive per tab (see their
// `salesRows` / `purchaseRows` / `timeline` memos). Kept loose (only the
// fields actually read here) so both pages' slightly different row unions
// satisfy this without extra casting.
interface SalesExportSource {
  isReturn: boolean
  date: Date
  ref: string
  party: string
  batch: string
  qty: number
  rate: number
  amount: number
  gst: number
  status: string
}

interface PurchasesExportSource {
  isReturn: boolean
  date: Date
  ref: string
  party: string
  batch: string
  qty: number
  purchaseRate: number
  amount: number
  status: string
}

interface TimelineExportSource {
  type: string
  date: Date
  ref: string
  party: string
  batch: string
  qty: number
  amount: number
  runningStock: number
}

export type ProductHistoryExportTab = 'sales' | 'purchases' | 'timeline' | 'overview'

/**
 * Build the flat export rows for whichever product-history tab is active.
 * Shared by ProductHistoryPage (full page) and ProductDetailContent (split
 * panel) — both previously duplicated this exact per-tab mapping in their own
 * `handleExport`. `overview` (only reachable from ProductDetailContent, which
 * hides its export action on that tab) returns no rows.
 */
export function buildProductHistoryExportRows(
  activeTab: ProductHistoryExportTab,
  filteredSales: SalesExportSource[],
  filteredPurchases: PurchasesExportSource[],
  filteredTimeline: TimelineExportSource[],
): Record<string, unknown>[] {
  if (activeTab === 'sales') {
    return filteredSales.map((r) => ({
      Type: r.isReturn ? 'Sales Return' : 'Sale',
      Date: formatDate(r.date.toISOString()),
      Ref: r.ref,
      Party: r.party,
      Batch: r.batch,
      Qty: r.isReturn ? `+${r.qty}` : `-${r.qty}`,
      Rate: r.rate,
      Amount: r.amount,
      'GST%': r.gst,
      Status: r.status,
    }))
  }
  if (activeTab === 'purchases') {
    return filteredPurchases.map((r) => ({
      Type: r.isReturn ? 'Purchase Return' : 'Purchase',
      Date: formatDate(r.date.toISOString()),
      Ref: r.ref,
      Party: r.party,
      Batch: r.batch,
      Qty: r.isReturn ? `-${r.qty}` : `+${r.qty}`,
      Rate: r.purchaseRate,
      Amount: r.amount,
      Status: r.status,
    }))
  }
  if (activeTab === 'timeline') {
    return filteredTimeline.map((r) => ({
      Type: r.type,
      Date: formatDate(r.date.toISOString()),
      Ref: r.ref,
      Party: r.party,
      Batch: r.batch,
      Qty: r.qty,
      Amount: r.amount,
      Stock: r.runningStock,
    }))
  }
  return []
}

// Tab-aware PDF/Print heading, e.g. "Sales & Returns — Paracetamol 500mg".
export function productHistoryExportTitle(activeTab: ProductHistoryExportTab, productName: string): string {
  const tabLabel =
    activeTab === 'sales' ? 'Sales & Returns'
      : activeTab === 'purchases' ? 'Purchases & Returns'
        : 'Timeline'
  return `${tabLabel} — ${productName}`
}

// Filename-safe slug matching the pre-existing `product-${tab}-${name}` convention.
export function productHistoryExportFilename(activeTab: ProductHistoryExportTab, productName: string): string {
  return `product-${activeTab}-${productName.replace(/\s+/g, '-').toLowerCase()}`
}
