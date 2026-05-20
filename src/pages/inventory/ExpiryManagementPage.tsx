import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  AlertOctagon, AlertTriangle, Clock, Package, PackageX, Trash2,
  Search, RefreshCw, X, ChevronRight, ChevronDown, Truck,
  User, Calendar, FileText, History,
} from 'lucide-react'

import { DataTablePagination } from '@/components/shared/DataTablePagination'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { BatchDetailView } from './BatchDetailView'
import { useDeepLinkHighlightState } from '@/hooks/useDeepLinkHighlight'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { cn, formatCurrency, timeAgo } from '@/lib/utils'
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
  supplierName: string
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
  | 'disposals'

interface FolderConfig {
  key: FolderKey
  label: string
  icon: typeof Package
  accent: string
  divider?: boolean
}

const FOLDERS: FolderConfig[] = [
  { key: 'all',           label: 'All Batches',   icon: Package,       accent: 'text-foreground' },
  { key: 'expired',       label: 'Expired',       icon: AlertOctagon,  accent: 'text-rose-600 dark:text-rose-400' },
  { key: 'expiring-soon', label: 'Expiring Soon', icon: Clock,         accent: 'text-amber-600 dark:text-amber-400' },
  { key: 'write-offs',    label: 'Write-offs',    icon: Trash2,        accent: 'text-rose-600 dark:text-rose-400', divider: true },
  { key: 'disposals',     label: 'Disposals',     icon: PackageX,      accent: 'text-purple-600 dark:text-purple-400' },
]

const BUCKET_FOLDERS: FolderKey[] = ['all', 'expired', 'expiring-soon']
const DISPOSAL_FOLDERS: FolderKey[] = ['write-offs', 'disposals']

type DisplayRow =
  | { kind: 'batch'; batch: EnrichedBatch }
  | { kind: 'disposal'; entry: DisposalEntry }

const rowKey = (r: DisplayRow) =>
  r.kind === 'batch' ? r.batch.batchId : r.entry.id

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}

