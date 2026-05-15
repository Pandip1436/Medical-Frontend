import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { toast } from 'sonner'
import { navigate, useRoute } from '@/lib/router'
import { APPROVAL_THRESHOLD_INR } from '@/lib/inventory'
import {
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Package,
  IndianRupee,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import api from '@/lib/api'
import { cn, formatCurrency, generateId, generateInvoiceNumber } from '@/lib/utils'

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
  mrp: number
}

// ─────────────────────────────────────────────────────────────
// StockAdjustmentPage
// ─────────────────────────────────────────────────────────────

export default function StockAdjustmentPage() {
  const updateBatchLocally = useMasterDataStore((s) => s.updateBatchLocally)

  const [isSubmitted, setIsSubmitted] = useState(false)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AdjustmentItem[]>([])
  const [referenceNumber, setReferenceNumber] = useState('')
  const [batchesPage, setBatchesPage] = useState(1)
  const BATCHES_PAGE_SIZE = 10

  // Server-paginated Available Batches list (replaces deriving from the master
  // batches array, which forced a /products full-catalogue load on mount).
  const [availableRows, setAvailableRows] = useState<any[]>([])
  const [availableTotal, setAvailableTotal] = useState(0)

  // Reset to page 1 when search changes
  useEffect(() => {
    setBatchesPage(1)
  }, [search])

  // Fetch the current page of available batches whenever search or page
  // changes. Debounces the search by 200 ms so typing doesn't fire per
  // keystroke.
  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(() => {
      api.get('/batches', {
        params: {
          q: search.trim() || undefined,
          status: 'active',
          skip: (batchesPage - 1) * BATCHES_PAGE_SIZE,
          take: BATCHES_PAGE_SIZE,
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
    }, search.trim() ? 200 : 0)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [search, batchesPage])

  // Deep-link from Stock Overview / Expiry Management: /inventory/adjustment?batchId=…
  // Pre-add that batch via a single /batches/:id fetch — no full master load.
  const { search: routeSearch } = useRoute()
  const handledBatchIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    const targetBatchId = new URLSearchParams(routeSearch).get('batchId')
    if (!targetBatchId) return
    if (handledBatchIds.current.has(targetBatchId)) return

    // Mark handled and strip the URL FIRST — re-entry guard.
    handledBatchIds.current.add(targetBatchId)
    window.history.replaceState(null, '', '/inventory/adjustment')

    if (items.some((i) => i.batchId === targetBatchId)) return

    api.get(`/batches/${targetBatchId}`)
      .then((res) => {
        const row = res.data
        if (!row) return
        addItem(
          { id: row.productId, name: row.productName },
          { id: row.id, batchNumber: row.batchNumber, quantity: row.quantity, mrp: row.mrp },
        )
      })
      .catch(() => { /* batch missing or unauthorised — silent */ })
    // `addItem` and `items` are intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch])

  // Available batches list — already-added items filtered out client-side so
  // users can't add the same batch twice within the same session.
  const searchResults = useMemo(() => {
    const addedIds = new Set(items.map((i) => i.batchId))
    return availableRows
      .filter((r) => !addedIds.has(r.id))
      .map((r) => ({
        product: { id: r.productId, name: r.productName, genericName: r.genericName ?? '' },
        batch: { id: r.id, batchNumber: r.batchNumber, quantity: r.quantity, mrp: r.mrp },
      }))
  }, [availableRows, items])

  const addItem = (product: any, batch: any) => {
    setItems((prev) => [
      ...prev,
      {
        id: generateId('adj'),
        productId: product.id,
        productName: product.name,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        systemQty: batch.quantity,
        adjustment: 0,
        rawAdjustment: '0',
        newQty: batch.quantity,
        reason: 'Damaged',
        mrp: Number(batch.mrp),
      },
    ])
    setSearch('')
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const updateAdjustment = (id: string, raw: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const parsed = raw === '' || raw === '-' ? 0 : parseInt(raw) || 0
        // Write-off only: cap parsed at 0 so the user can never push stock UP
        // from this page (additions belong to the Purchase Order / GRN flow).
        const negativeOnly = Math.min(0, parsed)
        const newQty = Math.max(0, item.systemQty + negativeOnly)
        // If the user typed below -systemQty, recompute the effective delta so
        // adjustment + newQty stay consistent (newQty pinned at 0).
        const clampedAdjustment = newQty === 0 && item.systemQty + negativeOnly < 0
          ? -item.systemQty
          : negativeOnly
        // Mirror the cap into the visible input so positive inputs don't linger.
        const sanitizedRaw = parsed > 0 ? '0' : raw
        return { ...item, rawAdjustment: sanitizedRaw, adjustment: clampedAdjustment, newQty }
      })
    )
  }

  const updateReason = (id: string, reason: AdjustmentReason) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, reason } : item))
    )
  }

  // Calculations
  const totalValueImpact = useMemo(() => {
    return items.reduce((sum, item) => sum + item.adjustment * item.mrp, 0)
  }, [items])

  // Backend is authoritative on approval — it returns its own `threshold` and
  // decides whether to queue the adjustment. This constant exists so the UI can
  // preview the "Approval Required" state before the request fires.
  const requiresApproval = Math.abs(totalValueImpact) > APPROVAL_THRESHOLD_INR

  const [isSubmitting, setIsSubmitting] = useState(false)

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
        })),
      })

      if (res.data.approvalRequested) {
        toast.info(
          `Approval request sent to admin (₹${(res.data.totalValue ?? 0).toLocaleString('en-IN')} > threshold ₹${(res.data.threshold ?? 0).toLocaleString('en-IN')}). Stock unchanged until approved.`,
          { duration: 5500 },
        )
        // Don't apply local changes — they'll happen at approval time.
        setReferenceNumber(`PENDING/${res.data.approvalRequestId ?? ''}`)
        setIsSubmitted(true)
        return
      }

      // Update local store only after API confirms
      items.forEach((item) => {
        updateBatchLocally(item.batchId, item.adjustment)
      })

      const refNo = res.data.adjustmentNo
        ?? generateInvoiceNumber('ADJ', Math.floor(Math.random() * 1000) + 1)
      setReferenceNumber(refNo)
      setIsSubmitted(true)
      toast.success('Stock adjustment saved successfully')
    } catch (error) {
      console.error(error)
      toast.error('Failed to process stock adjustments')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setIsSubmitted(false)
    setItems([])
    setSearch('')
    setReferenceNumber('')
  }

  // Live KPI computations (in addition to existing totalValueImpact / requiresApproval)
  const netQtyChange = useMemo(
    () => items.reduce((sum, item) => sum + item.adjustment, 0),
    [items],
  )

  // ── Derived values for KPI cards ──
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
  const valueSubtitle =
    totalValueImpact > 0 ? 'increase'
      : totalValueImpact < 0 ? 'decrease'
      : 'no change'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {isSubmitted ? (
        /* ── Success screen ── */
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 dark:bg-emerald-500/10">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="mb-2 text-2xl font-bold">Adjustment Saved Successfully</h2>
          <p className="mb-4 text-muted-foreground">Your stock adjustment has been recorded.</p>
          <div className="mb-8 rounded-xl border border-border/60 bg-muted/50 dark:bg-muted/30 px-6 py-4 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reference Number
            </p>
            <p className="mt-1 font-mono text-lg font-bold">{referenceNumber}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleReset}>New Adjustment</Button>
            <Button onClick={() => navigate('/reports')}>View History</Button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Summary KPI Cards ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card hover className="border-l-[3px] border-l-blue-500">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items Added</p>
                  <p className="text-lg font-bold font-mono leading-tight">{items.length}</p>
                  <p className="text-[11px] text-muted-foreground">in this adjustment</p>
                </div>
              </CardContent>
            </Card>
            <Card hover className="border-l-[3px] border-l-sky-500">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Qty Change</p>
                  <p className={cn('text-lg font-bold font-mono leading-tight', qtyColor)}>
                    {netQtyChange > 0 ? `+${netQtyChange}` : netQtyChange}
                  </p>
                  <p className="text-[11px] text-muted-foreground">units total</p>
                </div>
              </CardContent>
            </Card>
            <Card hover className="border-l-[3px] border-l-emerald-500">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <IndianRupee className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Value Impact</p>
                  <p className={cn('text-lg font-bold font-mono leading-tight', valueColor)}>
                    {valueLabel}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{valueSubtitle}</p>
                </div>
              </CardContent>
            </Card>
            <Card
              hover
              className={cn(
                'border-l-[3px]',
                requiresApproval ? 'border-l-amber-500' : 'border-l-emerald-500',
              )}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    requiresApproval
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {requiresApproval ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Approval Required</p>
                  <p className="text-lg font-bold font-mono leading-tight">
                    {requiresApproval ? 'Yes' : 'No'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {requiresApproval
                      ? `exceeds ${formatCurrency(APPROVAL_THRESHOLD_INR)}`
                      : `under ${formatCurrency(APPROVAL_THRESHOLD_INR)} threshold`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Product search ── */}
          <DataTableFilterBar
            searchQuery={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search products by name or generic name..."
            resultsCount={availableTotal}
          />

          {/* ── Split picker: Available Batches (left) | Items in Adjustment (right) ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          {/* ── Available batches: server-paginated, debounced search, refreshes on page change ── */}
          {(() => {
            const totalBatchesPages = Math.max(1, Math.ceil(availableTotal / BATCHES_PAGE_SIZE))
            // `searchResults` is already the current server-side page minus
            // already-added items; no client slicing needed.
            const pagedBatches = searchResults
            return (
              <Card className="flex flex-col lg:h-[calc(100vh-22rem)] lg:max-h-160">
                <div className="shrink-0 flex items-center justify-between border-b border-border/40 px-4 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Available Batches
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {availableTotal} batch{availableTotal === 1 ? '' : 'es'}
                  </span>
                </div>

                {/* Compact card list — scrolls internally; pagination stays pinned below */}
                <div className="flex-1 overflow-y-auto">
                  {pagedBatches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                        <Package className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {search.trim() ? 'No batches match your search' : 'No batches available to adjust'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {pagedBatches.map(({ product, batch }) => (
                        <button
                          key={batch.id}
                          onClick={() => addItem(product, batch)}
                          className="flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="truncate text-sm font-medium">{product.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{product.genericName}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {batch.batchNumber} · Qty {batch.quantity} · MRP {formatCurrency(Number(batch.mrp))}
                            </p>
                          </div>
                          <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <DataTablePagination
                  currentPage={batchesPage}
                  totalPages={totalBatchesPages}
                  onPageChange={setBatchesPage}
                  totalItems={availableTotal}
                  itemsPerPage={BATCHES_PAGE_SIZE}
                  className="shrink-0 border-t border-border/40 px-4"
                />
              </Card>
            )
          })()}

          {/* ── Items in this adjustment — only shown once at least one batch is added ── */}
          {items.length > 0 && (
            <Card className="flex flex-col lg:h-[calc(100vh-22rem)] lg:max-h-160">
              <div className="shrink-0 flex items-center justify-between border-b border-border/40 px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Items in this Adjustment
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {items.length} item{items.length === 1 ? '' : 's'}
                </span>
              </div>
              {/* Compact card list with inline editor — scrolls internally */}
              <div className="flex-1 overflow-y-auto divide-y divide-border/40">
                <AnimatePresence mode="popLayout">
                  {items.map((item, idx) => {
                    const impact = item.adjustment * item.mrp
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15, delay: idx * 0.02 }}
                        className="flex flex-col gap-3 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.productName}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{item.batchNumber}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] text-muted-foreground">
                            System: <span className="font-mono text-foreground">{item.systemQty}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateAdjustment(item.id, String(item.adjustment - 1))}
                              disabled={item.newQty === 0}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition hover:bg-red-50 hover:border-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-muted disabled:hover:border-border disabled:hover:text-muted-foreground"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={item.rawAdjustment}
                              onChange={(e) => {
                                const val = e.target.value
                                // Write-off only — allow empty, "0", "-", or "-N…"; reject positive inputs.
                                if (/^(0|-\d*)?$/.test(val)) updateAdjustment(item.id, val)
                              }}
                              className={cn(
                                'h-8 w-16 text-center font-mono',
                                item.adjustment < 0 && 'border-red-500 text-red-600 dark:text-red-400',
                              )}
                            />
                            <button
                              type="button"
                              onClick={() => updateAdjustment(item.id, String(item.adjustment + 1))}
                              disabled={item.adjustment >= 0}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-muted disabled:hover:border-border disabled:hover:text-muted-foreground"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className={cn(
                            'text-[11px] text-muted-foreground',
                            item.newQty < 0 && 'text-rose-600 dark:text-rose-400',
                          )}>
                            New: <span className="font-mono font-semibold text-foreground">{item.newQty}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Select
                            value={item.reason}
                            onValueChange={(v) => updateReason(item.id, v as AdjustmentReason)}
                          >
                            <SelectTrigger className="h-8 w-full max-w-44 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {adjustmentReasons.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span
                            className={cn(
                              'shrink-0 font-mono text-sm font-semibold',
                              impact > 0 && 'text-emerald-600 dark:text-emerald-400',
                              impact < 0 && 'text-rose-600 dark:text-rose-400',
                            )}
                          >
                            {impact > 0 ? `+${formatCurrency(impact)}` : formatCurrency(impact)}
                          </span>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </Card>
          )}

          {/* Empty placeholder so the right column stays aligned in split layout */}
          {items.length === 0 && (
            <Card className="hidden lg:flex flex-col items-center justify-center gap-3 py-16 text-center lg:h-[calc(100vh-22rem)] lg:max-h-160">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                <ClipboardList className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No items yet</p>
              <p className="text-[11px] text-muted-foreground/60">
                Pick a batch from the left to start an adjustment
              </p>
            </Card>
          )}
          </div>

          {/* ── Submit footer ── */}
          {items.length > 0 && (
            <div className="space-y-3">
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
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
