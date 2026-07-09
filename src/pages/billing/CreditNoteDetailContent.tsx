import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Hourglass, Package, CircleSlash, ShieldCheck, Printer, ExternalLink,
  Wallet, BadgeCheck, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { printHtmlInPage } from '@/lib/printUtils'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { isAdminish } from '@/types'
import type { CreditNote, CreditNoteStatus } from './CreditNotesPage'

// Display configs (kept in sync with CreditNotesPage's list rendering).
const settlementConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'info'; icon: typeof Wallet }> = {
  REFUND:      { label: 'Refund',       variant: 'success', icon: Wallet },
  CREDIT:      { label: 'Adjust',       variant: 'warning', icon: BadgeCheck },
  REPLACEMENT: { label: 'Replacement',  variant: 'info',    icon: RefreshCw },
}

const statusConfig: Record<CreditNoteStatus, { label: string; variant: 'warning' | 'success' | 'destructive'; icon: typeof Hourglass }> = {
  PENDING_REVIEW: { label: 'Pending Review', variant: 'warning',     icon: Hourglass },
  APPROVED:       { label: 'Approved',       variant: 'success',     icon: CheckCircle2 },
  REJECTED:       { label: 'Rejected',       variant: 'destructive', icon: XCircle },
}

const SETTLEMENT_PICKER_OPTIONS: Array<{ value: 'REFUND' | 'CREDIT' | 'REPLACEMENT'; label: string; sublabel: string }> = [
  { value: 'REFUND', label: 'Refund to Customer', sublabel: 'Cash/card refund via original payment method' },
  { value: 'CREDIT', label: 'Adjust Against Outstanding', sublabel: 'Deduct credit amount from existing balance' },
  { value: 'REPLACEMENT', label: 'Replacement', sublabel: 'Replace with equivalent product(s)' },
]

