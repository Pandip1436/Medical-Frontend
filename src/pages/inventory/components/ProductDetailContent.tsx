import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  TrendingUp, TrendingDown, Package,
  ArrowDown, ArrowUp, ChevronRight, ChevronUp,
  BarChart3, ShoppingCart, Truck, GitMerge,
  RotateCcw, PackageX,
} from 'lucide-react'
import { useProductDetail } from '../hooks/useProductDetail'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { ProductDocumentDrawer, type ProductDocType } from '@/components/inventory/ProductDocumentDrawer'
import api from '@/lib/api'
import { navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import {
  buildProductHistoryExportRows,
  productHistoryExportFilename,
  productHistoryExportTitle,
} from '../productHistoryExport'

// ─── Types ────────────────────────────────────────────────────
type ActiveTab = 'overview' | 'sales' | 'purchases' | 'timeline'

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

export function ProductDetailContent({ productId }: { productId: string }) {
  const detail = useProductDetail(productId)
  const [history, setHistory] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')

  // Shared search/date filters
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [batchFilter, setBatchFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  // Infinite scroll state for detail tabs
  const [tabVisibleCount, setTabVisibleCount] = useState(50)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const tabSentinelRef = useRef<HTMLDivElement>(null)
  const tabPendingRef = useRef(false)

  // Document drawer: clicking any history row opens the underlying document
  const [activeDoc, setActiveDoc] = useState<{ docType: ProductDocType; docId: string } | null>(null)
  const openDoc = useCallback((docType?: ProductDocType, docId?: string) => {
    if (!docType || !docId) {
      toast.info('No linked document for this entry')
      return
    }
    setActiveDoc({ docType, docId })
  }, [])

  const loadHistory = useCallback(async (pid: string) => {
    if (!pid) return
    setLoading(true)
    setHistory(null)
    try {
      const res = await api.get(`/products/${pid}/history`, {
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
    if (productId) loadHistory(productId)
  }, [productId, loadHistory])

  // History endpoint already returns the product
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

  // Distinct batches present anywhere in this product's history
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

  const filteredSales = useMemo(() => applyFilters([...salesRows, ...salesReturnRows].sort((a, b) => b.date.getTime() - a.date.getTime())), [salesRows, salesReturnRows, applyFilters])
  const filteredPurchases = useMemo(() => applyFilters([...purchaseRows, ...purchaseReturnRows].sort((a, b) => b.date.getTime() - a.date.getTime())), [purchaseRows, purchaseReturnRows, applyFilters])
  const filteredTimeline = useMemo(() => applyFilters(timeline), [timeline, applyFilters])

  // Progressively revealed rows for each tab (client-side infinite scroll)
  const visibleSales = useMemo(() => filteredSales.slice(0, tabVisibleCount), [filteredSales, tabVisibleCount])
  const visiblePurchases = useMemo(() => filteredPurchases.slice(0, tabVisibleCount), [filteredPurchases, tabVisibleCount])
  const visibleTimeline = useMemo(() => filteredTimeline.slice(0, tabVisibleCount), [filteredTimeline, tabVisibleCount])

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

  // Reset visible count + scroll position when tab or filters change
  useEffect(() => {
    setTabVisibleCount(50)
    tabPendingRef.current = false
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0
    setShowScrollTop(false)
  }, [activeTab, searchQuery, dateFrom, dateTo, batchFilter, sortOrder])

  // Sentinel IntersectionObserver — loads more rows when bottom enters view
  useEffect(() => {
    if (activeTab === 'overview') return
    if (!tabSentinelRef.current || !contentScrollRef.current) return
    const totalInTab = activeTab === 'sales' ? filteredSales.length
      : activeTab === 'purchases' ? filteredPurchases.length
      : filteredTimeline.length
    if (tabVisibleCount >= totalInTab) return

    const el = tabSentinelRef.current
    const root = contentScrollRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tabPendingRef.current) {
          tabPendingRef.current = true
          setTabVisibleCount(n => n + 50)
        }
      },
      { root, threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabVisibleCount, filteredSales.length, filteredPurchases.length, filteredTimeline.length])

  // Reset the pending guard after each new batch renders
  useEffect(() => {
    tabPendingRef.current = false
  }, [tabVisibleCount])

  // Product name used for the export title/filename — falls back the same
  // way the action bar's name label does when history hasn't resolved yet.
  const exportProductName = selectedProduct?.name ?? history?.product?.name ?? 'product'

  const hasData = history && (filteredSales.length > 0 || filteredPurchases.length > 0 || filteredTimeline.length > 0)
  const activeCount = activeTab === 'sales' ? filteredSales.length : activeTab === 'purchases' ? filteredPurchases.length : filteredTimeline.length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Action bar */}
      <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 py-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {selectedProduct && (
            <>
              <span className="block truncate text-sm font-semibold leading-tight">{selectedProduct.name}</span>
              <span className="text-[11px] text-muted-foreground">{selectedProduct.genericName}{selectedProduct.manufacturer && ` · ${selectedProduct.manufacturer}`}</span>
            </>
          )}
        </div>
        <StockStatusBadge product={selectedProduct ?? detail.product ?? { totalStock: 0, minStock: 0 }} />
        {activeTab !== 'overview' && (
          <>
            <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}>
              {sortOrder === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              {sortOrder === 'desc' ? 'New to Old' : 'Old to New'}
            </Button>
            <ExportMenu
              title={productHistoryExportTitle(activeTab, exportProductName)}
              filename={productHistoryExportFilename(activeTab, exportProductName)}
              noun="record"
              rows={() => buildProductHistoryExportRows(activeTab, filteredSales, filteredPurchases, filteredTimeline)}
              disabled={activeCount === 0}
              size="sm"
              variant="outline"
              className="h-7"
            />
          </>
        )}
        <Button size="sm" variant="outline" className="h-7" onClick={() => navigate(`/inventory/products?view=table&editId=${productId}&fromSplit=${productId}`)}>
          Edit
        </Button>
      </div>

      {/* Filter bar — hidden on overview tab */}
      {activeTab !== 'overview' && <div className="shrink-0">
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
      </div>}

      {/* Tab bar — Overview · Timeline · Sales & Returns · Purchases & Returns */}
      <div className="shrink-0 flex border-b border-border/60 px-1 overflow-x-auto">
        <TabButton
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          icon={Package}
          label="Overview"
          color="text-blue-600 dark:text-blue-400"
        />
        <TabButton
          active={activeTab === 'timeline'}
          onClick={() => setActiveTab('timeline')}
          icon={GitMerge}
          label="Timeline"
          count={filteredTimeline.length}
          color="text-primary"
        />
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
      </div>

      {/* Scrollable content area */}
      <div className="relative min-h-0 flex-1">
      <div
        ref={contentScrollRef}
        onScroll={() => setShowScrollTop((contentScrollRef.current?.scrollTop ?? 0) > 120)}
        className="h-full overflow-y-auto"
      >
        {activeTab === 'overview' ? (
          detail.loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Loading details…</p>
            </div>
          ) : detail.product ? (
            <div className="space-y-4 p-4">
              {/* Product details — HSN, Manufacturer, etc. (most important, shown first) */}
              <section>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
                <div className="divide-y divide-border/40 rounded-lg border border-border/40 bg-muted/20">
                  {detail.product.manufacturer && (
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs font-medium text-muted-foreground">Manufacturer</span>
                      <span className="text-sm font-semibold">{detail.product.manufacturer}</span>
                    </div>
                  )}
                  {detail.product.hsnCode && (
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs font-medium text-muted-foreground">HSN Code</span>
                      <span className="text-sm font-mono font-semibold tracking-wider">{detail.product.hsnCode}</span>
                    </div>
                  )}
                  {detail.product.schedule && detail.product.schedule !== 'NONE' && (
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs font-medium text-muted-foreground">Schedule</span>
                      <Badge variant="warning" size="sm">Schedule {detail.product.schedule}</Badge>
                    </div>
                  )}
                  {detail.product.category && (
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-xs font-medium text-muted-foreground">Category</span>
                      <span className="text-sm font-medium">
                        {typeof detail.product.category === 'string'
                          ? detail.product.category
                          : (detail.product.category as any)?.name ?? ''}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Pricing */}
              <section>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pricing</p>
                <div className="grid grid-cols-3 gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                  {[
                    { label: 'MRP', value: formatCurrency(detail.product.mrp) },
                    { label: 'Purchase Rate', value: formatCurrency(detail.product.purchaseRate) },
                    { label: 'Selling Rate', value: formatCurrency(detail.product.sellingRate) },
                  ].map(m => (
                    <div key={m.label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</p>
                      <p className="mt-0.5 text-sm font-mono font-bold">{m.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Inventory */}
              <section>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inventory</p>
                <div className="grid grid-cols-3 gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current Stock</p>
                    <p className={cn('mt-0.5 text-xl font-mono font-bold',
                      detail.product.totalStock <= 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : detail.product.totalStock <= detail.product.minStock
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400',
                    )}>{detail.product.totalStock}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Stock</p>
                    <p className="mt-0.5 text-base font-mono font-bold">{detail.product.minStock}</p>
                  </div>
                  {detail.product.rackLocation && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rack</p>
                      <p className="mt-0.5 text-base font-mono">{detail.product.rackLocation}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Transaction summary from history */}
              {history && (
                <section>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transaction Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Sold Qty', value: String(history.summary.totalSoldQty), sub: `${history.summary.totalSalesReturnQty ?? 0} returned`, color: 'text-rose-600 dark:text-rose-400' },
                      { label: 'Purchased Qty', value: String(history.summary.totalPurchasedQty), sub: `${history.summary.totalPurchaseReturnQty ?? 0} returned`, color: 'text-emerald-600 dark:text-emerald-400' },
                      { label: 'Sales Value', value: formatCurrency(history.summary.totalSalesValue), sub: 'gross revenue', color: '' },
                      { label: 'Purchase Value', value: formatCurrency(history.summary.totalPurchaseValue), sub: 'gross cost', color: '' },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                        <p className={cn('mt-0.5 text-base font-mono font-bold', s.color)}>{s.value}</p>
                        <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Active batches */}
              {detail.batches.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Batches ({detail.batches.length})
                  </p>
                  <div className="overflow-hidden rounded-md border border-border/40">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead className="text-[10px]">Batch</TableHead>
                          <TableHead className="text-right text-[10px]">Qty</TableHead>
                          <TableHead className="text-right text-[10px]">MRP</TableHead>
                          <TableHead className="text-right text-[10px]">Expiry</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.batches.map((b: any) => {
                          const daysLeft = Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86400000)
                          const expirySoon = daysLeft <= 90
                          return (
                            <TableRow key={b.id}>
                              <TableCell className="font-mono text-[11px]">{b.batchNumber}</TableCell>
                              <TableCell className="text-right text-[11px]">{b.quantity}</TableCell>
                              <TableCell className="text-right font-mono text-[11px]">{formatCurrency(b.mrp)}</TableCell>
                              <TableCell className={cn('text-right text-[11px]', expirySoon ? 'font-semibold text-amber-600 dark:text-amber-400' : '')}>
                                {formatDate(b.expiryDate)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
              <Package className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Product not found</p>
            </div>
          )
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
            <p className="text-sm text-muted-foreground animate-pulse">Loading transaction history…</p>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <BarChart3 className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No transactions found</p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-sm font-medium text-muted-foreground">No {activeTab} transactions match the current filters</p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <>
            {/* ── Sales tab ───────────────────────────────── */}
            {activeTab === 'sales' && (
              <>
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
                    {visibleSales.map((row: any, i) => {
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
                                onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch) }}
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
                {/* Infinite scroll sentinel */}
                <div ref={tabSentinelRef} className="h-1" />
                {visibleSales.length < filteredSales.length && (
                  <div className="flex justify-center py-3">
                    <span className="text-[11px] text-muted-foreground">Loading more…</span>
                  </div>
                )}
              </>
            )}

            {/* ── Purchases tab ────────────────────────────── */}
            {activeTab === 'purchases' && (
              <>
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
                    {visiblePurchases.map((row: any, i) => {
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
                                onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch) }}
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
                {/* Infinite scroll sentinel */}
                <div ref={tabSentinelRef} className="h-1" />
                {visiblePurchases.length < filteredPurchases.length && (
                  <div className="flex justify-center py-3">
                    <span className="text-[11px] text-muted-foreground">Loading more…</span>
                  </div>
                )}
              </>
            )}

            {/* ── Timeline tab ─────────────────────────────── */}
            {activeTab === 'timeline' && (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] text-muted-foreground">
                  Tip: click any row to open its invoice, GRN or note for verification.
                </p>
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
                    {visibleTimeline.map((row, i) => {
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
                                onClick={(e) => { e.stopPropagation(); setBatchFilter(row.batch) }}
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
                {/* Infinite scroll sentinel */}
                <div ref={tabSentinelRef} className="h-1" />
                {visibleTimeline.length < filteredTimeline.length && (
                  <div className="flex justify-center py-3">
                    <span className="text-[11px] text-muted-foreground">Loading more…</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Scroll-to-top — appears after scrolling down in the content area */}
      <button
        type="button"
        onClick={() => contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
        className={cn(
          'absolute bottom-3 left-1/2 -translate-x-1/2 z-10',
          'flex h-7 w-7 items-center justify-center rounded-full',
          'bg-background/90 border border-border/60 shadow-md backdrop-blur-sm',
          'text-muted-foreground hover:text-foreground hover:border-border',
          'transition-all duration-200',
          showScrollTop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      </div>

      {/* In-place document viewer — opened by clicking any history row. */}
      <ProductDocumentDrawer
        open={!!activeDoc}
        docType={activeDoc?.docType ?? null}
        docId={activeDoc?.docId ?? null}
        highlightProductId={productId}
        onOpenChange={(o) => { if (!o) setActiveDoc(null) }}
      />
    </div>
  )
}
