import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Package,
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight,
  IndianRupee, BarChart3, ShoppingCart, Truck, GitMerge,
  RotateCcw, PackageX, PackagePlus, SquarePen, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { ProductDocumentDrawer, type ProductDocType } from '@/components/inventory/ProductDocumentDrawer'
import api from '@/lib/api'
import { usePageFilter } from '@/hooks/usePageFilter'
import { usePageSize } from '@/hooks/usePageSize'
import { useRoute, navigate, goBack } from '@/lib/router'
import { cn, formatCurrency } from '@/lib/utils'
import {
  buildProductHistoryExportRows,
  productHistoryExportFilename,
  productHistoryExportTitle,
} from './productHistoryExport'

// ─── Types ────────────────────────────────────────────────────
type ActiveTab = 'sales' | 'purchases' | 'timeline'

type PartyKind = 'customer' | 'supplier'

interface TimelineRow {
  type: 'SALE' | 'PURCHASE' | 'SALES_RETURN' | 'PURCHASE_RETURN'
  date: Date
  ref: string
  party: string
  partyPhone?: string
  partyId?: string
  partyKind: PartyKind
  batch: string
  qty: number      // positive = stock IN, negative = stock OUT
  amount: number
  runningStock: number
  note?: string    // e.g. reason or settlement mode
  docType: ProductDocType  // which document this row points at
  docId?: string           // parent document id for click-through
}

// Maps a timeline movement type → the document kind it links to.
const DOC_TYPE_OF: Record<TimelineRow['type'], ProductDocType> = {
  SALE: 'invoice',
  PURCHASE: 'grn',
  SALES_RETURN: 'credit-note',
  PURCHASE_RETURN: 'purchase-return',
}

