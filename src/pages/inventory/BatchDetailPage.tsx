import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowLeft, FileX2, Clock, AlertOctagon, Package, IndianRupee,
  Truck, CalendarDays, Trash2, Undo2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { navigate, useRoute } from '@/lib/router'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import api from '@/lib/api'

// Batch Detail — destination for Expiry notifications.
// Surfaces batch identity, age, stock value, supplier, and the batch-level
// actions (return / write-off / dispose) that the user actually needs from
// an expiry alert.

type ConfirmKind = 'writeoff' | 'dispose' | null

export default function BatchDetailPage() {
  const { search } = useRoute()
  // Accept either `?id=` (new) or `?batchId=` (legacy).
  const params = new URLSearchParams(search)
  const id = params.get('id') ?? params.get('batchId')

  const batches = useMasterDataStore((s) => s.batches)
  const products = useMasterDataStore((s) => s.products)
  const suppliers = useMasterDataStore((s) => s.suppliers)
  const fetchProducts = useMasterDataStore((s) => s.fetchProducts)
  const fetchSuppliers = useMasterDataStore((s) => s.fetchSuppliers)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProducts(); fetchSuppliers() }, [])
  useBranchRefresh(fetchProducts)

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [submitting, setSubmitting] = useState(false)

  // Find batch in the master data store. If the store hasn't fetched yet,
  // the page shows a loading state until it populates.
  const batch = useMemo(() => batches.find((b) => b.id === id), [batches, id])
  const product = useMemo(() => batch ? products.find((p) => p.id === batch.productId) : null, [batch, products])
  const supplier = useMemo(() => batch ? suppliers.find((s) => s.id === batch.supplierId) : null, [batch, suppliers])

  const isLoading = batches.length === 0
  const daysToExpiry = batch ? differenceInDays(new Date(batch.expiryDate), new Date()) : 0
  const stockValue = batch ? batch.quantity * Number(batch.mrp) : 0
  const isExpired = daysToExpiry < 0
  const isCritical = daysToExpiry < 30

  const handleAction = async (kind: 'writeoff' | 'dispose') => {
    if (!batch) return
    setSubmitting(true)
    try {
      await api.patch(`/products/${batch.productId}/batches/${batch.id}/adjust`, {
        adjustedQty: 0,
        reason: kind === 'writeoff' ? 'Expired Removal' : 'Damaged',
        notes: kind === 'writeoff'
          ? `Written off — expired batch ${batch.batchNumber}`
          : `Disposed — batch ${batch.batchNumber}`,
      })
      toast.success(
        kind === 'writeoff'
          ? `Batch ${batch.batchNumber} written off`
          : `Batch ${batch.batchNumber} marked disposed`,
      )
      setConfirmKind(null)
      await fetchProducts()
      navigate('/inventory/expiry')
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

  const goBack = () => navigate('/inventory/expiry')

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back to expiry management
      </Button>

      <Card>
        {isLoading ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading batch…</p>
          </CardContent>
        ) : !batch ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">Batch not found</p>
              <p className="mt-1 text-xs text-muted-foreground">It may have been written off, returned, or fully sold.</p>
            </div>
            <Button size="sm" variant="outline" onClick={goBack}>Back to expiry management</Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    isExpired ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : isCritical ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  )}>
                    {isExpired ? <AlertOctagon className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">Batch {batch.batchNumber}</p>
                    <p className="text-base font-semibold leading-snug">
                      {product?.name ?? batch.productName ?? 'Unknown product'}
                    </p>
                  </div>
                </div>
                <Badge variant={isExpired ? 'destructive' : isCritical ? 'warning' : 'secondary'} size="sm">
                  {isExpired ? `Expired ${Math.abs(daysToExpiry)} days ago` : `Expires in ${daysToExpiry} days`}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile icon={Package} label="Quantity" value={`${batch.quantity} units`} />
                <StatTile icon={IndianRupee} label="MRP" value={formatCurrency(Number(batch.mrp))} />
                <StatTile icon={IndianRupee} label="Stock Value" value={formatCurrency(stockValue)} highlight />
                <StatTile icon={Truck} label="Supplier" value={supplier?.name ?? 'Unknown'} />
              </div>

              {/* Date strip */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/40 bg-muted/20 p-4">
                <DatePair icon={CalendarDays} label="Manufacture Date" value={formatDate(batch.mfgDate)} />
                <DatePair
                  icon={Clock}
                  label="Expiry Date"
                  value={formatDate(batch.expiryDate)}
                  emphasize={isExpired || isCritical}
                />
              </div>

              {/* Product details */}
              {product && (
                <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Product Details</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Generic:</span> {product.genericName}</div>
                    <div><span className="text-muted-foreground">Manufacturer:</span> {product.manufacturer}</div>
                    <div><span className="text-muted-foreground">Pack:</span> {product.packSize}</div>
                    <div><span className="text-muted-foreground">Stock now:</span> {product.totalStock} / {product.minStock} min</div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
                <Button size="sm" className="gap-1.5" onClick={handleCreateReturn}>
                  <Undo2 className="h-3.5 w-3.5" /> Create Return
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmKind('writeoff')}>
                  <Trash2 className="h-3.5 w-3.5" /> Write Off
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmKind('dispose')}>
                  <Trash2 className="h-3.5 w-3.5" /> Mark Disposed
                </Button>
                {product && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto gap-1.5"
                    onClick={() => navigate(`/inventory/product-history?productId=${product.id}`)}
                  >
                    View product history
                  </Button>
                )}
              </div>
            </CardContent>
          </>
        )}
      </Card>

      {/* Confirm dialog */}
      <Dialog open={!!confirmKind} onOpenChange={(open) => { if (!open) setConfirmKind(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmKind === 'writeoff' ? 'Write off batch?' : 'Mark batch as disposed?'}
            </DialogTitle>
            <DialogDescription>
              Batch <span className="font-mono">{batch?.batchNumber}</span> ({batch?.quantity} units, {formatCurrency(stockValue)}) will be set to zero. This can't be undone from here.
            </DialogDescription>
          </DialogHeader>
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
    </motion.div>
  )
}

function StatTile({
  icon: Icon, label, value, highlight,
}: {
  icon: typeof Package
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'rounded-xl border border-border/40 p-3',
      highlight ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-muted/20',
    )}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className={cn(
        'mt-1 text-sm font-semibold tabular-nums',
        highlight && 'text-emerald-700 dark:text-emerald-400',
      )}>
        {value}
      </p>
    </div>
  )
}

function DatePair({
  icon: Icon, label, value, emphasize,
}: {
  icon: typeof CalendarDays
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/60', emphasize && 'text-red-500')} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className={cn('text-sm font-medium tabular-nums', emphasize && 'text-red-600 dark:text-red-400')}>{value}</p>
      </div>
    </div>
  )
}
