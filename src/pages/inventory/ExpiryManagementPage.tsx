import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  AlertOctagon, AlertTriangle, Clock, Package, PackageX, Trash2,
  Search, RefreshCw, X, ChevronDown, Truck,
  User, Calendar, FileText, History, IndianRupee,
  LayoutGrid, TableProperties,
} from 'lucide-react'

import { DataTablePagination } from '@/components/shared/DataTablePagination'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate, timeAgo } from '@/lib/utils'
import { assignExpiryBucket, daysToExpiry as computeDaysToExpiry, type ExpiryBucket } from '@/lib/inventory'
import api from '@/lib/api'

interface SupplierLite { id: string; name: string; gstin?: string | null }

// ─────────────────────────────────────────────────────────────
// Types
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
  supplierId: string
  supplierName: string
  supplierPhone: string | null
  daysToExpiry: number
  bucket: ExpiryBucket | null
}

interface DisposalEntry {
  id: string
  adjustmentNo: string | null
  productId: string
  productName: string
  batchId: string
  batchNumber: string
  reason: 'Expired Removal' | 'Damaged'
  previousQty: number
  adjustedQty: number
  diff: number
  notes: string | null
  userId: string
  userName: string
  createdAt: string
}

type FolderKey =
  | 'all'
  | 'expired'
  | 'expiring-soon'
  | 'write-offs'

interface TabConfig {
  key: FolderKey
  label: string
  icon: typeof Package
  accent: string
}

const TABS: TabConfig[] = [
  { key: 'all',           label: 'All Batches',   icon: Package,       accent: 'text-foreground' },
  { key: 'expired',       label: 'Expired',       icon: AlertOctagon,  accent: 'text-rose-600 dark:text-rose-400' },
  { key: 'expiring-soon', label: 'Expiring Soon', icon: Clock,         accent: 'text-amber-600 dark:text-amber-400' },
  { key: 'write-offs',    label: 'Write-offs',    icon: Trash2,        accent: 'text-rose-600 dark:text-rose-400' },
]

const BUCKET_FOLDERS: FolderKey[] = ['all', 'expired', 'expiring-soon']
const DISPOSAL_FOLDERS: FolderKey[] = ['write-offs']

type DisplayRow =
  | { kind: 'batch'; batch: EnrichedBatch }
  | { kind: 'disposal'; entry: DisposalEntry }

const rowKey = (r: DisplayRow) =>
  r.kind === 'batch' ? r.batch.batchId : r.entry.id

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const } },
}

const PAGE_SIZE = 12

type ViewMode = 'card' | 'table'

