import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { AlertOctagon, CalendarClock, Search, Undo2, Trash2 } from 'lucide-react'
import { differenceInDays } from 'date-fns'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import api from '@/lib/api'

// ─────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

type ExpiryBucket = 'expired' | '30d' | '60d' | '90d' | '180d'

interface EnrichedBatch {
  batchId: string
  batchNumber: string
  productId: string
  productName: string
  expiryDate: string
  mfgDate: string
  quantity: number
  mrp: number
  stockValue: number
  supplierName: string
  daysToExpiry: number
  bucket: ExpiryBucket | null
}

function assignBucket(daysToExpiry: number): ExpiryBucket | null {
  if (daysToExpiry < 0) return 'expired'
  if (daysToExpiry <= 30) return '30d'
  if (daysToExpiry <= 60) return '60d'
  if (daysToExpiry <= 90) return '90d'
  if (daysToExpiry <= 180) return '180d'
  return null
}

interface BucketSummary {
  key: ExpiryBucket
  label: string
  icon: typeof AlertOctagon
  iconBg: string
  iconColor: string
  count: number
  value: number
}

type ConfirmAction = { type: 'writeoff' | 'dispose'; batch: EnrichedBatch }

// ─────────────────────────────────────────────────────────────

export default function ExpiryManagementPage() {
  const batches = useMasterDataStore((s) => s.batches)
  const suppliers = useMasterDataStore((s) => s.suppliers)
  const fetchProducts = useMasterDataStore((s) => s.fetchProducts)
  const fetchSuppliers = useMasterDataStore((s) => s.fetchSuppliers)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProducts(); fetchSuppliers() }, [])
  useBranchRefresh(fetchProducts)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const PAGE_SIZE = 10
  const [isSubmitting, setIsSubmitting] = useState(false)

  const today = new Date()

  const enrichedBatches: EnrichedBatch[] = useMemo(() => {
    return batches.filter((b) => b.quantity > 0).map((batch) => {
      const supplier = suppliers.find((s) => s.id === batch.supplierId)
      const daysToExpiry = differenceInDays(new Date(batch.expiryDate), today)
      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        productId: batch.productId,
        productName: batch.productName ?? 'Unknown',
        expiryDate: batch.expiryDate,
        mfgDate: batch.mfgDate,
        quantity: batch.quantity,
        mrp: Number(batch.mrp),
        stockValue: batch.quantity * Number(batch.mrp),
        supplierName: supplier?.name ?? 'Unknown',
        daysToExpiry,
        bucket: assignBucket(daysToExpiry),
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, suppliers])

  const filteredBatches = useMemo(() => {
    let result = enrichedBatches
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (b) => b.productName.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q)
      )
    }
    if (selectedSupplier !== 'all') result = result.filter((b) => b.supplierName === selectedSupplier)
    return result
  }, [enrichedBatches, searchQuery, selectedSupplier])

  const bucketBatches = useMemo(() => {
    const map: Record<ExpiryBucket, EnrichedBatch[]> = { expired: [], '30d': [], '60d': [], '90d': [], '180d': [] }
    filteredBatches.forEach((b) => { if (b.bucket) map[b.bucket].push(b) })
    return map
  }, [filteredBatches])

  const summaries: BucketSummary[] = useMemo(() => {
    const configs: Record<ExpiryBucket, { label: string; icon: typeof AlertOctagon; iconBg: string; iconColor: string }> = {
      expired: { label: 'Expired', icon: AlertOctagon, iconBg: 'bg-red-500/15', iconColor: 'text-red-600 dark:text-red-400' },
      '30d': { label: 'Expiring 30d', icon: CalendarClock, iconBg: 'bg-orange-500/15', iconColor: 'text-orange-600 dark:text-orange-400' },
      '60d': { label: 'Expiring 60d', icon: CalendarClock, iconBg: 'bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-400' },
      '90d': { label: 'Expiring 90d', icon: CalendarClock, iconBg: 'bg-yellow-500/15', iconColor: 'text-yellow-600 dark:text-yellow-400' },
      '180d': { label: 'Expiring 180d', icon: CalendarClock, iconBg: 'bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-400' },
    }
    return (['expired', '30d', '60d', '90d', '180d'] as ExpiryBucket[]).map((key) => ({
      key,
      ...configs[key],
      count: bucketBatches[key].length,
      value: bucketBatches[key].reduce((sum, b) => sum + b.stockValue, 0),
    }))
  }, [bucketBatches])

  // ── Actions ──────────────────────────────────────────────────

  const handleCreateReturn = (batch: EnrichedBatch) => {
    navigate(`/purchase/returns?productId=${batch.productId}&batchId=${batch.batchId}&batchNumber=${encodeURIComponent(batch.batchNumber)}`)
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    const { type, batch } = confirmAction
    setIsSubmitting(true)
    try {
      await api.patch(`/products/${batch.productId}/batches/${batch.batchId}/adjust`, {
        adjustedQty: 0,
        reason: type === 'writeoff' ? 'Expired Removal' : 'Damaged',
        notes: type === 'writeoff'
          ? `Written off — expired batch ${batch.batchNumber}`
          : `Disposed — batch ${batch.batchNumber}`,
      })
      toast.success(
        type === 'writeoff'
          ? `Batch ${batch.batchNumber} written off successfully`
          : `Batch ${batch.batchNumber} marked as disposed`
      )
      setConfirmAction(null)
      fetchProducts()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Action failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Table renderer ────────────────────────────────────────────

  const renderBatchTable = (batchesToRender: EnrichedBatch[]) => {
    const totalPages = Math.max(1, Math.ceil(batchesToRender.length / PAGE_SIZE))
    const paginated = batchesToRender.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

    return (
    <>
      <div className="rounded-2xl border border-border/60 bg-card shadow overflow-x-auto">
      {/* Mobile */}
      <div className="md:hidden">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Search className="mb-3 h-8 w-8 opacity-20" />
            <p>No batches in this category</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {paginated.map((batch) => (
              <div key={batch.batchId} className="flex items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{batch.productName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{batch.batchNumber}</p>
                  <p className={cn('text-[10px] mt-0.5',
                    batch.daysToExpiry < 0 ? 'text-red-600 dark:text-red-400 font-semibold'
                      : batch.daysToExpiry <= 30 ? 'text-orange-600 dark:text-orange-400'
                      : 'text-muted-foreground'
                  )}>
                    Exp: {formatDate(batch.expiryDate)} ({batch.daysToExpiry < 0 ? `${Math.abs(batch.daysToExpiry)}d ago` : `in ${batch.daysToExpiry}d`})
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm font-semibold">{formatCurrency(batch.stockValue)}</p>
                  <p className="text-[10px] text-muted-foreground">Qty: {batch.quantity}</p>
                  <div className="flex gap-1 mt-1 justify-end">
                    <Button size="icon-sm" variant="ghost" className="h-6 w-6 text-muted-foreground"
                      onClick={() => setConfirmAction({ type: 'writeoff', batch })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Stock Value</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((batch) => (
              <TableRow key={batch.batchId} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                <TableCell className="font-medium">{batch.productName}</TableCell>
                <TableCell className="font-mono text-xs">{batch.batchNumber}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className={cn(
                      batch.daysToExpiry < 0 ? 'text-red-600 dark:text-red-400 font-semibold'
                        : batch.daysToExpiry <= 30 ? 'text-orange-600 dark:text-orange-400'
                        : 'text-muted-foreground'
                    )}>
                      {formatDate(batch.expiryDate)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {batch.daysToExpiry < 0 ? `${Math.abs(batch.daysToExpiry)} days ago` : `in ${batch.daysToExpiry} days`}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{batch.quantity}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(batch.mrp)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(batch.stockValue)}</TableCell>
                <TableCell className="text-sm">{batch.supplierName}</TableCell>
                <TableCell className="text-right">
                  <DataTableRowActions
                    onView={() => navigate(`/inventory/product-history?productId=${batch.productId}`)}
                    customActions={[
                      {
                        label: 'Create Return',
                        icon: <Undo2 className="h-4 w-4" />,
                        onClick: () => handleCreateReturn(batch),
                      },
                      {
                        label: 'Write Off',
                        icon: <Trash2 className="h-4 w-4" />,
                        onClick: () => setConfirmAction({ type: 'writeoff', batch }),
                      },
                      {
                        label: 'Mark Disposed',
                        icon: <Trash2 className="h-4 w-4" />,
                        onClick: () => setConfirmAction({ type: 'dispose', batch }),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {paginated.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Search className="mb-3 h-8 w-8 opacity-20" />
            <p>No batches match your filters in this category</p>
          </div>
        )}
      </div>
    </div>
    <DataTablePagination
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={setCurrentPage}
      totalItems={batchesToRender.length}
      itemsPerPage={PAGE_SIZE}
      className="mt-4 px-2"
    />
  </>
)
}

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* Stats cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
        variants={containerVariants} initial="hidden" animate="visible"
      >
        {summaries.map((s) => {
          const Icon = s.icon
          return (
            <motion.div key={s.key} variants={itemVariants}>
              <div className="glass rounded-2xl border border-border/60 p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                    <p className="font-mono mt-1 text-2xl font-bold">{s.count}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{formatCurrency(s.value)}</p>
                  </div>
                  <div className={cn('rounded-full p-2.5', s.iconBg)}>
                    <Icon className={cn('h-5 w-5', s.iconColor)} />
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Filters */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
        searchPlaceholder="Search by product name or batch number..."
        resultsCount={filteredBatches.filter((b) => b.bucket !== null).length}
        activeFilterCount={selectedSupplier !== 'all' ? 1 : 0}
        onClearFilters={() => { setSelectedSupplier('all'); setCurrentPage(1) }}
      >
        <EnumSelect
          label="Supplier"
          value={selectedSupplier}
          onValueChange={(v) => { setSelectedSupplier(v); setCurrentPage(1) }}
          onClear={() => { setSelectedSupplier('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Suppliers' },
            ...suppliers.map((s) => ({ value: s.name, label: s.name })),
          ]}
        />
      </DataTableFilterBar>

      {/* Tabs */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible">
        <motion.div variants={itemVariants}>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all" onClick={() => setCurrentPage(1)}>
                All Batches
                <Badge variant="secondary" size="sm" className="ml-2 h-5 min-w-5 px-1.5">{filteredBatches.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="expired" onClick={() => setCurrentPage(1)}>
                Expired
                {bucketBatches.expired.length > 0 && <Badge variant="destructive" size="sm" className="ml-2 h-5 min-w-5 px-1.5">{bucketBatches.expired.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="30d" onClick={() => setCurrentPage(1)}>
                30 Days
                {bucketBatches['30d'].length > 0 && <Badge variant="warning" size="sm" className="ml-2 h-5 min-w-5 px-1.5">{bucketBatches['30d'].length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="60d" onClick={() => setCurrentPage(1)}>
                60 Days
                {bucketBatches['60d'].length > 0 && <Badge variant="secondary" size="sm" className="ml-2 h-5 min-w-5 px-1.5">{bucketBatches['60d'].length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="90d" onClick={() => setCurrentPage(1)}>
                90 Days
                {bucketBatches['90d'].length > 0 && <Badge variant="secondary" size="sm" className="ml-2 h-5 min-w-5 px-1.5">{bucketBatches['90d'].length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="180d" onClick={() => setCurrentPage(1)}>
                180 Days
                {bucketBatches['180d'].length > 0 && <Badge variant="info" size="sm" className="ml-2 h-5 min-w-5 px-1.5">{bucketBatches['180d'].length}</Badge>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">{renderBatchTable([...filteredBatches].sort((a, b) => a.daysToExpiry - b.daysToExpiry))}</TabsContent>
            <TabsContent value="expired" className="mt-4">{renderBatchTable(bucketBatches.expired)}</TabsContent>
            <TabsContent value="30d" className="mt-4">{renderBatchTable(bucketBatches['30d'])}</TabsContent>
            <TabsContent value="60d" className="mt-4">{renderBatchTable(bucketBatches['60d'])}</TabsContent>
            <TabsContent value="90d" className="mt-4">{renderBatchTable(bucketBatches['90d'])}</TabsContent>
            <TabsContent value="180d" className="mt-4">{renderBatchTable(bucketBatches['180d'])}</TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>

      {/* Confirm Write-Off / Dispose Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === 'writeoff' ? 'Write Off Batch' : 'Mark Batch as Disposed'}
            </DialogTitle>
            <DialogDescription>
              This will set the quantity of batch <span className="font-mono font-semibold">{confirmAction?.batch.batchNumber}</span> ({confirmAction?.batch.productName}) to <strong>0</strong>.
              {' '}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {confirmAction && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product</span>
                <span className="font-medium">{confirmAction?.batch?.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Batch</span>
                <span className="font-mono">{confirmAction?.batch?.batchNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Qty</span>
                <span className="font-mono">{confirmAction?.batch?.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stock Value</span>
                <span className="font-mono text-red-600">
                  {confirmAction?.batch ? formatCurrency(confirmAction.batch.stockValue) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason</span>
                <span>{confirmAction?.type === 'writeoff' ? 'Expired Removal' : 'Damaged / Disposed'}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmAction} disabled={isSubmitting}>
              {isSubmitting ? 'Processing…' : confirmAction?.type === 'writeoff' ? 'Write Off' : 'Mark Disposed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  )
}
