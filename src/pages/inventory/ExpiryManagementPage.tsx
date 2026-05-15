import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { AlertOctagon, CalendarClock, Search, Undo2, Trash2, Pencil } from 'lucide-react'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useDeepLinkHighlightState } from '@/hooks/useDeepLinkHighlight'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { assignExpiryBucket, daysToExpiry as computeDaysToExpiry, type ExpiryBucket } from '@/lib/inventory'
import api from '@/lib/api'

// ─────────────────────────────────────────────────────────────

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

interface BucketSummary {
  key: ExpiryBucket
  label: string
  icon: typeof AlertOctagon
  iconBg: string
  borderAccent: string
  count: number
  value: number
}

type ConfirmAction = { type: 'writeoff' | 'dispose'; batch: EnrichedBatch }

// ─────────────────────────────────────────────────────────────

export default function ExpiryManagementPage() {
  const suppliers = useMasterDataStore((s) => s.suppliers)
  const fetchSuppliers = useMasterDataStore((s) => s.fetchSuppliers)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [selectedBucket, setSelectedBucket] = useState<'all' | ExpiryBucket>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const PAGE_SIZE = 10
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Server-paginated batch rows, plus the lightweight stats bundle used for
  // both the summary cards and the bucket-count labels in the filter dropdown.
  const [rows, setRows] = useState<any[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [, setLoading] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { highlightId: highlightBatchId } = useDeepLinkHighlightState()

  // Suppliers needed only for the filter dropdown.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSuppliers() }, [])

  // Map UI bucket → API filter params.
  const bucketParams = useMemo((): Record<string, string | number | boolean | undefined> => {
    if (selectedBucket === 'all') return {}
    if (selectedBucket === 'expired') return { expired: true }
    const days: Record<ExpiryBucket, number> = { expired: 0, '30d': 30, '60d': 60, '90d': 90, '180d': 180 }
    return { expiringWithin: days[selectedBucket] }
  }, [selectedBucket])

  // Resolve the selected supplier NAME to its ID (server filters by ID).
  const supplierIdForFilter = useMemo(() => {
    if (selectedSupplier === 'all') return undefined
    const match = suppliers.find((s) => s.name === selectedSupplier)
    return match?.id
  }, [selectedSupplier, suppliers])

  // Fetch the current page of batches whenever a filter changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get('/batches', {
        params: {
          q: searchQuery.trim() || undefined,
          supplierId: supplierIdForFilter,
          ...bucketParams,
          status: selectedBucket === 'expired' ? undefined : (selectedBucket === 'all' ? undefined : 'active'),
          skip: (currentPage - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        },
      })
      .then((res) => {
        if (cancelled) return
        setRows(res.data?.data ?? [])
        setTotalRows(res.data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) { setRows([]); setTotalRows(0) }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [searchQuery, supplierIdForFilter, bucketParams, selectedBucket, currentPage, refreshKey])

  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setCurrentPage(1) }, [searchQuery, selectedSupplier, selectedBucket])

  // Stats — drives the 5 summary cards and the bucket-count labels.
  const refreshStats = useCallback(async () => {
    try {
      const res = await api.get('/reports/inventory/stats')
      setStats(res.data)
    } catch {
      // non-critical; counters just stay at 0
    }
  }, [])
  useEffect(() => { refreshStats() }, [refreshStats])

  // Convert API rows to the shape the renderer already expects.
  const enrichedBatches: EnrichedBatch[] = useMemo(() => {
    return rows.map((r) => {
      const days = computeDaysToExpiry(r.expiryDate) ?? Number.NaN
      return {
        batchId: r.id,
        batchNumber: r.batchNumber,
        productId: r.productId,
        productName: r.productName ?? 'Unknown',
        expiryDate: r.expiryDate,
        mfgDate: r.mfgDate,
        quantity: r.quantity,
        mrp: Number(r.mrp),
        stockValue: r.quantity * Number(r.mrp),
        supplierName: r.supplierName ?? 'Unknown',
        daysToExpiry: days,
        bucket: assignExpiryBucket(r.expiryDate),
      }
    })
  }, [rows])

  // Build the 5 summary cards from the stats bundle (one round-trip, no full
  // batch load). Falls back to zeros while stats are loading.
  const summaries: BucketSummary[] = useMemo(() => {
    const configs: Record<ExpiryBucket, { label: string; icon: typeof AlertOctagon; iconBg: string; borderAccent: string }> = {
      expired: { label: 'Expired', icon: AlertOctagon, iconBg: 'bg-red-500/10 text-red-600 dark:text-red-400', borderAccent: 'border-l-red-500' },
      '30d': { label: 'Expiring 30d', icon: CalendarClock, iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', borderAccent: 'border-l-orange-500' },
      '60d': { label: 'Expiring 60d', icon: CalendarClock, iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', borderAccent: 'border-l-amber-500' },
      '90d': { label: 'Expiring 90d', icon: CalendarClock, iconBg: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400', borderAccent: 'border-l-yellow-500' },
      '180d': { label: 'Expiring 180d', icon: CalendarClock, iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', borderAccent: 'border-l-blue-500' },
    }
    const eb = stats?.expiryBuckets ?? {}
    return (['expired', '30d', '60d', '90d', '180d'] as ExpiryBucket[]).map((key) => ({
      key,
      ...configs[key],
      count: eb[key]?.count ?? 0,
      value: eb[key]?.value ?? 0,
    }))
  }, [stats])

  // ── Actions ──────────────────────────────────────────────────

  const handleCreateReturn = (batch: EnrichedBatch) => {
    navigate(`/purchase/returns?productId=${batch.productId}&batchId=${batch.batchId}&batchNumber=${encodeURIComponent(batch.batchNumber)}`)
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    const { type, batch } = confirmAction
    setIsSubmitting(true)
    try {
      const res = await api.patch<{
        approvalRequested?: boolean
        approvalRequestId?: string
        totalValue?: number
        threshold?: number
      }>(`/products/${batch.productId}/batches/${batch.batchId}/adjust`, {
        adjustedQty: 0,
        reason: type === 'writeoff' ? 'Expired Removal' : 'Damaged',
        notes: type === 'writeoff'
          ? `Written off — expired batch ${batch.batchNumber}`
          : `Disposed — batch ${batch.batchNumber}`,
      })
      if (res.data?.approvalRequested) {
        // Server queued the action — stock unchanged until admin approves.
        toast.info(
          `Approval request sent to admin (₹${(res.data.totalValue ?? 0).toLocaleString('en-IN')} > threshold ₹${(res.data.threshold ?? 0).toLocaleString('en-IN')}). Stock unchanged until approved.`,
          { duration: 5500 },
        )
      } else {
        toast.success(
          type === 'writeoff'
            ? `Batch ${batch.batchNumber} written off successfully`
            : `Batch ${batch.batchNumber} marked as disposed`
        )
        // Refresh the current page from the server and update the KPI bundle.
        // Cheaper than the old "refetch every product nested with batches" call.
        setRefreshKey((k) => k + 1)
        refreshStats()
      }
      setConfirmAction(null)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Action failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Table renderer ────────────────────────────────────────────

  const renderBatchTable = (batchesToRender: EnrichedBatch[]) => {
    // Pagination is now server-side. `batchesToRender` is already the current
    // page; `totalRows` is the full match count from the API.
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
    const paginated = batchesToRender

    return (
      <Card>
      {/* Mobile */}
      <div className="md:hidden">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
              <Search className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No batches in this category</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {paginated.map((batch) => (
              <div
                key={batch.batchId}
                id={`batchId-${batch.batchId}`}
                onClick={() => navigate(`/inventory/batches/detail?id=${batch.batchId}`)}
                className={cn(
                  'flex items-start justify-between gap-2 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/30',
                  highlightBatchId === batch.batchId && 'bg-amber-500/15 ring-2 ring-amber-500/40'
                )}
              >
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
            <TableRow>
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
            <AnimatePresence mode="popLayout">
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                        <Search className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No batches match your filters in this category</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((batch, idx) => (
                  <motion.tr
                    key={batch.batchId}
                    id={`batchId-${batch.batchId}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, delay: idx * 0.02 }}
                    onClick={() => navigate(`/inventory/batches/detail?id=${batch.batchId}`)}
                    className={cn(
                      'cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30',
                      highlightBatchId === batch.batchId && 'bg-amber-500/15 hover:bg-amber-500/20'
                    )}
                  >
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
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => navigate(`/inventory/batches/detail?id=${batch.batchId}`)}
                        customActions={[
                          {
                            label: 'Adjust Stock',
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => navigate(`/inventory/adjustment?batchId=${batch.batchId}`),
                          },
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
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={totalRows}
        itemsPerPage={PAGE_SIZE}
        className="border-t border-border/40 px-4"
      />
    </Card>
  )
}

  // Visible rows = whatever the API returned for the current filter combination.
  const visibleBatches = enrichedBatches

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summaries.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.key} hover className={cn('border-l-[3px]', s.borderAccent)}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.iconBg)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="text-lg font-bold font-mono leading-tight">{s.count}</p>
                  <p className="text-[11px] text-muted-foreground">{formatCurrency(s.value)}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
        searchPlaceholder="Search by product name or batch number..."
        resultsCount={totalRows}
        activeFilterCount={(selectedSupplier !== 'all' ? 1 : 0) + (selectedBucket !== 'all' ? 1 : 0)}
        onClearFilters={() => { setSelectedSupplier('all'); setSelectedBucket('all'); setCurrentPage(1) }}
      >
        <EnumSelect
          label="Expiry Window"
          value={selectedBucket}
          onValueChange={(v) => { setSelectedBucket(v as 'all' | ExpiryBucket); setCurrentPage(1) }}
          onClear={() => { setSelectedBucket('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Batches' },
            { value: 'expired', label: `Expired (${stats?.expiryBuckets?.expired?.count ?? 0})` },
            { value: '30d', label: `30 Days (${stats?.expiryBuckets?.['30d']?.count ?? 0})` },
            { value: '60d', label: `60 Days (${stats?.expiryBuckets?.['60d']?.count ?? 0})` },
            { value: '90d', label: `90 Days (${stats?.expiryBuckets?.['90d']?.count ?? 0})` },
            { value: '180d', label: `180 Days (${stats?.expiryBuckets?.['180d']?.count ?? 0})` },
          ]}
        />
        <EnumSelect
          label="Supplier"
          value={selectedSupplier}
          onValueChange={(v) => { setSelectedSupplier(v); setCurrentPage(1) }}
          onClear={() => { setSelectedSupplier('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Suppliers' },
            // Dedupe by name — master list can contain duplicate supplier records
            // with the same display name, which would collide on React keys.
            // Drop empty names: Radix Select reserves "" for the placeholder.
            ...Array.from(new Set(suppliers.map((s) => s.name).filter((n): n is string => !!n && n.trim() !== '')))
              .sort()
              .map((name) => ({ value: name, label: name })),
          ]}
        />
      </DataTableFilterBar>

      {/* Batches table */}
      {renderBatchTable(visibleBatches)}

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
