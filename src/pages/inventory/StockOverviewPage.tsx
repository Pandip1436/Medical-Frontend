import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package,
  IndianRupee,
  AlertTriangle,
  Clock,
  LayoutGrid,
  TableProperties,
  MapPin,
  PackageX,
  Pencil,
} from 'lucide-react'
import { isExpired, isNearExpiry } from '@/lib/inventory'
import api from '@/lib/api'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { useMasterDataStore } from '@/stores/masterDataStore'
import { navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────

type StockStatus = 'healthy' | 'low_stock' | 'out_of_stock' | 'near_expiry' | 'expired'

function getBatchStatus(
  product: any,
  batch: any
): StockStatus {
  if (isExpired(batch.expiryDate)) return 'expired'
  if (isNearExpiry(batch.expiryDate, 90)) return 'near_expiry'
  if (product.totalStock === 0) return 'out_of_stock'
  if (product.totalStock < product.minStock) return 'low_stock'
  return 'healthy'
}

const statusConfig: Record<
  StockStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'info' | 'purple'; dot: string }
> = {
  healthy: {
    label: 'Healthy',
    variant: 'success',
    dot: 'bg-emerald-500',
  },
  low_stock: {
    label: 'Low Stock',
    variant: 'warning',
    dot: 'bg-amber-500',
  },
  out_of_stock: {
    label: 'Out of Stock',
    variant: 'destructive',
    dot: 'bg-red-500',
  },
  near_expiry: {
    label: 'Near Expiry',
    variant: 'warning',
    dot: 'bg-orange-500',
  },
  expired: {
    label: 'Expired',
    variant: 'destructive',
    dot: 'bg-red-800',
  },
}

// ─────────────────────────────────────────────────────────────
// Combined batch + product data type
// ─────────────────────────────────────────────────────────────

interface StockRow {
  productId: string
  productName: string
  category: string
  categoryId: string
  batchId: string
  batchNumber: string
  mfgDate: string
  expiryDate: string
  quantity: number
  mrp: number
  stockValue: number
  rackLocation: string
  status: StockStatus
  totalStock: number
  minStock: number
}

// ─────────────────────────────────────────────────────────────
// StockOverviewPage
// ─────────────────────────────────────────────────────────────

