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
  Upload,
  FileDown,
} from 'lucide-react'
import { isExpired, isNearExpiry } from '@/lib/inventory'
import api from '@/lib/api'
import { usePersistedState } from '@/hooks/usePersistedState'
import { exportToExcel } from '@/lib/excelUtils'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { ExportMenu } from '@/components/shared/ExportMenu'

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

import { useMasterDataStore } from '@/stores/masterDataStore'
import { navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { BatchDetailView } from './BatchDetailView'

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

  const [viewMode, setViewMode] = usePersistedState<'table' | 'card'>('filters:inventory.stock:view', 'table')
  const [search, setSearch] = usePersistedState('filters:inventory.stock:search', '')
  const [categoryFilter, setCategoryFilter] = usePersistedState('filters:inventory.stock:category', 'all')
  const [statusFilter, setStatusFilter] = usePersistedState('filters:inventory.stock:status', 'all')
  const [currentPage, setCurrentPage] = useState(1)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null)

  // Server-paginated rows for both views, plus the KPI bundle.
  const [batchRows, setBatchRows] = useState<any[]>([])
  const [batchTotal, setBatchTotal] = useState(0)
  const [productRows, setProductRows] = useState<any[]>([])
  const [productTotal, setProductTotal] = useState(0)
  const [stats, setStats] = useState<any>(null)

  // Categories dropdown only — small list, cached in store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCategories() }, [])

  // KPI bundle — one cheap call, no row data attached. Scoped to the active
  // category + status filters so the stat cards reflect whatever the operator
  // selected.
  useEffect(() => {
    api.get('/reports/inventory/stats', {
      params: {
        categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      },
    })
      .then((res) => setStats(res.data))
      .catch(() => {})
  }, [categoryFilter, statusFilter])

  // Map UI status → API params for /batches.
  // Note: the backend's `status: 'active'` means qty>0 AND not expired, so we
  // can't use it for the Expired filter (it'd cancel itself out). qty=0
  // exclusion is done client-side in `paginatedRows` below.
  const statusToBatchParams = (status: string): Record<string, string | boolean | undefined> => {
    if (status === 'expired') return { expired: true }
    if (status === 'near_expiry') return { expiringWithin: '90' }
    if (status === 'out_of_stock') return { status: 'out_of_stock' }
    // low_stock / healthy are product-stock statuses (not expiry) — resolved
    // server-side via the stockStatus param.
    if (status === 'low_stock' || status === 'healthy') return { stockStatus: status }
    return {}
  }

  // Fetch the visible page from /batches (table view) or /products (cards view).
  useEffect(() => {
    if (viewMode !== 'table') return
    let cancelled = false
    api.get('/batches', {
      params: {
        q: search.trim() || undefined,
        categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
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
  }, [viewMode, search, categoryFilter, statusFilter, currentPage])

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

  // ── Export: pull all matching rows (server-capped at 10000) reflecting the
  // current filters, then hand them to ExportMenu for Print / Excel / PDF.
  const fetchStockExportRows = async (): Promise<Record<string, string | number>[]> => {
    const res = await api.get('/batches', {
      params: {
        q: search.trim() || undefined,
        ...statusToBatchParams(statusFilter),
        take: 10000,
      },
    })
    const rawRows: any[] = res.data?.data ?? []
    const rows = statusFilter === 'out_of_stock'
      ? rawRows
      : rawRows.filter((r) => Number(r.quantity) > 0)
    return rows.map((r) => {
      const qty = Number(r.quantity) || 0
      const mrp = Number(r.mrp) || 0
      const status = getBatchStatus(
        { totalStock: r.productTotalStock, minStock: r.minStock },
        r,
      )
      return {
        'Product Name': r.productName ?? '',
        'Batch Number': r.batchNumber ?? '',
        'Expiry Date': r.expiryDate ? formatDate(r.expiryDate) : '',
        'Quantity': qty,
        'MRP': mrp,
        'Stock Value': qty * mrp,
        'Rack Location': r.rackLocation ?? '',
        'Status': statusConfig[status].label,
      }
    })
  }

  // ── Import: sample template download only (upload deferred) ──
  const handleDownloadSampleTemplate = () => {
    const sampleRows = [
      {
        'Product Name': 'Paracetamol 500mg',
        'Batch Number': 'B-001',
        'Expiry Date': '31/12/2027',
        'Quantity': 100,
        'MRP': 25,
        'Purchase Rate': 18,
        'Rack Location': 'A-01',
        'Supplier Name': 'ABC Pharma',
      },
    ]
    exportToExcel(sampleRows, 'stock-import-template')
  }

  // Map API batch rows → StockRow shape the renderer already expects. Status
  // is computed client-side per row using the joined product info on each
  // batch (productTotalStock + minStock + expiryDate). qty=0 batches are
  // hidden by default — they're "handled" (written off / disposed) and
  // shouldn't clutter the working view. The "Out of Stock" status filter
  // is the explicit escape hatch when the user wants to see them.
  const paginatedRows: StockRow[] = useMemo(() => {
    const source = statusFilter === 'out_of_stock'
      ? batchRows
      : batchRows.filter((r) => Number(r.quantity) > 0)
    return source.map((r) => ({
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
      rackLocation: r.rackLocation ?? '',
      status: getBatchStatus({ totalStock: r.productTotalStock, minStock: r.minStock }, r),
      totalStock: r.productTotalStock ?? 0,
      minStock: r.minStock ?? 0,
    }))
  }, [batchRows, statusFilter])

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

  // Clicking a card with a `filterKey` switches to the table view (where the
  // status filter actually narrows the /batches query — card view ignores it)
  // and sets the existing `statusFilter` to that status, toggling off if it's
  // already active. Cards without a filterKey are pure aggregates (Total
  // Products / Sellable Value) and just clear any active card filter.
  const applyCardFilter = (filterKey: StockStatus | null) => {
    if (!filterKey) {
      setStatusFilter('all')
      setCurrentPage(1)
      return
    }
    const active = statusFilter === filterKey
    if (!active) setViewMode('table')
    setStatusFilter(active ? 'all' : filterKey)
    setCurrentPage(1)
  }

  // KPI config — matches the SalesList card pattern: left border accent,
  // colored icon square, font-mono value, lowercase subtitle. `filterKey`
  // maps the actionable cards onto the existing `statusFilter` state;
  // `activeRing` highlights the card when its filter is active.
  const kpiCards: Array<{
    title: string; value: string; subtitle: string
    icon: typeof Package; iconBg: string; borderAccent: string
    filterKey: StockStatus | null; activeRing: string
  }> = [
    {
      title: 'Total Products',
      value: formatNumber(stats?.totalProducts ?? 0),
      subtitle: 'in catalog',
      icon: Package,
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      borderAccent: 'border-l-blue-500',
      filterKey: null,
      activeRing: '',
    },
    {
      title: 'Sellable Stock Value',
      value: formatCurrency(stats?.sellableStockValue ?? 0),
      subtitle: 'at MRP',
      icon: IndianRupee,
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      borderAccent: 'border-l-emerald-500',
      filterKey: null,
      activeRing: '',
    },
    {
      title: 'Low Stock Items',
      value: formatNumber(stats?.lowStockItems ?? 0),
      subtitle: 'below min level',
      icon: AlertTriangle,
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      borderAccent: 'border-l-amber-500',
      filterKey: 'low_stock',
      activeRing: 'ring-2 ring-amber-500/50',
    },
    {
      title: 'Near Expiry',
      value: formatNumber(stats?.nearExpiryCount ?? 0),
      subtitle: 'within 90 days',
      icon: Clock,
      iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
      borderAccent: 'border-l-orange-500',
      filterKey: 'near_expiry',
      activeRing: 'ring-2 ring-orange-500/50',
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
      filterKey: 'expired',
      activeRing: 'ring-2 ring-rose-500/50',
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
      {/* responsive: 2-up on phones (was 1-per-row) so the KPIs stay compact */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          const active = kpi.filterKey !== null && statusFilter === kpi.filterKey
          return (
            <Card
              key={kpi.title}
              hover
              role="button"
              tabIndex={0}
              title={kpi.filterKey === null ? 'Show all stock' : `Filter to ${kpi.title.toLowerCase()}`}
              onClick={() => applyCardFilter(kpi.filterKey)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyCardFilter(kpi.filterKey) } }}
              className={cn('border-l-[3px] cursor-pointer transition-shadow', kpi.borderAccent, active && kpi.activeRing)}
            >
              <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10', kpi.iconBg)}>
                  <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
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
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:w-auto sm:flex-none border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import
            </Button>
            <ExportMenu
              title="Stock Overview"
              filename={`stock-overview-${new Date().toISOString().slice(0, 10)}`}
              noun="record"
              rows={fetchStockExportRows}
              emptyMessage="No stock records to export for the current filters"
              className="flex-1 sm:w-auto sm:flex-none border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
            />
            <div className="flex w-full items-center rounded-xl border border-border/60 p-1 sm:w-auto">
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => { setViewMode('table'); setCurrentPage(1) }}
              >
                <TableProperties className="mr-1 h-4 w-4" />
                Table
              </Button>
              <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => { setViewMode('card'); setCurrentPage(1) }}
              >
                <LayoutGrid className="mr-1 h-4 w-4" />
                Cards
              </Button>
            </div>
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
                    if (row.batchId) setDetailBatchId(row.batchId)
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
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Stock Value</TableHead>
                  <TableHead className="text-center">Rack</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-40">
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
                        if (row.batchId) setDetailBatchId(row.batchId)
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
                          <TableCell className="text-muted-foreground">{formatDate(row.expiryDate)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{row.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(row.mrp)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(row.stockValue)}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{row.rackLocation || '—'}</TableCell>
                          <TableCell className="text-center">
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
                  <Card
                    hover
                    role="button"
                    tabIndex={0}
                    title={`View stock history for ${product.name}`}
                    onClick={() => navigate(`/inventory/product-history?productId=${product.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/inventory/product-history?productId=${product.id}`) } }}
                    className="cursor-pointer"
                  >
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

      {/* ── Batch Detail Side Panel ── */}
      <Sheet
        open={!!detailBatchId}
        onOpenChange={(open) => { if (!open) setDetailBatchId(null) }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-190 p-0 gap-0 flex flex-col"
        >
          <SheetTitle className="sr-only">Batch detail</SheetTitle>
          <BatchDetailView
            batchId={detailBatchId}
            onAfterAction={() => {
              setDetailBatchId(null)
              // Refresh the table so the just-adjusted batch reflects the new qty.
              setBatchRows((prev) => prev.filter((r) => r.id !== detailBatchId))
            }}
          />
        </SheetContent>
      </Sheet>

      {/* ── Import Dialog (sample template only for now) ── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Stock Batches</DialogTitle>
            <DialogDescription>
              Bulk upload is coming soon. For now, download the sample template to see
              the expected format — share it with whoever is preparing the data, and
              we'll wire up the upload step once the backend is ready.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleDownloadSampleTemplate}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Download Sample Template
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Columns: Product Name, Batch Number, Expiry Date (DD/MM/YYYY), Quantity,
              MRP, Purchase Rate, Rack Location, Supplier Name.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
