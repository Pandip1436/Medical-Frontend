import { useEffect, useState } from 'react'
import {
  Receipt, Truck, RotateCcw, PackageX, Loader2, AlertCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import api from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// The four document kinds a product-history row can point at.
export type ProductDocType = 'invoice' | 'grn' | 'credit-note' | 'purchase-return'

interface DocConfig {
  endpoint: (id: string) => string
  label: string
  icon: LucideIcon
  numberField: string
  partyField: string
  accent: string // text + bg accent for the header icon
}

const DOC_CONFIG: Record<ProductDocType, DocConfig> = {
  invoice: {
    endpoint: (id) => `/billing/${id}`,
    label: 'Invoice', icon: Receipt, numberField: 'invoiceNumber', partyField: 'customerName',
    accent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  grn: {
    endpoint: (id) => `/grn/${id}`,
    label: 'Goods Receipt', icon: Truck, numberField: 'grnNumber', partyField: 'supplierName',
    accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  'credit-note': {
    endpoint: (id) => `/credit-notes/${id}`,
    label: 'Credit Note', icon: RotateCcw, numberField: 'creditNoteNo', partyField: 'customerName',
    accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  'purchase-return': {
    endpoint: (id) => `/purchase-returns/${id}`,
    label: 'Debit Note', icon: PackageX, numberField: 'debitNoteNo', partyField: 'supplierName',
    accent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
}

interface ProductDocumentDrawerProps {
  open: boolean
  docType: ProductDocType | null
  docId: string | null
  /** Highlights the line for the product whose history we're viewing. */
  highlightProductId?: string | null
  onOpenChange: (open: boolean) => void
}

// Read-only document viewer for the Product History page. Shows just enough to
// VERIFY a movement — header, meta, line items and totals — with no payment,
// edit, print or share actions.
export function ProductDocumentDrawer({
  open, docType, docId, highlightProductId, onOpenChange,
}: ProductDocumentDrawerProps) {
  const [doc, setDoc] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !docType || !docId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDoc(null)
    api
      .get(DOC_CONFIG[docType].endpoint(docId))
      .then((res) => {
        if (cancelled) return
        setDoc(res.data?.data ?? res.data)
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load this document.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, docType, docId])

  const cfg = docType ? DOC_CONFIG[docType] : null
  const Icon = cfg?.icon ?? Receipt

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl p-0 gap-0 flex flex-col h-dvh overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 pr-12 border-b border-border/40 shrink-0 space-y-0 bg-muted/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cfg?.accent)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate font-mono">
                {doc?.[cfg?.numberField ?? ''] ?? cfg?.label ?? 'Document'}
              </SheetTitle>
              <SheetDescription className="mt-0.5 truncate text-sm text-muted-foreground">
                {cfg?.label}
                {doc?.[cfg?.partyField ?? ''] ? ` · ${doc[cfg!.partyField]}` : ''}
                {doc?.date ? ` · ${formatDate(doc.date)}` : ''}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading document…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <AlertCircle className="h-8 w-8 text-rose-500" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : doc ? (
            <DocumentBody docType={docType!} doc={doc} highlightProductId={highlightProductId ?? null} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Read-only body — covers invoice / GRN / credit note / debit note ──
// All four share a near-identical line-item shape; we read fields defensively
// and show optional columns (MRP / Disc% / GST% / Expiry) only when present.
// The line for the product whose history is open is highlighted.
function DocumentBody({
  docType, doc, highlightProductId,
}: {
  docType: ProductDocType
  doc: any
  highlightProductId: string | null
}) {
  const items: any[] = Array.isArray(doc.items) ? doc.items : []
  const num = (v: any) => Number(v ?? 0)
  const qtyOf = (it: any) => it.quantity ?? it.receivedQty ?? it.returnedQty ?? 0
  const rateOf = (it: any) => num(it.rate ?? it.purchaseRate)
  const amountOf = (it: any) => num(it.amount ?? rateOf(it) * qtyOf(it))

  const showMrp = items.some((it) => it.mrp != null && num(it.mrp) > 0)
  const showDisc = items.some((it) => it.discountPercent != null)
  const showGst = items.some((it) => it.gstPercent != null)
  const showExpiry = items.some((it) => it.expiryDate)

  const computedTotal = items.reduce((s, it) => s + amountOf(it), 0)
  const total = num(doc.totalAmount ?? doc.grandTotal ?? doc.supplierInvoiceAmount ?? computedTotal)
  const paid = num(doc.amountPaid)
  const balance = total - paid

  // Full party (customer for invoice/credit-note, supplier otherwise). Prefer
  // the live relation, falling back to invoice snapshot fields.
  const isCustomerDoc = docType === 'invoice' || docType === 'credit-note'
  const party = doc.customer ?? doc.supplier ?? null
  const partyName: string = party?.name ?? doc.customerName ?? doc.supplierName ?? '—'
  const partyFields: { label: string; value: string }[] = []
  const pushParty = (label: string, value: any) => { if (value) partyFields.push({ label, value: String(value) }) }
  pushParty('Phone', party?.phone ?? doc.customerPhone)
  pushParty('Alt. Phone', party?.alternatePhone)
  pushParty('Email', party?.email)
  pushParty('GSTIN', party?.gstin ?? doc.customerGstin)
  pushParty('Address', party?.address ?? doc.customerAddress)

  // Colour-graded top tiles — status + payment / settlement, prominent.
  const PAYMENT_TONE = 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/30 dark:text-indigo-300'
  const SETTLE_TONE = 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-300'
  const topTiles: { label: string; value: string; tone: string }[] = []
  if (doc.status) topTiles.push({ label: 'Status', value: String(doc.status), tone: statusTone(String(doc.status)) })
  if (docType === 'invoice' && doc.paymentMode) topTiles.push({ label: 'Payment Mode', value: String(doc.paymentMode), tone: PAYMENT_TONE })
  if (doc.settlementMode) topTiles.push({ label: 'Settlement', value: String(doc.settlementMode), tone: SETTLE_TONE })

  // Secondary meta — smaller chips for the rest.
  const metaRows: { label: string; value: string }[] = []
  if (docType === 'invoice' && doc.doctorName) metaRows.push({ label: 'Doctor', value: String(doc.doctorName) })
  if (docType === 'credit-note' && doc.invoiceNumber) metaRows.push({ label: 'Against Invoice', value: String(doc.invoiceNumber) })
  if (docType === 'grn' && doc.supplierInvoiceNo) metaRows.push({ label: 'Supplier Invoice', value: String(doc.supplierInvoiceNo) })
  if (doc.reason) metaRows.push({ label: 'Reason', value: String(doc.reason) })

  return (
    <div className="p-5 space-y-4">
      {/* Status / payment band — colour-graded, top of the panel */}
      {topTiles.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {topTiles.map((t) => (
            <div key={t.label} className={cn('flex-1 min-w-32 rounded-lg border px-3 py-2', t.tone)}>
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{t.label}</p>
              <p className="mt-0.5 text-sm font-bold leading-tight">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Party (customer / supplier) details */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {isCustomerDoc ? 'Customer' : 'Supplier'} Details
          </p>
          {party?.type && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              {party.type}
            </span>
          )}
        </div>
        <p className="text-base font-bold leading-tight">{partyName}</p>
        {partyFields.length > 0 && (
          <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {partyFields.map((f) => (
              <div key={f.label} className="flex gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground w-20">{f.label}</span>
                <span className="font-medium wrap-break-word">{f.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Secondary meta */}
      {metaRows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metaRows.map((m) => (
            <div key={m.label} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</p>
              <p className="text-sm font-medium truncate" title={m.value}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      {/* Mobile: stacked cards — the full table overflows a phone width. */}
      <div className="space-y-2 md:hidden">
        {items.map((it, i) => {
          const isCurrent = highlightProductId && it.productId === highlightProductId
          const cells = [
            { label: 'Batch', value: it.batchNumber || '—' },
            ...(showExpiry ? [{ label: 'Expiry', value: it.expiryDate ? formatDate(it.expiryDate) : '—' }] : []),
            { label: 'Qty', value: String(qtyOf(it)) },
            ...(showMrp ? [{ label: 'MRP', value: num(it.mrp) > 0 ? formatCurrency(num(it.mrp)) : '—' }] : []),
            { label: 'Rate', value: formatCurrency(rateOf(it)) },
            ...(showDisc ? [{ label: 'Disc%', value: it.discountPercent != null ? `${num(it.discountPercent)}%` : '—' }] : []),
            ...(showGst ? [{ label: 'GST%', value: it.gstPercent != null ? `${num(it.gstPercent)}%` : '—' }] : []),
          ]
          return (
            <div key={it.id ?? i} className={cn('rounded-xl border p-3', isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border/40')}>
              <div className="flex items-start justify-between gap-2">
                <span className={cn('min-w-0 break-words text-sm font-semibold', isCurrent && 'text-primary')}>
                  {it.productName ?? it.product?.name ?? '—'}
                </span>
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">This product</span>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
                {cells.map((c) => (
                  <div key={c.label} className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</p>
                    <p className="mt-0.5 truncate font-mono text-xs">{c.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-border/30 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</span>
                <span className="font-mono text-sm font-semibold">{formatCurrency(amountOf(it))}</span>
              </div>
            </div>
          )
        })}
        {items.length === 0 && (
          <p className="rounded-xl border border-border/40 py-8 text-center text-sm text-muted-foreground">No line items on this document.</p>
        )}
      </div>

      {/* Desktop / tablet: full table */}
      <div className="hidden rounded-xl border border-border/40 overflow-x-auto md:block">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="text-xs font-bold uppercase">Product</TableHead>
              <TableHead className="w-24 text-xs font-bold uppercase">Batch</TableHead>
              {showExpiry && <TableHead className="w-20 text-xs font-bold uppercase">Expiry</TableHead>}
              <TableHead className="text-right text-xs font-bold uppercase">Qty</TableHead>
              {showMrp && <TableHead className="text-right text-xs font-bold uppercase">MRP</TableHead>}
              <TableHead className="text-right text-xs font-bold uppercase">Rate</TableHead>
              {showDisc && <TableHead className="text-right text-xs font-bold uppercase">Disc%</TableHead>}
              {showGst && <TableHead className="text-right text-xs font-bold uppercase">GST%</TableHead>}
              <TableHead className="text-right text-xs font-bold uppercase">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, i) => {
              const isCurrent = highlightProductId && it.productId === highlightProductId
              return (
                <TableRow
                  key={it.id ?? i}
                  className={cn('border-b border-border/30', isCurrent && 'bg-primary/10 hover:bg-primary/15')}
                >
                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className={cn('text-sm font-semibold', isCurrent && 'text-primary')}>
                        {it.productName ?? it.product?.name ?? '—'}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                          This product
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 text-xs font-mono text-muted-foreground">{it.batchNumber || '—'}</TableCell>
                  {showExpiry && (
                    <TableCell className="py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {it.expiryDate ? formatDate(it.expiryDate) : '—'}
                    </TableCell>
                  )}
                  <TableCell className="py-2.5 text-right text-sm font-mono font-semibold">{qtyOf(it)}</TableCell>
                  {showMrp && <TableCell className="py-2.5 text-right text-xs font-mono text-muted-foreground">{num(it.mrp) > 0 ? formatCurrency(num(it.mrp)) : '—'}</TableCell>}
                  <TableCell className="py-2.5 text-right text-sm font-mono">{formatCurrency(rateOf(it))}</TableCell>
                  {showDisc && <TableCell className="py-2.5 text-right text-xs font-mono text-muted-foreground">{it.discountPercent != null ? `${num(it.discountPercent)}%` : '—'}</TableCell>}
                  {showGst && <TableCell className="py-2.5 text-right text-xs font-mono text-muted-foreground">{it.gstPercent != null ? `${num(it.gstPercent)}%` : '—'}</TableCell>}
                  <TableCell className="py-2.5 text-right text-sm font-mono font-semibold">{formatCurrency(amountOf(it))}</TableCell>
                </TableRow>
              )
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No line items on this document.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full sm:w-72 space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-4">
          {num(doc.subtotal) > 0 && <Row label="Subtotal" value={formatCurrency(num(doc.subtotal))} />}
          {num(doc.taxableAmount) > 0 && <Row label="Taxable" value={formatCurrency(num(doc.taxableAmount))} />}
          {(num(doc.cgst) > 0 || num(doc.sgst) > 0) && (
            <Row label="CGST + SGST" value={formatCurrency(num(doc.cgst) + num(doc.sgst))} />
          )}
          {num(doc.igst) > 0 && <Row label="IGST" value={formatCurrency(num(doc.igst))} />}
          {num(doc.deliveryCharge) > 0 && <Row label="Delivery / Packaging" value={formatCurrency(num(doc.deliveryCharge))} />}
          <div className="flex items-center justify-between border-t border-border/50 pt-2 mt-1">
            <span className="text-sm font-bold">Total</span>
            <span className="text-lg font-bold font-mono">{formatCurrency(total)}</span>
          </div>
          {paid > 0 && (
            <div className="flex items-center justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <span>Paid</span>
              <span className="font-mono">{formatCurrency(paid)}</span>
            </div>
          )}
          {paid > 0 && balance > 0.01 && (
            <div className="flex items-center justify-between text-sm font-bold text-amber-600 dark:text-amber-400">
              <span>Balance Due</span>
              <span className="font-mono">{formatCurrency(balance)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Colour grading for the Status tile.
function statusTone(status: string): string {
  const s = status.toUpperCase()
  if (['PAID', 'APPROVED', 'RECEIVED', 'FULLY_RECEIVED', 'VERIFIED', 'CLOSED'].includes(s))
    return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (['UNPAID', 'REJECTED', 'CANCELLED'].includes(s))
    return 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300'
  if (['PARTIAL', 'PENDING_REVIEW', 'DRAFT', 'SENT', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'].includes(s))
    return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300'
  return 'border-border/50 bg-muted/40 text-foreground'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}