export default function StockOverviewPage() {
  const storeCategories = useMasterDataStore((s) => s.categories)
  const fetchCategories = useMasterDataStore((s) => s.fetchCategories)
  const PAGE_SIZE = 15

  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Server-paginated rows for both views, plus the KPI bundle.
  const [batchRows, setBatchRows] = useState<any[]>([])
  const [batchTotal, setBatchTotal] = useState(0)
  const [productRows, setProductRows] = useState<any[]>([])
  const [productTotal, setProductTotal] = useState(0)
  const [stats, setStats] = useState<any>(null)

  // Categories dropdown only — small list, cached in store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCategories() }, [])

  // KPI bundle — one cheap call, no row data attached.
  useEffect(() => {
    api.get('/reports/inventory/stats')
      .then((res) => setStats(res.data))
      .catch(() => {})
  }, [])

  // Map UI status → API params for /batches.
  const statusToBatchParams = (status: string): Record<string, string | boolean | undefined> => {
    if (status === 'expired') return { expired: true }
    if (status === 'near_expiry') return { expiringWithin: '90' }
    if (status === 'out_of_stock') return { status: 'out_of_stock' }
    return {}
  }

  // Fetch the visible page from /batches (table view) or /products (cards view).
  useEffect(() => {
    if (viewMode !== 'table') return
    let cancelled = false
    api.get('/batches', {
      params: {
        q: search.trim() || undefined,
        ...statusToBatchParams(statusFilter),
        skip: (currentPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      },
    })
      .then((res) => {
        if (cancelled) return
        setBatchRows(res.data?.data ?? [])
        setBatchTotal(res.data?.total ?? 0)
      })
      .catch(() => { if (!cancelled) { setBatchRows([]); setBatchTotal(0) } })
    return () => { cancelled = true }
  }, [viewMode, search, statusFilter, currentPage])

  useEffect(() => {
    if (viewMode !== 'card') return
    let cancelled = false
    api.get('/products', {
      params: {
        q: search.trim() || undefined,
        categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
        skip: (currentPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      },
    })
      .then((res) => {
        if (cancelled) return
        setProductRows(res.data?.data ?? [])
        setProductTotal(res.data?.total ?? 0)
      })
      .catch(() => { if (!cancelled) { setProductRows([]); setProductTotal(0) } })
    return () => { cancelled = true }
  }, [viewMode, search, categoryFilter, currentPage])

  // Reset to page 1 whenever a filter changes (or the view mode flips).
  useEffect(() => { setCurrentPage(1) }, [viewMode, search, categoryFilter, statusFilter])

  // Map API batch rows → StockRow shape the renderer already expects. Status
  // is computed client-side per row using the joined product info on each
  // batch (productTotalStock + minStock + expiryDate).
  const paginatedRows: StockRow[] = useMemo(() => {
    return batchRows.map((r) => ({
      productId: r.productId,
      productName: r.productName ?? 'Unknown',
      category: '',
      categoryId: '',
      batchId: r.id,
      batchNumber: r.batchNumber,
      mfgDate: r.mfgDate,
      expiryDate: r.expiryDate,
      quantity: r.quantity,
      mrp: Number(r.mrp),
      stockValue: r.quantity * Number(r.mrp),
      rackLocation: '',
      status: getBatchStatus({ totalStock: r.productTotalStock, minStock: r.minStock }, r),
      totalStock: r.productTotalStock ?? 0,
      minStock: r.minStock ?? 0,
    }))
  }, [batchRows])

  const totalPages = Math.max(1, Math.ceil(batchTotal / PAGE_SIZE))

  // Cards: derive product-level status from totalStock/minStock and the
  // nested batches (if the /products response carries them — which it does).
  const filteredCards = useMemo(() => {
    return productRows.map((product: any) => {
      const productBatches: any[] = product.batches ?? []

      let productStatus: StockStatus = 'healthy'
      if (product.totalStock === 0) productStatus = 'out_of_stock'
      else if (product.totalStock < product.minStock) productStatus = 'low_stock'

      for (const b of productBatches) {
        if (isExpired(b.expiryDate)) { productStatus = 'expired'; break }
        if (isNearExpiry(b.expiryDate, 90)) productStatus = 'near_expiry'
      }

      return {
        ...product,
        mrp: Number(product.mrp),
        batchCount: productBatches.length,
        status: productStatus,
      }
    })
  }, [productRows])

  // Visible row count for the filter bar header — depends on which view is active.
  const filteredRowsCount = viewMode === 'table' ? batchTotal : productTotal

  // KPI config — matches the SalesList card pattern: left border accent,
  // colored icon square, font-mono value, lowercase subtitle.
  const kpiCards: Array<{
    title: string; value: string; subtitle: string
    icon: typeof Package; iconBg: string; borderAccent: string
    onClick?: () => void
  }> = [
    {
      title: 'Total Products',
      value: formatNumber(stats?.totalProducts ?? 0),
      subtitle: 'in catalog',
      icon: Package,
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      borderAccent: 'border-l-blue-500',
    },
    {
      title: 'Sellable Stock Value',
      value: formatCurrency(stats?.sellableStockValue ?? 0),
      subtitle: 'at MRP',
      icon: IndianRupee,
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      borderAccent: 'border-l-emerald-500',
    },
    {
      title: 'Low Stock Items',
      value: formatNumber(stats?.lowStockItems ?? 0),
      subtitle: 'below min level',
      icon: AlertTriangle,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      borderAccent: 'border-l-amber-500',
    },
    {
      title: 'Near Expiry',
      value: formatNumber(stats?.nearExpiryCount ?? 0),
      subtitle: 'within 90 days',
      icon: Clock,
      iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
      borderAccent: 'border-l-orange-500',
      onClick: () => navigate('/inventory/expiry'),
    },
    {
      title: 'Expired Stock',
      value: (stats?.expiredStockValue ?? 0) > 0 ? formatCurrency(stats.expiredStockValue) : '—',
      subtitle: (stats?.expiredBatchCount ?? 0) > 0
        ? `${stats.expiredBatchCount} batch${stats.expiredBatchCount === 1 ? '' : 'es'}`
        : 'no expired stock',
      icon: PackageX,
      iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      borderAccent: 'border-l-rose-500',
      onClick: () => navigate('/inventory/expiry'),
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card
              key={kpi.title}
              hover
              onClick={kpi.onClick}
              className={cn('border-l-[3px]', kpi.borderAccent, kpi.onClick && 'cursor-pointer')}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', kpi.iconBg)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {kpi.title}
                  </p>
                  <p className="text-lg font-bold font-mono leading-tight">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground">{kpi.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── Filters & View Toggle ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products or batches..."
        resultsCount={filteredRowsCount}
        activeFilterCount={(categoryFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
        onClearFilters={() => {
          setCategoryFilter('all');
          setStatusFilter('all');
          setCurrentPage(1);
        }}
        actionNode={
          <div className="flex items-center rounded-xl border border-border/60 p-1">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => { setViewMode('table'); setCurrentPage(1) }}
            >
              <TableProperties className="mr-1 h-4 w-4" />
              Table
            </Button>
            <Button
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => { setViewMode('card'); setCurrentPage(1) }}
            >
              <LayoutGrid className="mr-1 h-4 w-4" />
              Cards
            </Button>
          </div>
        }
      >
        <EnumSelect
          label="Category"
          value={categoryFilter}
          onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1) }}
          onClear={() => { setCategoryFilter('all'); setCurrentPage(1) }}
          options={[
            { label: 'All Categories', value: 'all' },
            ...storeCategories.map((c) => ({ label: c.name, value: c.id })),
          ]}
        />
        <EnumSelect
          label="Status"
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}
          onClear={() => { setStatusFilter('all'); setCurrentPage(1) }}
          options={[
            { label: 'All Status', value: 'all' },
            { label: 'Healthy', value: 'healthy' },
            { label: 'Low Stock', value: 'low_stock' },
            { label: 'Out of Stock', value: 'out_of_stock' },
            { label: 'Near Expiry', value: 'near_expiry' },
            { label: 'Expired', value: 'expired' },
          ]}
        />
      </DataTableFilterBar>

      {/* ── Table View ── */}
      {viewMode === 'table' && (
        <Card>
          {/* Mobile card list */}
          <div className="md:hidden">
            {paginatedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                  <Package className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No stock records found</p>
                <p className="text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {paginatedRows.map((row) => {
                  const sc = statusConfig[row.status]
                  const onRowClick = () => {
                    if (row.batchId) navigate(`/inventory/batches/detail?id=${row.batchId}`)
                    else navigate(`/inventory/product-history?productId=${row.productId}`)
                  }
                  return (
                    <div
                      key={row.batchId || row.productId}
                      onClick={onRowClick}
                      className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate font-medium text-sm">{row.productName}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {row.batchNumber}{row.rackLocation ? ` · ${row.rackLocation}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          <Badge variant={sc.variant} dot size="sm">{sc.label}</Badge>
                          {row.expiryDate && (
                            <span className="text-xs text-muted-foreground">Exp: {formatDate(row.expiryDate)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="font-mono text-sm font-semibold">{formatCurrency(row.stockValue)}</span>
                        <span className="text-xs text-muted-foreground">{row.quantity} units · {formatCurrency(row.mrp)} MRP</span>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DataTableRowActions
                            onView={onRowClick}
                            customActions={row.batchId ? [
                              {
                                label: 'Quick Adjust',
                                icon: <Pencil className="h-4 w-4" />,
                                onClick: () => navigate(`/inventory/adjustment?batchId=${row.batchId}`),
                              },
                            ] : []}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Mfg Date</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead>Rack</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-40">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                            <Package className="h-6 w-6 text-muted-foreground/60" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">No stock records found</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((row, idx) => {
                      const sc = statusConfig[row.status]
                      const onRowClick = () => {
                        if (row.batchId) navigate(`/inventory/batches/detail?id=${row.batchId}`)
                        else navigate(`/inventory/product-history?productId=${row.productId}`)
                      }
                      return (
                        <motion.tr
                          key={row.batchId || row.productId}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.15, delay: idx * 0.02 }}
                          onClick={onRowClick}
                          className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30"
                        >
                          <TableCell className="font-medium">{row.productName}</TableCell>
                          <TableCell className="font-mono text-xs">{row.batchNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(row.mfgDate)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(row.expiryDate)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{row.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(row.mrp)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(row.stockValue)}</TableCell>
                          <TableCell className="text-muted-foreground">{row.rackLocation}</TableCell>
                          <TableCell>
                            <Badge variant={sc.variant} dot size="sm">{sc.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DataTableRowActions
                              onView={onRowClick}
                              customActions={row.batchId ? [
                                {
                                  label: 'Quick Adjust',
                                  icon: <Pencil className="h-4 w-4" />,
                                  onClick: () => navigate(`/inventory/adjustment?batchId=${row.batchId}`),
                                },
                              ] : []}
                            />
                          </TableCell>
                        </motion.tr>
                      )
                    })
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={batchTotal}
            itemsPerPage={PAGE_SIZE}
            className="border-t border-border/40 px-4"
          />
        </Card>
      )}

      {/* ── Card View ── */}
      {viewMode === 'card' && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCards.map((product, idx) => {
              const sc = statusConfig[product.status as StockStatus]
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: idx * 0.02 }}
                >
                  <Card hover className="cursor-pointer">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold">{product.name}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">{product.genericName}</p>
                        </div>
                        <div
                          className={cn('mt-1 h-3 w-3 shrink-0 rounded-full', sc.dot)}
                          title={sc.label}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Stock</p>
                          <p className="font-mono font-semibold">{formatNumber(product.totalStock)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batches</p>
                          <p className="font-mono font-semibold">{product.batchCount}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MRP</p>
                          <p className="font-mono text-sm font-semibold">{formatCurrency(product.mrp)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{product.rackLocation}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <Badge variant={sc.variant} dot size="sm">{sc.label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {typeof product.category === 'object' ? (product.category as any)?.name ?? '' : (product.category ?? '')}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
            {filteredCards.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                  <Package className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No products found</p>
                <p className="text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
          {productTotal > PAGE_SIZE && (
            <DataTablePagination
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(productTotal / PAGE_SIZE))}
              onPageChange={setCurrentPage}
              totalItems={productTotal}
              itemsPerPage={PAGE_SIZE}
              className="mt-4"
            />
          )}
        </>
      )}
    </motion.div>
  )
}
