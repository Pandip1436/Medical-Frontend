import { useEffect, useState } from 'react'
import { differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import {
  FileX2, Clock, AlertOctagon, Package,
  Truck, Trash2, Undo2, History, Calendar, Factory,
  Phone, MapPin, ChevronRight, Wallet, Tag, IndianRupee, TrendingDown, Receipt,
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

// Write-off is the single removal action for expired stock. (Disposal used to
// be a separate action with reason 'Damaged', but it was redundant — both
// just zero out the batch — so the UI now exposes Write Off only.)
type ConfirmKind = 'writeoff' | null

interface BatchDetailViewProps {
  /** When this changes (or becomes truthy), the view re-fetches. Null clears state. */
  batchId: string | null
  /** Called after a write-off / dispose succeeds. Page: navigate back. Sheet: close panel + refresh. */
  onAfterAction?: () => void
  /**
   * Layout density. `'panel'` (default) stacks sections in one column for the
   * narrow Stock Overview side sheet. `'page'` spreads them into a 2-column grid
   * so the full-page route uses the horizontal space and fits without scrolling.
   */
  layout?: 'panel' | 'page'
}

export function BatchDetailView({ batchId, onAfterAction, layout = 'panel' }: BatchDetailViewProps) {
  const isPage = layout === 'page'
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
  const supplier = batch
    ? { id: batch.supplierId, name: batch.supplierName, phone: batch.supplierPhone, address: batch.supplierAddress }
    : null

  const daysToExpiry = batch ? differenceInDays(new Date(batch.expiryDate), new Date()) : 0
  const stockValue = batch ? batch.quantity * Number(batch.mrp) : 0
  // What writing off this batch actually costs us — quantity at the cost
  // (purchase) rate, not MRP. This is the real loss for an expired batch.
  const lossAtCost = batch ? batch.quantity * Number(batch.purchaseRate) : 0
  const isExpired = daysToExpiry < 0
  const isCritical = daysToExpiry < 30 && daysToExpiry >= 0
  const handleWriteOff = async () => {
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
        reason: 'Expired Removal',
        notes: `Written off — expired batch ${batch.batchNumber}`,
      })
      if (res.data?.approvalRequested) {
        toast.info(
          `Approval request sent to admin (₹${(res.data.totalValue ?? 0).toLocaleString('en-IN')} > threshold ₹${(res.data.threshold ?? 0).toLocaleString('en-IN')}). Stock unchanged until approved.`,
          { duration: 5500 },
        )
      } else {
        updateBatchLocally(batch.id, -batch.quantity)
        toast.success(`Batch ${batch.batchNumber} written off`)
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

  return (
    <div className="flex h-full flex-col">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 border-b border-border/40 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              isExpired ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                        : isCritical ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            )}>
              {isExpired ? <AlertOctagon className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold leading-snug">
                {product?.name ?? batch.productName ?? 'Unknown product'}
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-foreground/80">
                Batch {batch.batchNumber}
              </p>
            </div>
          </div>
          <Badge variant={isExpired ? 'destructive' : isCritical ? 'warning' : 'success'} dot>
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
      <div className={cn(
        'flex-1 overflow-y-auto px-6 py-4',
        // Page: the four lower cards sit in one row on wide screens (xl:4-up) so
        // the whole view is just 2 rows and fits without scrolling; medium
        // screens fall back to 2-up. Panel: single-column stack for the sheet.
        isPage ? 'grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-4 lg:content-start' : 'space-y-5',
      )}>
        {/* Expiry — the headline of an expiry view, so it's the hero block:
            large date + countdown, colour-coded by status. Spans full width. */}
        <div className={cn('space-y-2', isPage && 'lg:col-span-full')}>
          <SectionLabel>Expiry Date</SectionLabel>
          <div className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-6 py-3',
            isExpired
              ? 'border-red-300/60 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20'
              : isCritical
                ? 'border-orange-300/60 bg-orange-50/50 dark:border-orange-900/60 dark:bg-orange-950/20'
                : 'border-border/40 bg-muted/20',
          )}>
            <div className="flex items-center gap-3">
              <Clock className={cn(
                'h-6 w-6 shrink-0',
                isExpired ? 'text-red-600 dark:text-red-400'
                          : isCritical ? 'text-orange-600 dark:text-orange-400'
                          : 'text-muted-foreground/70',
              )} />
              <span className={cn(
                'text-2xl font-bold tabular-nums',
                isExpired ? 'text-red-700 dark:text-red-300'
                          : isCritical ? 'text-orange-700 dark:text-orange-300'
                          : 'text-foreground',
              )}>
                {formatDate(batch.expiryDate)}
              </span>
            </div>
            <span className={cn(
              'text-base font-semibold',
              isExpired ? 'text-red-600 dark:text-red-400'
                        : isCritical ? 'text-orange-600 dark:text-orange-400'
                        : 'text-muted-foreground',
            )}>
              {isExpired ? `${Math.abs(daysToExpiry)} days overdue` : `in ${daysToExpiry} days`}
            </span>
          </div>
        </div>

        {/* Quantity + pricing — how much is affected and what it's worth. The
            purchase rate (cost) and MRP are both surfaced so the value at risk on
            this expiring batch is clear. */}
        <div className="space-y-2">
          <SectionLabel>Quantity &amp; Value</SectionLabel>
          <BigTile
            icon={Package}
            label="Quantity"
            value={`${batch.quantity}`}
            unit="units"
            sub={product ? `of ${product.totalStock} total in stock` : undefined}
            accent="blue"
          >
            <div className="mt-2.5 grid grid-cols-1 gap-y-2.5 border-t border-border/40 pt-2.5">
              <InfoRow label="Purchase Rate" value={formatCurrency(Number(batch.purchaseRate))} icon={Wallet} />
              <InfoRow label="MRP" value={formatCurrency(Number(batch.mrp))} icon={Tag} />
              <InfoRow label="Stock Value" value={formatCurrency(stockValue)} icon={IndianRupee} />
              <InfoRow label="Loss on Write-off" value={formatCurrency(lossAtCost)} icon={TrendingDown} />
            </div>
          </BigTile>
        </div>

        {/* Purchase + manufacture dates. Purchase date comes from the
            originating GRN; fall back to the batch's createdAt for legacy/manual
            batches with no GRN link. */}
        <div className="space-y-2">
          <SectionLabel>Purchase</SectionLabel>
          <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
            <div className="grid grid-cols-1 gap-y-2.5">
              <InfoRow
                label="Purchased"
                value={formatDate(batch.grnDate ?? batch.createdAt)}
                icon={Calendar}
              />
              <InfoRow
                label="Manufactured"
                value={formatDate(batch.mfgDate)}
                icon={Factory}
              />
              {batch.grnNumber && (
                <InfoRow label="PE No" value={batch.grnNumber} icon={Truck} />
              )}
              {batch.supplierInvoiceNo && (
                <InfoRow label="Supplier Inv No" value={batch.supplierInvoiceNo} icon={Receipt} />
              )}
              {batch.supplierInvoiceDate && (
                <InfoRow label="Supplier Inv Date" value={formatDate(batch.supplierInvoiceDate)} icon={Calendar} />
              )}
            </div>
          </div>
        </div>

        {/* Product info card — half width on the page so it pairs with Supplier. */}
        {product && (
          <div className="space-y-2">
            <SectionLabel>Product</SectionLabel>
            <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
              <div className="grid grid-cols-1 gap-y-2.5">
                <InfoRow label="Generic" value={product?.genericName ?? '—'} />
                <InfoRow label="Manufacturer" value={product?.manufacturer ?? '—'} />
                <InfoRow label="Pack" value={product?.packSize ?? '—'} />
              </div>
            </div>
          </div>
        )}

        {/* Supplier card — name links to the supplier detail page, with phone +
            address surfaced for quick contact. Pairs beside Product on the page. */}
        {supplier?.name && (
          <div className="space-y-2">
            <SectionLabel>Supplier</SectionLabel>
            <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
              <button
                type="button"
                disabled={!supplier.id}
                onClick={() => supplier.id && navigate(`/purchase/suppliers/detail?supplierId=${supplier.id}`)}
                className={cn(
                  'group flex w-full items-center gap-2.5 text-left',
                  supplier.id && 'cursor-pointer',
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Truck className="h-5 w-5" />
                </span>
                <span
                  title={supplier.name}
                  className={cn(
                    'min-w-0 flex-1 line-clamp-2 text-lg font-bold leading-tight',
                    supplier.id && 'text-primary group-hover:underline',
                  )}
                >
                  {supplier.name}
                </span>
                {supplier.id && (
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
              <div className="grid grid-cols-1 gap-y-3">
                <InfoRow label="Phone" value={supplier.phone || '—'} icon={Phone} />
                <InfoRow label="Address" value={supplier.address || '—'} icon={MapPin} />
              </div>
            </div>
          </div>
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
              onClick={() => {
                // Detail is its own route now, so browser Back from product
                // history returns straight here — no reopen bookkeeping needed.
                navigate(`/inventory/product-history?productId=${product.id}`)
              }}
            >
              <History className="h-3.5 w-3.5" /> Product history
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
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
            <DialogTitle>Write off batch?</DialogTitle>
            <DialogDescription>
              Removes this expired stock from sellable inventory and records the value as a financial loss. This zeroes out the batch quantity.
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
                <span className="font-medium">Expired Removal</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmKind(null)} disabled={submitting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleWriteOff}
              disabled={submitting}
            >
              {submitting ? 'Working…' : 'Write Off'}
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
    <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  )
}

function BigTile({
  icon: Icon, label, value, unit, sub, accent, children,
}: {
  icon: typeof Package
  label: string
  value: string
  unit?: string
  sub?: string
  accent: 'blue' | 'emerald' | 'red'
  children?: React.ReactNode
}) {
  const accentClass = {
    blue: 'bg-blue-50/60 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400',
    emerald: 'bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
    red: 'bg-red-50/60 dark:bg-red-950/20 text-red-700 dark:text-red-400',
  }[accent]
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', accentClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono leading-none tabular-nums">{value}</span>
        {unit && <span className="text-base text-muted-foreground">{unit}</span>}
      </div>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
      {children}
    </div>
  )
}

// Stacked label-above-value so every value gets the FULL card width — long
// generics, manufacturer names, supplier addresses, etc. wrap onto a second
// line instead of truncating mid-word in a cramped inline row. Capped at 2
// lines + ellipsis so no single value can blow out the card height and break
// the fit-on-screen layout; the native title tooltip surfaces the full text on
// hover. This scales the same way no matter how narrow the column gets.
function InfoRow({
  label, value, icon: Icon,
}: {
  label: string
  value: string
  icon?: typeof Truck
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <p title={value} className="mt-0.5 line-clamp-2 wrap-break-word text-base font-semibold">
        {value}
      </p>
    </div>
  )
}