// Distinct colour per movement type so all four read apart at a glance.
const TYPE_THEME: Record<TimelineRow['type'], { badge: string; qty: string }> = {
  SALE:            { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',       qty: 'text-rose-600 dark:text-rose-300' },
  PURCHASE:        { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', qty: 'text-emerald-600 dark:text-emerald-300' },
  SALES_RETURN:    { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',     qty: 'text-amber-600 dark:text-amber-300' },
  PURCHASE_RETURN: { badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',  qty: 'text-violet-600 dark:text-violet-300' },
}

// Navigate to the party's detail page (customer or supplier).
function goToParty(kind: PartyKind, id?: string) {
  if (!id) return
  navigate(kind === 'supplier' ? `/purchase/suppliers/detail?supplierId=${id}` : `/customers/detail?customerId=${id}`)
}

// ─── Stock status badge ──────────────────────────────────────
// Shown next to the product name in the header so the user immediately sees
// the alert state when arriving from a Low Stock notification.
function StockStatusBadge({ product }: { product: { totalStock: number; minStock: number } }) {
  if (product.totalStock <= 0) {
    return <Badge variant="destructive" size="sm">OUT OF STOCK</Badge>
  }
  if (product.minStock > 0 && product.totalStock <= product.minStock) {
    return <Badge variant="warning" size="sm">LOW STOCK</Badge>
  }
  return <Badge variant="success" size="sm">IN STOCK</Badge>
}

// ─── Tab button ────────────────────────────────────────────────
function TabButton({
  active, onClick, icon: Icon, label, count, color,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  count?: number
  color: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
        active
          ? `border-current ${color}`
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && (
        <span className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
          active ? 'bg-current/15' : 'bg-muted text-muted-foreground'
        )}>
          {count}
        </span>
      )}
    </button>
  )
}

export default function ProductHistoryPage() {
  const { search } = useRoute()

  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    const params = new URLSearchParams(search)
    return params.get('productId') ?? ''
  })
  const [history, setHistory] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = usePageFilter<ActiveTab>('inventory.productHistory', 'activeTab', 'timeline')

  // Shared search/date filters
  const [searchQuery, setSearchQuery] = usePageFilter<string>('inventory.productHistory', 'search', '')
  const [dateFrom, setDateFrom] = usePageFilter<string>('inventory.productHistory', 'dateFrom', '')
  const [dateTo, setDateTo] = usePageFilter<string>('inventory.productHistory', 'dateTo', '')
  const [batchFilter, setBatchFilter] = usePageFilter<string>('inventory.productHistory', 'batchFilter', 'all')
  const [sortOrder, setSortOrder] = usePageFilter<'desc' | 'asc'>('inventory.productHistory', 'sortOrder', 'desc')

  // Per-tab pagination
  const [salesPage, setSalesPage] = useState(1)
  const [purchasesPage, setPurchasesPage] = useState(1)
  const [timelinePage, setTimelinePage] = useState(1)
  const PAGE_SIZE = 50
  const [pageSize, setPageSize] = usePageSize('pbims.productHistory.pageSize', PAGE_SIZE)

  // Document drawer: clicking any history row opens the underlying document
  // (invoice / GRN / credit note / debit note) in-place for verification.
  const [activeDoc, setActiveDoc] = useState<{ docType: ProductDocType; docId: string } | null>(null)
  const openDoc = useCallback((docType?: ProductDocType, docId?: string) => {
    if (!docType || !docId) {
      toast.info('No linked document for this entry')
      return
    }
    setActiveDoc({ docType, docId })
  }, [])

  const loadHistory = useCallback(async (productId: string) => {
    if (!productId) return
    setLoading(true)
    setHistory(null)
    try {
      // Load all records — tabs handle virtual pagination client-side
      const res = await api.get(`/products/${productId}/history`, {
        params: { skip: 0, take: 500 },
      })
      setHistory(res.data)
    } catch {
      toast.error('Failed to load product history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedProductId) loadHistory(selectedProductId)
  }, [selectedProductId, loadHistory])

  // History endpoint already returns the product — no need for a master list lookup.
  const selectedProduct = history?.product ?? null

  // ── Sales rows (outgoing — stock OUT) ───────────────────────
  const salesRows = useMemo(() => {
    if (!history) return []
    return history.sales.map((s: any) => ({
      date: new Date(s.date), ref: s.invoiceNumber, party: s.customerName, partyPhone: s.customerPhone,
      batch: s.batchNumber, qty: s.quantity, rate: s.rate, amount: s.amount,
      gst: s.gstPercent, discount: s.discountPercent, status: s.status,
      isReturn: false, docType: 'invoice' as ProductDocType, docId: s.invoiceId,
      partyKind: 'customer' as PartyKind, partyId: s.customerId,
    }))
  }, [history])

  // ── Sales return rows (incoming — stock back IN) ─────────────
  const salesReturnRows = useMemo(() => {
    if (!history) return []
    return (history.salesReturns ?? []).map((r: any) => ({
      date: new Date(r.date), ref: r.creditNoteNo, party: r.customerName, partyPhone: r.customerPhone,
      batch: r.batchNumber, qty: r.returnedQty, rate: r.rate, amount: r.amount,
      gst: r.gstPercent, discount: 0, status: r.settlementMode,
      reason: r.reason, isReturn: true, docType: 'credit-note' as ProductDocType, docId: r.creditNoteId,
      partyKind: 'customer' as PartyKind, partyId: r.customerId,
    }))
  }, [history])

  // ── Purchase rows (incoming — stock IN) ──────────────────────
  const purchaseRows = useMemo(() => {
    if (!history) return []
    return history.purchases.map((p: any) => ({
      date: new Date(p.date), ref: p.grnNumber, party: p.supplierName, partyPhone: p.supplierPhone,
      batch: p.batchNumber, qty: p.receivedQty, freeQty: p.freeQty,
      purchaseRate: p.purchaseRate, mrp: p.mrp, amount: p.amount, status: p.status,
      isReturn: false, docType: 'grn' as ProductDocType, docId: p.grnId,
      partyKind: 'supplier' as PartyKind, partyId: p.supplierId,
    }))
  }, [history])

  // ── Purchase return rows (outgoing — stock OUT to supplier) ──
  // Short-delivery debit notes are excluded: they're financial claims for
  // goods that never arrived, so they don't represent any stock movement.
  // They still exist in the Debit Notes page for accounting visibility.
  const SHORT_DELIVERY_RE = /short.*delivery|short.*supply/i
  const purchaseReturnRows = useMemo(() => {
    if (!history) return []
    return (history.purchaseReturns ?? [])
      .filter((r: any) => !SHORT_DELIVERY_RE.test(r.reason ?? ''))
      .map((r: any) => ({
        date: new Date(r.date), ref: r.debitNoteNo, party: r.supplierName, partyPhone: r.supplierPhone,
        batch: r.batchNumber, qty: r.returnedQty, freeQty: 0,
        purchaseRate: r.purchaseRate, mrp: 0, amount: r.amount, status: r.status,
        reason: r.reason, isReturn: true, docType: 'purchase-return' as ProductDocType, docId: r.purchaseReturnId,
        partyKind: 'supplier' as PartyKind, partyId: r.supplierId,
      }))
  }, [history])

  // ── Timeline — all 4 types merged with running stock ─────────
  const timeline = useMemo((): TimelineRow[] => {
    if (!history) return []
    const rows: Omit<TimelineRow, 'runningStock'>[] = [
      ...history.sales.map((s: any) => ({
        type: 'SALE' as const, date: new Date(s.date),
        ref: s.invoiceNumber, party: s.customerName, partyPhone: s.customerPhone,
        partyKind: 'customer' as PartyKind, partyId: s.customerId,
        batch: s.batchNumber, qty: s.quantity, amount: s.amount,
        docType: 'invoice' as ProductDocType, docId: s.invoiceId,
      })),
      ...(history.salesReturns ?? []).map((r: any) => ({
        type: 'SALES_RETURN' as const, date: new Date(r.date),
        ref: r.creditNoteNo, party: r.customerName, partyPhone: r.customerPhone,
        partyKind: 'customer' as PartyKind, partyId: r.customerId,
        batch: r.batchNumber, qty: r.returnedQty, amount: r.amount,
        note: r.reason, docType: 'credit-note' as ProductDocType, docId: r.creditNoteId,
      })),
      ...history.purchases.map((p: any) => ({
        type: 'PURCHASE' as const, date: new Date(p.date),
        ref: p.grnNumber, party: p.supplierName, partyPhone: p.supplierPhone,
        partyKind: 'supplier' as PartyKind, partyId: p.supplierId,
        batch: p.batchNumber, qty: p.receivedQty, amount: p.amount,
        docType: 'grn' as ProductDocType, docId: p.grnId,
      })),
      // Skip short-delivery DNs — they don't move stock, so including them
      // would corrupt the running-stock total walked below.
      ...(history.purchaseReturns ?? [])
        .filter((r: any) => !SHORT_DELIVERY_RE.test(r.reason ?? ''))
        .map((r: any) => ({
          type: 'PURCHASE_RETURN' as const, date: new Date(r.date),
          ref: r.debitNoteNo, party: r.supplierName, partyPhone: r.supplierPhone,
          partyKind: 'supplier' as PartyKind, partyId: r.supplierId,
          batch: r.batchNumber, qty: r.returnedQty, amount: r.amount,
          note: r.reason, docType: 'purchase-return' as ProductDocType, docId: r.purchaseReturnId,
        })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Net stock change per type: SALE → out, PURCHASE → in, SALES_RETURN → in, PURCHASE_RETURN → out
    const netChange = (type: string, qty: number) => {
      if (type === 'PURCHASE' || type === 'SALES_RETURN') return qty
      return -qty
    }
    const totalNet = rows.reduce((s, r) => s + netChange(r.type, r.qty), 0)
    const currentStock: number = history.summary.currentStock ?? 0
    let runningStock = currentStock - totalNet

    return rows.map(row => {
      runningStock += netChange(row.type, row.qty)
      return { ...row, runningStock }
    })
  }, [history])

  // ── Apply shared filters + sort to each tab ─────────────────
  const applyFilters = useCallback(<T extends { date: Date; ref: string; party: string; batch: string }>(rows: T[]): T[] => {
    let result = [...rows]
    if (dateFrom) result = result.filter(r => r.date >= new Date(dateFrom))
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999)
      result = result.filter(r => r.date <= end)
    }
    if (batchFilter && batchFilter !== 'all') {
      result = result.filter(r => r.batch === batchFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        r.ref.toLowerCase().includes(q) ||
        r.party.toLowerCase().includes(q) ||
        r.batch.toLowerCase().includes(q)
      )
    }
    if (sortOrder === 'desc') result = result.reverse()
    return result
  }, [dateFrom, dateTo, batchFilter, searchQuery, sortOrder])

  // Distinct batches present anywhere in this product's history. Sorted with
  // recent batches first by appearance order in the timeline.
  const availableBatches = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    for (const row of timeline) {
      if (row.batch && !seen.has(row.batch)) {
        seen.add(row.batch)
        order.push(row.batch)
      }
    }
    return order
  }, [timeline])

  // Sales tab = sales + sales returns; Purchases tab = purchases + purchase returns
  const filteredSales = useMemo(() => applyFilters([...salesRows, ...salesReturnRows].sort((a, b) => b.date.getTime() - a.date.getTime())), [salesRows, salesReturnRows, applyFilters])
  const filteredPurchases = useMemo(() => applyFilters([...purchaseRows, ...purchaseReturnRows].sort((a, b) => b.date.getTime() - a.date.getTime())), [purchaseRows, purchaseReturnRows, applyFilters])
  const filteredTimeline = useMemo(() => applyFilters(timeline), [timeline, applyFilters])

  // ── Paginate ────────────────────────────────────────────────
  const paginate = <T,>(rows: T[], page: number) => rows.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = (rows: any[]) => Math.max(1, Math.ceil(rows.length / pageSize))

  const pagedSales = useMemo(() => paginate(filteredSales, salesPage), [filteredSales, salesPage])
  const pagedPurchases = useMemo(() => paginate(filteredPurchases, purchasesPage), [filteredPurchases, purchasesPage])
  const pagedTimeline = useMemo(() => paginate(filteredTimeline, timelinePage), [filteredTimeline, timelinePage])

  const activeFilterCount = [
    dateFrom,
    dateTo,
    searchQuery,
    batchFilter !== 'all' ? batchFilter : '',
  ].filter(Boolean).length

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setSearchQuery('')
    setBatchFilter('all')
  }

  // Product name used for the export title/filename — falls back the same
  // way the header below does when the history payload hasn't resolved yet.
  const exportProductName = selectedProduct?.name ?? history?.product?.name ?? 'product'

  // ── Pagination footer ───────────────────────────────────────

  const hasData = history && (filteredSales.length > 0 || filteredPurchases.length > 0 || filteredTimeline.length > 0)
  const activeCount = activeTab === 'sales' ? filteredSales.length : activeTab === 'purchases' ? filteredPurchases.length : filteredTimeline.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="icon-sm" onClick={() => goBack('/inventory/products')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            {selectedProduct ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{selectedProduct.name}</h1>
                  <StockStatusBadge product={selectedProduct} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {selectedProduct.genericName}
                  {selectedProduct.manufacturer && <> · {selectedProduct.manufacturer}</>}
                  {selectedProduct.packSize && <> · {selectedProduct.packSize}</>}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight">Product History</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  View full sales and purchase transaction history for any product
                </p>
              </>
            )}
          </div>
        </div>
        {history && (
          <div className="flex flex-wrap items-center gap-2 self-start w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(`/inventory/products?view=table&editId=${selectedProductId}`)}
            >
              <SquarePen className="h-3.5 w-3.5" />
              Edit Product
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(`/purchase/orders?productId=${selectedProductId}`)}
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Create PO
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
            >
              {sortOrder === 'desc'
                ? <><ArrowDown className="h-3.5 w-3.5" /> New to Old</>
                : <><ArrowUp className="h-3.5 w-3.5" /> Old to New</>
              }
            </Button>
            <ExportMenu
              title={productHistoryExportTitle(activeTab, exportProductName)}
              filename={productHistoryExportFilename(activeTab, exportProductName)}
              noun="record"
              rows={() => buildProductHistoryExportRows(activeTab, filteredSales, filteredPurchases, filteredTimeline)}
              disabled={activeCount === 0}
              size="sm"
              variant="outline"
            />
          </div>
        )}
      </div>

      {/* Phantom-stock warning — a stock number with zero batches behind it
          usually means the product was imported (e.g. cloned to a new branch)
          without any real GRN receiving, so this timeline will be empty even
          though the number above suggests otherwise. */}
      {history && history.summary.currentStock > 0 && history.product.activeBatches === 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This product shows <b>{history.summary.currentStock}</b> in stock but has no batch records —
            likely imported without real inventory. Add stock via a GRN to make it sellable and to populate this timeline.
          </p>
        </div>
      )}

      {/* Summary stats */}
      {history && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: 'In Stock',
              // Show "current / min" so the Low Stock context is obvious from the badge alone.
              value: selectedProduct
                ? `${history.summary.currentStock} / ${selectedProduct.minStock}`
                : String(history.summary.currentStock),
              subtitle: `${history.product.activeBatches} active batch${history.product.activeBatches !== 1 ? 'es' : ''}${selectedProduct ? ' · min stock threshold' : ''}`,
              icon: Package,
              iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
              borderAccent: 'border-l-blue-500',
            },
            {
              label: 'Sold Qty',
              value: String(history.summary.totalSoldQty),
              subtitle: `${history.summary.totalSalesReturnQty ?? 0} returned`,
              icon: TrendingDown,
              iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
              borderAccent: 'border-l-rose-500',
            },
            {
              label: 'Purchased Qty',
              value: String(history.summary.totalPurchasedQty),
              subtitle: `${history.summary.totalPurchaseReturnQty ?? 0} returned to supplier`,
              icon: TrendingUp,
              iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              borderAccent: 'border-l-emerald-500',
            },
            {
              label: 'Sales Value',
              value: formatCurrency(history.summary.totalSalesValue),
              subtitle: formatCurrency(history.summary.totalPurchaseValue) + ' purchased',
              icon: IndianRupee,
              iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              borderAccent: 'border-l-amber-500',
            },
          ].map((stat) => (
            <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.iconBg)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold font-mono leading-tight">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search reference, party or batch..."
        resultsCount={activeCount}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
      >
        {/* Date From + Date To paired together so they always land on the same row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
            <DatePicker value={dateFrom} onChange={setDateFrom} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
            <DatePicker value={dateTo} onChange={setDateTo} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</Label>
          <Select value={batchFilter} onValueChange={setBatchFilter} disabled={availableBatches.length === 0}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {availableBatches.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DataTableFilterBar>

      {/* Content area */}
      {!selectedProductId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <Package className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No product selected</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">Open a product from the Products list to view its history</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/inventory/products')}>
              <Package className="h-3.5 w-3.5" />
              Go to Products
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
            <p className="text-sm text-muted-foreground animate-pulse">Loading transaction history…</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-border/60 px-1 overflow-x-auto shrink-0">
            <TabButton
              active={activeTab === 'sales'}
              onClick={() => setActiveTab('sales')}
              icon={ShoppingCart}
              label="Sales & Returns"
              count={filteredSales.length}
              color="text-rose-600 dark:text-rose-400"
            />
            <TabButton
              active={activeTab === 'purchases'}
              onClick={() => setActiveTab('purchases')}
              icon={Truck}
              label="Purchases & Returns"
              count={filteredPurchases.length}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <TabButton
              active={activeTab === 'timeline'}
              onClick={() => setActiveTab('timeline')}
              icon={GitMerge}
              label="Timeline"
              count={filteredTimeline.length}
              color="text-primary"
            />
          </div>

          {/* Empty state (no data at all) */}
          {!hasData ? (
            <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                <BarChart3 className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No transactions found</p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
              )}
            </CardContent>
          ) : activeCount === 0 ? (
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <p className="text-sm font-medium text-muted-foreground">No {activeTab} transactions match the current filters</p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
              )}
            </CardContent>
          ) : (
            <>
              {/* ── Sales tab ───────────────────────────────── */}
              {activeTab === 'sales' && (
                <>
                  {/* responsive: phone card list — desktop table hidden below md */}
                  <div className="divide-y divide-border/40 md:hidden">
                    {pagedSales.map((row: any, i) => {
                      const isReturn = row.isReturn
                      return (
                        <div
                          key={`sale-card-${i}`}
                          onClick={() => openDoc(row.docType, row.docId)}
                          className="cursor-pointer active:bg-muted/50 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                                {isReturn && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-bold"><RotateCcw className="h-2.5 w-2.5" />RETURN</span>}
                                {row.ref}
                              </div>
                              <div>
                                {row.partyId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); goToParty(row.partyKind, row.partyId) }}
                                    className="text-sky-600 dark:text-sky-400 font-medium hover:underline underline-offset-2 text-left text-xs"
                                    title={`View ${row.partyKind} details`}
                                  >
                                    {row.party}
                                  </button>
                                ) : <span className="text-xs">{row.party}</span>}
                                {row.partyPhone && (
                                  <span className="block text-[11px] font-mono text-muted-foreground">{row.partyPhone}</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={cn('text-xs font-mono font-semibold', isReturn ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-300')}>
                                {isReturn ? `+${row.qty}` : `−${row.qty}`}
                              </div>
                              <div className="font-mono text-xs font-semibold">{formatCurrency(row.amount)}</div>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Date</div>
                              <div className="text-xs text-muted-foreground">{row.date.toLocaleDateString('en-IN')}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Batch</div>
                              <div className="text-xs font-mono">
                                {row.batch ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch); setSalesPage(1) }}
                                    className={cn(
                                      'underline-offset-2 hover:underline cursor-pointer transition-colors',
                                      batchFilter === row.batch
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground hover:text-primary'
                                    )}
                                    title={`Filter to batch ${row.batch}`}
                                  >
                                    {row.batch}
                                  </button>
                                ) : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Rate</div>
                              <div className="text-xs font-mono">{formatCurrency(row.rate)}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">GST</div>
                              <div className="text-xs font-mono text-muted-foreground">{row.gst}%</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Disc</div>
                              <div className="text-xs font-mono text-muted-foreground">{isReturn ? '—' : `${row.discount}%`}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Status</div>
                              <div>
                                {isReturn
                                  ? <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{row.status}</span>
                                  : <span className={cn('text-[10px] font-semibold uppercase rounded-full px-2 py-0.5', row.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{row.status}</span>
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="overflow-auto max-h-130 hidden md:block">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">GST%</TableHead>
                          <TableHead className="text-right">Disc%</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedSales.map((row: any, i) => {
                          const isReturn = row.isReturn
                          return (
                            <TableRow
                              key={`sale-${i}`}
                              onClick={() => openDoc(row.docType, row.docId)}
                              title="Click to view the document"
                              className="cursor-pointer border-b border-border/30 hover:bg-muted/50">
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {row.date.toLocaleDateString('en-IN')}
                              </TableCell>
                              <TableCell className="text-xs">
                                {row.partyId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); goToParty(row.partyKind, row.partyId) }}
                                    className="text-sky-600 dark:text-sky-400 font-medium hover:underline underline-offset-2 text-left"
                                    title={`View ${row.partyKind} details`}
                                  >
                                    {row.party}
                                  </button>
                                ) : row.party}
                                {row.partyPhone && (
                                  <span className="block text-[11px] font-mono text-muted-foreground">{row.partyPhone}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono font-medium">
                                <div className="flex items-center gap-1.5">
                                  {isReturn && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-bold"><RotateCcw className="h-2.5 w-2.5" />RETURN</span>}
                                  {row.ref}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">
                                {row.batch ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch); setSalesPage(1) }}
                                    className={cn(
                                      'underline-offset-2 hover:underline cursor-pointer transition-colors',
                                      batchFilter === row.batch
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground hover:text-primary'
                                    )}
                                    title={`Filter to batch ${row.batch}`}
                                  >
                                    {row.batch}
                                  </button>
                                ) : '—'}
                              </TableCell>
                              <TableCell className={cn('text-right text-xs font-mono font-semibold', isReturn ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-300')}>
                                {isReturn ? `+${row.qty}` : `−${row.qty}`}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono">{formatCurrency(row.rate)}</TableCell>
                              <TableCell className="text-right text-xs font-mono font-semibold">{formatCurrency(row.amount)}</TableCell>
                              <TableCell className="text-right text-xs font-mono text-muted-foreground">{row.gst}%</TableCell>
                              <TableCell className="text-right text-xs font-mono text-muted-foreground">{isReturn ? '—' : `${row.discount}%`}</TableCell>
                              <TableCell>
                                {isReturn
                                  ? <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{row.status}</span>
                                  : <span className={cn('text-[10px] font-semibold uppercase rounded-full px-2 py-0.5', row.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{row.status}</span>
                                }
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <DataTablePagination
                    currentPage={salesPage}
                    totalPages={totalPages(filteredSales)}
                    onPageChange={setSalesPage}
                    totalItems={filteredSales.length}
                    itemsPerPage={pageSize}
                    pageSize={pageSize}
                    onPageSizeChange={(n) => { setPageSize(n); setSalesPage(1); setPurchasesPage(1); setTimelinePage(1) }}
                    className="border-t border-border/40 px-4"
                  />
                </>
              )}

              {/* ── Purchases tab ────────────────────────────── */}
              {activeTab === 'purchases' && (
                <>
                  {/* responsive: phone card list — desktop table hidden below md */}
                  <div className="divide-y divide-border/40 md:hidden">
                    {pagedPurchases.map((row: any, i) => {
                      const isReturn = row.isReturn
                      return (
                        <div
                          key={`purchase-card-${i}`}
                          onClick={() => openDoc(row.docType, row.docId)}
                          className="cursor-pointer active:bg-muted/50 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                                {isReturn && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 py-0.5 text-[9px] font-bold"><PackageX className="h-2.5 w-2.5" />RETURN</span>}
                                {row.ref}
                              </div>
                              <div>
                                {row.partyId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); goToParty(row.partyKind, row.partyId) }}
                                    className="text-sky-600 dark:text-sky-400 font-medium hover:underline underline-offset-2 text-left text-xs"
                                    title={`View ${row.partyKind} details`}
                                  >
                                    {row.party}
                                  </button>
                                ) : <span className="text-xs">{row.party}</span>}
                                {row.partyPhone && (
                                  <span className="block text-[11px] font-mono text-muted-foreground">{row.partyPhone}</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={cn('text-xs font-mono font-semibold', isReturn ? 'text-violet-600 dark:text-violet-300' : 'text-emerald-600 dark:text-emerald-300')}>
                                {isReturn ? `−${row.qty}` : `+${row.qty}`}
                              </div>
                              <div className="font-mono text-xs font-semibold">{formatCurrency(row.amount)}</div>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Date</div>
                              <div className="text-xs text-muted-foreground">{row.date.toLocaleDateString('en-IN')}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Batch</div>
                              <div className="text-xs font-mono">
                                {row.batch ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch); setPurchasesPage(1) }}
                                    className={cn(
                                      'underline-offset-2 hover:underline cursor-pointer transition-colors',
                                      batchFilter === row.batch
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground hover:text-primary'
                                    )}
                                    title={`Filter to batch ${row.batch}`}
                                  >
                                    {row.batch}
                                  </button>
                                ) : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Rate</div>
                              <div className="text-xs font-mono">{formatCurrency(row.purchaseRate)}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">MRP</div>
                              <div className="text-xs font-mono">{row.mrp > 0 ? formatCurrency(row.mrp) : '—'}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Free Qty</div>
                              <div className="text-xs font-mono text-muted-foreground">{isReturn ? '—' : (row.freeQty > 0 ? `+${row.freeQty}` : '—')}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Status</div>
                              <div>
                                <span className={cn(
                                  'text-[10px] font-semibold uppercase rounded-full px-2 py-0.5',
                                  isReturn
                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                    : row.status === 'RECEIVED'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                      : 'bg-muted text-muted-foreground'
                                )}>{row.status}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="overflow-auto max-h-130 hidden md:block">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>GRN #</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Free Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">MRP</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedPurchases.map((row: any, i) => {
                          const isReturn = row.isReturn
                          return (
                            <TableRow
                              key={`purchase-${i}`}
                              onClick={() => openDoc(row.docType, row.docId)}
                              title="Click to view the document"
                              className="cursor-pointer border-b border-border/30 hover:bg-muted/50">
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {row.date.toLocaleDateString('en-IN')}
                              </TableCell>
                              <TableCell className="text-xs">
                                {row.partyId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); goToParty(row.partyKind, row.partyId) }}
                                    className="text-sky-600 dark:text-sky-400 font-medium hover:underline underline-offset-2 text-left"
                                    title={`View ${row.partyKind} details`}
                                  >
                                    {row.party}
                                  </button>
                                ) : row.party}
                                {row.partyPhone && (
                                  <span className="block text-[11px] font-mono text-muted-foreground">{row.partyPhone}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono font-medium">
                                <div className="flex items-center gap-1.5">
                                  {isReturn && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 py-0.5 text-[9px] font-bold"><PackageX className="h-2.5 w-2.5" />RETURN</span>}
                                  {row.ref}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">
                                {row.batch ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch); setPurchasesPage(1) }}
                                    className={cn(
                                      'underline-offset-2 hover:underline cursor-pointer transition-colors',
                                      batchFilter === row.batch
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground hover:text-primary'
                                    )}
                                    title={`Filter to batch ${row.batch}`}
                                  >
                                    {row.batch}
                                  </button>
                                ) : '—'}
                              </TableCell>
                              <TableCell className={cn('text-right text-xs font-mono font-semibold', isReturn ? 'text-violet-600 dark:text-violet-300' : 'text-emerald-600 dark:text-emerald-300')}>
                                {isReturn ? `−${row.qty}` : `+${row.qty}`}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono text-muted-foreground">
                                {isReturn ? '—' : (row.freeQty > 0 ? `+${row.freeQty}` : '—')}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono">{formatCurrency(row.purchaseRate)}</TableCell>
                              <TableCell className="text-right text-xs font-mono">{row.mrp > 0 ? formatCurrency(row.mrp) : '—'}</TableCell>
                              <TableCell className="text-right text-xs font-mono font-semibold">{formatCurrency(row.amount)}</TableCell>
                              <TableCell>
                                <span className={cn(
                                  'text-[10px] font-semibold uppercase rounded-full px-2 py-0.5',
                                  isReturn
                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                    : row.status === 'RECEIVED'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                      : 'bg-muted text-muted-foreground'
                                )}>{row.status}</span>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <DataTablePagination
                    currentPage={purchasesPage}
                    totalPages={totalPages(filteredPurchases)}
                    onPageChange={setPurchasesPage}
                    totalItems={filteredPurchases.length}
                    itemsPerPage={pageSize}
                    pageSize={pageSize}
                    onPageSizeChange={(n) => { setPageSize(n); setSalesPage(1); setPurchasesPage(1); setTimelinePage(1) }}
                    className="border-t border-border/40 px-4"
                  />
                </>
              )}

              {/* ── Timeline tab ─────────────────────────────── */}
              {activeTab === 'timeline' && (
                <>
                  <p className="hidden md:block px-4 pt-3 pb-1 text-[11px] text-muted-foreground">
                    Tip: click any row to open its invoice, GRN or note for verification.
                  </p>
                  {/* responsive: phone card list — desktop table hidden below md */}
                  <div className="divide-y divide-border/40 md:hidden">
                    {pagedTimeline.map((row, i) => {
                      const TYPE_STYLE = {
                        SALE:            { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',     icon: TrendingDown, label: 'Sale',            qtySign: '−' },
                        PURCHASE:        { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: TrendingUp, label: 'Purchase',        qtySign: '+' },
                        SALES_RETURN:    { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: RotateCcw, label: 'Sale Return',   qtySign: '+' },
                        PURCHASE_RETURN: { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',     icon: PackageX,   label: 'Purchase Return', qtySign: '−' },
                      }
                      const style = TYPE_STYLE[row.type]
                      const Icon = style.icon
                      return (
                        <div
                          key={`tl-card-${i}`}
                          onClick={() => openDoc(row.docType, row.docId)}
                          className="cursor-pointer active:bg-muted/50 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase whitespace-nowrap', TYPE_THEME[row.type].badge)}>
                                <Icon className="h-3 w-3" />
                                {style.label}
                              </span>
                              <div className="mt-1">
                                {row.partyId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); goToParty(row.partyKind, row.partyId) }}
                                    className="text-sky-600 dark:text-sky-400 font-medium hover:underline underline-offset-2 text-left text-xs"
                                    title={`View ${row.partyKind} details`}
                                  >
                                    {row.party}
                                  </button>
                                ) : <span className="text-xs">{row.party}</span>}
                                {row.partyPhone && (
                                  <span className="block text-[11px] font-mono text-muted-foreground">{row.partyPhone}</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={cn(
                                'text-[15px] font-mono font-semibold',
                                style.qtySign === '+'
                                  ? 'text-emerald-600 dark:text-emerald-300'
                                  : 'text-rose-600 dark:text-rose-300',
                              )}>
                                {style.qtySign}{row.qty}
                              </div>
                              <div className="font-mono text-xs font-semibold">{formatCurrency(row.amount)}</div>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Date</div>
                              <div className="text-xs text-muted-foreground">{row.date.toLocaleDateString('en-IN')}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Batch</div>
                              <div className="text-xs font-mono">
                                {row.batch ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch); setTimelinePage(1) }}
                                    className={cn(
                                      'underline-offset-2 hover:underline cursor-pointer transition-colors',
                                      batchFilter === row.batch
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground hover:text-primary'
                                    )}
                                    title={`Filter to batch ${row.batch}`}
                                  >
                                    {row.batch}
                                  </button>
                                ) : '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Document #</div>
                              <div className="text-xs font-mono font-medium">{row.ref}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Stock</div>
                              <div>
                                <span className={cn(
                                  'inline-block rounded-md px-2 py-0.5 text-xs font-mono font-semibold',
                                  row.runningStock <= 0
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                    : 'bg-muted text-foreground',
                                )}>
                                  {row.runningStock}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="overflow-auto max-h-130 hidden md:block">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead className="w-40 min-w-40">Type</TableHead>
                          <TableHead className="whitespace-nowrap">Date</TableHead>
                          <TableHead>Party</TableHead>
                          <TableHead className="w-32">Batch</TableHead>
                          <TableHead>Document #</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedTimeline.map((row, i) => {
                          const TYPE_STYLE = {
                            SALE:            { rowBg: 'bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100/70 dark:hover:bg-rose-950/40',         accent: 'border-l-rose-400 dark:border-l-rose-500/60',       badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',     icon: TrendingDown, label: 'Sale',            qtySign: '−', qtyColor: 'text-rose-700 dark:text-rose-300' },
                            PURCHASE:        { rowBg: 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/40', accent: 'border-l-emerald-400 dark:border-l-emerald-500/60', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: TrendingUp, label: 'Purchase',        qtySign: '+', qtyColor: 'text-emerald-700 dark:text-emerald-300' },
                            SALES_RETURN:    { rowBg: 'bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/30', accent: 'border-l-emerald-300 dark:border-l-emerald-500/40', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: RotateCcw, label: 'Sale Return',   qtySign: '+', qtyColor: 'text-emerald-700 dark:text-emerald-300' },
                            PURCHASE_RETURN: { rowBg: 'bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-100/60 dark:hover:bg-rose-950/30',      accent: 'border-l-rose-300 dark:border-l-rose-500/40',       badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',     icon: PackageX,   label: 'Purchase Return', qtySign: '−', qtyColor: 'text-rose-700 dark:text-rose-300' },
                          }
                          const style = TYPE_STYLE[row.type]
                          const Icon = style.icon
                          return (
                            <TableRow
                              key={`tl-${i}`}
                              className="group cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/50"
                              onClick={() => openDoc(row.docType, row.docId)}
                              title="Click to view the document"
                            >
                              <TableCell>
                                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase whitespace-nowrap', TYPE_THEME[row.type].badge)}>
                                  <Icon className="h-3 w-3" />
                                  {style.label}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {row.date.toLocaleDateString('en-IN')}
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.partyId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); goToParty(row.partyKind, row.partyId) }}
                                    className="text-sky-600 dark:text-sky-400 font-medium hover:underline underline-offset-2 text-left"
                                    title={`View ${row.partyKind} details`}
                                  >
                                    {row.party}
                                  </button>
                                ) : row.party}
                                {row.partyPhone && (
                                  <span className="block text-[11px] font-mono text-muted-foreground">{row.partyPhone}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-[13px] font-mono text-muted-foreground">
                                {row.batch ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch); setTimelinePage(1) }}
                                    className={cn(
                                      'underline-offset-2 hover:underline cursor-pointer transition-colors',
                                      batchFilter === row.batch
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground hover:text-primary'
                                    )}
                                    title={`Filter to batch ${row.batch}`}
                                  >
                                    {row.batch}
                                  </button>
                                ) : '—'}
                              </TableCell>
                              <TableCell className="text-sm font-medium font-mono group-hover:text-primary transition-colors">{row.ref}</TableCell>
                              <TableCell className={cn(
                                'text-right text-[15px] font-mono font-semibold',
                                // Colour strictly by direction: incoming (+) green, outgoing (−) red.
                                style.qtySign === '+'
                                  ? 'text-emerald-600 dark:text-emerald-300'
                                  : 'text-rose-600 dark:text-rose-300',
                              )}>
                                {style.qtySign}{row.qty}
                              </TableCell>
                              <TableCell className="text-right text-sm font-mono">{formatCurrency(row.amount)}</TableCell>
                              <TableCell className="text-right">
                                <span className={cn(
                                  'inline-block rounded-md px-2 py-0.5 text-sm font-mono font-semibold',
                                  row.runningStock <= 0
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                    : 'bg-muted text-foreground',
                                )}>
                                  {row.runningStock}
                                </span>
                              </TableCell>
                              <TableCell className="w-8 pr-3 text-right">
                                <ChevronRight className="h-4 w-4 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <DataTablePagination
                    currentPage={timelinePage}
                    totalPages={totalPages(filteredTimeline)}
                    onPageChange={setTimelinePage}
                    totalItems={filteredTimeline.length}
                    itemsPerPage={pageSize}
                    pageSize={pageSize}
                    onPageSizeChange={(n) => { setPageSize(n); setSalesPage(1); setPurchasesPage(1); setTimelinePage(1) }}
                    className="border-t border-border/40 px-4"
                  />
                </>
              )}
            </>
          )}
        </Card>
      )}

      {/* In-place document viewer — opened by clicking any history row. */}
      <ProductDocumentDrawer
        open={!!activeDoc}
        docType={activeDoc?.docType ?? null}
        docId={activeDoc?.docId ?? null}
        highlightProductId={selectedProductId}
        onOpenChange={(o) => { if (!o) setActiveDoc(null) }}
      />
    </motion.div>
  )
}

// ─── Product search input ──────────────────────────────────────
// Debounced server-side search via GET /products?q=&take=20. Previously this
// component filtered a master-loaded array client-side — that required the
// page to pre-load every product on mount (slow). Now it only fetches the
// page of results the user is actually looking at.
