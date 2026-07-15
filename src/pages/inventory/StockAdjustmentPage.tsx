import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { toast } from 'sonner'
import { APPROVAL_THRESHOLD_INR } from '@/lib/inventory'
import {
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Package,
  PackagePlus,
  Search,
  RefreshCw,
  X,
  ChevronRight,
  History,
  User,
  Calendar,
  FileText,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useDeepLinkParam, useDeepLinkHighlightState } from '@/hooks/useDeepLinkHighlight'
import { usePageFilter } from '@/hooks/usePageFilter'
import { usePageSize } from '@/hooks/usePageSize'
import api from '@/lib/api'
import { cn, formatCurrency, generateId } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Adjustment types
// ─────────────────────────────────────────────────────────────

// Stock can only decrease here — additions belong to the Purchase Order / GRN
// flow. These reasons cover damage, expiry write-off, and unaccounted loss.
const adjustmentReasons = ['Damaged', 'Lost', 'Expired Removal'] as const

type AdjustmentReason = (typeof adjustmentReasons)[number]

interface AdjustmentItem {
  id: string
  productId: string
  productName: string
  batchId: string
  batchNumber: string
  systemQty: number
  adjustment: number
  rawAdjustment: string
  newQty: number
  reason: AdjustmentReason
  notes: string
  mrp: number
}

type FolderKey = 'all' | 'in-adjustment' | 'available' | 'history'

const FOLDERS: { key: FolderKey; label: string; icon: typeof Package; accent: string }[] = [
  { key: 'all',           label: 'All Batches',   icon: Package,       accent: 'text-foreground' },
  { key: 'in-adjustment', label: 'In Adjustment', icon: ClipboardList, accent: 'text-amber-600 dark:text-amber-400' },
  { key: 'available',     label: 'Available',     icon: PackagePlus,   accent: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'history',       label: 'History',       icon: History,       accent: 'text-blue-600 dark:text-blue-400' },
]

interface HistoryItem {
  productId: string
  productName: string
  batchId: string
  batchNumber: string
  reason: string
  previousQty: number
  adjustedQty: number
  diff: number
  notes: string | null
  mrp: number
  impact: number
}

interface AdjustmentHistoryRow {
  adjustmentNo: string
  createdAt: string
  userId: string
  userName: string
  branchId: string | null
  itemsCount: number
  totalDiff: number
  totalImpact: number
  items: HistoryItem[]
}

// Rows shown by the editor flow (All Batches / Available / In Adjustment).
// `BatchRow` and `BatchDetailPanel` only handle these — history rows are
// rendered by `HistoryRow` / `HistoryDetailPanel` instead.
type BatchKindRow =
  | { kind: 'item'; item: AdjustmentItem }
  | {
      kind: 'batch'
      batchId: string
      productId: string
      productName: string
      genericName: string
      batchNumber: string
      quantity: number
      mrp: number
    }

type DisplayRow =
  | BatchKindRow
  | { kind: 'history'; history: AdjustmentHistoryRow }

const rowKey = (r: DisplayRow) =>
  r.kind === 'item' ? r.item.id
    : r.kind === 'batch' ? r.batchId
    : r.history.adjustmentNo
const rowBatchId = (r: DisplayRow) => (r.kind === 'batch' ? r.batchId : r.kind === 'item' ? r.item.batchId : r.history.adjustmentNo)

// Write-off math, shared by the reducer below and the fresh-batch detail panel
// so the two can't drift. Any positive input is auto-negated — typing "7"
// produces "-7" — because this page is write-off only (additions go through
// the GRN flow).
function computeAdjustment(systemQty: number, raw: string) {
  const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw) || 0
  const signed = parsed > 0 ? -parsed : parsed
  const newQty = Math.max(0, systemQty + signed)
  // When the user types below -systemQty, pin newQty at 0 and recompute the
  // effective delta so adjustment + newQty stay consistent.
  const adjustment = newQty === 0 && systemQty + signed < 0 ? -systemQty : signed
  // Reflect the auto-negation back into the visible input so positive entries
  // flip to "-N" the moment they're typed.
  const sanitizedRaw = parsed > 0 ? `-${parsed}` : raw
  return { adjustment, newQty, sanitizedRaw }
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
}

const DEFAULT_PAGE_SIZE = 10

// ─────────────────────────────────────────────────────────────
// StockAdjustmentPage
// ─────────────────────────────────────────────────────────────

