import { useState, useMemo, useEffect } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertOctagon,
  CalendarClock,
  RotateCcw,
  FileX2,
  Trash2,
  Search,
  Undo2,
  History,
} from 'lucide-react'
import { differenceInDays } from 'date-fns'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

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
// Expiry bucket helpers
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Summary card config
// ─────────────────────────────────────────────────────────────

interface BucketSummary {
  key: ExpiryBucket
  label: string
  icon: typeof AlertOctagon
  iconBg: string
  iconColor: string
  count: number
  value: number
}

// ─────────────────────────────────────────────────────────────
// ExpiryManagementPage
// ─────────────────────────────────────────────────────────────

export default function ExpiryManagementPage() {
  const batches = useMasterDataStore((s) => s.batches)
  const suppliers = useMasterDataStore((s) => s.suppliers)
  const fetchProducts = useMasterDataStore((s) => s.fetchProducts)
  const fetchSuppliers = useMasterDataStore((s) => s.fetchSuppliers)

  useEffect(() => {
    fetchProducts()
    fetchSuppliers()
  }, [])

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('all')

  const today = new Date()

  // Build enriched batch list
  const enrichedBatches: EnrichedBatch[] = useMemo(() => {
    return batches.map((batch) => {
      const supplier = suppliers.find((s) => s.id === batch.supplierId)
      const daysToExpiry = differenceInDays(new Date(batch.expiryDate), today)
      const bucket = assignBucket(daysToExpiry)

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
        bucket,
      }
    })
  }, [batches, suppliers])

  const filteredBatches: EnrichedBatch[] = useMemo(() => {
    let result = enrichedBatches

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (b) =>
          b.productName.toLowerCase().includes(q) ||
          b.batchNumber.toLowerCase().includes(q)
      )
    }

    if (selectedSupplier !== 'all') {
      result = result.filter((b) => b.supplierName === selectedSupplier)
    }

    return result
  }, [enrichedBatches, searchQuery, selectedSupplier])

  // Batches per bucket
  const bucketBatches = useMemo(() => {
    const map: Record<ExpiryBucket, EnrichedBatch[]> = {
      expired: [],
      '30d': [],
      '60d': [],
      '90d': [],
      '180d': [],
    }
    filteredBatches.forEach((b) => {
      if (b.bucket) map[b.bucket].push(b)
    })
    return map
  }, [filteredBatches])

  // Summary cards
  const summaries: BucketSummary[] = useMemo(() => {
    const bucketKeys: ExpiryBucket[] = ['expired', '30d', '60d', '90d', '180d']
    const configs: Record<
      ExpiryBucket,
      { label: string; icon: typeof AlertOctagon; iconBg: string; iconColor: string }
    > = {
      expired: {
        label: 'Expired',
        icon: AlertOctagon,
        iconBg: 'bg-red-500/15 dark:bg-red-500/10',
        iconColor: 'text-red-600 dark:text-red-400',
      },
      '30d': {
        label: 'Expiring 30d',
        icon: CalendarClock,
        iconBg: 'bg-orange-500/15 dark:bg-orange-500/10',
        iconColor: 'text-orange-600 dark:text-orange-400',
      },
      '60d': {
        label: 'Expiring 60d',
        icon: CalendarClock,
        iconBg: 'bg-amber-500/15 dark:bg-amber-500/10',
        iconColor: 'text-amber-600 dark:text-amber-400',
      },
      '90d': {
        label: 'Expiring 90d',
        icon: CalendarClock,
        iconBg: 'bg-yellow-500/15 dark:bg-yellow-500/10',
        iconColor: 'text-yellow-600 dark:text-yellow-400',
      },
      '180d': {
        label: 'Expiring 180d',
        icon: CalendarClock,
        iconBg: 'bg-blue-500/15 dark:bg-blue-500/10',
        iconColor: 'text-blue-600 dark:text-blue-400',
      },
    }

    return bucketKeys.map((key) => {
      const batches = bucketBatches[key]
      return {
        key,
        ...configs[key],
        count: batches.length,
        value: batches.reduce((sum, b) => sum + b.stockValue, 0),
      }
    })
  }, [bucketBatches])

  // Actions
  const handleCreateReturn = (batch: EnrichedBatch) => {
    toast.success(`Return created for batch ${batch.batchNumber}`)
  }
  const handleWriteOff = (batch: EnrichedBatch) => {
    toast.success(`Batch ${batch.batchNumber} written off`)
  }
  const handleMarkDisposed = (batch: EnrichedBatch) => {
    toast.success(`Batch ${batch.batchNumber} marked as disposed`)
  }

  // Table renderer for a bucket
  const renderBatchTable = (batchesToRender: EnrichedBatch[]) => (
    <div className="rounded-2xl border border-border/60 bg-card shadow overflow-hidden">
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
          {batchesToRender.map((batch) => (
            <TableRow key={batch.batchId} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
              <TableCell className="font-medium">{batch.productName}</TableCell>
              <TableCell className="font-mono text-xs">
                {batch.batchNumber}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span
                    className={cn(
                      batch.daysToExpiry < 0
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : batch.daysToExpiry <= 30
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-muted-foreground'
                    )}
                  >
                    {formatDate(batch.expiryDate)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {batch.daysToExpiry < 0 
                      ? `${Math.abs(batch.daysToExpiry)} days ago` 
                      : `in ${batch.daysToExpiry} days`}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {batch.quantity}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatCurrency(batch.mrp)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-semibold">
                {formatCurrency(batch.stockValue)}
              </TableCell>
              <TableCell className="text-sm">{batch.supplierName}</TableCell>
              <TableCell className="text-right">
                <DataTableRowActions
                  onView={() => toast.info(`Viewing details for ${batch.productName}`)}
                  onEdit={() => toast.info(`Edit batch ${batch.batchNumber}`)}
                  onDelete={() => handleMarkDisposed(batch)}
                  customActions={[
                    {
                      label: 'Create Return',
                      icon: <Undo2 className="h-4 w-4" />,
                      onClick: () => handleCreateReturn(batch),
                    },
                    {
                      label: 'Write Off',
                      icon: <History className="h-4 w-4" />,
                      onClick: () => handleWriteOff(batch),
                    },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {batchesToRender.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Search className="mb-3 h-8 w-8 opacity-20" />
          <p>No batches match your filters in this category</p>
        </div>
      )}
    </div>
  )

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {summaries.map((s) => {
          const Icon = s.icon
          return (
            <motion.div key={s.key} variants={itemVariants}>
              <div className="glass rounded-2xl border border-border/60 p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {s.label}
                    </p>
                    <p className="font-mono mt-1 text-2xl font-bold">
                      {s.count}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {formatCurrency(s.value)}
                    </p>
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

      {/* ── Tabs ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <Tabs defaultValue="expired">
            <TabsList>
              <TabsTrigger value="expired">
                Expired
                {bucketBatches.expired.length > 0 && (
                  <Badge
                    variant="destructive"
                    size="sm"
                    className="ml-2 h-5 min-w-[20px] px-1.5"
                  >
                    {bucketBatches.expired.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="30d">
                30 Days
                {bucketBatches['30d'].length > 0 && (
                  <Badge
                    variant="warning"
                    size="sm"
                    className="ml-2 h-5 min-w-[20px] px-1.5"
                  >
                    {bucketBatches['30d'].length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="60d">
                60 Days
                {bucketBatches['60d'].length > 0 && (
                  <Badge
                    variant="secondary"
                    size="sm"
                    className="ml-2 h-5 min-w-[20px] px-1.5"
                  >
                    {bucketBatches['60d'].length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="90d">
                90 Days
                {bucketBatches['90d'].length > 0 && (
                  <Badge
                    variant="secondary"
                    size="sm"
                    className="ml-2 h-5 min-w-[20px] px-1.5"
                  >
                    {bucketBatches['90d'].length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="180d">
                180 Days
                {bucketBatches['180d'].length > 0 && (
                  <Badge
                    variant="info"
                    size="sm"
                    className="ml-2 h-5 min-w-[20px] px-1.5"
                  >
                    {bucketBatches['180d'].length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="expired" className="mt-4">
              {renderBatchTable(bucketBatches.expired)}
            </TabsContent>
            <TabsContent value="30d" className="mt-4">
              {renderBatchTable(bucketBatches['30d'])}
            </TabsContent>
            <TabsContent value="60d" className="mt-4">
              {renderBatchTable(bucketBatches['60d'])}
            </TabsContent>
            <TabsContent value="90d" className="mt-4">
              {renderBatchTable(bucketBatches['90d'])}
            </TabsContent>
            <TabsContent value="180d" className="mt-4">
              {renderBatchTable(bucketBatches['180d'])}
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
