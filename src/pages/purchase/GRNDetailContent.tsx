import { useState, Fragment } from 'react'
import {
  AlertTriangle, Printer, Truck, Calendar, FileText,
  CheckCircle2, XCircle, RotateCcw, Pencil, Wallet, PackageCheck,
  ChevronDown, ChevronRight, History, ShoppingCart, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { usePersistedState } from '@/hooks/usePersistedState'
import api from '@/lib/api'
import type { GRN } from '@/types'
import { useSettingsStore } from '@/stores/settingsStore'
import { ShortBillingDialog, type ShortBillingItem } from './ShortBillingDialog'

// ─── Helpers ──────────────────────────────────────────────────
function daysUntilExpiry(expiryDate: string) {
  return Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000)
}

// Unpaid balance owed to the supplier for this GRN's invoice.
function grnBalance(grn: GRN) {
  return Math.max(0, Number(grn.supplierInvoiceAmount || 0) - Number(grn.amountPaid || 0))
}

// ─── View Bill (sales + returns) types ───────────────────────
interface BillSale {
  invoiceId: string
  invoiceNumber: string
  date: string
  customerName: string
  customerId: string | null
  quantity: number
  amount: number | string
}
interface BillReturn {
  creditNoteId: string
  creditNoteNo: string
  invoiceId: string
  date: string
  customerName: string
  customerId: string | null
  returnedQty: number
  amount: number | string
}
interface BillItem {
  productId: string
  productName: string
  batchNumber: string
  expiryDate: string
  receivedQty: number
  currentStock: number
  unitsSold: number
  unitsReturned: number
  sales: BillSale[]
  returns: BillReturn[]
}
interface GRNBill {
  grnId: string
  grnNumber: string
  items: BillItem[]
}