export default function StockAdjustmentPage() {
  const updateBatchLocally = useMasterDataStore((s) => s.updateBatchLocally)

  const [search, setSearch] = usePageFilter<string>('inventory.stockAdjustment', 'search', '')
  const [pageSize, setPageSize] = usePageSize('pbims.stockAdjustment.pageSize', DEFAULT_PAGE_SIZE)
  const [items, setItems] = useState<AdjustmentItem[]>([])
  const [batchesPage, setBatchesPage] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [availableRows, setAvailableRows] = useState<any[]>([])
  const [availableTotal, setAvailableTotal] = useState(0)
  const [fetching, setFetching] = useState(false)

  // History (folder === 'history'). Lazy-loaded the first time the user opens
  // the folder and re-fetched on page change or explicit refresh.
  const [historyRows, setHistoryRows] = useState<AdjustmentHistoryRow[]>([])
  const [historyTotal, setHistoryTotal] = useState<number | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [fetchingHistory, setFetchingHistory] = useState(false)

  const [folder, setFolder] = usePageFilter<FolderKey>('inventory.stockAdjustment', 'folder', 'all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Reset to page 1 when search changes
  useEffect(() => {
    setBatchesPage(1)
  }, [search])

  // Fetch the current page of available batches whenever search or page
  // changes. Debounces the search by 200 ms so typing doesn't fire per
  // keystroke.
  useEffect(() => {
    let cancelled = false
    setFetching(true)
    const handle = setTimeout(() => {
      api.get('/batches', {
        params: {
          q: search.trim() || undefined,
          status: 'active',
          skip: (batchesPage - 1) * pageSize,
          take: pageSize,
        },
      })
        .then((res) => {
          if (cancelled) return
          setAvailableRows(res.data?.data ?? [])
          setAvailableTotal(res.data?.total ?? 0)
        })
        .catch(() => {
          if (!cancelled) { setAvailableRows([]); setAvailableTotal(0) }
        })
        .finally(() => { if (!cancelled) setFetching(false) })
    }, search.trim() ? 200 : 0)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [search, batchesPage, pageSize])

  // Fetch the current page of history when the user is on the History folder
  // or when historyPage changes. We don't bind this to `search` — history list
  // doesn't filter server-side (the search box is reused for client-side filter
  // below).
  useEffect(() => {
    if (folder !== 'history') return
    let cancelled = false
    setFetchingHistory(true)
    api.get('/products/adjustments', {
      params: {
        skip: (historyPage - 1) * pageSize,
        take: pageSize,
      },
    })
      .then((res) => {
        if (cancelled) return
        setHistoryRows(res.data?.data ?? [])
        setHistoryTotal(res.data?.total ?? 0)
      })
      .catch(() => {
        if (!cancelled) { setHistoryRows([]); setHistoryTotal(0) }
      })
      .finally(() => { if (!cancelled) setFetchingHistory(false) })
    return () => { cancelled = true }
  }, [folder, historyPage, pageSize])

  // Deep-link from Stock Overview / Expiry Management:
  //   /inventory/adjustment?batchId=…
  // Behavior change vs the old page: in addition to pre-adding the batch to the
  // cart, we now also auto-open the detail panel for it and switch the sidebar
  // to "In Adjustment" so the user lands directly on the editor.
  const { targetId: deepLinkBatchId, clearParam } = useDeepLinkParam('batchId', '/inventory/adjustment')
  const { highlightId, highlight } = useDeepLinkHighlightState()
  useEffect(() => {
    if (!deepLinkBatchId) return
    const existing = items.find((i) => i.batchId === deepLinkBatchId)
    if (existing) {
      setFolder('in-adjustment')
      setSelectedId(existing.id)
      highlight(existing.id)
      clearParam()
      return
    }
    api.get(`/batches/${deepLinkBatchId}`)
      .then((res) => {
        const row = res.data
        if (!row) return
        const newItem: AdjustmentItem = {
          id: generateId('adj'),
          productId: row.productId,
          productName: row.productName,
          batchId: row.id,
          batchNumber: row.batchNumber,
          systemQty: row.quantity,
          adjustment: 0,
          rawAdjustment: '0',
          newQty: row.quantity,
          reason: 'Damaged',
          notes: '',
          mrp: Number(row.mrp),
        }
        setItems((prev) => [...prev, newItem])
        setFolder('in-adjustment')
        setSelectedId(newItem.id)
        highlight(newItem.id)
        clearParam()
      })
      .catch(() => clearParam())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkBatchId])

  const itemByBatchId = useMemo(
    () => new Map(items.map((i) => [i.batchId, i])),
    [items],
  )

  const displayRows: DisplayRow[] = useMemo(() => {
    if (folder === 'in-adjustment') {
      return items.map((i) => ({ kind: 'item' as const, item: i }))
    }
    if (folder === 'history') {
      // Client-side search filter on adjustmentNo / userName / batchNumber /
      // productName. Server returns the page as-is; the search box is reused
      // for in-page filtering.
      const q = search.trim().toLowerCase()
      const rows = q
        ? historyRows.filter((h) => {
            if (h.adjustmentNo.toLowerCase().includes(q)) return true
            if (h.userName.toLowerCase().includes(q)) return true
            return h.items.some((it) =>
              it.batchNumber.toLowerCase().includes(q)
              || it.productName.toLowerCase().includes(q),
            )
          })
        : historyRows
      return rows.map((h) => ({ kind: 'history' as const, history: h }))
    }
    const mapped = availableRows.map<DisplayRow>((r) => {
      const existing = itemByBatchId.get(r.id)
      return existing
        ? { kind: 'item', item: existing }
        : {
            kind: 'batch',
            batchId: r.id,
            productId: r.productId,
            productName: r.productName,
            genericName: r.genericName ?? '',
            batchNumber: r.batchNumber,
            quantity: r.quantity,
            mrp: Number(r.mrp),
          }
    })
    return folder === 'available' ? mapped.filter((r) => r.kind === 'batch') : mapped
  }, [folder, items, availableRows, itemByBatchId, historyRows, search])

  // Look first in the current page's rows; fall back to items / history so the
  // panel doesn't blink away when the user pages past a selected row.
  const selectedRow: DisplayRow | null = useMemo(() => {
    if (!selectedId) return null
    const inList = displayRows.find((r) => rowKey(r) === selectedId)
    if (inList) return inList
    const inItems = items.find((i) => i.id === selectedId)
    if (inItems) return { kind: 'item', item: inItems }
    const inHistory = historyRows.find((h) => h.adjustmentNo === selectedId)
    return inHistory ? { kind: 'history', history: inHistory } : null
  }, [selectedId, displayRows, items, historyRows])

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const updateAdjustment = (id: string, raw: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const { adjustment, newQty, sanitizedRaw } = computeAdjustment(item.systemQty, raw)
        return { ...item, rawAdjustment: sanitizedRaw, adjustment, newQty }
      }),
    )
  }

  const updateReason = (id: string, reason: AdjustmentReason) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, reason } : item)),
    )
  }

  const updateNotes = (id: string, notes: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, notes } : item)),
    )
  }

  // Calculations
  const totalValueImpact = useMemo(
    () => items.reduce((sum, item) => sum + item.adjustment * item.mrp, 0),
    [items],
  )

  // Backend is authoritative on approval — it returns its own `threshold` and
  // decides whether to queue the adjustment. This constant exists so the UI can
  // preview the "Approval Required" state before the request fires.
  const requiresApproval = Math.abs(totalValueImpact) > APPROVAL_THRESHOLD_INR
  const netQtyChange = useMemo(
    () => items.reduce((sum, item) => sum + item.adjustment, 0),
    [items],
  )

  const qtyColor =
    netQtyChange > 0 ? 'text-emerald-600 dark:text-emerald-400'
      : netQtyChange < 0 ? 'text-rose-600 dark:text-rose-400'
      : ''
  const valueColor =
    totalValueImpact > 0 ? 'text-emerald-600 dark:text-emerald-400'
      : totalValueImpact < 0 ? 'text-rose-600 dark:text-rose-400'
      : ''
  const valueLabel =
    totalValueImpact > 0
      ? `+${formatCurrency(totalValueImpact)}`
      : formatCurrency(totalValueImpact)

  const folderCounts: Record<FolderKey, number> = {
    all: availableTotal,
    'in-adjustment': items.length,
    // Approximate — `items` may include batches outside the current
    // active-status server pool, so this can drift by up to `items.length`.
    // Sidebar counts are navigational hints, not authoritative.
    available: Math.max(0, availableTotal - items.length),
    // 0 until the user opens the folder for the first time (lazy fetch). The
    // badge JSX hides 0-counts, so this just stays invisible until then.
    history: historyTotal ?? 0,
  }

  const activeFolderLabel = FOLDERS.find((f) => f.key === folder)?.label ?? 'All Batches'

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true)

      // API call first — only update local state after confirmed.
      // BE may either execute immediately (admin / under threshold) or queue
      // an approval request for non-admin users on large adjustments.
      const res = await api.post<{
        success?: boolean
        adjustmentNo?: string
        approvalRequested?: boolean
        approvalRequestId?: string
        totalValue?: number
        threshold?: number
      }>('/products/bulk-adjust', {
        items: items.map((item) => ({
          productId: item.productId,
          batchId: item.batchId,
          adjustedQty: item.newQty,
          reason: item.reason,
          notes: item.notes.trim() || undefined,
        })),
      })

      if (res.data.approvalRequested) {
        toast.info(
          `Approval request sent to admin (₹${(res.data.totalValue ?? 0).toLocaleString('en-IN')} > threshold ₹${(res.data.threshold ?? 0).toLocaleString('en-IN')}). Stock unchanged until approved.`,
          { duration: 5500 },
        )
        // Don't apply local changes — they'll happen at approval time.
        resetCart()
        return
      }

      // Update local store only after API confirms
      items.forEach((item) => {
        updateBatchLocally(item.batchId, item.adjustment)
      })

      const refNo = res.data.adjustmentNo ?? null
      toast.success(
        refNo
          ? `Stock adjustment ${refNo} saved successfully`
          : 'Stock adjustment saved successfully',
      )
      resetCart()
    } catch (error) {
      console.error(error)
      toast.error('Failed to process stock adjustments')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetCart = () => {
    setItems([])
    setSearch('')
    setSelectedId(null)
    // History badge may now be stale — bump its page so the effect refires
    // next time the user opens the folder.
    setHistoryTotal(null)
    setHistoryRows([])
  }

  const handleAddBatch = (
    args: { productId: string; productName: string; batchId: string;
            batchNumber: string; systemQty: number; mrp: number },
    adjustment: number,
    reason: AdjustmentReason,
    notes: string,
  ) => {
    const newQty = Math.max(0, args.systemQty + adjustment)
    const newItem: AdjustmentItem = {
      id: generateId('adj'),
      productId: args.productId,
      productName: args.productName,
      batchId: args.batchId,
      batchNumber: args.batchNumber,
      systemQty: args.systemQty,
      adjustment,
      rawAdjustment: String(adjustment),
      newQty,
      reason,
      notes,
      mrp: args.mrp,
    }
    setItems((prev) => [...prev, newItem])
    setSelectedId(newItem.id)
  }

  const refresh = () => {
    // Re-trigger the active folder's fetch by resetting its page (cheap,
    // predictable — the page-effect refires).
    if (folder === 'history') setHistoryPage(1)
    else setBatchesPage(1)
  }

  const totalBatchesPages = Math.max(1, Math.ceil(availableTotal / pageSize))

  // The submit footer below the Card only renders when there are items in
  // the cart (and we're not on History). When it's hidden, reclaim its slot
  // so the Card isn't sitting on top of empty space.
  const showSubmitFooter = items.length > 0 && folder !== 'history'

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden p-0">
          {/* ── Slim toolbar ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {items.length === 0 ? (
                <>No items in this adjustment</>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{items.length}</span> item{items.length === 1 ? '' : 's'}
                  {' · '}
                  <span className={cn('font-semibold', qtyColor)}>
                    {netQtyChange > 0 ? `+${netQtyChange}` : netQtyChange} units
                  </span>
                  {' · '}
                  <span className={cn('font-semibold', valueColor)}>{valueLabel}</span>
                  {requiresApproval && (
                    <> {' · '}<span className="font-semibold text-amber-600 dark:text-amber-400">approval required</span></>
                  )}
                </>
              )}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={refresh}
              disabled={fetching || fetchingHistory}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (fetching || fetchingHistory) && 'animate-spin')} />
            </Button>
          </div>

          {/* Below xl the app shows the fixed bottom tab bar (~5rem), so the
              shell must shrink by that much or the detail-panel footer renders
              underneath it and its buttons aren't reachable. */}
          <div className={cn(
            'flex min-h-100 flex-col lg:flex-row',
            showSubmitFooter
              ? 'h-[calc(100dvh-280px)] xl:h-[calc(100vh-200px)]'
              : 'h-[calc(100dvh-200px)] xl:h-[calc(100vh-120px)]',
          )}>
            {/* ── Sidebar: folders ── */}
            <aside className={cn(
              'shrink-0 border-b border-border/60 lg:w-56 lg:border-b-0 lg:border-r',
              selectedRow && 'hidden lg:block',
            )}>
              {/* responsive: horizontal scrolling tab strip on phones, vertical folder list at lg+ */}
              <div className="px-2 py-2 lg:px-3 lg:py-3">
                <p className="hidden px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 lg:block">
                  Folders
                </p>
                <nav className="flex gap-1 overflow-x-auto pb-0.5 [&>button]:shrink-0 lg:flex-col lg:gap-0 lg:space-y-0.5 lg:overflow-visible lg:pb-0">
                  {FOLDERS.map((cat) => {
                    const Icon = cat.icon
                    const count = folderCounts[cat.key]
                    const isActive = folder === cat.key
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setFolder(cat.key)}
                        className={cn(
                          'group relative flex w-auto items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm transition-colors lg:w-full',
                          isActive
                            ? 'bg-accent font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="adjustment-sidebar-active"
                            className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary lg:inset-x-auto lg:inset-y-1 lg:left-0 lg:h-auto lg:w-0.5"
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
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={`Search ${activeFolderLabel.toLowerCase()}…`}
                      className="h-8 border-border/60 pl-8 text-xs"
                    />
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {displayRows.length} in {activeFolderLabel}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {folder === 'history' && fetchingHistory && displayRows.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="text-xs text-muted-foreground">Loading history…</p>
                    </div>
                  ) : displayRows.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
                        {folder === 'history'
                          ? <History className="h-5 w-5 text-muted-foreground/50" />
                          : <Package className="h-5 w-5 text-muted-foreground/50" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {folder === 'in-adjustment' ? 'No items yet'
                            : folder === 'history' ? 'No adjustments yet'
                            : 'No batches found'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {folder === 'in-adjustment'
                            ? 'Pick a batch from All Batches or Available to start an adjustment'
                            : folder === 'history'
                              ? search.trim() ? 'Try clearing the search' : 'Submitted adjustments will appear here'
                              : search.trim()
                                ? 'Try clearing the search'
                                : folder === 'available'
                                  ? 'All visible batches are already in the adjustment'
                                  : 'No batches available to adjust'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    // Flat list — batches lack a natural time/category bucket
                    // (unlike Reminders/Approvals which group by date), and a
                    // single flat list is faster to scan.
                    <div>
                      {displayRows.map((row) =>
                        row.kind === 'history' ? (
                          <HistoryRow
                            key={rowKey(row)}
                            row={row.history}
                            isSelected={selectedId === row.history.adjustmentNo}
                            onSelect={setSelectedId}
                          />
                        ) : (
                          <BatchRow
                            key={rowKey(row)}
                            row={row}
                            isSelected={selectedId === rowKey(row)}
                            highlighted={highlightId === rowKey(row)}
                            onSelect={setSelectedId}
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>

                {folder === 'history' ? (
                  <DataTablePagination
                    currentPage={historyPage}
                    totalPages={Math.max(1, Math.ceil((historyTotal ?? 0) / pageSize))}
                    onPageChange={setHistoryPage}
                    totalItems={historyTotal ?? 0}
                    itemsPerPage={pageSize}
                    pageSize={pageSize}
                    onPageSizeChange={(n) => { setPageSize(n); setHistoryPage(1) }}
                    className="shrink-0 border-t border-border/60 px-3"
                  />
                ) : folder !== 'in-adjustment' && (
                  <DataTablePagination
                    currentPage={batchesPage}
                    totalPages={totalBatchesPages}
                    onPageChange={setBatchesPage}
                    totalItems={availableTotal}
                    itemsPerPage={pageSize}
                    pageSize={pageSize}
                    onPageSizeChange={(n) => { setPageSize(n); setBatchesPage(1) }}
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
                    className="flex min-w-0 flex-1 flex-col bg-background lg:w-md lg:flex-none lg:border-l lg:border-border/60 xl:w-lg"
                  >
                    {selectedRow.kind === 'history' ? (
                      <HistoryDetailPanel
                        row={selectedRow.history}
                        onClose={() => setSelectedId(null)}
                      />
                    ) : (
                      <BatchDetailPanel
                        row={selectedRow}
                        onClose={() => setSelectedId(null)}
                        onAdd={handleAddBatch}
                        onUpdateAdjustment={updateAdjustment}
                        onUpdateReason={updateReason}
                        onUpdateNotes={updateNotes}
                        onRemove={(id) => { removeItem(id); setSelectedId(null) }}
                      />
                    )}
                  </motion.aside>
                )}
              </AnimatePresence>
            </section>
          </div>
        </Card>
      </motion.div>

      {/* ── Submit footer (outside the Card so it's always reachable) ── */}
      {/* Hidden in History view so the read-only context doesn't show a stray
          Confirm button — the cart is preserved and reappears when the user
          switches back to All Batches / In Adjustment / Available. */}
      {showSubmitFooter && (
        <motion.div variants={itemVariants} className="space-y-3">
          {requiresApproval && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Requires Admin Approval
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  Total adjustment value exceeds {formatCurrency(APPROVAL_THRESHOLD_INR)}.
                  This adjustment will require admin approval before processing.
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isSubmitting}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  {isSubmitting ? 'Processing...' : 'Confirm Adjustment'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit stock adjustment?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      <p>
                        You're about to adjust <span className="font-semibold">{items.length}</span> batch
                        {items.length === 1 ? '' : 'es'} with a total value impact of{' '}
                        <span className={cn(
                          'font-semibold',
                          totalValueImpact < 0 ? 'text-rose-600' : 'text-emerald-600',
                        )}>
                          {totalValueImpact >= 0 ? '+' : ''}{formatCurrency(totalValueImpact)}
                        </span>.
                      </p>
                      {requiresApproval && (
                        <p className="text-amber-600 dark:text-amber-400 text-xs">
                          ⓘ Adjustment exceeds {formatCurrency(APPROVAL_THRESHOLD_INR)} — admins will see this immediately; non-admins will be queued for approval.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        This action is logged with your name and reason. It cannot be undone — you'd have to make a counter-adjustment.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting…' : 'Yes, submit'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

// ─── List row ─────────────────────────────────────────────────
function BatchRow({
  row, isSelected, highlighted, onSelect,
}: {
  row: BatchKindRow
  isSelected: boolean
  highlighted: boolean
  onSelect: (id: string) => void
}) {
  const key = rowKey(row)
  const isItem = row.kind === 'item'
  const impact = isItem ? row.item.adjustment * row.item.mrp : 0
  const aboveThreshold = isItem && Math.abs(impact) > APPROVAL_THRESHOLD_INR
  const borderTone = !isItem
    ? 'border-l-transparent'
    : aboveThreshold
      ? 'border-l-amber-500'
      : row.item.adjustment < 0
        ? 'border-l-rose-500'
        : 'border-l-transparent'

  const productName = isItem ? row.item.productName : row.productName
  const subLine = isItem
    ? `${row.item.batchNumber} · Qty ${row.item.systemQty} · MRP ${formatCurrency(row.item.mrp)}`
    : `${row.batchNumber} · Qty ${row.quantity} · MRP ${formatCurrency(row.mrp)}`
  const generic = !isItem ? row.genericName : ''

  return (
    <div
      id={`batchId-${rowBatchId(row)}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(key)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(key)
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
            {productName}
          </p>
          {isItem && (
            <Badge
              variant={row.item.adjustment < 0 ? 'destructive' : 'secondary'}
              size="sm"
              className="text-[9px]"
            >
              In adjustment · {row.item.adjustment > 0 ? `+${row.item.adjustment}` : row.item.adjustment} · {formatCurrency(impact)}
            </Badge>
          )}
        </div>
        {generic && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{generic}</p>
        )}
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
          {subLine}
        </p>
      </div>

      <ChevronRight
        className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40"
        aria-hidden
      />
    </div>
  )
}

// ─── Side detail panel ────────────────────────────────────────
// One panel handles both "fresh batch about to be added" and "already in cart"
// states. For fresh batches it keeps a local adjustment/reason draft until the
// user clicks Add; for cart items it edits the parent state in place.
function BatchDetailPanel({
  row, onClose, onAdd, onUpdateAdjustment, onUpdateReason, onUpdateNotes, onRemove,
}: {
  row: BatchKindRow
  onClose: () => void
  onAdd: (
    args: { productId: string; productName: string; batchId: string;
            batchNumber: string; systemQty: number; mrp: number },
    adjustment: number,
    reason: AdjustmentReason,
    notes: string,
  ) => void
  onUpdateAdjustment: (id: string, raw: string) => void
  onUpdateReason: (id: string, reason: AdjustmentReason) => void
  onUpdateNotes: (id: string, notes: string) => void
  onRemove: (id: string) => void
}) {
  const isItem = row.kind === 'item'

  // Fresh-batch draft state. The outer AnimatePresence `key={rowKey(...)}`
  // remounts this component between selections, so initial values are fine.
  const [draftRaw, setDraftRaw] = useState('0')
  const [draftReason, setDraftReason] = useState<AdjustmentReason>('Damaged')
  const [draftNotes, setDraftNotes] = useState('')

  const systemQty = isItem ? row.item.systemQty : row.quantity
  const mrp = isItem ? row.item.mrp : row.mrp
  const productName = isItem ? row.item.productName : row.productName
  const batchNumber = isItem ? row.item.batchNumber : row.batchNumber

  const draftDerived = computeAdjustment(systemQty, draftRaw)
  const adjustment = isItem ? row.item.adjustment : draftDerived.adjustment
  const newQty = isItem ? row.item.newQty : draftDerived.newQty
  const rawAdjustment = isItem ? row.item.rawAdjustment : draftRaw
  const reason = isItem ? row.item.reason : draftReason
  const notes = isItem ? row.item.notes : draftNotes
  const impact = adjustment * mrp
  const aboveThreshold = Math.abs(impact) > APPROVAL_THRESHOLD_INR

  const handleRawChange = (raw: string) => {
    if (isItem) {
      onUpdateAdjustment(row.item.id, raw)
    } else {
      const { sanitizedRaw } = computeAdjustment(systemQty, raw)
      setDraftRaw(sanitizedRaw)
    }
  }

  const stepBy = (delta: number) => {
    const next = String(adjustment + delta)
    handleRawChange(next)
  }

  const handleReasonChange = (v: AdjustmentReason) => {
    if (isItem) onUpdateReason(row.item.id, v)
    else setDraftReason(v)
  }

  const handleNotesChange = (v: string) => {
    if (isItem) onUpdateNotes(row.item.id, v)
    else setDraftNotes(v)
  }

  const headerBorder = aboveThreshold
    ? 'border-l-amber-500'
    : adjustment < 0
      ? 'border-l-rose-500'
      : 'border-l-border'

  const impactColor = impact > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : impact < 0
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-muted-foreground'

  return (
    <>
      {/* Header */}
      <div className={cn(
        'flex items-start gap-3 border-b border-border/60 border-l-[3px] px-4 py-3',
        headerBorder,
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Package className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{productName}</p>
            {isItem && (
              <Badge
                variant={row.item.adjustment < 0 ? 'destructive' : 'secondary'}
                size="sm"
              >
                In adjustment
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {batchNumber}
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* System / New / Impact summary */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/40 bg-muted/20 p-3 text-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">System</p>
            <p className="mt-1 font-mono text-base font-bold">{systemQty}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">New</p>
            <p className={cn(
              'mt-1 font-mono text-base font-bold',
              newQty < systemQty && 'text-rose-600 dark:text-rose-400',
            )}>
              {newQty}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Impact</p>
            <p className={cn('mt-1 font-mono text-base font-bold', impactColor)}>
              {impact > 0 ? `+${formatCurrency(impact)}` : formatCurrency(impact)}
            </p>
          </div>
        </div>

        {/* Adjustment stepper */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Adjustment quantity
          </Label>
          <div className="flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => stepBy(-1)}
              disabled={newQty === 0}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition hover:border-red-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-muted disabled:hover:text-muted-foreground"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <Input
              type="text"
              inputMode="numeric"
              value={rawAdjustment}
              onChange={(e) => {
                const val = e.target.value
                // Accept digits with optional leading minus. Positive entries
                // are auto-negated by `computeAdjustment` (write-off only).
                if (/^-?\d*$/.test(val)) handleRawChange(val)
              }}
              className={cn(
                'h-9 w-24 text-center font-mono',
                adjustment < 0 && 'border-red-500 text-red-600 dark:text-red-400',
              )}
            />
            <button
              type="button"
              onClick={() => stepBy(1)}
              disabled={adjustment >= 0}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-muted disabled:hover:text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground">
            Write-offs only — additions go through a Goods Received Note (GRN).
          </p>
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason
          </Label>
          <Select value={reason} onValueChange={(v) => handleReasonChange(v as AdjustmentReason)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {adjustmentReasons.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notes (optional) */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Notes <span className="font-normal normal-case tracking-normal text-muted-foreground/60">(optional)</span>
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="e.g. batch number printed wrong, water damage during transport, recall lot…"
            rows={3}
            className="resize-none text-xs"
          />
        </div>

        {aboveThreshold && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This item alone exceeds the {formatCurrency(APPROVAL_THRESHOLD_INR)} approval threshold.
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/10 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {isItem ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onRemove(row.item.id)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
            <Button size="sm" onClick={onClose} className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Done
            </Button>
          </>
        ) : (
          <>
            {/* Helper hint is desktop-only; on mobile the button goes full-width
                (its label already says what it does). */}
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Set quantity to add this batch
            </span>
            <Button
              size="sm"
              disabled={adjustment === 0}
              className="w-full gap-1.5 sm:w-auto"
              onClick={() => onAdd(
                {
                  productId: row.productId,
                  productName: row.productName,
                  batchId: row.batchId,
                  batchNumber: row.batchNumber,
                  systemQty: row.quantity,
                  mrp: row.mrp,
                },
                adjustment,
                draftReason,
                draftNotes,
              )}
            >
              <Plus className="h-3.5 w-3.5" /> Add to adjustment
            </Button>
          </>
        )}
      </div>
    </>
  )
}

// ─── History row (one per submitted adjustment) ──────────────
function HistoryRow({
  row, isSelected, onSelect,
}: {
  row: AdjustmentHistoryRow
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const aboveThreshold = Math.abs(row.totalImpact) > APPROVAL_THRESHOLD_INR
  const borderTone = aboveThreshold
    ? 'border-l-amber-500'
    : row.totalDiff < 0
      ? 'border-l-rose-500'
      : 'border-l-transparent'
  const when = new Date(row.createdAt)
  const whenLabel = when.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.adjustmentNo)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(row.adjustmentNo)
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 border-b border-l-[3px] border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/40',
        borderTone,
        isSelected && 'bg-accent/60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-mono text-[13px] font-semibold leading-tight text-foreground">
            {row.adjustmentNo}
          </p>
          <Badge
            variant={row.totalDiff < 0 ? 'destructive' : 'secondary'}
            size="sm"
            className="text-[9px]"
          >
            {row.itemsCount} item{row.itemsCount === 1 ? '' : 's'} · {row.totalDiff > 0 ? `+${row.totalDiff}` : row.totalDiff} units · {row.totalImpact > 0 ? `+${formatCurrency(row.totalImpact)}` : formatCurrency(row.totalImpact)}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <User className="mr-1 inline h-3 w-3 align-[-2px]" />
          {row.userName}
        </p>
        <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
          <Calendar className="mr-1 inline h-3 w-3 align-[-2px]" />
          {whenLabel}
        </p>
      </div>
      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
    </div>
  )
}

// ─── History detail panel (read-only) ─────────────────────────
function HistoryDetailPanel({
  row, onClose,
}: {
  row: AdjustmentHistoryRow
  onClose: () => void
}) {
  const aboveThreshold = Math.abs(row.totalImpact) > APPROVAL_THRESHOLD_INR
  const headerBorder = aboveThreshold
    ? 'border-l-amber-500'
    : row.totalDiff < 0
      ? 'border-l-rose-500'
      : 'border-l-border'
  const when = new Date(row.createdAt)
  const whenLabel = when.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const totalImpactColor = row.totalImpact > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : row.totalImpact < 0
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-muted-foreground'

  return (
    <>
      {/* Header */}
      <div className={cn(
        'flex items-start gap-3 border-b border-border/60 border-l-[3px] px-4 py-3',
        headerBorder,
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <History className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-mono text-sm font-semibold">{row.adjustmentNo}</p>
            <Badge variant="secondary" size="sm">Posted</Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            By <span className="font-medium text-foreground">{row.userName}</span>
            {' · '}{whenLabel}
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Items</p>
            <p className="mt-1 font-mono text-base font-bold">{row.itemsCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Net units</p>
            <p className={cn(
              'mt-1 font-mono text-base font-bold',
              row.totalDiff < 0 && 'text-rose-600 dark:text-rose-400',
              row.totalDiff > 0 && 'text-emerald-600 dark:text-emerald-400',
            )}>
              {row.totalDiff > 0 ? `+${row.totalDiff}` : row.totalDiff}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Impact</p>
            <p className={cn('mt-1 font-mono text-base font-bold', totalImpactColor)}>
              {row.totalImpact > 0 ? `+${formatCurrency(row.totalImpact)}` : formatCurrency(row.totalImpact)}
            </p>
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Line items · {row.items.length}
          </p>
          <div className="space-y-2">
            {row.items.map((it) => (
              <div
                key={`${it.batchId}-${it.productId}`}
                className={cn(
                  'rounded-lg border bg-muted/10 p-3',
                  it.diff < 0 ? 'border-rose-200 dark:border-rose-900/40' : 'border-border/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.productName}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                      {it.batchNumber}
                    </p>
                  </div>
                  <Badge
                    variant={it.diff < 0 ? 'destructive' : 'secondary'}
                    size="sm"
                    className="shrink-0"
                  >
                    {it.reason}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground/60">Was</p>
                    <p className="font-mono font-semibold">{it.previousQty}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60">Now</p>
                    <p className="font-mono font-semibold">{it.adjustedQty}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60">Δ</p>
                    <p className={cn(
                      'font-mono font-semibold',
                      it.diff < 0 && 'text-rose-600 dark:text-rose-400',
                      it.diff > 0 && 'text-emerald-600 dark:text-emerald-400',
                    )}>
                      {it.diff > 0 ? `+${it.diff}` : it.diff}
                      {it.mrp > 0 && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          ({it.impact > 0 ? `+${formatCurrency(it.impact)}` : formatCurrency(it.impact)})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {it.notes && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/30 px-2 py-1.5">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" />
                    <p className="text-[11px] text-muted-foreground">{it.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Caveat about mrp lookup */}
        <p className="text-[10px] text-muted-foreground/60">
          Impact uses the current batch MRP. If the batch was deleted, impact shows as ₹0.
        </p>
      </div>
    </>
  )
}
