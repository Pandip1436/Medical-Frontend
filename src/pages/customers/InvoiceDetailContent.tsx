import { useEffect, useState } from 'react'
import {
  Printer, Download, ShoppingCart, Wallet,
  Stethoscope, CalendarDays, CalendarClock, Pencil,
  Send, QrCode, History, Eye, Phone, MapPin,
  Truck, Loader2, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { downloadInvoicePdf, printInvoicePdf } from '@/lib/pdf/invoicePdf'
import { InvoiceDocument } from '@/components/billing/InvoiceDocument'
import {
  printReceipt, downloadReceiptPdf,
  type ReceiptPayment, type ReceiptInvoice,
} from '@/lib/pdf/receiptPdf'
import type { Invoice } from '@/types'

// Shared invoice detail body — used by both the list-page modal and the
// standalone detail page. Header (Receipt icon, invoice #, status) is rendered
// by the host; this component owns the meta-block, items table, totals,
// collect-payment widget, and action buttons.

interface InvoiceDetailContentProps {
  invoice: Invoice
  onClose: () => void
  onUpdated: (inv: Invoice) => void
}

export function InvoiceDetailContent({ invoice, onClose, onUpdated }: InvoiceDetailContentProps) {
  const [collectAmount, setCollectAmount] = useState('')
  // UPI is the most common collection mode here, so it's the default.
  const [collectMode, setCollectMode] = useState('UPI')
  // Reference (UTR / txn id / cheque no.) — required for every non-cash mode.
  const [collectRef, setCollectRef] = useState('')
  const [collectSubmitting, setCollectSubmitting] = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [regeneratingQr, setRegeneratingQr] = useState(false)
  // On-screen invoice preview — the same styled document the New Sale page shows.
  const [previewOpen, setPreviewOpen] = useState(false)
  // Courier toggle — reflects whether a delivery tracking record exists for
  // this invoice. Turning it on snapshots the invoice into the Delivery
  // Tracking module and jumps to the tracking page.
  const [delivery, setDelivery] = useState<{ id: string } | null>(null)
  const [courierToggling, setCourierToggling] = useState(false)

  // Courier tracking applies only to real invoices (not quotations).
  const isCourierApplicable = invoice.type === 'INVOICE'

  useEffect(() => {
    if (!isCourierApplicable) return
    let active = true
    api
      // Optional feature + not every role can read delivery (e.g. SALESPERSON),
      // so suppress the global error toast — a 403/empty here is non-fatal.
      .get(`/delivery/invoice/${invoice.id}`, { suppressGlobalToast: true } as any)
      .then((r) => { if (active) setDelivery(r.data ?? null) })
      .catch(() => { /* tracking is optional — ignore */ })
    return () => { active = false }
  }, [invoice.id, isCourierApplicable])

  const handleCourierToggle = async (on: boolean) => {
    setCourierToggling(true)
    try {
      if (on) {
        const res = await api.post('/delivery', { invoiceId: invoice.id })
        setDelivery(res.data)
        toast.success('Courier tracking enabled')
        navigate(`/delivery/tracking?id=${res.data.id}`)
      } else if (delivery) {
        await api.delete(`/delivery/${delivery.id}`)
        setDelivery(null)
        toast.success('Courier tracking disabled')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update courier tracking')
    } finally {
      setCourierToggling(false)
    }
  }

  // Auto-send / QR flow only applies to real invoices that aren't draft or
  // cancelled. Quotations are billed-out differently and have no payment QR.
  const isAutoSendApplicable =
    invoice.type === 'INVOICE' &&
    invoice.status !== 'DRAFT' &&
    invoice.status !== 'CANCELLED'

  const handleSendWhatsApp = async () => {
    setSendingWhatsApp(true)
    try {
      await api.post(`/billing/${invoice.id}/send-whatsapp`)
      toast.success('Queued — WhatsApp message will be sent shortly')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to queue WhatsApp send')
    } finally {
      setSendingWhatsApp(false)
    }
  }

  const handleRegenerateQr = async () => {
    setRegeneratingQr(true)
    try {
      const res = await api.post(`/billing/${invoice.id}/payment-link`)
      if (res.data == null) {
        toast.info('Invoice fully paid — no payment QR needed')
      } else {
        toast.success('Payment QR generated')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Failed to generate payment QR'
      toast.error(typeof msg === 'string' ? msg : 'Failed to generate payment QR')
    } finally {
      setRegeneratingQr(false)
    }
  }

  const handleCollectPayment = async () => {
    const raw = parseFloat(collectAmount)
    if (!collectAmount || isNaN(raw) || raw <= 0) return
    // The displayed outstanding is rounded to the rupee, so the operator may
    // type a value a few paise above the true balance (e.g. ₹13,050 when the
    // real figure is ₹13,049.95). Reject only a meaningful over-payment (>₹1),
    // then cap the collected amount to the exact outstanding so it settles the
    // invoice cleanly without ever exceeding it.
    if (raw > maxCollectible + 0.01) {
      toast.error(`Payment cannot exceed the outstanding amount of ${formatCurrency(outstanding)}`)
      return
    }
    const amount = Math.min(raw, outstanding)
    // Non-cash modes are traceable — a reference number is mandatory.
    if (refRequired && !collectRef.trim()) {
      toast.error(`Enter the ${collectMode} reference number`)
      return
    }
    setCollectSubmitting(true)
    try {
      const res = await api.patch(`/billing/${invoice.id}/collect-payment`, {
        amountReceived: amount,
        paymentMode: collectMode,
        referenceNumber: refRequired ? collectRef.trim() : undefined,
      })
      toast.success('Payment collected successfully')
      setCollectAmount('')
      setCollectRef('')
      onUpdated(res.data)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to collect payment')
    } finally {
      setCollectSubmitting(false)
    }
  }

  const handleRepurchase = () => {
    sessionStorage.setItem(
      'repurchase_items',
      JSON.stringify(
        invoice.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          mrp: item.mrp,
          rate: item.rate,
          discountPercent: item.discountPercent,
          gstPercent: item.gstPercent,
          amount: item.amount,
        }))
      )
    )
    toast.success('Items loaded — redirecting to new sale…')
    onClose()
    setTimeout(() => navigate('/billing/new'), 200)
  }

  const grandTotal = Number(invoice.grandTotal)
  const amountPaid = Number(invoice.amountPaid)
  const outstanding = grandTotal - amountPaid
  // The displayed outstanding is rounded to whole rupees, so the operator may
  // legitimately type that rounded figure (e.g. ₹38,272 for a true ₹38,271.55).
  // Allow up to that rounded value; anything beyond it is a real over-payment.
  // (A flat ±₹1 tolerance was too loose — it silently accepted ₹38,272 on an
  // exact ₹38,271 balance instead of flagging it.)
  const maxCollectible = Math.max(outstanding, Math.round(outstanding))
  // Typed amount overshoots what's due — drives the inline error + disabled state.
  const collectNum = parseFloat(collectAmount)
  const collectExceeds = !isNaN(collectNum) && collectNum > maxCollectible + 0.01
  // UPI / Card / Cheque collections need a reference number; Cash doesn't.
  const refRequired = collectMode !== 'CASH'
  const refMissing = refRequired && !collectRef.trim()

  return (
    <div className="space-y-4">
      {/* Customer header — identity + detail chips on the left, quick actions
          (Edit / Repurchase) on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
            {invoice.customerName?.trim()?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight">{invoice.customerName}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {invoice.customerPhone && (
                <Badge variant="secondary" size="sm" className="gap-1 font-medium tabular-nums">
                  <Phone className="h-3 w-3" />
                  <span>{invoice.customerPhone}</span>
                </Badge>
              )}
              {invoice.customerAddress && (
                <Badge variant="secondary" size="sm" className="max-w-64 gap-1 font-normal">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{invoice.customerAddress}</span>
                </Badge>
              )}
              <Badge variant="secondary" size="sm" className="gap-1 font-normal">
                <CalendarDays className="h-3 w-3" />
                <span className="capitalize">{invoice.billingType.toLowerCase()}</span>
              </Badge>
              {invoice.doctorName && (
                <Badge variant="secondary" size="sm" className="max-w-44 gap-1 font-normal">
                  <Stethoscope className="h-3 w-3 shrink-0" />
                  <span className="truncate">{invoice.doctorName}</span>
                </Badge>
              )}
              {invoice.dueDate && (() => {
                // Highlight in red when the due date has passed and money is still owed.
                const overdue =
                  new Date(invoice.dueDate) < new Date() &&
                  (invoice.status === 'UNPAID' || invoice.status === 'PARTIAL')
                return (
                  <Badge
                    variant="secondary"
                    size="sm"
                    className={cn(
                      'gap-1 font-medium',
                      overdue && 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400',
                    )}
                  >
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    <span>Due {formatDate(invoice.dueDate)}</span>
                  </Badge>
                )
              })()}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isCourierApplicable && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Courier</span>
              {courierToggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={!!delivery}
                  onCheckedChange={handleCourierToggle}
                  aria-label="Enable courier tracking"
                />
              )}
              {delivery && !courierToggling && (
                <button
                  onClick={() => navigate(`/delivery/tracking?id=${delivery.id}`)}
                  className="ml-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Track <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {(invoice.status === 'UNPAID' || invoice.status === 'PARTIAL') && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40"
              onClick={() => navigate(`/billing/new?editId=${invoice.id}`)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {amountPaid > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                document
                  .getElementById('invoice-payment-history')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <History className="h-3.5 w-3.5" />
              Payment History
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40"
            onClick={handleRepurchase}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Repurchase
          </Button>
        </div>
      </div>

      {/* Items table */}
      <div className="overflow-hidden rounded-xl border border-border/40">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-center">Expiry</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Disc%</TableHead>
              <TableHead className="text-right">Taxable</TableHead>
              <TableHead className="text-right">GST%</TableHead>
              <TableHead className="text-right">GST ₹</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.items.map((item, idx) => (
              <TableRow key={item.id ?? idx}>
                <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{item.productName}</p>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.batchNumber}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{item.quantity}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">{Number(item.mrp).toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(item.rate)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{Number(item.discountPercent).toFixed(1)}</TableCell>
                {/* Pre-GST taxable base — the line amount is GST-inclusive, so
                    back the tax out: amount ÷ (1 + gst%). */}
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(Number(item.amount) / (1 + Number(item.gstPercent) / 100))}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{Number(item.gstPercent).toFixed(1)}%</TableCell>
                {/* GST value in ₹ = amount − taxable. */}
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(Number(item.amount) - Number(item.amount) / (1 + Number(item.gstPercent) / 100))}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(item.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Balance Due hero — only when there's outstanding. Rendered ABOVE the
          totals breakdown so the customer's eye lands on what they still owe
          before scanning the line-by-line breakdown. Amber-tinted, large
          currency, full-width. */}
      {outstanding > 0.01 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              Balance Due
            </span>
            <span className="text-xs text-amber-700/70 dark:text-amber-400/70">
              {formatCurrency(amountPaid)} paid of {formatCurrency(grandTotal)}
            </span>
          </div>
          <span className="font-mono text-3xl font-black tabular-nums text-amber-700 dark:text-amber-400">
            {formatCurrency(outstanding)}
          </span>
        </div>
      )}

      {/* Collect Payment (left) + Totals (right). Side by side on large screens
          when there's something to collect; otherwise the totals span full
          width on their own. */}
      {(() => {
        const canCollect = invoice.status === 'UNPAID' || invoice.status === 'PARTIAL'
        return (
          <div className={cn('grid gap-4 lg:items-start', canCollect && 'lg:grid-cols-2')}>
            {/* Collect Payment — unpaid/partial only (left column) */}
            {canCollect && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Collect Payment — Outstanding: {formatCurrency(outstanding)}
                </p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select value={collectMode} onValueChange={setCollectMode}>
                      <SelectTrigger className="w-32 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['CASH', 'UPI', 'CARD', 'CHEQUE'].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Amount"
                      className={cn(
                        'h-9 text-sm',
                        collectExceeds && 'border-rose-400 focus-visible:ring-rose-400',
                      )}
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      min={0}
                      max={maxCollectible}
                    />
                    <Button
                      size="sm"
                      className="gap-1.5 shrink-0"
                      disabled={collectSubmitting || !collectAmount || collectExceeds || refMissing}
                      onClick={handleCollectPayment}
                    >
                      <Wallet className="h-4 w-4" />
                      {collectSubmitting ? 'Saving…' : 'Collect'}
                    </Button>
                  </div>
                  {/* Non-cash modes need a traceable reference number. */}
                  {refRequired && (
                    <Input
                      placeholder={`${collectMode === 'CHEQUE' ? 'Cheque' : collectMode} reference no. (UTR / txn id / cheque #)`}
                      className="h-9 text-sm"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                    />
                  )}
                </div>
                {collectExceeds && (
                  <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                    Amount can't exceed the outstanding {formatCurrency(outstanding)}.
                  </p>
                )}
                {!collectExceeds && refMissing && collectAmount && (
                  <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Enter the {collectMode} reference number to collect.
                  </p>
                )}
              </div>
            )}

            {/* Totals — compact single horizontal row to save vertical space */}
            <div className="rounded-xl border border-border/40 bg-muted/10 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                {([
                  { label: 'Subtotal', value: Number(invoice.subtotal) },
                  Number(invoice.productDiscount) > 0 ? { label: 'Disc', value: -Number(invoice.productDiscount) } : null,
                  { label: 'Taxable', value: Number(invoice.taxableAmount) },
                  { label: 'CGST', value: Number(invoice.cgst) },
                  { label: 'SGST', value: Number(invoice.sgst) },
                  Number(invoice.igst) > 0 ? { label: 'IGST', value: Number(invoice.igst) } : null,
                  Number(invoice.deliveryCharge) > 0 ? { label: 'Delivery', value: Number(invoice.deliveryCharge) } : null,
                  Math.abs(Number(invoice.roundOff)) > 0 ? { label: 'Round Off', value: Number(invoice.roundOff) } : null,
                ].filter(Boolean) as Array<{ label: string; value: number }>).map((row) => (
                  <div key={row.label} className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-sm tabular-nums">{formatCurrency(row.value)}</span>
                  </div>
                ))}
                <div className="ml-auto flex items-center gap-2 border-l border-border/40 pl-4">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Grand Total</span>
                  <span className="font-mono text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
              {amountPaid > 0 && (
                <div className="mt-1.5 flex items-center gap-3 border-t border-border/30 pt-1.5">
                  <span className="text-[11px] text-muted-foreground">Paid</span>
                  <span className="font-mono text-sm tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(amountPaid)}</span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Payment History — every payment made against this invoice, including
          the upfront at-counter amount (synthesized by the backend). The id +
          scroll-margin let the header "Payment History" button jump here. */}
      {amountPaid > 0 && (
        <div id="invoice-payment-history" className="scroll-mt-24">
          <PaymentHistory invoice={invoice} />
        </div>
      )}

      {/* Actions — sticky toolbar pinned to the bottom of the viewport so it
          stays reachable while scrolling the invoice. Server actions (WhatsApp
          / QR / Sync) sit to the left of the document actions (Download /
          Print). Edit & Repurchase live in the top header. */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
        {isAutoSendApplicable && (
          <>
            <Button
              variant="outline"
              className="h-10 gap-2 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/40"
              onClick={handleSendWhatsApp}
              disabled={sendingWhatsApp}
              title="Re-send the invoice PDF + payment QR to the customer's WhatsApp via Meta Cloud API"
            >
              <Send className={`h-4 w-4 ${sendingWhatsApp ? 'animate-pulse' : ''}`} />
              {sendingWhatsApp ? 'Sending…' : 'Send WhatsApp'}
            </Button>
            <Button
              variant="outline"
              className="h-10 gap-2 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/40"
              onClick={handleRegenerateQr}
              disabled={regeneratingQr}
              title="Generate a fresh Razorpay UPI QR for the current outstanding amount. Closes any existing live QR for this invoice first."
            >
              <QrCode className={`h-4 w-4 ${regeneratingQr ? 'animate-pulse' : ''}`} />
              {regeneratingQr ? 'Generating…' : 'Generate QR'}
            </Button>
            <span className="mx-1 hidden h-6 w-px bg-border/60 sm:block" aria-hidden />
          </>
        )}
        <Button variant="outline" className="h-10 gap-2" onClick={() => setPreviewOpen(true)}>
          <Eye className="h-4 w-4" />
          Preview
        </Button>
        <Button variant="outline" className="h-10 gap-2" onClick={() => downloadInvoicePdf(invoice)}>
          <Download className="h-4 w-4" />
          Download
        </Button>
        <Button className="h-10 gap-2" onClick={() => printInvoicePdf(invoice)}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Invoice preview — the same styled document the New Sale page renders,
          so the user sees the bill on-screen before printing/downloading. */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 md:h-auto md:max-h-[92vh] md:w-[96vw] md:max-w-6xl md:rounded-xl">
          {/* Toolbar */}
          <DialogHeader className="shrink-0 border-b border-border/30 bg-background px-5 py-3">
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                <Eye className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-bold">Invoice Preview</span>
                <span className="hidden font-mono text-xs font-normal text-muted-foreground sm:inline">{invoice.invoiceNumber}</span>
              </span>
              <span className="mr-8 flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-sm" onClick={() => downloadInvoicePdf(invoice)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
                <Button size="sm" className="h-8 gap-1.5 px-4 text-sm font-semibold" onClick={() => printInvoicePdf(invoice)}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </span>
            </DialogTitle>
          </DialogHeader>
          {/* Document body */}
          <div className="flex-1 overflow-y-auto">
            <InvoiceDocument invoice={invoice} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Payment History ───────────────────────────────────────────
// Read-only list of every payment against this single invoice. Fetched from
// GET /billing/:id/payments — re-fetches whenever amountPaid changes (i.e.
// after a successful collection), since the parent re-passes a fresh invoice.

interface PaymentHistoryData {
  invoiceNumber: string
  customerName: string
  customerPhone?: string | null
  customerAddress?: string | null
  customerGstin?: string | null
  grandTotal: number
  amountPaid: number
  payments: ReceiptPayment[]
}

const MODE_BADGE: Record<string, string> = {
  CASH: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40',
  UPI: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/40',
  CARD: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/40',
  CHEQUE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40',
}

function PaymentHistory({ invoice }: { invoice: Invoice }) {
  const [data, setData] = useState<PaymentHistoryData | null>(null)
  const [loading, setLoading] = useState(true)

  const amountPaid = Number(invoice.amountPaid)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .get(`/billing/${invoice.id}/payments`)
      .then((res) => { if (active) setData(res.data) })
      .catch(() => { if (active) setData(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // amountPaid in deps so a fresh collection re-pulls the updated history.
  }, [invoice.id, amountPaid])

  const receiptInvoice: ReceiptInvoice = {
    invoiceNumber: data?.invoiceNumber ?? invoice.invoiceNumber,
    customerName: data?.customerName ?? invoice.customerName,
    // Party details: prefer the payments endpoint (pulls the live customer
    // record), fall back to the invoice snapshot.
    customerPhone: data?.customerPhone ?? invoice.customerPhone,
    customerAddress: data?.customerAddress ?? invoice.customerAddress,
    customerGstin: data?.customerGstin ?? invoice.customerGstin,
    grandTotal: data?.grandTotal ?? Number(invoice.grandTotal),
    amountPaid: data?.amountPaid ?? amountPaid,
  }

  const payments = data?.payments ?? []

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Payment History</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {payments.length} {payments.length === 1 ? 'payment' : 'payments'} · {formatCurrency(amountPaid)} paid
        </p>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading payments…</div>
      ) : payments.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">No payments recorded yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Receipt #</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p, idx) => {
              const isInitial = p.source === 'INITIAL'
              return (
                <TableRow key={p.id ?? `initial-${idx}`}>
                  <TableCell className="text-sm">{formatDate(p.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {isInitial ? (
                      <span className="text-muted-foreground">At counter</span>
                    ) : (
                      p.receiptNumber ?? '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" size="sm" className={cn('font-medium', MODE_BADGE[p.paymentMode])}>
                      {p.paymentMode}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.referenceNumber ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isInitial ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => printReceipt(p, receiptInvoice)}
                          title="Print receipt voucher"
                        >
                          <Printer className="h-3.5 w-3.5" /> Print
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => downloadReceiptPdf(p, receiptInvoice)}
                          title="Download receipt voucher"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {payments.length > 0 && (
        <div className="flex justify-between border-t border-border/40 px-4 py-2.5 text-sm font-semibold">
          <span>Total Paid</span>
          <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(amountPaid)}</span>
        </div>
      )}
    </div>
  )
}