const PAGE_SIZE = 10

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ExpiryManagementPage() {
  const [folder, setFolder] = useState<FolderKey>('expired')
  const [search, setSearch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierLite | null>(null)
  const [selectedRow, setSelectedRow] = useState<DisplayRow | null>(null)

  // Active batches state (folders: expired/30d/60d/90d/180d/all)
  const [batchRows, setBatchRows] = useState<any[]>([])
  const [batchesTotal, setBatchesTotal] = useState(0)
  const [batchesPage, setBatchesPage] = useState(1)
  const [fetchingBatches, setFetchingBatches] = useState(false)

  // Disposal history state (folders: write-offs/disposals). Counts are cached
  // per-reason and only update when the user visits that folder — same lazy
  // pattern as Stock Adjustment's History folder.
  const [disposalRows, setDisposalRows] = useState<DisposalEntry[]>([])
  const [writeOffsTotal, setWriteOffsTotal] = useState<number | null>(null)
  const [disposalsTotal, setDisposalsTotal] = useState<number | null>(null)
  const [disposalPage, setDisposalPage] = useState(1)
  const [fetchingDisposal, setFetchingDisposal] = useState(false)

  // Stats bundle — drives the bucket count badges in the sidebar.
  const [stats, setStats] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { highlightId: highlightBatchId, highlight } = useDeepLinkHighlightState()

  // Map UI folder → API filter params (only meaningful for bucket folders).
  // 'Expiring Soon' aggregates everything within the 180-day window — server
  // returns batches with daysToExpiry ≤ 180 in one query instead of four.
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
          // folder — they live in the Write-offs / Disposals folders now.
          // `hasStock=true` is orthogonal to `status='active'` (which would
          // also exclude expired) so expired batches still appear here.
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

  // Disposal-history fetch — runs only on disposal folders.
  useEffect(() => {
    if (!DISPOSAL_FOLDERS.includes(folder)) return
    let cancelled = false
    setFetchingDisposal(true)
    const reason = folder === 'write-offs' ? 'Expired Removal' : 'Damaged'
    api.get('/products/disposals', {
      params: {
        reason,
        skip: (disposalPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      },
    })
      .then((res) => {
        if (cancelled) return
        const data: DisposalEntry[] = res.data?.data ?? []
        const total: number = res.data?.total ?? 0
        setDisposalRows(data)
        if (folder === 'write-offs') setWriteOffsTotal(total)
        else setDisposalsTotal(total)
      })
      .catch(() => {
        if (!cancelled) {
          setDisposalRows([])
          if (folder === 'write-offs') setWriteOffsTotal(0)
          else setDisposalsTotal(0)
        }
      })
      .finally(() => { if (!cancelled) setFetchingDisposal(false) })
    return () => { cancelled = true }
  }, [folder, disposalPage, refreshKey])

  // Stats — refresh on mount and whenever a mutation lands.
  const refreshStats = useCallback(async () => {
    try {
      const res = await api.get('/reports/inventory/stats')
      setStats(res.data)
    } catch {
      // non-critical; counters just stay at 0
    }
  }, [])
  useEffect(() => { refreshStats() }, [refreshStats, refreshKey])

  // Enrich raw batch rows with computed days-to-expiry / bucket / stockValue.
  // qty=0 batches are already filtered server-side via `hasStock=true`.
  const enrichedBatches: EnrichedBatch[] = useMemo(() => {
    return batchRows
      .map((r) => {
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
  const activeFolderLabel = FOLDERS.find((f) => f.key === folder)?.label ?? 'Expired'

  // Sidebar count badges. The 'Expiring Soon' folder rolls up the four
  // sub-windows (30/60/90/180) since the page no longer shows them separately.
  const folderCounts: Record<FolderKey, number> = useMemo(() => {
    const eb = stats?.expiryBuckets ?? {}
    const expiringSoonCount =
      (eb['30d']?.count ?? 0) + (eb['60d']?.count ?? 0)
      + (eb['90d']?.count ?? 0) + (eb['180d']?.count ?? 0)
    return {
      all: folder === 'all' ? batchesTotal : 0,
      expired: eb.expired?.count ?? 0,
      'expiring-soon': expiringSoonCount,
      'write-offs': writeOffsTotal ?? 0,
      disposals: disposalsTotal ?? 0,
    }
  }, [stats, folder, batchesTotal, writeOffsTotal, disposalsTotal])

  // "At risk" value shown in the toolbar.
  const atRiskValue = useMemo(() => {
    const eb = stats?.expiryBuckets ?? {}
    const allBuckets: ExpiryBucket[] = ['expired', '30d', '60d', '90d', '180d']
    if (folder === 'all') return allBuckets.reduce((sum, k) => sum + (eb[k]?.value ?? 0), 0)
    if (folder === 'expired') return eb.expired?.value ?? 0
    if (folder === 'expiring-soon') {
      return (['30d', '60d', '90d', '180d'] as ExpiryBucket[])
        .reduce((sum, k) => sum + (eb[k]?.value ?? 0), 0)
    }
    return 0
  }, [stats, folder])

  const refresh = () => {
    if (isDisposalFolder) setDisposalPage(1)
    else setBatchesPage(1)
    setRefreshKey((k) => k + 1)
  }

  const onAfterAction = () => {
    setSelectedRow(null)
    setRefreshKey((k) => k + 1)
    refreshStats()
  }

  // Deep-link: highlight the deep-linked batch when the URL has ?batchId=...
  // (existing behavior — kept for parity).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('batchId')
    if (id) {
      highlight(id)
      window.history.replaceState(null, '', '/inventory/expiry')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalBatchesPages = Math.max(1, Math.ceil(batchesTotal / PAGE_SIZE))
  const currentDisposalTotal = folder === 'write-offs' ? writeOffsTotal ?? 0 : disposalsTotal ?? 0
  const totalDisposalPages = Math.max(1, Math.ceil(currentDisposalTotal / PAGE_SIZE))

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden p-0">
          {/* ── Slim toolbar ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {isDisposalFolder ? (
                <>
                  <span className="font-semibold text-foreground">{currentDisposalTotal}</span>
                  {' '}{folder === 'write-offs' ? 'write-off' : 'disposal'}{currentDisposalTotal === 1 ? '' : 's'} on record
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{batchesTotal}</span> batch{batchesTotal === 1 ? '' : 'es'}
                  {atRiskValue > 0 && (
                    <> {' · '}<span className="font-semibold">{formatCurrency(atRiskValue)}</span> at risk</>
                  )}
                </>
              )}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={refresh}
              disabled={fetchingBatches || fetchingDisposal}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (fetchingBatches || fetchingDisposal) && 'animate-spin')} />
            </Button>
          </div>

          <div className="flex h-[calc(100vh-200px)] min-h-100 flex-col lg:flex-row">
            {/* ── Sidebar: folders ── */}
            <aside className={cn(
              'shrink-0 border-b border-border/60 lg:w-56 lg:border-b-0 lg:border-r',
              selectedRow && 'hidden lg:block',
            )}>
              <div className="px-3 py-3">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Folders
                </p>
                <nav className="space-y-0.5">
                  {FOLDERS.map((cat) => {
                    const Icon = cat.icon
                    const count = folderCounts[cat.key]
                    const isActive = folder === cat.key
                    return (
                      <div key={cat.key}>
                        {cat.divider && <div className="my-1 border-t border-border/40" />}
                        <button
                          type="button"
                          onClick={() => setFolder(cat.key)}
                          className={cn(
                            'group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                            isActive
                              ? 'bg-accent font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          )}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="expiry-sidebar-active"
                              className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}
                          <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? cat.accent : '')} />
                          <span className="flex-1 truncate">{cat.label}</span>
                          {count > 0 && (
                            <span className={cn(
                              'rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums',
                              isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}>
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </nav>
              </div>
            </aside>

            {/* ── Main: search + list + detail panel ── */}
            <section className="flex min-h-0 flex-1 flex-row">
              {/* List column */}
              <div className={cn(
                'flex min-w-0 flex-1 flex-col',
                selectedRow && 'hidden lg:flex',
              )}>
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
                  <div className="relative flex-1 min-w-0">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search ${activeFolderLabel.toLowerCase()}…`}
                      className="h-8 border-border/60 pl-8 text-xs"
                    />
                  </div>
                  {!isDisposalFolder && (
                    <SupplierCombobox
                      value={selectedSupplier}
                      onChange={setSelectedSupplier}
                    />
                  )}
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {displayRows.length} in {activeFolderLabel}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {(fetchingBatches || fetchingDisposal) && displayRows.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    </div>
                  ) : displayRows.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
                        {isDisposalFolder
                          ? <History className="h-5 w-5 text-muted-foreground/50" />
                          : <Package className="h-5 w-5 text-muted-foreground/50" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {isDisposalFolder
                            ? folder === 'write-offs' ? 'No write-offs yet' : 'No disposals yet'
                            : 'No batches in this folder'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {search.trim()
                            ? 'Try clearing the search'
                            : isDisposalFolder
                              ? `${folder === 'write-offs' ? 'Written-off' : 'Disposed'} batches will appear here once recorded`
                              : 'Nothing in this expiry window'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {displayRows.map((row) =>
                        row.kind === 'batch' ? (
                          <BatchRow
                            key={rowKey(row)}
                            batch={row.batch}
                            isSelected={selectedRow?.kind === 'batch' && selectedRow.batch.batchId === row.batch.batchId}
                            highlighted={highlightBatchId === row.batch.batchId}
                            onSelect={() => setSelectedRow(row)}
                          />
                        ) : (
                          <DisposalRow
                            key={rowKey(row)}
                            entry={row.entry}
                            isSelected={selectedRow?.kind === 'disposal' && selectedRow.entry.id === row.entry.id}
                            onSelect={() => setSelectedRow(row)}
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>

                {isDisposalFolder ? (
                  <DataTablePagination
                    currentPage={disposalPage}
                    totalPages={totalDisposalPages}
                    onPageChange={setDisposalPage}
                    totalItems={currentDisposalTotal}
                    itemsPerPage={PAGE_SIZE}
                    className="shrink-0 border-t border-border/60 px-3"
                  />
                ) : (
                  <DataTablePagination
                    currentPage={batchesPage}
                    totalPages={totalBatchesPages}
                    onPageChange={setBatchesPage}
                    totalItems={batchesTotal}
                    itemsPerPage={PAGE_SIZE}
                    className="shrink-0 border-t border-border/60 px-3"
                  />
                )}
              </div>

              {/* Detail panel */}
              <AnimatePresence initial={false}>
                {selectedRow && (
                  <motion.aside
                    key={rowKey(selectedRow)}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="relative flex min-w-0 flex-1 flex-col bg-background lg:w-md lg:flex-none lg:border-l lg:border-border/60 xl:w-lg"
                  >
                    {selectedRow.kind === 'batch' ? (
                      <>
                        {/* Close button overlays the panel header — keeps the
                            BatchDetailView footer inside the viewport since we
                            don't steal a row of vertical space. */}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="absolute right-2 top-2 z-10 h-7 w-7"
                          onClick={() => setSelectedRow(null)}
                          aria-label="Close panel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <BatchDetailView
                          batchId={selectedRow.batch.batchId}
                          onAfterAction={onAfterAction}
                        />
                      </>
                    ) : (
                      <DisposalDetailPanel
                        entry={selectedRow.entry}
                        onClose={() => setSelectedRow(null)}
                      />
                    )}
                  </motion.aside>
                )}
              </AnimatePresence>
            </section>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}

// ─── Batch row ────────────────────────────────────────────────
function BatchRow({
  batch, isSelected, highlighted, onSelect,
}: {
  batch: EnrichedBatch
  isSelected: boolean
  highlighted: boolean
  onSelect: () => void
}) {
  const borderTone =
    batch.daysToExpiry < 0 ? 'border-l-rose-500'
      : batch.daysToExpiry <= 30 ? 'border-l-amber-500'
      : batch.daysToExpiry <= 90 ? 'border-l-yellow-500'
      : 'border-l-transparent'

  const statusVariant =
    batch.daysToExpiry < 0 ? 'destructive'
      : batch.daysToExpiry <= 30 ? 'warning'
      : 'secondary'

  const statusLabel = batch.daysToExpiry < 0
    ? `Expired ${Math.abs(batch.daysToExpiry)}d ago`
    : `Expires in ${batch.daysToExpiry}d`

  return (
    <div
      id={`batchId-${batch.batchId}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 border-b border-l-[3px] border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/40',
        borderTone,
        isSelected && 'bg-accent/60',
        highlighted && 'bg-emerald-500/10 ring-1 ring-emerald-500/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
            {batch.productName}
          </p>
          <Badge variant={statusVariant} size="sm" className="text-[9px]">
            {statusLabel}
          </Badge>
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
          {batch.batchNumber} · Qty {batch.quantity} · MRP {formatCurrency(batch.mrp)} · {formatCurrency(batch.stockValue)}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
          {batch.supplierName}
        </p>
      </div>
      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
    </div>
  )
}

// ─── Disposal row (write-off / dispose history) ──────────────
function DisposalRow({
  entry, isSelected, onSelect,
}: {
  entry: DisposalEntry
  isSelected: boolean
  onSelect: () => void
}) {
  const isWriteOff = entry.reason === 'Expired Removal'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 border-b border-l-[3px] border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/40',
        isWriteOff ? 'border-l-rose-500' : 'border-l-purple-500',
        isSelected && 'bg-accent/60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
            {entry.productName}
          </p>
          <Badge
            variant={isWriteOff ? 'destructive' : 'secondary'}
            size="sm"
            className="text-[9px]"
          >
            {entry.reason}
          </Badge>
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
          {entry.batchNumber} · Was {entry.previousQty} → {entry.adjustedQty} (Δ {entry.diff})
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
          <User className="mr-1 inline h-3 w-3 align-[-2px]" />
          {entry.userName} · {timeAgo(entry.createdAt)}
          {entry.adjustmentNo && <> · <span className="font-mono">{entry.adjustmentNo}</span></>}
        </p>
      </div>
      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
    </div>
  )
}

// ─── Disposal detail panel (read-only) ────────────────────────
function DisposalDetailPanel({
  entry, onClose,
}: {
  entry: DisposalEntry
  onClose: () => void
}) {
  const isWriteOff = entry.reason === 'Expired Removal'
  const when = new Date(entry.createdAt)
  const whenLabel = when.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <>
      {/* Header */}
      <div className={cn(
        'flex items-start gap-3 border-b border-border/60 border-l-[3px] px-4 py-3',
        isWriteOff ? 'border-l-rose-500' : 'border-l-purple-500',
      )}>
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          isWriteOff
            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
        )}>
          {isWriteOff ? <Trash2 className="h-4 w-4" /> : <PackageX className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{entry.productName}</p>
            <Badge
              variant={isWriteOff ? 'destructive' : 'secondary'}
              size="sm"
            >
              {entry.reason}
            </Badge>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {entry.batchNumber}
            {entry.adjustmentNo && <> · {entry.adjustmentNo}</>}
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
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
        <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <span>Recorded by <span className="font-medium text-foreground">{entry.userName}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <span>{whenLabel}</span>
          </div>
        </div>

        {/* Notes */}
        {entry.notes && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Notes
              </p>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{entry.notes}</p>
          </div>
        )}

        {/* Reversibility caveat */}
        <div className="flex items-start gap-2 rounded-lg border border-border/30 bg-muted/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <p className="text-[11px] text-muted-foreground">
            This batch was removed via a stock adjustment. To reverse, file a counter-adjustment in Stock Adjustment.
          </p>
        </div>
      </div>
    </>
  )
}

// ─── SupplierCombobox ─────────────────────────────────────────
// Searchable, server-paginated supplier picker that matches the New Sale
// page's customer dropdown pattern: lazy-fetched on open, debounced query,
// infinite scroll for more pages, click-outside to close.
function SupplierCombobox({
  value, onChange,
}: {
  value: SupplierLite | null
  onChange: (v: SupplierLite | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Server-paginated search — only fires while the dropdown is open so we don't
  // burn requests on every keystroke when the picker is closed.
  const results = usePaginatedSearch<SupplierLite>({
    endpoint: '/suppliers',
    pageSize: 20,
    enabled: open,
  })

  // Close on outside click
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
          'flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 text-[11px] transition-colors hover:bg-muted/40',
          value && 'border-primary/40 bg-primary/5 text-foreground',
        )}
      >
        <Truck className="h-3.5 w-3.5 text-muted-foreground/60" />
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
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
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