// ─── Record Payment Dialog ────────────────────────────────────
// Records a payment against a single GRN's invoice (POST /suppliers/:id/payment
// with grnIds). Mirrors the customer collect-payment form.
function GRNPaymentDialog({
  grn,
  onClose,
  onSuccess,
}: {
  grn: GRN
  onClose: () => void
  onSuccess: () => void | Promise<void>
}) {
  const balance = grnBalance(grn)
  const invoiceAmount = Number(grn.supplierInvoiceAmount || 0)
  const paidAmount = Number(grn.amountPaid || 0)
  const [mode, setMode] = useState<'CASH' | 'CHEQUE' | 'NEFT_UPI'>('CASH')
  const [amount, setAmount] = useState(balance ? String(balance) : '')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const amt = parseFloat(amount)
  const validAmt = Number.isFinite(amt) && amt > 0 && amt <= balance + 0.01
  const remainingAfter = Math.max(0, balance - (Number.isFinite(amt) ? amt : 0))
  const settlesInFull = validAmt && remainingAfter <= 0.01

  const submit = async () => {
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (amt > balance + 0.01) {
      toast.error(`Amount exceeds balance (${formatCurrency(balance)})`)
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post(`/suppliers/${grn.supplierId}/payment`, {
        amount: amt,
        paymentMode: mode,
        referenceNumber: reference || undefined,
        grnIds: [grn.id],
      })
      toast.success(`Payment recorded · ${res.data?.paymentNumber ?? ''}`)
      await onSuccess()
      onClose()
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to record payment'
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md gap-0 overflow-hidden p-0">
        {/* Header — emerald wallet badge matches the Record Payment action */}
        <DialogHeader className="space-y-0 border-b border-border/40 px-5 py-4 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">Record Payment</DialogTitle>
              <DialogDescription className="truncate font-mono text-xs">
                {grn.grnNumber} · {grn.supplierName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className={cn(
            'overflow-hidden rounded-xl border',
            balance > 0.01
              ? 'border-amber-300/40 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20'
              : 'border-emerald-300/40 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20',
          )}>
            <div className="px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Balance Due</p>
              <p className={cn(
                'mt-0.5 font-mono text-2xl font-bold tabular-nums',
                balance > 0.01 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
              )}>
                {formatCurrency(balance)}
              </p>
            </div>
            <div className="flex items-stretch border-t border-border/30">
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</p>
                <p className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums">{formatCurrency(invoiceAmount)}</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/30 px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Paid</p>
                <p className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(paidAmount)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'CASH' | 'CHEQUE' | 'NEFT_UPI')}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="NEFT_UPI">NEFT / UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</Label>
                {balance > 0.01 && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(balance))}
                    className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    Pay full
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/40">₹</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-9 pl-6 font-mono text-sm font-semibold"
                  value={amount}
                  max={balance}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {mode === 'CHEQUE' ? 'Cheque Number' : mode === 'NEFT_UPI' ? 'UPI / Transaction Ref' : 'Reference'}
              {mode === 'CASH' && <span className="ml-1 font-normal normal-case text-muted-foreground/60">(optional)</span>}
            </Label>
            <Input
              type="text"
              placeholder={mode === 'CHEQUE' ? 'e.g. 004521' : mode === 'NEFT_UPI' ? 'UPI ref / UTR number' : 'Optional note'}
              className="h-9 text-sm"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {validAmt && (
            <p className="text-[11px] text-muted-foreground">
              Balance after this payment:{' '}
              <span className="font-mono font-semibold text-foreground">{formatCurrency(remainingAfter)}</span>
              {settlesInFull && (
                <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">· settles in full</span>
              )}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border/40 px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            onClick={submit}
            disabled={submitting || !validAmt || balance <= 0}
          >
            <Wallet className="h-4 w-4" />
            {submitting ? 'Saving…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── GRN Detail Content ───────────────────────────────────────
// The full-page body for a Purchase Entry — extracted from the old list-page
// drawer. The host page renders the GRN number + status header + Back button.
export function GRNDetailContent({
  grn, allGrns, onRefresh,
}: {
  grn: GRN
  allGrns: GRN[]
  onRefresh: () => void | Promise<void>
}) {
  const businessProfile = useSettingsStore(s => s.businessProfile)
  const orgName = businessProfile?.name || 'Hospital Suppliers'
  const orgSub = businessProfile?.address?.split(',').slice(-2).join(',').trim() || ''
  const [shortBillingOpen, setShortBillingOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  // View Bill — lazy-loaded sales & returns history for this PE's products.
  const [billOpen, setBillOpen] = useState(false)
  const [bill, setBill] = useState<GRNBill | null>(null)
  const [billLoading, setBillLoading] = useState(false)
  const [billError, setBillError] = useState(false)
  // Which product row in the Sales & Returns table is expanded (only one open at
  // a time). Persisted per-GRN so it's restored when returning from a product /
  // customer / invoice link opened out of the sub-table.
  const [expandedKey, setExpandedKey] = usePersistedState<string | null>(
    `grn.bill.expanded:${grn.id}`,
    null,
  )
  const toggleRow = (key: string) =>
    setExpandedKey((prev) => (prev === key ? null : key))

  const toggleBill = async () => {
    const next = !billOpen
    setBillOpen(next)
    if (next && !bill && !billLoading) {
      setBillLoading(true)
      setBillError(false)
      try {
        const res = await api.get(`/grn/${grn.id}/bill`)
        setBill(res.data)
      } catch {
        setBillError(true)
      } finally {
        setBillLoading(false)
      }
    }
  }

  const paidAmount = Number(grn.amountPaid || 0)
  const balanceDue = grnBalance(grn)
  const totalOrdered   = grn.items.reduce((s, i) => s + i.orderedQty, 0)
  const totalReceived  = grn.items.reduce((s, i) => s + i.receivedQty, 0)
  const totalFree      = grn.items.reduce((s, i) => s + (i.freeQty ?? 0), 0)
  const totalDamaged   = grn.items.reduce((s, i) => s + (i.damageQty ?? 0), 0)
  const totalShort     = grn.items.reduce((s, i) => s + Math.max(0, i.orderedQty - i.receivedQty), 0)
  const shortItems     = grn.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty)
  const damagedItems   = grn.items.filter(i => (i.damageQty ?? 0) > 0)
  const hasPO          = !!grn.poId

  // Find sibling GRNs against the same PO (supplementary deliveries)
  const siblingGrns = grn.poId
    ? allGrns.filter(g => g.poId === grn.poId && g.id !== grn.id)
    : []
  const earlierGrns = siblingGrns.filter(g => new Date(g.date).getTime() < new Date(grn.date).getTime())
  const laterGrns = siblingGrns.filter(g => new Date(g.date).getTime() >= new Date(grn.date).getTime())
  const isSupplementary = earlierGrns.length > 0
  const shortageDebitNotes = (grn.purchaseReturns ?? []).filter(pr =>
    /short|excess/i.test(pr.reason ?? '')
  )
  const resolvedShortages = shortItems
    .map(it => {
      const missingQty = it.orderedQty - it.receivedQty
      const fulfilledQty = laterGrns.reduce((s, g) => {
        return s + g.items
          .filter(gi => gi.productId === it.productId)
          .reduce((acc, gi) => acc + gi.receivedQty + (gi.freeQty ?? 0), 0)
      }, 0)
      const resolvingGrns = laterGrns
        .filter(g => g.items.some(gi => gi.productId === it.productId && gi.receivedQty > 0))
        .map(g => g.grnNumber)
      const debitedQty = shortageDebitNotes.reduce((s, pr) => {
        return s + pr.items
          .filter(pi => pi.productId === it.productId)
          .reduce((acc, pi) => acc + pi.returnedQty, 0)
      }, 0)
      const resolvingDebitNotes = shortageDebitNotes
        .filter(pr => pr.items.some(pi => pi.productId === it.productId && pi.returnedQty > 0))
        .map(pr => pr.debitNoteNo)
      const totalResolved = fulfilledQty + debitedQty
      return {
        item: it,
        missingQty,
        fulfilledQty,
        debitedQty,
        resolved: totalResolved >= missingQty,
        resolvingGrns,
        resolvingDebitNotes,
        resolvedBy: resolvingDebitNotes.length > 0 && fulfilledQty === 0 ? 'debit' : 'goods' as 'debit' | 'goods',
      }
    })
    .filter(r => r.resolved && (r.resolvingGrns.length > 0 || r.resolvingDebitNotes.length > 0))

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return

    const itemRows = grn.items.map((item, i) => {
      const short     = Math.max(0, item.orderedQty - item.receivedQty)
      const damaged   = item.damageQty ?? 0
      const lineValue = (item.receivedQty + (item.freeQty ?? 0)) * item.purchaseRate
      const days      = item.expiryDate ? Math.floor((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) : null
      const expLabel  = item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN') : '—'
      const expColor  = days !== null && days < 0 ? '#dc2626' : days !== null && days <= 90 ? '#d97706' : '#374151'
      const rowBg     = damaged > 0 ? '#fff1f2' : short > 0 ? '#fffbeb' : i % 2 === 0 ? '#f9fafb' : '#ffffff'
      return `<tr style="background:${rowBg}">
        <td class="center muted">${i + 1}</td>
        <td class="bold">${item.productName}</td>
        <td class="mono">${item.batchNumber}</td>
        <td class="right muted">${item.orderedQty > 0 ? item.orderedQty : '—'}</td>
        <td class="right mono bold" style="color:#059669">+${item.receivedQty}</td>
        <td class="right mono" style="color:#2563eb">${(item.freeQty ?? 0) > 0 ? '+' + item.freeQty : '—'}</td>
        <td class="right mono bold" style="color:${damaged > 0 ? '#dc2626' : '#9ca3af'}">${damaged > 0 ? damaged : '—'}</td>
        <td class="right mono bold" style="color:${short > 0 ? '#d97706' : '#059669'}">${short > 0 ? '−' + short : '✓ Full'}</td>
        <td class="right mono">₹${Number(item.purchaseRate).toFixed(2)}</td>
        <td class="right mono muted">₹${Number(item.mrp).toFixed(2)}</td>
        <td class="right mono bold">₹${lineValue.toFixed(2)}</td>
        <td class="mono" style="color:${expColor}">${expLabel}${days !== null && days < 0 ? ' ⚠' : days !== null && days <= 90 ? ' ⚡' : ''}</td>
      </tr>`
    }).join('')

    const alerts = [
      shortItems.length > 0
        ? `<div class="alert alert-amber"><span class="alert-icon">⚠</span><div><b>Short Supply — ${totalShort} unit${totalShort !== 1 ? 's' : ''} missing</b><br>${shortItems.map(i => `${i.productName}: ordered ${i.orderedQty}, received ${i.receivedQty} (short ${i.orderedQty - i.receivedQty})`).join(' &nbsp;·&nbsp; ')}</div></div>` : '',
      damagedItems.length > 0
        ? `<div class="alert alert-red"><span class="alert-icon">✗</span><div><b>Damaged Goods — ${totalDamaged} unit${totalDamaged !== 1 ? 's' : ''} — raise Purchase Return</b><br>${damagedItems.map(i => `${i.productName}: ${i.damageQty} damaged`).join(' &nbsp;·&nbsp; ')}</div></div>` : '',
    ].join('')

    const totalLineValueP = grn.items.reduce((s, i) => s + (i.receivedQty + (i.freeQty ?? 0)) * i.purchaseRate, 0)

    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>PE — ${grn.grnNumber}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111827; background: #fff; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 3px solid #1d4ed8; }
    .org-name { font-size: 18px; font-weight: 800; color: #1d4ed8; letter-spacing: -0.3px; }
    .org-sub  { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .doc-title { font-size: 13px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 1px; text-align: center; }
    .doc-grn  { font-size: 20px; font-weight: 800; font-family: 'Courier New', monospace; color: #1d4ed8; text-align: center; margin-top: 3px; }
    .print-meta { font-size: 10px; color: #9ca3af; text-align: right; line-height: 1.6; }
    .info-row { display: flex; gap: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    .info-cell { flex: 1; padding: 10px 14px; border-right: 1px solid #e5e7eb; }
    .info-cell:last-child { border-right: none; }
    .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 3px; }
    .info-value { font-size: 13px; font-weight: 600; color: #111827; }
    .badge { display: inline-block; background: #dbeafe; color: #1d4ed8; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 700; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat { border-radius: 8px; padding: 12px 14px; border: 1.5px solid #e5e7eb; }
    .stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 6px; }
    .stat-value { font-size: 26px; font-weight: 800; font-family: 'Courier New', monospace; line-height: 1; }
    .stat-sub { font-size: 10px; color: #9ca3af; margin-top: 4px; }
    .alert { display: flex; align-items: flex-start; gap: 10px; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; font-size: 11px; }
    .alert-amber { background: #fffbeb; border: 1.5px solid #fcd34d; color: #78350f; }
    .alert-red   { background: #fff1f2; border: 1.5px solid #fca5a5; color: #7f1d1d; }
    .alert-icon  { font-size: 14px; margin-top: 1px; flex-shrink: 0; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1d4ed8; }
    th { padding: 9px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; text-align: right; white-space: nowrap; }
    th:nth-child(1) { text-align: center; width: 36px; }
    th:nth-child(2) { text-align: left; }
    th:nth-child(3) { text-align: left; }
    td { padding: 9px 10px; font-size: 11.5px; border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    .right  { text-align: right; }
    .center { text-align: center; }
    .mono   { font-family: 'Courier New', monospace; }
    .bold   { font-weight: 600; }
    .muted  { color: #6b7280; }
    .totals-row td { background: #f9fafb; font-weight: 700; border-top: 2px solid #e5e7eb; font-size: 12px; }
    .doc-footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer-left { font-size: 10px; color: #6b7280; line-height: 1.8; }
    .footer-sig  { text-align: right; font-size: 10px; color: #6b7280; }
    .sig-line    { border-top: 1px solid #374151; width: 140px; padding-top: 4px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="doc-header">
    <div>
      <div class="org-name">${orgName}</div>
      <div class="org-sub">${orgSub}</div>
    </div>
    <div style="text-align:center">
      <div class="doc-title">Purchase Entry</div>
      <div class="doc-grn">${grn.grnNumber}</div>
    </div>
    <div class="print-meta">
      Printed: ${new Date().toLocaleDateString('en-IN')}<br/>
      ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}<br/>
      <span class="badge ${hasPO ? '' : 'badge-green'}">${hasPO ? 'Against PO' : 'Direct Entry'}</span>
    </div>
  </div>
  <div class="info-row">
    <div class="info-cell"><div class="info-label">Supplier</div><div class="info-value">${grn.supplierName}</div></div>
    <div class="info-cell"><div class="info-label">PE Date</div><div class="info-value">${formatDate(grn.date)}</div></div>
    <div class="info-cell"><div class="info-label">Invoice Number</div><div class="info-value">${grn.supplierInvoiceNo || '—'}</div></div>
    <div class="info-cell"><div class="info-label">Invoice Date</div><div class="info-value">${grn.supplierInvoiceDate ? formatDate(grn.supplierInvoiceDate) : '—'}</div></div>
    <div class="info-cell"><div class="info-label">Invoice Amount</div><div class="info-value">₹${(grn.supplierInvoiceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
    <div class="info-cell"><div class="info-label">PE Total</div><div class="info-value" style="color:#1d4ed8">₹${(grn.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
  </div>
  <div class="stats">
    <div class="stat">
      <div class="stat-label">Products</div>
      <div class="stat-value">${grn.items.length}</div>
      <div class="stat-sub">${grn.items.length} line item${grn.items.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Ordered</div>
      <div class="stat-value" style="color:#6b7280">${totalOrdered > 0 ? totalOrdered : '—'}</div>
      <div class="stat-sub">units requested</div>
    </div>
    <div class="stat" style="border-color:#6ee7b7">
      <div class="stat-label">Received</div>
      <div class="stat-value" style="color:#059669">+${totalReceived}</div>
      <div class="stat-sub">${totalFree > 0 ? `incl. +${totalFree} free` : 'added to stock'}</div>
    </div>
    <div class="stat" style="border-color:${totalDamaged > 0 ? '#fca5a5' : '#e5e7eb'}">
      <div class="stat-label">Damaged</div>
      <div class="stat-value" style="color:${totalDamaged > 0 ? '#dc2626' : '#9ca3af'}">${totalDamaged > 0 ? totalDamaged : '—'}</div>
      <div class="stat-sub">${totalDamaged > 0 ? 'raise purchase return' : 'no damage'}</div>
    </div>
    <div class="stat" style="border-color:#bfdbfe">
      <div class="stat-label">Invoice Value</div>
      <div class="stat-value" style="color:#1d4ed8;font-size:20px">₹${(grn.supplierInvoiceAmount || grn.totalAmount || 0).toLocaleString('en-IN')}</div>
      <div class="stat-sub">PE Total: ₹${(grn.totalAmount || 0).toLocaleString('en-IN')}</div>
    </div>
  </div>
  ${alerts}
  <div class="section-title">Receipt Line Items</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th style="text-align:left">Product</th>
        <th style="text-align:left">Batch No.</th>
        <th>Ordered</th>
        <th>Received</th>
        <th>Free Qty</th>
        <th>Damaged</th>
        <th>Short</th>
        <th>Purchase Rate</th>
        <th>MRP</th>
        <th>Line Value</th>
        <th style="text-align:left">Expiry Date</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="totals-row">
        <td colspan="3" style="text-align:left;padding-left:10px">TOTALS</td>
        <td class="right mono">${totalOrdered}</td>
        <td class="right mono" style="color:#059669">+${totalReceived}</td>
        <td class="right mono" style="color:#2563eb">${totalFree > 0 ? '+' + totalFree : '—'}</td>
        <td class="right mono" style="color:${totalDamaged > 0 ? '#dc2626' : '#9ca3af'}">${totalDamaged > 0 ? totalDamaged : '—'}</td>
        <td class="right mono" style="color:${totalShort > 0 ? '#d97706' : '#059669'}">${totalShort > 0 ? '−' + totalShort : '✓'}</td>
        <td colspan="2"></td>
        <td class="right mono" style="color:#1d4ed8">₹${totalLineValueP.toFixed(2)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div class="doc-footer">
    <div class="footer-left">
      <b>${orgName}</b><br/>
      PE: ${grn.grnNumber} &nbsp;·&nbsp; Date: ${formatDate(grn.date)}<br/>
      This is a system-generated document.
    </div>
    <div class="footer-sig">
      <div class="sig-line">Authorised Signatory</div>
    </div>
  </div>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 400)
  }

  const totalLineValue = grn.items.reduce((s, i) => s + (i.receivedQty + (i.freeQty ?? 0)) * i.purchaseRate, 0)

  return (
    <div className="space-y-4">
      {/* ── Top action row: descriptive badges + actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={hasPO ? 'info' : 'secondary'} size="sm">{hasPO ? 'Against PO' : 'Direct Entry'}</Badge>
          {isSupplementary && <Badge variant="purple" size="sm">Supplementary</Badge>}
          {totalDamaged > 0 && <Badge variant="destructive" size="sm">{totalDamaged} Damaged</Badge>}
          {totalShort > 0 && resolvedShortages.length < shortItems.length && <Badge variant="warning" size="sm">{totalShort} Short</Badge>}
          {resolvedShortages.length > 0 && resolvedShortages.length === shortItems.length && <Badge variant="success" size="sm">Resolved</Badge>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!grn.isReplacement && balanceDue > 0.01 && (
            <Button
              size="sm"
              className="gap-1.5 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              onClick={() => setPayOpen(true)}
            >
              <Wallet className="h-3.5 w-3.5" />
              Record Payment
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => navigate(`/purchase/grn?grnId=${grn.id}`)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Info row — Supplier / PE Date / Invoice # / Invoice Date / Invoice Amount */}
      <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
        {[
          { label: 'Supplier', value: grn.supplierName, icon: <Truck className="h-3 w-3 text-muted-foreground/60" /> },
          { label: 'PE Date', value: formatDate(grn.date), icon: <Calendar className="h-3 w-3 text-muted-foreground/60" /> },
          { label: 'Invoice #', value: grn.supplierInvoiceNo || '—', icon: <FileText className="h-3 w-3 text-muted-foreground/60" /> },
          { label: 'Invoice Date', value: grn.supplierInvoiceDate ? formatDate(grn.supplierInvoiceDate) : '—' },
          { label: 'Invoice Amount', value: formatCurrency(grn.supplierInvoiceAmount || 0) },
        ].map((c, i) => (
          <div key={c.label} className={cn('flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3', i > 0 && 'border-l border-border/40')}>
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              {c.icon}
              {c.label}
            </p>
            <p className="mt-0.5 text-sm font-medium truncate" title={c.value}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Payment panel — invoice / paid / balance / status */}
      {grn.isReplacement ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <PackageCheck className="h-4 w-4 shrink-0" />
          Replacement PE — stock-back, no payable to the supplier.
        </div>
      ) : (
        <div className={cn(
          'flex items-stretch overflow-x-auto rounded-xl border',
          balanceDue > 0.01
            ? 'border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/40'
            : 'border-emerald-300/40 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800/40',
        )}>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">Balance Due</p>
            <p className={cn(
              'text-2xl font-bold font-mono mt-0.5',
              balanceDue > 0.01 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
            )}>
              {formatCurrency(balanceDue)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
              {balanceDue > 0.01 ? 'still owed to supplier' : 'fully settled'}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/30 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Invoice Amount</p>
            <p className="mt-0.5 font-mono text-sm font-semibold">{formatCurrency(grn.supplierInvoiceAmount || 0)}</p>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/30 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Paid</p>
            <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(paidAmount)}</p>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/30 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">PE Total</p>
            <p className="mt-0.5 font-mono text-sm font-semibold">{formatCurrency(grn.totalAmount || 0)}</p>
          </div>
        </div>
      )}

      {/* Alert banners — conditional */}
      {(shortItems.length > 0 || damagedItems.length > 0 || resolvedShortages.length > 0) && (
        <div className="flex flex-col gap-2">
          {resolvedShortages.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300/60 bg-emerald-50/60 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Shortage Resolved</p>
                {resolvedShortages.map((r, idx) => (
                  <span key={idx} className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                    {r.item.productName}: {r.missingQty} short → {
                      r.resolvedBy === 'debit'
                        ? `debit note ${r.resolvingDebitNotes.map(n => n.split('-').slice(-1)[0]).join(', ')}`
                        : `PE ${r.resolvingGrns.map(n => n.split('-').slice(-1)[0]).join(', ')}`
                    }
                  </span>
                ))}
              </div>
            </div>
          )}
          {shortItems.length > 0 && resolvedShortages.length < shortItems.length && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/10">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Short Supply — {totalShort} unit{totalShort !== 1 ? 's' : ''}</p>
              <div className="flex flex-wrap gap-1">
                {shortItems.map((it, idx) => (
                  <span key={idx} className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    {it.productName} ({it.orderedQty}→{it.receivedQty})
                  </span>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto gap-1 text-amber-700 border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 h-7 px-2.5 text-[11px]"
                onClick={() => setShortBillingOpen(true)}
              >
                <FileText className="h-3 w-3" /> Raise Short-Billing Debit Note
              </Button>
            </div>
          )}
          {damagedItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-rose-300/60 bg-rose-50/60 px-4 py-3 dark:border-rose-800/40 dark:bg-rose-900/10">
              <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Damaged — {totalDamaged} unit{totalDamaged !== 1 ? 's' : ''}</p>
              <div className="flex flex-wrap gap-1">
                {damagedItems.map((it, idx) => (
                  <span key={idx} className="rounded-full bg-rose-100 dark:bg-rose-900/30 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                    {it.productName} ({it.damageQty})
                  </span>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto gap-1 text-rose-600 border-rose-300 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 h-7 px-2.5 text-[11px]"
                onClick={() => navigate(`/purchase/returns?grnId=${grn.id}`)}
              >
                <RotateCcw className="h-3 w-3" /> Raise Return
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Items table */}
      <div className="overflow-hidden rounded-xl border border-border/40">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-b border-border/40 hover:bg-transparent">
                <TableHead className="h-10 w-10 px-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ordered</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Received</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Free</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Damaged</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Short</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">MRP</TableHead>
                <TableHead className="h-10 px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Line Value</TableHead>
                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grn.items.map((item, i) => {
                const short        = Math.max(0, item.orderedQty - item.receivedQty)
                const damaged      = item.damageQty ?? 0
                const days         = item.expiryDate ? daysUntilExpiry(item.expiryDate) : null
                const expired      = days !== null && days < 0
                const expiringSoon = days !== null && days >= 0 && days <= 90
                const lineValue    = (item.receivedQty + (item.freeQty ?? 0)) * item.purchaseRate
                return (
                  <TableRow key={i} className={cn(
                    'border-b border-border/30 last:border-b-0',
                    damaged > 0 && 'bg-rose-50/40 dark:bg-rose-950/10',
                    short > 0 && !damaged && 'bg-amber-50/40 dark:bg-amber-950/10',
                  )}>
                    <TableCell className="px-2 py-3 text-center text-sm text-muted-foreground font-mono">{i + 1}</TableCell>
                    <TableCell className="px-3 py-3">
                      {/* Product name → product history page */}
                      <button
                        type="button"
                        onClick={() => navigate(`/inventory/product-history?productId=${item.productId}`)}
                        className="text-left text-base font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {item.productName}
                      </button>
                    </TableCell>
                    <TableCell className="px-3 py-3"><span className="font-mono text-sm bg-muted/60 rounded px-2 py-1 whitespace-nowrap">{item.batchNumber}</span></TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono text-muted-foreground">{item.orderedQty > 0 ? item.orderedQty : '—'}</TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono font-bold text-emerald-700 dark:text-emerald-300">+{item.receivedQty}</TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono">
                      {(item.freeQty ?? 0) > 0 ? <span className="text-blue-600 dark:text-blue-400 font-semibold">+{item.freeQty}</span> : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono">
                      {damaged > 0 ? <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400"><XCircle className="h-4 w-4" />{damaged}</span> : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono">
                      {short > 0
                        ? <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400"><AlertTriangle className="h-4 w-4" />−{short}</span>
                        : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm"><CheckCircle2 className="h-4 w-4" />Full</span>
                      }
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono whitespace-nowrap">{formatCurrency(item.purchaseRate)}</TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono text-muted-foreground whitespace-nowrap">{formatCurrency(item.mrp)}</TableCell>
                    <TableCell className="px-3 py-3 text-right text-base font-mono font-semibold whitespace-nowrap">{formatCurrency(lineValue)}</TableCell>
                    <TableCell className="px-3 py-3">
                      {item.expiryDate ? (
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap',
                          expired ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                          : expiringSoon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        )}>
                          {expired ? <XCircle className="h-3.5 w-3.5" /> : expiringSoon ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {new Date(item.expiryDate).toLocaleDateString('en-IN')}
                          {expiringSoon && !expired && ` · ${days}d`}
                          {expired && ' · Expired'}
                        </span>
                      ) : <span className="text-muted-foreground/40 text-sm">—</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Totals — stacked one-by-one, below the table and aligned right. Only
          when it summarises more than one line (for a single item it would
          just repeat the row above). */}
      {grn.items.length > 1 && (
        <div className="flex justify-end">
          <div className="w-full overflow-hidden rounded-xl border border-border/40 sm:w-72">
            <div className="border-b border-border/40 bg-muted/20 px-4 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Totals</p>
            </div>
            <div className="divide-y divide-border/40">
              {[
                { label: 'Products', value: `${grn.items.length}`, tone: '' },
                { label: 'Ordered', value: `${totalOrdered}`, tone: '' },
                { label: 'Received', value: `+${totalReceived}`, tone: 'text-emerald-700 dark:text-emerald-300' },
                { label: 'Free', value: totalFree > 0 ? `+${totalFree}` : '—', tone: totalFree > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground/40' },
                { label: 'Damaged', value: totalDamaged > 0 ? `${totalDamaged}` : '—', tone: totalDamaged > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/40' },
                { label: 'Short', value: totalShort > 0 ? `−${totalShort}` : '—', tone: totalShort > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/40' },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between px-4 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{r.label}</span>
                  <span className={cn('font-mono text-sm font-bold tabular-nums', r.tone)}>{r.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-primary/5 px-4 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Line Value</span>
                <span className="font-mono text-sm font-bold tabular-nums text-primary">{formatCurrency(totalLineValue)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sales & Returns (View Bill) — what happened to the received stock ── */}
      <div className="overflow-hidden rounded-xl border border-border/40">
        <button
          type="button"
          onClick={toggleBill}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            Sales &amp; Returns
            <span className="text-xs font-normal text-muted-foreground">— how much of this stock was sold / returned</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', billOpen && 'rotate-180')} />
        </button>

        {billOpen && (
          <div className="border-t border-border/40 p-4">
            {billLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading sales &amp; returns…
              </div>
            ) : billError ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Couldn&apos;t load the sales history. <button type="button" className="font-medium text-primary hover:underline" onClick={toggleBill}>Retry</button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/40">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expiry</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sold</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Returned</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bill!.items.map((it) => {
                      const key = `${it.productId}-${it.batchNumber}`
                      const txns = [
                        ...it.sales.map((s) => ({
                          key: `s-${s.invoiceId}`, kind: 'sale' as const,
                          doc: s.invoiceNumber, date: s.date, customer: s.customerName,
                          customerId: s.customerId, qty: s.quantity, invoiceId: s.invoiceId,
                        })),
                        ...it.returns.map((r) => ({
                          key: `r-${r.creditNoteId}`, kind: 'return' as const,
                          doc: r.creditNoteNo, date: r.date, customer: r.customerName,
                          customerId: r.customerId, qty: r.returnedQty, invoiceId: r.invoiceId,
                        })),
                      ]
                      const hasTxns = txns.length > 0
                      const isOpen = expandedKey === key
                      return (
                        <Fragment key={key}>
                          {/* Master row — one per received product/batch */}
                          <TableRow
                            className={cn('border-b border-border/30', hasTxns && 'cursor-pointer', isOpen && 'bg-muted/30 hover:bg-muted/30')}
                            onClick={() => hasTxns && toggleRow(key)}
                          >
                            <TableCell className="px-3 py-2.5">
                              <span className="inline-flex items-center gap-1.5">
                                {hasTxns
                                  ? <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                                  : <span className="inline-block w-4 shrink-0" />}
                                {/* Product name → product history. stopPropagation so it
                                    doesn't also toggle the row's sub-table. */}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/inventory/product-history?productId=${it.productId}`) }}
                                  className="text-left text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {it.productName}
                                </button>
                              </span>
                            </TableCell>
                            <TableCell className="px-3 py-2.5 font-mono text-sm text-foreground/80">{it.batchNumber}</TableCell>
                            <TableCell className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(it.expiryDate)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-base tabular-nums">{it.receivedQty}</TableCell>
                            <TableCell className={cn('px-3 py-2.5 text-right font-mono text-base font-semibold tabular-nums', it.unitsSold > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/50')}>{it.unitsSold}</TableCell>
                            <TableCell className={cn('px-3 py-2.5 text-right font-mono text-base font-semibold tabular-nums', it.unitsReturned > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground/50')}>{it.unitsReturned}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-base font-bold tabular-nums text-blue-700 dark:text-blue-400">{it.currentStock}</TableCell>
                          </TableRow>

                          {/* Expanded sub-table — the actual sale / return transactions.
                              Inset, tinted and left-accented so it reads as a child of the
                              row above; scrolls internally so long histories (100s of
                              invoices) never blow out the page. */}
                          {isOpen && hasTxns && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={7} className="bg-muted/40 p-0">
                                <div className="px-3 py-2.5 pl-8">
                                  <div className="flex items-center justify-between px-1 pb-1.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {txns.length} transaction{txns.length === 1 ? '' : 's'}
                                    </p>
                                  </div>
                                  <div className="overflow-hidden rounded-md border-l-2 border-l-primary/50 border-y border-r border-border/60 bg-background">
                                    <div className="max-h-80 overflow-y-auto">
                                      <Table>
                                        <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
                                          <TableRow className="hover:bg-transparent">
                                            <TableHead className="h-8 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                                            <TableHead className="h-8 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</TableHead>
                                            <TableHead className="h-8 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice</TableHead>
                                            <TableHead className="h-8 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                                            <TableHead className="h-8 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {txns.map((t) => (
                                            <TableRow
                                              key={t.key}
                                              onClick={() => navigate(`/customers/invoices/detail?id=${t.invoiceId}`)}
                                              className="cursor-pointer"
                                            >
                                              <TableCell className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</TableCell>
                                              <TableCell className="px-3 py-2 text-xs">
                                                {/* Customer → customer detail. stopPropagation so it doesn't
                                                    open the invoice (the row's default click). */}
                                                {t.customerId ? (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/customers/detail?customerId=${t.customerId}`) }}
                                                    className="text-left font-medium text-blue-600 hover:underline dark:text-blue-400"
                                                  >
                                                    {t.customer}
                                                  </button>
                                                ) : (
                                                  <span>{t.customer}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="px-3 py-2">
                                                <span className="inline-flex items-center gap-1.5">
                                                  {t.kind === 'sale'
                                                    ? <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                    : <Undo2 className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />}
                                                  <span className="font-mono text-xs font-semibold">{t.doc}</span>
                                                </span>
                                              </TableCell>
                                              <TableCell className="px-3 py-2">
                                                <Badge variant={t.kind === 'sale' ? 'success' : 'destructive'} size="sm">
                                                  {t.kind === 'sale' ? 'Sold' : 'Returned'}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className={cn(
                                                'px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums',
                                                t.kind === 'sale' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400',
                                              )}>
                                                {t.kind === 'sale' ? t.qty : `−${t.qty}`}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      <ShortBillingDialog
        open={shortBillingOpen}
        onOpenChange={setShortBillingOpen}
        grn={{
          id: grn.id,
          grnNumber: grn.grnNumber,
          supplierId: grn.supplierId,
          supplierName: grn.supplierName,
        }}
        shortItems={shortItems.map<ShortBillingItem>((it) => ({
          productId: it.productId,
          productName: it.productName,
          shortQty: it.orderedQty - it.receivedQty,
          purchaseRate: Number(it.purchaseRate),
          gstPercent: 12,
          batchNumber: it.batchNumber,
          expiryDate: typeof it.expiryDate === 'string' ? it.expiryDate : new Date(it.expiryDate).toISOString(),
        }))}
        onSuccess={() => onRefresh()}
      />

      {payOpen && (
        <GRNPaymentDialog
          grn={grn}
          onClose={() => setPayOpen(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  )
}
