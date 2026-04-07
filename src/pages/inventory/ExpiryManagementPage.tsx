import { useMemo } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertOctagon,
  CalendarClock,
  RotateCcw,
  FileX2,
  Trash2,
} from 'lucide-react'
import { differenceInDays } from 'date-fns'

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
import { mockProducts, mockBatches, mockSuppliers } from '@/data/mock'
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
  const today = new Date()

  // Build enriched batch list
  const enrichedBatches: EnrichedBatch[] = useMemo(() => {
    return mockBatches.map((batch) => {
      const product = mockProducts.find((p) => p.id === batch.productId)!
      const supplier = mockSuppliers.find((s) => s.id === batch.supplierId)
      const daysToExpiry = differenceInDays(new Date(batch.expiryDate), today)
      const bucket = assignBucket(daysToExpiry)

      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        productId: product.id,
        productName: product.name,
        expiryDate: batch.expiryDate,
        mfgDate: batch.mfgDate,
        quantity: batch.quantity,
        mrp: batch.mrp,
        stockValue: batch.quantity * batch.mrp,
        supplierName: supplier?.name ?? 'Unknown',
        daysToExpiry,
        bucket,
      }
    })
  }, [])

  // Batches per bucket
  const bucketBatches = useMemo(() => {
    const map: Record<ExpiryBucket, EnrichedBatch[]> = {
      expired: [],
      '30d': [],
      '60d': [],
      '90d': [],
      '180d': [],
    }
    enrichedBatches.forEach((b) => {
      if (b.bucket) map[b.bucket].push(b)
    })
    return map
  }, [enrichedBatches])

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
  const renderBatchTable = (batches: EnrichedBatch[]) => (
    <div className="rounded-2xl border border-border/60 bg-card shadow">
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
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => (
            <TableRow key={batch.batchId} className="border-b border-border/40">
              <TableCell className="font-medium">{batch.productName}</TableCell>
              <TableCell className="font-mono text-xs">
                {batch.batchNumber}
              </TableCell>
              <TableCell>
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
              <TableCell className="text-muted-foreground">
                {batch.supplierName}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => handleCreateReturn(batch)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Return
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => handleWriteOff(batch)}
                  >
                    <FileX2 className="mr-1 h-3 w-3" />
                    Write Off
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => handleMarkDisposed(batch)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Disposed
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {batches.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="py-8 text-center text-muted-foreground"
              >
                No batches in this expiry window.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )

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
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expiry Management</h1>
            <p className="text-sm text-muted-foreground">
              Track and manage products approaching expiry
            </p>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
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
