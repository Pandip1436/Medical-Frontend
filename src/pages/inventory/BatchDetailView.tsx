import { useEffect, useState } from 'react'
import { differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import {
  FileX2, Clock, AlertOctagon, Package, IndianRupee,
  Truck, Trash2, Undo2, History,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { navigate } from '@/lib/router'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import api from '@/lib/api'

// Shared batch-detail renderer used both by the full BatchDetailPage route
// and by the Stock Overview side panel. Owns its own data fetch + confirm
// dialog so the host (page or sheet) only has to provide chrome.

type ConfirmKind = 'writeoff' | 'dispose' | null

interface BatchDetailViewProps {
  /** When this changes (or becomes truthy), the view re-fetches. Null clears state. */
  batchId: string | null
  /** Called after a write-off / dispose succeeds. Page: navigate back. Sheet: close panel + refresh. */
  onAfterAction?: () => void
}

export function BatchDetailView({ batchId, onAfterAction }: BatchDetailViewProps) {
  const updateBatchLocally = useMasterDataStore((s) => s.updateBatchLocally)

  const [batch, setBatch] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!batchId) { setBatch(null); setIsLoading(false); return }
    let cancelled = false
    setIsLoading(true)
    setBatch(null)
    api.get(`/batches/${batchId}`)
      .then((res) => { if (!cancelled) setBatch(res.data) })
      .catch(() => { if (!cancelled) setBatch(null) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [batchId])

  const product = batch
    ? { id: batch.productId, name: batch.productName, genericName: batch.genericName, manufacturer: batch.manufacturer, packSize: batch.packSize, totalStock: batch.productTotalStock, minStock: batch.minStock }
    : null
  const supplier = batch ? { id: batch.supplierId, name: batch.supplierName } : null

  const daysToExpiry = batch ? differenceInDays(new Date(batch.expiryDate), new Date()) : 0
  const stockValue = batch ? batch.quantity * Number(batch.mrp) : 0
  const isExpired = daysToExpiry < 0
  const isCritical = daysToExpiry < 30 && daysToExpiry >= 0
  const handleAction = async (kind: 'writeoff' | 'dispose') => {
    if (!batch) return
    setSubmitting(true)
    try {
      const res = await api.patch<{
        approvalRequested?: boolean
        approvalRequestId?: string
        totalValue?: number
        threshold?: number
      }>(`/products/${batch.productId}/batches/${batch.id}/adjust`, {
        adjustedQty: 0,
        reason: kind === 'writeoff' ? 'Expired Removal' : 'Damaged',
        notes: kind === 'writeoff'
          ? `Written off — expired batch ${batch.batchNumber}`
          : `Disposed — batch ${batch.batchNumber}`,
      })
      if (res.data?.approvalRequested) {
        toast.info(
          `Approval request sent to admin (₹${(res.data.totalValue ?? 0).toLocaleString('en-IN')} > threshold ₹${(res.data.threshold ?? 0).toLocaleString('en-IN')}). Stock unchanged until approved.`,
          { duration: 5500 },
        )
      } else {
        updateBatchLocally(batch.id, -batch.quantity)
        toast.success(
          kind === 'writeoff'
            ? `Batch ${batch.batchNumber} written off`
            : `Batch ${batch.batchNumber} marked disposed`,
        )
      }
      setConfirmKind(null)
      onAfterAction?.()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateReturn = () => {
    if (!batch) return
    navigate(
      `/purchase/returns?productId=${batch.productId}&batchId=${batch.id}&batchNumber=${encodeURIComponent(batch.batchNumber)}`,
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground">Loading batch…</p>
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
          <FileX2 className="h-5 w-5 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-medium">Batch not found</p>
          <p className="mt-1 text-xs text-muted-foreground">It may have been written off, returned, or fully sold.</p>
        </div>
      </div>
    )
  }

  const stockHealth = product
    ? product.totalStock === 0 ? 'out'
      : product.totalStock < product.minStock ? 'low'
      : 'healthy'
    : 'healthy'

  return (
    <div className="flex h-full flex-col">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 border-b border-border/40 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              isExpired ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                        : isCritical ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            )}>
              {isExpired ? <AlertOctagon className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Batch · {batch.batchNumber}
              </p>
              <p className="truncate text-base font-semibold leading-snug">
                {product?.name ?? batch.productName ?? 'Unknown product'}
              </p>
            </div>
          </div>
          <Badge variant={isExpired ? 'destructive' : isCritical ? 'warning' : 'success'} dot size="sm">
            {isExpired
              ? `Expired ${Math.abs(daysToExpiry)} days ago`
              : `Expires in ${daysToExpiry} days`}
          </Badge>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      {/* The "Expired / Critical" status is already conveyed by the header
          badge and the Expiry pill below, so no banner here — it just pushed
          the action footer off-screen in the side panel. */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Stock + value — compact 2-up tiles */}
        <SectionLabel>Stock &amp; Value</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <BigTile
            icon={Package}
            label="Quantity"
            value={`${batch.quantity}`}
            unit="units"
            sub={product ? `of ${product.totalStock} total in stock` : undefined}
            accent="blue"
          />
          <BigTile
            icon={IndianRupee}
            label="Stock Value"
            value={formatCurrency(stockValue)}
            sub={`@ ${formatCurrency(Number(batch.mrp))} MRP`}
            accent={isExpired ? 'red' : 'emerald'}
          />
        </div>

        {/* Expiry — single pill with the formatted date + countdown */}
        <SectionLabel>Expiry</SectionLabel>
        <div className={cn(
          'flex items-center justify-between gap-3 rounded-xl border px-3 py-2',
          isExpired
            ? 'border-red-300/60 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20'
            : isCritical
              ? 'border-orange-300/60 bg-orange-50/40 dark:border-orange-900/60 dark:bg-orange-950/20'
              : 'border-border/40 bg-muted/20',
        )}>
          <div className="flex items-center gap-2.5">
            <Clock className={cn(
              'h-4 w-4',
              isExpired ? 'text-red-600 dark:text-red-400'
                        : isCritical ? 'text-orange-600 dark:text-orange-400'
                        : 'text-muted-foreground/70',
            )} />
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              (isExpired || isCritical) && 'text-foreground',
            )}>
              {formatDate(batch.expiryDate)}
            </span>
          </div>
          <span className={cn(
            'text-xs font-medium',
            isExpired ? 'text-red-600 dark:text-red-400'
                      : isCritical ? 'text-orange-600 dark:text-orange-400'
                      : 'text-muted-foreground',
          )}>
            {isExpired ? `${Math.abs(daysToExpiry)} days overdue` : `in ${daysToExpiry} days`}
          </span>
        </div>

        {/* Product + supplier — one combined info card */}
        {(product || supplier) && (
          <>
            <SectionLabel>Product &amp; Supplier</SectionLabel>
            <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
              <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                <InfoRow label="Generic" value={product?.genericName ?? '—'} />
                <InfoRow label="Manufacturer" value={product?.manufacturer ?? '—'} />
                <InfoRow label="Pack" value={product?.packSize ?? '—'} />
                <InfoRow
                  label="Supplier"
                  value={supplier?.name ?? '—'}
                  icon={Truck}
                />
                <div className="sm:col-span-2 mt-1 border-t border-border/40 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Product stock health
                    </span>
                    <Badge
                      variant={stockHealth === 'out' ? 'destructive' : stockHealth === 'low' ? 'warning' : 'success'}
                      size="sm"
                      dot
                    >
                      {stockHealth === 'out' ? 'Out of stock' : stockHealth === 'low' ? 'Low stock' : 'Healthy'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs">
                    <span className="font-semibold tabular-nums">{product?.totalStock ?? 0}</span>
                    <span className="text-muted-foreground"> total units · min level </span>
                    <span className="font-semibold tabular-nums">{product?.minStock ?? 0}</span>
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Sticky Footer (actions) ── */}
      <div className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {product && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => navigate(`/inventory/product-history?productId=${product.id}`)}
            >
              <History className="h-3.5 w-3.5" /> Product history
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmKind('dispose')}>
              <Trash2 className="h-3.5 w-3.5" /> Mark Disposed
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmKind('writeoff')}>
              <Trash2 className="h-3.5 w-3.5" /> Write Off
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleCreateReturn}>
              <Undo2 className="h-3.5 w-3.5" /> Create Return
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      <Dialog open={!!confirmKind} onOpenChange={(open) => { if (!open) setConfirmKind(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmKind === 'writeoff' ? 'Write off batch?' : 'Mark batch as disposed?'}
            </DialogTitle>
            <DialogDescription>
              {confirmKind === 'writeoff'
                ? 'Removes expired stock from sellable inventory and records the value as a financial loss. Use for stock that’s past expiry but where no physical disposal is being recorded yet.'
                : 'Records that this batch was physically destroyed, contaminated, or damaged. Use when documenting actual disposal (incineration, hazardous waste, controlled-substance destruction).'}
            </DialogDescription>
          </DialogHeader>
          {batch && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm space-y-1.5">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Batch</span>
                <span className="font-mono">{batch.batchNumber}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Quantity</span>
                <span className="font-mono">{batch.quantity} units &rarr; 0</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Stock value</span>
                <span className="font-mono">{formatCurrency(stockValue)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Recorded reason</span>
                <span className="font-medium">{confirmKind === 'writeoff' ? 'Expired Removal' : 'Damaged'}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmKind(null)} disabled={submitting}>Cancel</Button>
            <Button
              variant={confirmKind === 'writeoff' ? 'destructive' : 'default'}
              onClick={() => confirmKind && handleAction(confirmKind)}
              disabled={submitting}
            >
              {submitting ? 'Working…' : confirmKind === 'writeoff' ? 'Write Off' : 'Mark Disposed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Local presentational helpers ──────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  )
}

function BigTile({
  icon: Icon, label, value, unit, sub, accent,
}: {
  icon: typeof Package
  label: string
  value: string
  unit?: string
  sub?: string
  accent: 'blue' | 'emerald' | 'red'
}) {
  const accentClass = {
    blue: 'bg-blue-50/60 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400',
    emerald: 'bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
    red: 'bg-red-50/60 dark:bg-red-950/20 text-red-700 dark:text-red-400',
  }[accent]
  return (
    <div className="rounded-xl border border-border/40 bg-card p-3">
      <div className="flex items-center gap-2">
        <div className={cn('flex h-6 w-6 items-center justify-center rounded-md', accentClass)}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold font-mono leading-none tabular-nums">{value}</span>
        {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
      </div>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function InfoRow({
  label, value, icon: Icon,
}: {
  label: string
  value: string
  icon?: typeof Truck
}) {
  return (
    <div className="flex items-baseline gap-2">
      {Icon && <Icon className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{label}:</span>
      <span className="truncate text-sm">{value}</span>
    </div>
  )
}