// Shared expiry-status mapping used by both the card and table views.
function batchStatus(daysToExpiry: number): {
  variant: 'destructive' | 'warning' | 'secondary'
  border: string
  label: string
} {
  const variant =
    daysToExpiry < 0 ? 'destructive'
      : daysToExpiry <= 30 ? 'warning'
      : 'secondary'
  const border =
    daysToExpiry < 0 ? 'border-l-rose-500'
      : daysToExpiry <= 30 ? 'border-l-amber-500'
      : daysToExpiry <= 90 ? 'border-l-yellow-500'
      : 'border-l-border/60'
  const label = daysToExpiry < 0
    ? `Expired ${Math.abs(daysToExpiry)}d ago`
    : `Expires in ${daysToExpiry}d`
  return { variant, border, label }
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ExpiryManagementPage() {
  const [folder, setFolder] = useState<FolderKey>('expired')
  const [search, setSearch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierLite | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  // Read-only disposal detail shown in a modal (write-offs aren't reachable
  // from notifications, so they don't need the full-page detail route).
  const [disposalModal, setDisposalModal] = useState<DisposalEntry | null>(null)

  // Active batches state (folders: expired/expiring-soon/all)
  const [batchRows, setBatchRows] = useState<any[]>([])
  const [batchesTotal, setBatchesTotal] = useState(0)
  const [batchesPage, setBatchesPage] = useState(1)
  const [fetchingBatches, setFetchingBatches] = useState(false)

  // Disposal history state (folder: write-offs). Counts are cached per-reason
  // and only update when the user visits that folder.
  const [disposalRows, setDisposalRows] = useState<DisposalEntry[]>([])
  const [writeOffsTotal, setWriteOffsTotal] = useState<number | null>(null)
  const [disposalPage, setDisposalPage] = useState(1)
  const [fetchingDisposal, setFetchingDisposal] = useState(false)

  // Stats bundle — drives the KPI cards and tab count badges.
  const [stats, setStats] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Map UI folder → API filter params (only meaningful for bucket folders).
  // 'Expiring Soon' aggregates everything within the 180-day window.
  const bucketParams = useMemo((): Record<string, string | number | boolean | undefined> => {
    if (folder === 'all') return {}
    if (folder === 'expired') return { expired: true }
    if (folder === 'expiring-soon') return { expiringWithin: 180 }
    return {}
  }, [folder])

  // Reset pagination when filters change.
  useEffect(() => { setBatchesPage(1) }, [search, selectedSupplier, folder])

  // Active-batches fetch — runs only on bucket folders.
  useEffect(() => {
    if (!BUCKET_FOLDERS.includes(folder)) return
    let cancelled = false
    setFetchingBatches(true)
    const handle = setTimeout(() => {
      api.get('/batches', {
        params: {
          q: search.trim() || undefined,
          supplierId: selectedSupplier?.id ?? undefined,
          ...bucketParams,
          // Hide written-off / disposed batches (qty=0) from every active
          // folder — they live in the Write-offs folder now.
          hasStock: true,
          skip: (batchesPage - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        },
      })
        .then((res) => {
          if (cancelled) return
          setBatchRows(res.data?.data ?? [])
          setBatchesTotal(res.data?.total ?? 0)
        })
        .catch(() => {
          if (!cancelled) { setBatchRows([]); setBatchesTotal(0) }
        })
        .finally(() => { if (!cancelled) setFetchingBatches(false) })
    }, search.trim() ? 200 : 0)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [folder, search, selectedSupplier, bucketParams, batchesPage, refreshKey])

  // Disposal-history fetch — runs only on the write-offs folder.
  useEffect(() => {
    if (!DISPOSAL_FOLDERS.includes(folder)) return
    let cancelled = false
    setFetchingDisposal(true)
    api.get('/products/disposals', {
      params: {
        reason: 'Expired Removal',
        skip: (disposalPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      },
    })
      .then((res) => {
        if (cancelled) return
        const data: DisposalEntry[] = res.data?.data ?? []
        const total: number = res.data?.total ?? 0
        setDisposalRows(data)
        setWriteOffsTotal(total)
      })
      .catch(() => {
        if (!cancelled) {
          setDisposalRows([])
          setWriteOffsTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setFetchingDisposal(false) })
    return () => { cancelled = true }
  }, [folder, disposalPage, refreshKey])

  // Stats — refresh on mount, on mutation, and when the supplier filter changes
  // so the KPI cards reflect the selected supplier.
  const refreshStats = useCallback(async () => {
    try {
      const res = await api.get('/reports/inventory/stats', {
        params: { supplierId: selectedSupplier?.id ?? undefined },
      })
      setStats(res.data)
    } catch {
      // non-critical; counters just stay at 0
    }
  }, [selectedSupplier])
  useEffect(() => { refreshStats() }, [refreshStats, refreshKey])

  // Enrich raw batch rows with computed days-to-expiry / bucket / stockValue.
  const enrichedBatches: EnrichedBatch[] = useMemo(() => {
    return batchRows.map((r) => {
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
        supplierId: r.supplierId,
        supplierName: r.supplierName ?? 'Unknown',
        supplierPhone: r.supplierPhone ?? null,
        daysToExpiry: days,
        bucket: assignExpiryBucket(r.expiryDate),
      }
    })
  }, [batchRows])

  // Display rows — single discriminated list switching by folder.
  const displayRows: DisplayRow[] = useMemo(() => {
    if (DISPOSAL_FOLDERS.includes(folder)) {
      const q = search.trim().toLowerCase()
      const rows = q
        ? disposalRows.filter((d) =>
            d.productName.toLowerCase().includes(q)
            || d.batchNumber.toLowerCase().includes(q)
            || d.userName.toLowerCase().includes(q)
            || (d.adjustmentNo ?? '').toLowerCase().includes(q),
          )
        : disposalRows
      return rows.map((d) => ({ kind: 'disposal' as const, entry: d }))
    }
    return enrichedBatches.map((b) => ({ kind: 'batch' as const, batch: b }))
  }, [folder, enrichedBatches, disposalRows, search])

  const isDisposalFolder = DISPOSAL_FOLDERS.includes(folder)
  const activeTabLabel = TABS.find((t) => t.key === folder)?.label ?? 'Expired'

  // Tab count badges. 'Expiring Soon' rolls up the four sub-windows.
  const tabCounts: Record<FolderKey, number> = useMemo(() => {
    const eb = stats?.expiryBuckets ?? {}
    const expiringSoonCount =
      (eb['30d']?.count ?? 0) + (eb['60d']?.count ?? 0)
      + (eb['90d']?.count ?? 0) + (eb['180d']?.count ?? 0)
    return {
      all: folder === 'all' ? batchesTotal : 0,
      expired: eb.expired?.count ?? 0,
      'expiring-soon': expiringSoonCount,
      'write-offs': writeOffsTotal ?? 0,
    }
  }, [stats, folder, batchesTotal, writeOffsTotal])

  // KPI figures — derived straight from stats so they stay stable across tabs.
  const kpi = useMemo(() => {
    const eb = stats?.expiryBuckets ?? {}
    const soonKeys: ExpiryBucket[] = ['30d', '60d', '90d', '180d']
    const expiredCount = eb.expired?.count ?? 0
    const expiredValue = eb.expired?.value ?? 0
    const soonCount = soonKeys.reduce((s, k) => s + (eb[k]?.count ?? 0), 0)
    const soonValue = soonKeys.reduce((s, k) => s + (eb[k]?.value ?? 0), 0)
    return {
      expiredCount,
      expiredValue,
      soonCount,
      atRiskValue: expiredValue + soonValue,
      atRiskCount: expiredCount + soonCount,
    }
  }, [stats])

  const refresh = () => {
    if (isDisposalFolder) setDisposalPage(1)
    else setBatchesPage(1)
    setRefreshKey((k) => k + 1)
  }

  const openBatch = (batchId: string) => {
    // Full-page detail. Reached via navigate() (pushState) so the detail's
    // Back button returns to wherever we came from — this grid, or the
    // notifications page when the user arrived from an expiry alert.
    navigate(`/inventory/batches/detail?id=${batchId}`)
  }

  const totalBatchesPages = Math.max(1, Math.ceil(batchesTotal / PAGE_SIZE))
  const currentDisposalTotal = writeOffsTotal ?? 0
  const totalDisposalPages = Math.max(1, Math.ceil(currentDisposalTotal / PAGE_SIZE))
  const loading = fetchingBatches || fetchingDisposal

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">
      {/* ── KPI cards ── */}
      {/* responsive: 2-up on phones (was 1-per-row) so the KPIs stay compact */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <KpiCard
          title="Expired"
          value={`${kpi.expiredCount}`}
          subtitle={kpi.expiredValue > 0 ? `${formatCurrency(kpi.expiredValue)} at risk` : 'no expired stock'}
          icon={AlertOctagon}
          accent="rose"
          active={folder === 'expired'}
          onClick={() => setFolder('expired')}
        />
        <KpiCard
          title="Expiring Soon"
          value={`${kpi.soonCount}`}
          subtitle="within 180 days"
          icon={Clock}
          accent="amber"
          active={folder === 'expiring-soon'}
          onClick={() => setFolder('expiring-soon')}
        />
        <KpiCard
          title="At Risk Value"
          value={kpi.atRiskValue > 0 ? formatCurrency(kpi.atRiskValue) : '—'}
          subtitle={`${kpi.atRiskCount} batch${kpi.atRiskCount === 1 ? '' : 'es'} expired or soon`}
          icon={IndianRupee}
          accent="orange"
          active={folder === 'all'}
          onClick={() => setFolder('all')}
        />
      </motion.div>

      {/* ── Main card ── */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden p-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 px-2 py-2 sm:px-3">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const count = tabCounts[tab.key]
              const isActive = folder === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFolder(tab.key)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', isActive && tab.accent)} />
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span className={cn(
                      'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5">
            {/* On mobile, search shares a row with a Refresh button; on sm+ the
                wrapper is display:contents so the search flows into the toolbar as
                before and the end-of-row Refresh (below) is the one shown. */}
            <div className="flex w-full items-center gap-2 sm:contents">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${activeTabLabel.toLowerCase()}…`}
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-9 w-9 shrink-0 sm:hidden"
                onClick={refresh}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </div>
            {!isDisposalFolder && (
              <SupplierCombobox value={selectedSupplier} onChange={setSelectedSupplier} />
            )}
            <span className="shrink-0 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{displayRows.length}</span> in {activeTabLabel.toLowerCase()}
            </span>
            {/* View toggle — card grid vs. table */}
            <div className="flex flex-1 items-center rounded-lg border border-border/60 p-0.5 sm:flex-none sm:shrink-0">
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 flex-1 gap-1.5 px-2.5 sm:flex-none"
                onClick={() => setViewMode('table')}
                aria-label="Table view"
              >
                <TableProperties className="h-4 w-4" />
                Table
              </Button>
              <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 flex-1 gap-1.5 px-2.5 sm:flex-none"
                onClick={() => setViewMode('card')}
                aria-label="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
                Cards
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden h-9 w-9 sm:inline-flex"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>

          {/* Grid / table / states */}
          <div className="min-h-75">
            {loading && displayRows.length === 0 ? (
              <div className="flex h-75 flex-col items-center justify-center gap-3">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading…</p>
              </div>
            ) : displayRows.length === 0 ? (
              <div className="flex h-75 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
                  {isDisposalFolder
                    ? <History className="h-6 w-6 text-muted-foreground/50" />
                    : <Package className="h-6 w-6 text-muted-foreground/50" />}
                </div>
                <div>
                  <p className="text-base font-medium text-foreground">
                    {isDisposalFolder ? 'No write-offs yet' : 'No batches in this view'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {search.trim()
                      ? 'Try clearing the search'
                      : isDisposalFolder
                        ? 'Written-off batches will appear here once recorded'
                        : 'Nothing in this expiry window'}
                  </p>
                </div>
              </div>
            ) : viewMode === 'card' ? (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3"
              >
                {displayRows.map((row) =>
                  row.kind === 'batch' ? (
                    <BatchCard
                      key={rowKey(row)}
                      batch={row.batch}
                      onSelect={() => openBatch(row.batch.batchId)}
                    />
                  ) : (
                    <DisposalCard
                      key={rowKey(row)}
                      entry={row.entry}
                      onSelect={() => setDisposalModal(row.entry)}
                    />
                  ),
                )}
              </motion.div>
            ) : isDisposalFolder ? (
              <DisposalTable
                rows={displayRows.flatMap((r) => (r.kind === 'disposal' ? [r.entry] : []))}
                onSelect={setDisposalModal}
              />
            ) : (
              <BatchTable
                rows={displayRows.flatMap((r) => (r.kind === 'batch' ? [r.batch] : []))}
                onSelect={(b) => openBatch(b.batchId)}
              />
            )}
          </div>

          {/* Pagination */}
          {isDisposalFolder ? (
            <DataTablePagination
              currentPage={disposalPage}
              totalPages={totalDisposalPages}
              onPageChange={setDisposalPage}
              totalItems={currentDisposalTotal}
              itemsPerPage={PAGE_SIZE}
              className="border-t border-border/60 px-3"
            />
          ) : (
            <DataTablePagination
              currentPage={batchesPage}
              totalPages={totalBatchesPages}
              onPageChange={setBatchesPage}
              totalItems={batchesTotal}
              itemsPerPage={PAGE_SIZE}
              className="border-t border-border/60 px-3"
            />
          )}
        </Card>
      </motion.div>

      {/* Disposal detail modal (read-only) */}
      <Dialog open={!!disposalModal} onOpenChange={(open) => { if (!open) setDisposalModal(null) }}>
        <DialogContent className="md:max-w-md">
          {disposalModal && <DisposalDetail entry={disposalModal} />}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────
function KpiCard({
  title, value, subtitle, icon: Icon, accent, active, onClick,
}: {
  title: string
  value: string
  subtitle: string
  icon: typeof Package
  accent: 'rose' | 'amber' | 'orange'
  active: boolean
  onClick: () => void
}) {
  const tone = {
    rose:   { icon: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',     border: 'border-l-rose-500',   ring: 'ring-2 ring-rose-500/50' },
    amber:  { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',  border: 'border-l-amber-500',  ring: 'ring-2 ring-amber-500/50' },
    orange: { icon: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', border: 'border-l-orange-500', ring: 'ring-2 ring-orange-500/50' },
  }[accent]
  return (
    <Card
      hover
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={cn('cursor-pointer border-l-[3px] transition-shadow', tone.border, active && tone.ring)}
    >
      <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11', tone.icon)}>
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">{title}</p>
          <p className="font-mono text-xl font-bold leading-tight sm:text-2xl">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Batch card ───────────────────────────────────────────────
function BatchCard({ batch, onSelect }: { batch: EnrichedBatch; onSelect: () => void }) {
  const status = batchStatus(batch.daysToExpiry)

  return (
    <motion.div variants={cardVariants}>
      <Card
        hover
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
        className={cn('cursor-pointer border-l-[3px]', status.border)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-foreground">
              {batch.productName}
            </p>
            <Badge variant={status.variant} size="sm" dot>{status.label}</Badge>
          </div>

          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">{batch.batchNumber}</span>
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border/40 bg-muted/20 p-2.5 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Qty</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">{batch.quantity}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">MRP</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">{formatCurrency(batch.mrp)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Value</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">{formatCurrency(batch.stockValue)}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <SupplierLink id={batch.supplierId} name={batch.supplierName} phone={batch.supplierPhone} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Disposal card (write-off history) ────────────────────────
function DisposalCard({ entry, onSelect }: { entry: DisposalEntry; onSelect: () => void }) {
  const isWriteOff = entry.reason === 'Expired Removal'
  return (
    <motion.div variants={cardVariants}>
      <Card
        hover
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
        className={cn('cursor-pointer border-l-[3px]', isWriteOff ? 'border-l-rose-500' : 'border-l-purple-500')}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-foreground">
              {entry.productName}
            </p>
            <Badge variant={isWriteOff ? 'destructive' : 'purple'} size="sm">{entry.reason}</Badge>
          </div>

          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {entry.batchNumber}
            {entry.adjustmentNo && <> · {entry.adjustmentNo}</>}
          </p>

          <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-muted/20 p-2.5 font-mono text-sm">
            <span className="font-bold tabular-nums">{entry.previousQty}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-bold tabular-nums">{entry.adjustedQty}</span>
            <span className={cn(
              'ml-1 text-xs font-semibold',
              entry.diff < 0 && 'text-rose-600 dark:text-rose-400',
              entry.diff > 0 && 'text-emerald-600 dark:text-emerald-400',
            )}>
              ({entry.diff > 0 ? `+${entry.diff}` : entry.diff})
            </span>
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate">{entry.userName} · {timeAgo(entry.createdAt)}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Supplier link (blue name + phone, navigates to supplier detail) ──
function SupplierLink({ id, name, phone }: { id: string; name: string; phone: string | null }) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={(e) => {
          // Don't trigger the row's batch-detail navigation.
          e.stopPropagation()
          navigate(`/purchase/suppliers/detail?supplierId=${id}`)
        }}
        className="truncate text-left font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        {name}
      </button>
      {phone && (
        <p className="truncate text-xs text-muted-foreground">{phone}</p>
      )}
    </div>
  )
}

// ─── Batch table ──────────────────────────────────────────────
function BatchTable({ rows, onSelect }: { rows: EnrichedBatch[]; onSelect: (b: EnrichedBatch) => void }) {
  return (
    <>
      {/* responsive: cards on phones so the wide table isn't horizontally scrolled */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:hidden"
      >
        {rows.map((b) => (
          <BatchCard key={b.batchId} batch={b} onSelect={() => onSelect(b)} />
        ))}
      </motion.div>
      <div className="hidden overflow-x-auto md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">MRP</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => {
            const status = batchStatus(b.daysToExpiry)
            return (
              <TableRow
                key={b.batchId}
                onClick={() => onSelect(b)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">{b.productName}</TableCell>
                <TableCell className="font-mono text-xs">{b.batchNumber}</TableCell>
                <TableCell>
                  <SupplierLink id={b.supplierId} name={b.supplierName} phone={b.supplierPhone} />
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant} size="sm" dot>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(b.expiryDate)}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{b.quantity}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(b.mrp)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatCurrency(b.stockValue)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </>
  )
}

// ─── Disposal table (write-off history) ──────────────────────
function DisposalTable({ rows, onSelect }: { rows: DisposalEntry[]; onSelect: (e: DisposalEntry) => void }) {
  return (
    <>
      {/* responsive: cards on phones so the wide table isn't horizontally scrolled */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:hidden"
      >
        {rows.map((e) => (
          <DisposalCard key={e.id} entry={e} onSelect={() => onSelect(e)} />
        ))}
      </motion.div>
      <div className="hidden overflow-x-auto md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead>By</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const isWriteOff = e.reason === 'Expired Removal'
            return (
              <TableRow
                key={e.id}
                onClick={() => onSelect(e)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">{e.productName}</TableCell>
                <TableCell className="font-mono text-xs">
                  {e.batchNumber}
                  {e.adjustmentNo && <span className="text-muted-foreground"> · {e.adjustmentNo}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={isWriteOff ? 'destructive' : 'purple'} size="sm">{e.reason}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {e.previousQty} → {e.adjustedQty}
                  <span className={cn(
                    'ml-1.5 text-xs font-semibold',
                    e.diff < 0 && 'text-rose-600 dark:text-rose-400',
                    e.diff > 0 && 'text-emerald-600 dark:text-emerald-400',
                  )}>
                    ({e.diff > 0 ? `+${e.diff}` : e.diff})
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.userName}</TableCell>
                <TableCell className="text-muted-foreground">{timeAgo(e.createdAt)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </>
  )
}

// ─── Disposal detail (read-only, rendered inside a modal) ─────
function DisposalDetail({ entry }: { entry: DisposalEntry }) {
  const isWriteOff = entry.reason === 'Expired Removal'
  const when = new Date(entry.createdAt)
  const whenLabel = when.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3 pr-6">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          isWriteOff
            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
        )}>
          {isWriteOff ? <Trash2 className="h-5 w-5" /> : <PackageX className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold">{entry.productName}</p>
            <Badge variant={isWriteOff ? 'destructive' : 'purple'} size="sm">{entry.reason}</Badge>
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {entry.batchNumber}
            {entry.adjustmentNo && <> · {entry.adjustmentNo}</>}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 text-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Was</p>
          <p className="mt-1 font-mono text-base font-bold">{entry.previousQty}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Now</p>
          <p className="mt-1 font-mono text-base font-bold">{entry.adjustedQty}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Δ</p>
          <p className={cn(
            'mt-1 font-mono text-base font-bold',
            entry.diff < 0 && 'text-rose-600 dark:text-rose-400',
            entry.diff > 0 && 'text-emerald-600 dark:text-emerald-400',
          )}>
            {entry.diff > 0 ? `+${entry.diff}` : entry.diff}
          </p>
        </div>
      </div>

      {/* Who + when */}
      <div className="space-y-1.5 rounded-lg border border-border/40 bg-muted/10 p-3 text-sm">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <span>Recorded by <span className="font-medium text-foreground">{entry.userName}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <span>{whenLabel}</span>
        </div>
      </div>

      {/* Notes */}
      {entry.notes && (
        <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Notes</p>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{entry.notes}</p>
        </div>
      )}

      {/* Reversibility caveat */}
      <div className="flex items-start gap-2 rounded-lg border border-border/30 bg-muted/5 px-3 py-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          This batch was removed via a stock adjustment. To reverse, file a counter-adjustment in Stock Adjustment.
        </p>
      </div>
    </div>
  )
}

// ─── SupplierCombobox ─────────────────────────────────────────
// Searchable, server-paginated supplier picker: lazy-fetched on open,
// debounced query, infinite scroll for more pages, click-outside to close.
function SupplierCombobox({
  value, onChange,
}: {
  value: SupplierLite | null
  onChange: (v: SupplierLite | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const results = usePaginatedSearch<SupplierLite>({
    endpoint: '/suppliers',
    pageSize: 20,
    enabled: open,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const triggerLabel = value?.name ?? 'All suppliers'

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-xs transition-colors hover:bg-muted/40',
          value && 'border-primary/40 bg-primary/5 text-foreground',
        )}
      >
        <Truck className="h-4 w-4 text-muted-foreground/60" />
        <span className={cn('max-w-40 truncate', !value && 'text-muted-foreground')}>
          {triggerLabel}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
              }
            }}
            aria-label="Clear supplier"
            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
          >
            <div className="border-b border-border/60 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  value={results.query}
                  onChange={(e) => results.setQuery(e.target.value)}
                  placeholder="Search supplier name or GSTIN…"
                  className="h-9 w-full rounded-md bg-muted/40 pl-8 pr-2.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  autoFocus
                />
              </div>
            </div>

            <div
              className="max-h-64 overflow-y-auto"
              onScroll={(e) => {
                const el = e.currentTarget
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
                  results.loadMore()
                }
              }}
            >
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false) }}
                className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2.5 text-left text-xs transition-colors hover:bg-accent/60"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                  ALL
                </div>
                <span className="font-medium">All suppliers</span>
                {!value && <span className="ml-auto text-[10px] text-primary">Selected</span>}
              </button>

              {results.loading && results.items.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>
              )}
              {!results.loading && results.items.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {results.query ? `No suppliers match "${results.query}"` : 'No suppliers found'}
                </div>
              )}

              <div className="divide-y divide-border/40">
                {results.items.map((s) => {
                  const isSelected = value?.id === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { onChange({ id: s.id, name: s.name, gstin: s.gstin ?? null }); setOpen(false) }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-accent/60',
                        isSelected && 'bg-accent/40',
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                        {s.name[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{s.name}</p>
                        {s.gstin && (
                          <p className="truncate font-mono text-[10px] text-muted-foreground">{s.gstin}</p>
                        )}
                      </div>
                      {isSelected && <span className="ml-auto text-[10px] text-primary">Selected</span>}
                    </button>
                  )
                })}
              </div>

              {results.items.length > 0 && results.loading && (
                <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">Loading more…</div>
              )}
              {results.items.length > 0 && !results.loading && !results.hasMore && (
                <div className="px-3 py-2 text-center text-[10px] text-muted-foreground/60">
                  {results.total} supplier{results.total !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
