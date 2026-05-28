import { useEffect, useMemo, useState } from 'react'
import { FileWarning, Loader2, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'

// ─── Types ────────────────────────────────────────────────────
export interface ShortBillingItem {
  productId: string
  productName: string
  shortQty: number          // missing qty (orderedQty - receivedQty)
  purchaseRate: number
  gstPercent: number
  batchNumber: string       // batch from the GRN's partial receipt
  expiryDate: string
}

export interface ShortBillingGrnRef {
  id: string
  grnNumber: string
  supplierId: string
  supplierName: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  grn: ShortBillingGrnRef
  shortItems: ShortBillingItem[]
  onSuccess?: (debitNoteNo: string) => void
}

type Settlement = 'ADJUST' | 'REFUND'

// ─── Component ────────────────────────────────────────────────
export function ShortBillingDialog({ open, onOpenChange, grn, shortItems, onSuccess }: Props) {
  const { batches, fetchMasterData } = useMasterDataStore()
  const [settlement, setSettlement] = useState<Settlement>('ADJUST')
  const [submitting, setSubmitting] = useState(false)
  const [outstanding, setOutstanding] = useState<number | null>(null) // null = loading

  // Fetch supplier outstanding + refresh master data when the dialog opens.
  // The master-data refresh is critical: the batch we need to link to was
  // just created by the GRN, and the cached store may not have it yet.
  useEffect(() => {
    if (!open || !grn.supplierId) {
      setOutstanding(null)
      return
    }
    let cancelled = false
    setOutstanding(null)
    fetchMasterData().catch(() => {})
    api
      .get<{ currentOutstanding?: number | string }>(`/suppliers/${grn.supplierId}`)
      .then((res) => {
        if (!cancelled) setOutstanding(Number(res.data?.currentOutstanding ?? 0))
      })
      .catch(() => {
        if (!cancelled) setOutstanding(0)
      })
    return () => {
      cancelled = true
    }
  }, [open, grn.supplierId, fetchMasterData])

  const totals = useMemo(() => {
    let subtotal = 0
    let gst = 0
    for (const it of shortItems) {
      const lineTaxable = it.shortQty * it.purchaseRate
      subtotal += lineTaxable
      gst += lineTaxable * (it.gstPercent / 100)
    }
    return { subtotal, gst, total: subtotal + gst }
  }, [shortItems])

  // Adjust requires the supplier to actually owe us money (or rather, we owe
  // them — which is what currentOutstanding tracks). If there's nothing to
  // adjust against, force Refund and disable the Adjust option.
  const adjustDisabled = outstanding !== null && outstanding < totals.total
  const adjustReason =
    outstanding === null
      ? null
      : outstanding === 0
        ? 'Supplier has zero outstanding — nothing to adjust against. Use Refund.'
        : outstanding < totals.total
          ? `Outstanding (${formatCurrency(outstanding)}) is less than this debit note total. Use Refund or pay the difference first.`
          : null

  // Auto-fall back to Refund the moment Adjust becomes unavailable
  useEffect(() => {
    if (adjustDisabled && settlement === 'ADJUST') {
      setSettlement('REFUND')
    }
  }, [adjustDisabled, settlement])

  async function handleSubmit() {
    if (shortItems.length === 0) return
    // Resolve the batch each short item attaches to. The GRN's partial-receipt
    // batch is the right anchor — even though the missing qty was never in
    // that batch, this debit note conceptually belongs to that delivery row.
    const payloadItems: Array<{
      productId: string
      productName: string
      batchId: string
      batchNumber: string
      expiryDate: string
      returnedQty: number
      purchaseRate: number
      gstPercent: number
      amount: number
    }> = []

    for (const it of shortItems) {
      const batch = batches.find(
        (b) => b.productId === it.productId && b.batchNumber === it.batchNumber,
      )
      if (!batch) {
        toast.error(
          `Batch ${it.batchNumber} for ${it.productName} not found in master data. Refresh and retry.`,
          { duration: 6000 },
        )
        return
      }
      const lineAmount = it.shortQty * it.purchaseRate
      const gstAmount = lineAmount * (it.gstPercent / 100)
      payloadItems.push({
        productId: it.productId,
        productName: it.productName,
        batchId: batch.id,
        batchNumber: it.batchNumber,
        expiryDate: new Date(it.expiryDate).toISOString(),
        returnedQty: it.shortQty,
        purchaseRate: it.purchaseRate,
        gstPercent: it.gstPercent,
        amount: Number((lineAmount + gstAmount).toFixed(2)),
      })
    }

    setSubmitting(true)
    try {
      const res = await api.post('/purchase-returns', {
        supplierId: grn.supplierId,
        supplierName: grn.supplierName,
        grnId: grn.id,
        reason: 'Short delivery',
        items: payloadItems,
        subtotal: Number(totals.subtotal.toFixed(2)),
        cgst: Number((totals.gst / 2).toFixed(2)),
        sgst: Number((totals.gst / 2).toFixed(2)),
        totalAmount: Number(totals.total.toFixed(2)),
        status: 'SENT',
        settlementMode: settlement,
      })
      const debitNoteNo = res.data?.debitNoteNo ?? '(pending)'
      if (res.data?.approvalRequested) {
        toast.success('Approval request sent to admin. The debit note will be created once approved.', { duration: 6000 })
      } else {
        toast.success(`Short-Billing Debit Note ${debitNoteNo} created.`, {
          description:
            settlement === 'ADJUST'
              ? `${formatCurrency(totals.total)} adjusted against supplier outstanding.`
              : `Supplier will refund ${formatCurrency(totals.total)} separately.`,
        })
      }
      onSuccess?.(debitNoteNo)
      onOpenChange(false)
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'Failed to create short-billing debit note'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-130">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileWarning className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Raise Short-Billing Debit Note</DialogTitle>
              <DialogDescription className="text-xs">
                Supplier billed for goods that were never delivered. This is a financial claim,
                not a return — stock is unaffected.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Reference */}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Against PR</span>
              <span className="font-mono font-semibold">{grn.grnNumber}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-muted-foreground">Supplier</span>
              <span className="font-medium">{grn.supplierName}</span>
            </div>
          </div>

          {/* Short items list */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Goods never received
            </p>
            <div className="rounded-lg border border-amber-200/70 dark:border-amber-900/30 divide-y divide-amber-200/50 dark:divide-amber-900/20">
              {shortItems.map((it) => (
                <div key={it.productId} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{it.productName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">batch {it.batchNumber}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="warning" size="sm" className="font-mono">
                      {it.shortQty} short
                    </Badge>
                    <span className="font-mono text-muted-foreground">
                      @ {formatCurrency(it.purchaseRate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals + supplier outstanding */}
          <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST</span>
              <span className="font-mono">{formatCurrency(totals.gst)}</span>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1.5">
              <span className="font-bold">Debit Note Total</span>
              <span className="font-mono font-bold text-primary">{formatCurrency(totals.total)}</span>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1.5">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-3 w-3" />
                Supplier outstanding (we owe them)
              </span>
              <span className="font-mono">
                {outstanding === null ? (
                  <span className="text-muted-foreground/60 italic">loading…</span>
                ) : (
                  formatCurrency(outstanding)
                )}
              </span>
            </div>
            {outstanding !== null && settlement === 'ADJUST' && !adjustDisabled && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>After adjustment</span>
                <span className="font-mono">{formatCurrency(outstanding - totals.total)}</span>
              </div>
            )}
          </div>

          {/* What happens on confirm */}
          <div className="rounded-lg border border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900/40 px-3 py-2 text-[11px] space-y-0.5">
            <p className="font-semibold text-blue-700 dark:text-blue-300">On confirm, the system will:</p>
            <ul className="text-blue-700/90 dark:text-blue-300/90 list-disc list-inside space-y-0.5">
              <li>Create a debit note for {formatCurrency(totals.total)}</li>
              {settlement === 'ADJUST' ? (
                <>
                  <li>Reduce supplier outstanding by {formatCurrency(totals.total)}</li>
                  <li>Mark the debit note as <span className="font-semibold">Settled</span> automatically</li>
                </>
              ) : (
                <>
                  <li>Leave outstanding unchanged — supplier owes a separate refund</li>
                  <li>Mark the debit note as <span className="font-semibold">Sent</span> until the refund is received</li>
                </>
              )}
            </ul>
          </div>

          {/* Settlement */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Settlement
            </p>
            <RadioGroup value={settlement} onValueChange={(v) => setSettlement(v as Settlement)} className="space-y-1.5">
              <Label
                htmlFor="settle-adjust"
                className={
                  'flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2 ' +
                  (adjustDisabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer hover:bg-accent/30 has-checked:border-primary has-checked:bg-primary/5')
                }
              >
                <RadioGroupItem id="settle-adjust" value="ADJUST" className="mt-0.5" disabled={adjustDisabled} />
                <div className="text-xs">
                  <p className="font-semibold">
                    Adjust against outstanding{!adjustDisabled && ' (recommended)'}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {adjustReason ?? `Reduces what we owe the supplier by ${formatCurrency(totals.total)}. Marks the debit note settled immediately.`}
                  </p>
                </div>
              </Label>
              <Label
                htmlFor="settle-refund"
                className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2 cursor-pointer hover:bg-accent/30 has-checked:border-primary has-checked:bg-primary/5"
              >
                <RadioGroupItem id="settle-refund" value="REFUND" className="mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold">
                    Refund{adjustDisabled && ' (only option available)'}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    Supplier will refund {formatCurrency(totals.total)} separately (cheque, bank
                    transfer). Outstanding stays the same until the refund lands.
                  </p>
                </div>
              </Label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create debit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
