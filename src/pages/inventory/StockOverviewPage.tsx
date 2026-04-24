import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import {
  Package,
  IndianRupee,
  AlertTriangle,
  Clock,
  Search,
  LayoutGrid,
  TableProperties,
  MapPin,
} from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
}

// ─────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────

type StockStatus = 'healthy' | 'low_stock' | 'out_of_stock' | 'near_expiry' | 'expired'

function getBatchStatus(
  product: any,
  batch: any
): StockStatus {
  const today = new Date()
  const expiry = new Date(batch.expiryDate)
  const daysToExpiry = differenceInDays(expiry, today)

  if (daysToExpiry < 0) return 'expired'
  if (daysToExpiry <= 90) return 'near_expiry'
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
  const products = useMasterDataStore((s) => s.products)
  const batches = useMasterDataStore((s) => s.batches)
  const fetchProducts = useMasterDataStore((s) => s.fetchProducts)

  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchProducts()
  }, [])
  useBranchRefresh(fetchProducts)

  // Build combined data — products without any batch get a synthetic out_of_stock row
  const stockRows: StockRow[] = useMemo(() => {
    const rows: StockRow[] = []

    for (const product of products) {
      const productBatches = batches.filter((b) => b.productId === product.id)
      if (productBatches.length === 0) {
        // No batches at all — show as out of stock
        rows.push({
          productId: product.id,
          productName: product.name,
          category: typeof product.category === 'object' ? (product.category as any)?.name ?? '' : (product.category ?? ''),
          batchId: '',
          batchNumber: '—',
          mfgDate: '',
          expiryDate: '',
          quantity: 0,
          mrp: Number(product.mrp),
          stockValue: 0,
          rackLocation: product.rackLocation,
          status: 'out_of_stock',
          totalStock: 0,
          minStock: product.minStock,
        })
      } else {
        for (const batch of productBatches) {
          const status = getBatchStatus(product, batch)
          rows.push({
            productId: product.id,
            productName: product.name,
            category: typeof product.category === 'object' ? (product.category as any)?.name ?? '' : (product.category ?? ''),
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            mfgDate: batch.mfgDate,
            expiryDate: batch.expiryDate,
            quantity: batch.quantity,
            mrp: Number(batch.mrp),
            stockValue: batch.quantity * Number(batch.mrp),
            rackLocation: product.rackLocation,
            status,
            totalStock: product.totalStock,
            minStock: product.minStock,
          })
        }
      }
    }

    return rows
  }, [batches, products])

  const filteredRows = useMemo(() => {
    let rows = stockRows
    const q = search.toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          r.batchNumber.toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== 'all') {
      rows = rows.filter((r) => r.category.toUpperCase() === categoryFilter.toUpperCase())
    }
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }
    return rows
  }, [stockRows, search, categoryFilter, statusFilter])

  // Stats
  const stats = useMemo(() => {
    const totalProducts = products.length
    const totalStockValue = products.reduce(
      (sum, p) => sum + p.totalStock * Number(p.mrp),
      0
    )
    const lowStockItems = products.filter(
      (p) => p.totalStock > 0 && p.totalStock < p.minStock
    ).length
    const today = new Date()
    const nearExpiry = batches.filter((b) => {
      const days = differenceInDays(new Date(b.expiryDate), today)
      return days >= 0 && days <= 90
    }).length

    return { totalProducts, totalStockValue, lowStockItems, nearExpiry }
  }, [products, batches])

  // Product-level aggregation for card view
  const productCards = useMemo(() => {
    return products.map((product) => {
      const productBatches = batches.filter((b) => b.productId === product.id)
      const today = new Date()

      let productStatus: StockStatus = 'healthy'
      if (product.totalStock === 0) productStatus = 'out_of_stock'
      else if (product.totalStock < product.minStock) productStatus = 'low_stock'

      for (const b of productBatches) {
        const days = differenceInDays(new Date(b.expiryDate), today)
        if (days < 0) { productStatus = 'expired'; break }
        if (days <= 90) productStatus = 'near_expiry'
      }

      return {
        ...product,
        mrp: Number(product.mrp),
        batchCount: productBatches.length,
        status: productStatus,
      }
    })
  }, [products, batches])

  const filteredCards = useMemo(() => {
    let cards = productCards
    const q = search.toLowerCase()
    if (q) {
      cards = cards.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.genericName.toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== 'all') {
      cards = cards.filter((c) => (typeof c.category === 'string' ? c.category : '').toUpperCase() === categoryFilter.toUpperCase())
    }
    if (statusFilter !== 'all') {
      cards = cards.filter((c) => c.status === statusFilter)
    }
    return cards
  }, [productCards, search, categoryFilter, statusFilter])

  // KPI config
  const kpiCards = [
    {
      title: 'Total Products',
      value: formatNumber(stats.totalProducts),
      icon: Package,
      iconBg: 'bg-blue-500/15 dark:bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Total Stock Value',
      value: formatCurrency(stats.totalStockValue),
      icon: IndianRupee,
      iconBg: 'bg-emerald-500/15 dark:bg-emerald-500/10',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Low Stock Items',
      value: formatNumber(stats.lowStockItems),
      icon: AlertTriangle,
      iconBg: 'bg-red-500/15 dark:bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: 'Near Expiry',
      value: formatNumber(stats.nearExpiry),
      icon: Clock,
      iconBg: 'bg-orange-500/15 dark:bg-orange-500/10',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Custom Flex Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stock Overview</h1>
            <p className="text-sm text-muted-foreground">Inventory status at a glance</p>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <motion.div key={kpi.title} variants={itemVariants}>
              <div className="glass rounded-2xl border border-border/60 p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {kpi.title}
                    </p>
                    <p className="font-mono mt-1 text-2xl font-bold">
                      {kpi.value}
                    </p>
                  </div>
                  <div className={cn('rounded-full p-2.5', kpi.iconBg)}>
                    <Icon className={cn('h-5 w-5', kpi.iconColor)} />
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* ── Filters & View Toggle ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products or batches..."
        resultsCount={viewMode === 'table' ? filteredRows.length : filteredCards.length}
        activeFilterCount={(categoryFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
        onClearFilters={() => {
          setCategoryFilter('all');
          setStatusFilter('all');
        }}
        actionNode={
          <div className="flex items-center rounded-xl border border-border/60 p-1">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              <TableProperties className="mr-1 h-4 w-4" />
              Table
            </Button>
            <Button
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('card')}
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
          onValueChange={setCategoryFilter}
          onClear={() => setCategoryFilter('all')}
          options={[
            { label: 'All Categories', value: 'all' },
            { label: 'Nephrology', value: 'NEPHROLOGY' },
            { label: 'Oncology', value: 'ONCOLOGY' },
            { label: 'General', value: 'GENERAL' },
            { label: 'OTC', value: 'OTC' },
            { label: 'Surgical', value: 'SURGICAL' },
          ]}
        />
        <EnumSelect
          label="Status"
          value={statusFilter}
          onValueChange={setStatusFilter}
          onClear={() => setStatusFilter('all')}
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
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <div className="rounded-2xl border border-border/60 bg-card shadow">

              {/* Mobile card list */}
              <div className="md:hidden">
                {filteredRows.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No stock records found matching your filters.
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {filteredRows.map((row) => {
                      const sc = statusConfig[row.status]
                      return (
                        <div key={row.batchId || row.productId} className="flex items-start justify-between gap-2 px-4 py-3">
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
                  <TableRow className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Mfg Date</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Stock Value</TableHead>
                    <TableHead>Rack</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const sc = statusConfig[row.status]
                    return (
                      <TableRow key={row.batchId} className="border-b border-border/40">
                        <TableCell className="font-medium">
                          {row.productName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.batchNumber}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(row.mfgDate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(row.expiryDate)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(row.mrp)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {formatCurrency(row.stockValue)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.rackLocation}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} dot size="sm">
                            {sc.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No stock records found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ── Card View ── */}
      {viewMode === 'card' && (
        <motion.div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filteredCards.map((product) => {
            const sc = statusConfig[product.status]
            return (
              <motion.div key={product.id} variants={itemVariants}>
                <Card hover className="cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">
                          {product.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {product.genericName}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'mt-1 h-3 w-3 shrink-0 rounded-full',
                          sc.dot
                        )}
                        title={sc.label}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Total Stock
                        </p>
                        <p className="font-mono font-semibold">
                          {formatNumber(product.totalStock)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Batches
                        </p>
                        <p className="font-mono font-semibold">{product.batchCount}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          MRP
                        </p>
                        <p className="font-mono text-sm font-semibold">
                          {formatCurrency(product.mrp)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {product.rackLocation}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <Badge variant={sc.variant} dot size="sm">
                        {sc.label}
                      </Badge>
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
            <div className="col-span-full py-16 text-center text-muted-foreground">
              No products found matching your filters.
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
