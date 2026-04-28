import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Package,
  ArrowDown, ArrowUp, ChevronLeft,
  IndianRupee, BarChart3, Download,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'
import api from '@/lib/api'
import { useRoute, navigate } from '@/lib/router'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { exportToCsv } from '@/lib/exportUtils'

// ─── Constants ────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'SALE', label: 'Sales Only' },
  { value: 'PURCHASE', label: 'Purchases Only' },
] as const

// ─── Types ────────────────────────────────────────────────────
interface TimelineRow {
  type: 'SALE' | 'PURCHASE'
  date: Date
  ref: string
  party: string
  batch: string
  qty: number
  amount: number
  cumPurchaseQty: number
  cumSaleQty: number
  runningStock: number
}

export default function ProductHistoryPage() {
  const { search } = useRoute()
  const products = useMasterDataStore(s => s.products)
  const fetchProducts = useMasterDataStore(s => s.fetchProducts)

  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    const params = new URLSearchParams(search)
    return params.get('productId') ?? ''
  })
  const [history, setHistory] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  useEffect(() => { fetchProducts() }, [])
  useBranchRefresh(fetchProducts)

  const loadHistory = useCallback(async (productId: string) => {
    if (!productId) return
    setLoading(true)
    setHistory(null)
    try {
      const res = await api.get(`/products/${productId}/history`)
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

  const selectedProduct = products.find(p => p.id === selectedProductId)

  // Build timeline with running stock balance anchored to real current stock
  const timeline = useMemo((): TimelineRow[] => {
    if (!history) return []
    const sales = history.sales.map((s: any) => ({
      type: 'SALE' as const,
      date: new Date(s.date),
      ref: s.invoiceNumber,
      party: s.customerName,
      batch: s.batchNumber,
      qty: s.quantity,
      amount: s.amount,
    }))
    const purchases = history.purchases.map((p: any) => ({
      type: 'PURCHASE' as const,
      date: new Date(p.date),
      ref: p.grnNumber,
      party: p.supplierName,
      batch: p.batchNumber,
      qty: p.receivedQty,
      amount: p.amount,
    }))
    // Sort oldest-first to build forward running balance
    const merged = [...sales, ...purchases].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Anchor: walk forward and compute net change relative to current real stock
    // net = sum of all purchases - sum of all sales in this history
    let totalPurchased = 0
    let totalSold = 0
    merged.forEach(row => {
      if (row.type === 'PURCHASE') totalPurchased += row.qty
      else totalSold += row.qty
    })
    // Opening stock = currentStock - (totalPurchased - totalSold)
    const currentStock: number = history.summary.currentStock ?? 0
    const openingStock = currentStock - (totalPurchased - totalSold)

    let runningStock = openingStock
    let runningPurchase = 0
    let runningSale = 0
    return merged.map(row => {
      if (row.type === 'PURCHASE') { runningStock += row.qty; runningPurchase += row.qty }
      else { runningStock -= row.qty; runningSale += row.qty }
      return { ...row, cumPurchaseQty: runningPurchase, cumSaleQty: runningSale, runningStock }
    })
  }, [history])

  // Apply filters + sort
  const filteredTimeline = useMemo(() => {
    let rows = [...timeline]

    if (typeFilter !== 'all') rows = rows.filter(r => r.type === typeFilter)

    if (dateFrom) rows = rows.filter(r => r.date >= new Date(dateFrom))
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      rows = rows.filter(r => r.date <= end)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(r =>
        r.ref.toLowerCase().includes(q) ||
        r.party.toLowerCase().includes(q) ||
        r.batch.toLowerCase().includes(q)
      )
    }

    if (sortOrder === 'desc') rows = rows.reverse()
    return rows
  }, [timeline, typeFilter, dateFrom, dateTo, searchQuery, sortOrder])

  const activeFilterCount = [
    typeFilter !== 'all' ? typeFilter : '',
    dateFrom,
    dateTo,
    searchQuery,
  ].filter(Boolean).length

  const clearFilters = () => {
    setTypeFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearchQuery('')
  }

  const handleExport = () => {
    if (!filteredTimeline.length) { toast.info('No data to export'); return }
    const productName = selectedProduct?.name ?? history?.product?.name ?? 'product'
    exportToCsv(
      filteredTimeline.map((r) => ({
        Type: r.type,
        Date: formatDate(r.date.toISOString()),
        'Invoice / GRN #': r.ref,
        Party: r.party,
        Batch: r.batch,
        Qty: r.qty,
        Amount: r.amount,
        'Cumulative Purchased': r.cumPurchaseQty,
        'Cumulative Sold': r.cumSaleQty,
      })),
      `product-history-${productName.replace(/\s+/g, '-').toLowerCase()}`
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" onClick={() => navigate('/inventory/products')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Product History</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              View full sales and purchase transaction history for any product
            </p>
          </div>
        </div>
        {history && (
          <div className="flex items-center gap-2 self-start">
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
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExport}
              disabled={!filteredTimeline.length}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        )}
      </div>

      {/* Summary stats — top, only when product selected */}
      {history && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'In Stock',
              value: String(history.summary.currentStock),
              subtitle: `${history.product.activeBatches} active batch${history.product.activeBatches !== 1 ? 'es' : ''}`,
              icon: Package,
              iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
              borderAccent: 'border-l-blue-500',
            },
            {
              label: 'Sold Qty',
              value: String(history.summary.totalSoldQty),
              subtitle: `${history.summary.salesCount} sale${history.summary.salesCount !== 1 ? 's' : ''}`,
              icon: TrendingDown,
              iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
              borderAccent: 'border-l-rose-500',
            },
            {
              label: 'Purchased Qty',
              value: String(history.summary.totalPurchasedQty),
              subtitle: `${history.summary.purchaseCount} purchase${history.summary.purchaseCount !== 1 ? 's' : ''}`,
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

      {/* Filter bar — search | product dropdown | filters */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search reference, party or batch..."
        resultsCount={filteredTimeline.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        midNode={
          <div className="w-60 shrink-0">
            <ProductSearchInput
              products={products}
              selectedId={selectedProductId}
              onSelect={id => { setSelectedProductId(id); setHistory(null) }}
              onClear={() => { setSelectedProductId(''); setHistory(null) }}
              selectedLabel={selectedProduct ? selectedProduct.name : ''}
            />
          </div>
        }
      >
        <EnumSelect
          label="Type"
          value={typeFilter}
          onValueChange={setTypeFilter}
          onClear={() => setTypeFilter('all')}
          options={TYPE_OPTIONS}
        />

        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Date From
          </Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Date To
          </Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </DataTableFilterBar>

      {/* Table / empty states */}
      {!selectedProductId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <Package className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No product selected</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">Search and select a product above to view its history</p>
            </div>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
            <p className="text-sm text-muted-foreground animate-pulse">Loading transaction history…</p>
          </CardContent>
        </Card>
      ) : filteredTimeline.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <BarChart3 className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No transactions found</p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice # / GRN #</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Purchase Qty</TableHead>
                  <TableHead className="text-right">Sale Qty</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTimeline.map((row, i) => {
                  const isSale = row.type === 'SALE'
                  return (
                    <TableRow
                      key={`${row.type}-${row.ref}-${i}`}
                      className={isSale
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                        : 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                      }
                    >
                      <TableCell>
                        <span className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase',
                          isSale
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        )}>
                          {isSale ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                          {isSale ? 'Sale' : 'Purchase'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.date.toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell className="text-xs font-medium font-mono">{row.ref}</TableCell>
                      <TableCell className="text-xs">{row.party}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{row.batch}</TableCell>
                      <TableCell className={cn('text-right text-xs font-mono font-semibold',
                        isSale ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
                      )}>
                        {isSale ? `−${row.qty}` : `+${row.qty}`}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {isSale
                          ? <span className="text-muted-foreground/40">—</span>
                          : <span className="text-emerald-700 dark:text-emerald-300">+{row.qty}</span>
                        }
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {isSale
                          ? <span className="text-rose-700 dark:text-rose-300">−{row.qty}</span>
                          : <span className="text-muted-foreground/40">—</span>
                        }
                      </TableCell>
                      <TableCell className={cn('text-right text-xs font-mono font-semibold', row.runningStock <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-primary')}>
                        {row.runningStock}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </motion.div>
  )
}

// ─── Product search input sub-component ───────────────────────
function ProductSearchInput({
  products,
  selectedId,
  onSelect,
  onClear,
  selectedLabel,
}: {
  products: any[]
  selectedId: string
  onSelect: (id: string) => void
  onClear: () => void
  selectedLabel: string
}) {
  const [q, setQ] = useState(selectedLabel)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!selectedId) setQ('')
    else setQ(selectedLabel)
  }, [selectedId, selectedLabel])

  const filtered = useMemo(() => {
    if (!q.trim()) return products.slice(0, 30)
    const lower = q.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      (p.genericName ?? '').toLowerCase().includes(lower)
    ).slice(0, 30)
  }, [q, products])

  return (
    <div className="relative">
      <Input
        placeholder="Search product by name or generic name..."
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        suffix={selectedId
          ? <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" onClick={onClear}>✕</button>
          : undefined
        }
      />
      {open && !selectedId && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border/60 bg-popover shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No products found</p>
          ) : filtered.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-3"
              onMouseDown={e => { e.preventDefault(); onSelect(p.id); setQ(p.name); setOpen(false) }}
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                {p.genericName && <p className="text-xs text-muted-foreground truncate">{p.genericName}</p>}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{p.totalStock ?? 0} in stock</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