// Printable credit-note HTML. Exported so the list page can offer a quick
// per-row Print without duplicating the template.
export function printCreditNote(cn: CreditNote, businessProfile?: { name?: string; address?: string } | null) {
  printHtmlInPage(`
    <html><head><title>Credit Note ${cn.creditNoteNo}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      .sub { color: #666; font-size: 11px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
      .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
      .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #f5f5f5; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 8px; border-bottom: 1px solid #eee; }
      .totals { margin-top: 16px; text-align: right; }
      .totals .row { display: flex; justify-content: flex-end; gap: 32px; margin-bottom: 4px; }
      .grand { font-size: 16px; font-weight: 700; color: #1a56db; }
      @media print { button { display: none; } }
    </style></head><body>
    <h1>CREDIT NOTE</h1>
    <div class="sub">${businessProfile?.name ?? 'Hospital Suppliers'}${businessProfile?.address ? ` · ${businessProfile.address.split(',').slice(-2).join(',').trim()}` : ''}</div>
    <div class="grid">
      <div><div class="label">Credit Note No</div><div class="value">${cn.creditNoteNo}</div></div>
      <div><div class="label">Date</div><div class="value">${formatDate(cn.date)}</div></div>
      <div><div class="label">Customer</div><div class="value">${cn.customerName}</div></div>
      <div><div class="label">Against Invoice</div><div class="value">${cn.invoiceNumber}</div></div>
      <div><div class="label">Settlement</div><div class="value">${settlementConfig[cn.settlementMode]?.label ?? cn.settlementMode}</div></div>
      <div><div class="label">Reason</div><div class="value">${cn.reason}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Product</th><th>Batch</th><th>Qty</th><th>Rate</th><th>GST%</th><th style="text-align:right">Amount</th>
      </tr></thead>
      <tbody>
        ${(cn.items ?? []).map(item => `<tr>
          <td>${item.productName}</td>
          <td>${item.batchNumber}</td>
          <td>${item.returnedQty}</td>
          <td>₹${Number(item.rate).toFixed(2)}</td>
          <td>${item.gstPercent}%</td>
          <td style="text-align:right">₹${Number(item.amount).toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>₹${Number(cn.subtotal).toFixed(2)}</span></div>
      <div class="row"><span>CGST</span><span>₹${Number(cn.cgst).toFixed(2)}</span></div>
      <div class="row"><span>SGST</span><span>₹${Number(cn.sgst).toFixed(2)}</span></div>
      <div class="row grand"><span>Total Credit</span><span>₹${Number(cn.totalAmount).toFixed(2)}</span></div>
    </div>
    </body></html>
  `)
}

// Shared credit-note detail body — used by the standalone detail page. Header
// (CN number, status) is rendered by the host; this component owns the
// meta-block, review panel, items, totals, and action buttons. Self-contained:
// holds its own review state + approve/reject/print handlers, and calls
// `onUpdated` with the fresh CN after a review action.
interface CreditNoteDetailContentProps {
  creditNote: CreditNote
  onUpdated: (cn: CreditNote) => void
}

export function CreditNoteDetailContent({ creditNote, onUpdated }: CreditNoteDetailContentProps) {
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const isAdmin = useAuthStore((s) => isAdminish(s.user))

  // Reviewer can override settlement on approve; both approve and reject can
  // attach a free-text inspection note (seeded from the CN's existing values).
  const [reviewSettlementOverride, setReviewSettlementOverride] = useState<'REFUND' | 'CREDIT' | 'REPLACEMENT'>(creditNote.settlementMode)
  const [reviewNote, setReviewNote] = useState(creditNote.reviewNote ?? '')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)

  // The customer's current outstanding — drives the same settlement rules as
  // the Sales Returns page: Adjust needs a balance to apply against; Refund is
  // blocked while dues exist; and an over-value Adjust shows the adjust/refund
  // split. Only fetched while this CN is awaiting review.
  const isPendingReview = creditNote.status === 'PENDING_REVIEW'
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null)
  useEffect(() => {
    if (!isPendingReview || !creditNote.customerId) return
    let cancelled = false
    api
      .get(`/customers/${creditNote.customerId}`)
      .then((res) => {
        if (!cancelled) setCustomerOutstanding(Number(res.data?.currentOutstanding ?? 0))
      })
      .catch(() => { /* leave null — guards fall back to permissive */ })
    return () => { cancelled = true }
  }, [isPendingReview, creditNote.customerId])

  const hasOutstanding = (customerOutstanding ?? 0) > 0
  // Mirrors CreditNotesService.approve(): only the outstanding portion is
  // adjusted; any excess of an over-value return is refunded in cash.
  const settlementSplit = useMemo(() => {
    const outstanding = Math.max(0, customerOutstanding ?? 0)
    const total = Number(creditNote.totalAmount)
    if (reviewSettlementOverride !== 'CREDIT' || outstanding <= 0) {
      return { adjusted: 0, refunded: 0, hasExcess: false }
    }
    const adjusted = Math.min(total, outstanding)
    const refunded = Math.max(0, total - adjusted)
    return { adjusted, refunded, hasExcess: refunded > 0.01 }
  }, [reviewSettlementOverride, customerOutstanding, creditNote.totalAmount])

  // Keep the selected settlement consistent with the balance once it loads:
  // switch Refund→Adjust while dues exist, and Adjust→Refund when nothing's due.
  useEffect(() => {
    if (!isPendingReview || customerOutstanding === null) return
    if (reviewSettlementOverride === 'REFUND' && hasOutstanding) {
      setReviewSettlementOverride('CREDIT')
    } else if (reviewSettlementOverride === 'CREDIT' && !hasOutstanding) {
      setReviewSettlementOverride('REFUND')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerOutstanding, isPendingReview])

  const handleApprove = useCallback(async () => {
    setReviewSubmitting(true)
    try {
      const body: { settlementMode?: string; reviewNote?: string } = {}
      if (reviewSettlementOverride !== creditNote.settlementMode) {
        body.settlementMode = reviewSettlementOverride
      }
      if (reviewNote.trim()) body.reviewNote = reviewNote.trim()
      const res = await api.post(`/credit-notes/${creditNote.id}/approve`, body)
      onUpdated(res.data)
      toast.success(`${creditNote.creditNoteNo} approved`, {
        description: body.settlementMode
          ? `Settlement set to ${body.settlementMode.toLowerCase()}. Side effects executed.`
          : 'Stock restored and settlement applied.',
      })
    } catch {
      // api.ts surfaces the error toast
    } finally {
      setReviewSubmitting(false)
    }
  }, [creditNote, reviewSettlementOverride, reviewNote, onUpdated])

  const handleReject = useCallback(async () => {
    if (!reviewNote.trim()) {
      toast.error('Please describe what you found on inspection before rejecting.')
      return
    }
    setReviewSubmitting(true)
    try {
      const res = await api.post(`/credit-notes/${creditNote.id}/reject`, { reviewNote: reviewNote.trim() })
      onUpdated(res.data)
      toast.success(`${creditNote.creditNoteNo} rejected`, {
        description: 'No stock or balance changes were applied.',
      })
    } catch {
      // api.ts surfaces the error toast
    } finally {
      setReviewSubmitting(false)
    }
  }, [creditNote, reviewNote, onUpdated])

  // Issue the replacement goods: pre-load a fresh sale with the returned items
  // for this customer, carrying the credit-note id so the new invoice links
  // back and settles the CN on save. Mirrors the quotation → invoice flow.
  const issueReplacement = useCallback(() => {
    try {
      sessionStorage.setItem('replacement_prefill', JSON.stringify({
        creditNoteId: creditNote.id,
        creditNoteNo: creditNote.creditNoteNo,
        customerId: creditNote.customerId ?? '',
        customerName: creditNote.customerName,
        customerPhone: creditNote.customerPhone ?? '',
        // Replacement is goods-for-goods — the customer already paid on the
        // original sale, so each line is issued at 100% discount (no charge).
        // The invoice records the stock-out and links to the CN, but bills ₹0.
        items: creditNote.items.map((it) => ({
          productName: it.productName,
          quantity: it.returnedQty,
          rate: it.rate,
          discountPercent: 100,
        })),
      }))
    } catch { /* storage disabled — non-fatal */ }
    navigate('/billing/new')
  }, [creditNote])

  // A REPLACEMENT credit note that's approved but not yet fulfilled.
  const awaitingReplacement =
    creditNote.settlementMode === 'REPLACEMENT' &&
    creditNote.status === 'APPROVED' &&
    !creditNote.settledAt

  const settlement = settlementConfig[creditNote.settlementMode]
  const status = statusConfig[creditNote.status]
  const StatusIcon = status?.icon ?? Hourglass
  const isPending = creditNote.status === 'PENDING_REVIEW'
  const canReview = isPending && isAdmin

  return (
    <div className="space-y-5">
      {/* Customer / Against Invoice / Reason / Settlement — single row, equal width */}
      <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Customer</p>
          <CustomerNameLine
            name={creditNote.customerName}
            phone={creditNote.customerPhone}
            className="mt-0.5"
            nameClassName="text-sm font-semibold text-sky-600 hover:underline dark:text-sky-400"
            onNameClick={creditNote.customerId ? () => navigate(`/customers/detail?customerId=${creditNote.customerId}`) : undefined}
          />
        </div>
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Against Invoice</p>
          <p className="mt-0.5 font-mono text-xs font-medium truncate" title={creditNote.invoiceNumber}>{creditNote.invoiceNumber}</p>
        </div>
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Reason</p>
          <p className="mt-0.5 text-sm font-medium wrap-break-word" title={creditNote.reason}>{creditNote.reason}</p>
        </div>
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Settlement</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={settlement?.variant ?? 'secondary'} size="sm" dot>
              {settlement?.label ?? creditNote.settlementMode}
            </Badge>
            {awaitingReplacement && (
              <Badge variant="warning" size="sm">Awaiting replacement</Badge>
            )}
            {creditNote.settlementMode === 'REPLACEMENT' && creditNote.settledAt && (
              <Badge variant="success" size="sm">Replacement issued</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Notes — conditional, full width */}
      {creditNote.notes && (
        <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
          <p className="mt-0.5 text-sm">{creditNote.notes}</p>
        </div>
      )}

      {/* ── Review panel ──
          PENDING_REVIEW + admin → editable (settlement override + inspection
          note + Approve/Reject). APPROVED/REJECTED → read-only. PENDING_REVIEW
          + non-admin → "awaiting review" banner. */}
      {canReview ? (
        <div className="rounded-xl border-2 border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20 px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Awaiting your review</p>
          </div>
          <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
            No inventory, customer balance, or invoice status has changed yet. Confirm or override the
            settlement method, write an inspection note, then approve or reject.
          </p>

          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Settlement Method
            </Label>
            <div className="grid gap-2">
              {SETTLEMENT_PICKER_OPTIONS.map((opt) => {
                const checked = reviewSettlementOverride === opt.value
                const isAdjust = opt.value === 'CREDIT'
                const isRefund = opt.value === 'REFUND'
                // Adjust needs an outstanding balance; Refund is blocked while
                // the customer still owes money (settle the dues first).
                const blocked =
                  customerOutstanding !== null &&
                  ((isAdjust && !hasOutstanding) || (isRefund && hasOutstanding))
                const disabled = reviewSubmitting || blocked
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => !blocked && setReviewSettlementOverride(opt.value)}
                    disabled={disabled}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors',
                      checked
                        ? 'border-primary bg-primary/5'
                        : 'border-border/40 bg-background hover:border-border/80',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                      checked ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    )}>
                      {checked && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{opt.label}</p>
                        {isAdjust && customerOutstanding !== null && (
                          <span className={cn(
                            'text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded',
                            hasOutstanding ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                          )}>
                            {hasOutstanding ? `${formatCurrency(customerOutstanding)} due` : 'No outstanding'}
                          </span>
                        )}
                        {isRefund && hasOutstanding && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Settle dues first
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{opt.sublabel}</p>
                      {isAdjust && checked && settlementSplit.hasExcess && (
                        <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {formatCurrency(settlementSplit.adjusted)} adjusted · {formatCurrency(settlementSplit.refunded)} refunded
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            {settlementSplit.hasExcess && (
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80">
                The return is worth more than the customer owes — {formatCurrency(settlementSplit.adjusted)} will be adjusted against the outstanding and the remaining {formatCurrency(settlementSplit.refunded)} refunded in cash.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cn-review-note" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Inspection Note <span className="font-normal normal-case text-muted-foreground/70">(required to reject)</span>
            </Label>
            <textarea
              id="cn-review-note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              disabled={reviewSubmitting}
              rows={3}
              maxLength={2000}
              placeholder="What did you find on inspection?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>
        </div>
      ) : isPending ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/10 px-4 py-3 flex items-center gap-2">
          <Hourglass className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Awaiting review by an admin. No inventory or balance changes have fired yet.
          </p>
        </div>
      ) : (
        <div className={cn(
          'rounded-xl border px-4 py-3',
          creditNote.status === 'APPROVED'
            ? 'border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-700/40 dark:bg-emerald-950/10'
            : 'border-rose-300/60 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/10'
        )}>
          <div className="flex items-center gap-2">
            <StatusIcon className={cn(
              'h-4 w-4',
              creditNote.status === 'APPROVED'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            )} />
            <p className={cn(
              'text-sm font-semibold',
              creditNote.status === 'APPROVED'
                ? 'text-emerald-900 dark:text-emerald-200'
                : 'text-rose-900 dark:text-rose-200'
            )}>
              {status?.label ?? creditNote.status}
              {creditNote.reviewedBy ? ` by ${creditNote.reviewedBy.name}` : ''}
              {creditNote.reviewedAt ? ` · ${formatDate(creditNote.reviewedAt)}` : ''}
            </p>
          </div>
          {creditNote.reviewNote && (
            <p className="mt-1 text-[12px] whitespace-pre-wrap">{creditNote.reviewNote}</p>
          )}
        </div>
      )}

      {/* Items — proper table with sticky header */}
      {/* Items — cards on mobile, table on md+ */}
      <div className="space-y-2 md:hidden">
        {(creditNote.items ?? []).map((item, idx) => (
          <div key={item.id ?? idx} className="rounded-xl border border-border/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.productName}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{item.batchNumber}</p>
              </div>
              <p className="shrink-0 font-mono text-sm font-semibold">{formatCurrency(item.amount)}</p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
              <div><span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Qty</span><span className="font-mono">{item.returnedQty}</span></div>
              <div><span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Rate</span><span className="font-mono">{formatCurrency(item.rate)}</span></div>
              <div><span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">GST</span><span className="font-mono">{item.gstPercent}%</span></div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border border-border/40 md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
            <TableRow className="border-b border-border/40 hover:bg-transparent">
              <TableHead className="h-9 w-10 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
              <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
              <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GST%</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(creditNote.items ?? []).map((item, idx) => (
              <TableRow key={item.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="px-3 py-2.5 text-sm font-medium">{item.productName}</TableCell>
                <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.batchNumber}</TableCell>
                <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{item.returnedQty}</TableCell>
                <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.rate)}</TableCell>
                <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{item.gstPercent}%</TableCell>
                <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals — single horizontal strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/40 bg-muted/10 px-4 py-2.5">
        {([
          { label: 'Subtotal', value: creditNote.subtotal },
          { label: 'CGST', value: creditNote.cgst },
          { label: 'SGST', value: creditNote.sgst },
          creditNote.igst > 0 ? { label: 'IGST', value: creditNote.igst } : null,
        ].filter(Boolean) as Array<{ label: string; value: number }>).map((row) => (
          <div key={row.label} className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">{row.label}</span>
            <span className="font-mono text-sm tabular-nums">{formatCurrency(row.value)}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2 border-l border-border/40 pl-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">Total Credit</span>
          <span className="font-mono text-lg font-black tabular-nums text-rose-700 dark:text-rose-400">{formatCurrency(creditNote.totalAmount)}</span>
        </div>
      </div>

      {/* ── Actions — sticky bar at the bottom of the viewport ── */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 rounded-b-2xl border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
        {canReview ? (
          <div className="flex flex-wrap items-center justify-end gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
            {/* Reject stays enabled even with an empty note — handleReject toasts
                a friendly "describe what you found" prompt instead of dead-clicking. */}
            <Button variant="destructive" className="gap-2" onClick={handleReject} disabled={reviewSubmitting}>
              <CircleSlash className="h-4 w-4" />
              Reject Return
            </Button>
            <Button
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              onClick={handleApprove}
              disabled={reviewSubmitting}
            >
              <ShieldCheck className="h-4 w-4" />
              Approve &amp; Settle
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
            {awaitingReplacement && (
              <Button
                className="gap-2 bg-cyan-600 text-white hover:bg-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                onClick={issueReplacement}
              >
                <RefreshCw className="h-4 w-4" />
                Issue Replacement
              </Button>
            )}
            {creditNote.settlementMode === 'REPLACEMENT' && creditNote.settledAt && creditNote.replacementInvoiceId && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate(`/billing/sales?view=split&invoiceId=${encodeURIComponent(creditNote.replacementInvoiceId!)}`)}
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Replacement Invoice</span>
                <span className="sm:hidden">Replacement</span>
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate(`/billing/sales?view=split&invoiceId=${encodeURIComponent(creditNote.invoiceId)}`)}
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View Invoice</span>
              <span className="sm:hidden">Invoice</span>
            </Button>
            <Button className="gap-2" onClick={() => printCreditNote(creditNote, businessProfile)}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
