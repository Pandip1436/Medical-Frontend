import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  PackageCheck,
  AlertTriangle, Printer, RefreshCw,
  ClipboardList, TrendingUp, Truck, Calendar,
  FileText, CheckCircle2, XCircle, ShieldAlert,
  RotateCcw,
} from 'lucide-react'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import api from '@/lib/api'
import type { GRN } from '@/types'
import { useSettingsStore } from '@/stores/settingsStore'
import { ShortBillingDialog, type ShortBillingItem } from './ShortBillingDialog'

// ─── Helpers ──────────────────────────────────────────────────
function daysUntilExpiry(expiryDate: string) {
  return Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000)
}

// ─── GRN Detail Dialog ────────────────────────────────────────
function GRNDetailDialog({ grn, allGrns, onClose }: { grn: GRN; allGrns: GRN[]; onClose: () => void }) {
  const businessProfile = useSettingsStore(s => s.businessProfile)
  const orgName = businessProfile?.name || 'Hospital Suppliers'
  const orgSub = businessProfile?.address?.split(',').slice(-2).join(',').trim() || ''
  const [shortBillingOpen, setShortBillingOpen] = useState(false)
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
  // Active debit notes covering shortage (Short delivery / Excess supply reasons, status not REJECTED)
  const shortageDebitNotes = (grn.purchaseReturns ?? []).filter(pr =>
    /short|excess/i.test(pr.reason ?? '')
  )
  // For each short item, check if resolved by:
  //   (a) a later supplementary GRN delivering the missing qty, OR
  //   (b) a debit note covering the shortage (financial closure)
  const resolvedShortages = shortItems
    .map(it => {
      const missingQty = it.orderedQty - it.receivedQty
      // (a) Goods-based resolution. A later GRN can list the same product
      // across multiple line items (different batches), so sum across all.
      const fulfilledQty = laterGrns.reduce((s, g) => {
        return s + g.items
          .filter(gi => gi.productId === it.productId)
          .reduce((acc, gi) => acc + gi.receivedQty + (gi.freeQty ?? 0), 0)
      }, 0)
      const resolvingGrns = laterGrns
        .filter(g => g.items.some(gi => gi.productId === it.productId && gi.receivedQty > 0))
        .map(g => g.grnNumber)
      // (b) Financial resolution via debit note (also sum across line items)
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

    const totalLineValue = grn.items.reduce((s, i) => s + (i.receivedQty + (i.freeQty ?? 0)) * i.purchaseRate, 0)

    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>GRN — ${grn.grnNumber}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111827; background: #fff; }

    /* ── Document header ── */
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 3px solid #1d4ed8; }
    .org-name { font-size: 18px; font-weight: 800; color: #1d4ed8; letter-spacing: -0.3px; }
    .org-sub  { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .doc-title { font-size: 13px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 1px; text-align: center; }
    .doc-grn  { font-size: 20px; font-weight: 800; font-family: 'Courier New', monospace; color: #1d4ed8; text-align: center; margin-top: 3px; }
    .print-meta { font-size: 10px; color: #9ca3af; text-align: right; line-height: 1.6; }

    /* ── Info row ── */
    .info-row { display: flex; gap: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    .info-cell { flex: 1; padding: 10px 14px; border-right: 1px solid #e5e7eb; }
    .info-cell:last-child { border-right: none; }
    .info-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 3px; }
    .info-value { font-size: 13px; font-weight: 600; color: #111827; }
    .badge { display: inline-block; background: #dbeafe; color: #1d4ed8; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 700; }
    .badge-green { background: #d1fae5; color: #065f46; }

    /* ── Summary cards ── */
    .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat { border-radius: 8px; padding: 12px 14px; border: 1.5px solid #e5e7eb; }
    .stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 6px; }
    .stat-value { font-size: 26px; font-weight: 800; font-family: 'Courier New', monospace; line-height: 1; }
    .stat-sub { font-size: 10px; color: #9ca3af; margin-top: 4px; }

    /* ── Alerts ── */
    .alert { display: flex; align-items: flex-start; gap: 10px; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; font-size: 11px; }
    .alert-amber { background: #fffbeb; border: 1.5px solid #fcd34d; color: #78350f; }
    .alert-red   { background: #fff1f2; border: 1.5px solid #fca5a5; color: #7f1d1d; }
    .alert-icon  { font-size: 14px; margin-top: 1px; flex-shrink: 0; }

    /* ── Table ── */
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

    /* ── Totals row ── */
    .totals-row td { background: #f9fafb; font-weight: 700; border-top: 2px solid #e5e7eb; font-size: 12px; }

    /* ── Footer ── */
    .doc-footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer-left { font-size: 10px; color: #6b7280; line-height: 1.8; }
    .footer-sig  { text-align: right; font-size: 10px; color: #6b7280; }
    .sig-line    { border-top: 1px solid #374151; width: 140px; padding-top: 4px; margin-top: 32px; }
  </style>
</head>
<body>

  <!-- Document header -->
  <div class="doc-header">
    <div>
      <div class="org-name">${orgName}</div>
      <div class="org-sub">${orgSub}</div>
    </div>
    <div style="text-align:center">
      <div class="doc-title">Purchase Entry Note</div>
      <div class="doc-grn">${grn.grnNumber}</div>
    </div>
    <div class="print-meta">
      Printed: ${new Date().toLocaleDateString('en-IN')}<br/>
      ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}<br/>
      <span class="badge ${hasPO ? '' : 'badge-green'}">${hasPO ? 'Against PO' : 'Direct Entry'}</span>
    </div>
  </div>

  <!-- Info row -->
  <div class="info-row">
    <div class="info-cell"><div class="info-label">Supplier</div><div class="info-value">${grn.supplierName}</div></div>
    <div class="info-cell"><div class="info-label">GRN Date</div><div class="info-value">${formatDate(grn.date)}</div></div>
    <div class="info-cell"><div class="info-label">Invoice Number</div><div class="info-value">${grn.supplierInvoiceNo || '—'}</div></div>
    <div class="info-cell"><div class="info-label">Invoice Date</div><div class="info-value">${grn.supplierInvoiceDate ? formatDate(grn.supplierInvoiceDate) : '—'}</div></div>
    <div class="info-cell"><div class="info-label">Invoice Amount</div><div class="info-value">₹${(grn.supplierInvoiceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
    <div class="info-cell"><div class="info-label">GRN Total</div><div class="info-value" style="color:#1d4ed8">₹${(grn.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
  </div>

  <!-- Stats -->
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
      <div class="stat-sub">GRN: ₹${(grn.totalAmount || 0).toLocaleString('en-IN')}</div>
    </div>
  </div>

  ${alerts}

  <!-- Items table -->
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
        <td class="right mono" style="color:#1d4ed8">₹${totalLineValue.toFixed(2)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <!-- Footer -->
  <div class="doc-footer">
    <div class="footer-left">
      <b>${orgName}</b><br/>
      GRN: ${grn.grnNumber} &nbsp;·&nbsp; Date: ${formatDate(grn.date)}<br/>
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
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-160 lg:max-w-225 xl:max-w-300 p-0 gap-0 flex flex-col"
        >
          {/* ── Sticky Header ── */}
          <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
            <div className="flex items-center justify-between gap-3 pr-10">
              <div className="flex min-w-0 items-baseline gap-2 flex-wrap">
                <SheetTitle className="font-mono text-base font-semibold truncate">
                  {grn.grnNumber}
                </SheetTitle>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(grn.date)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <Badge variant={hasPO ? 'info' : 'secondary'} size="sm">{hasPO ? 'Against PO' : 'Direct Entry'}</Badge>
                  {isSupplementary && <Badge variant="purple" size="sm">Supplementary</Badge>}
                  {totalDamaged > 0 && <Badge variant="destructive" size="sm">{totalDamaged} Damaged</Badge>}
                  {totalShort > 0 && resolvedShortages.length < shortItems.length && <Badge variant="warning" size="sm">{totalShort} Short</Badge>}
                  {resolvedShortages.length > 0 && resolvedShortages.length === shortItems.length && <Badge variant="success" size="sm">Resolved</Badge>}
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                  onClick={handlePrint}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Info row — Supplier / GRN Date / Invoice # / Invoice Date / Invoice Amount */}
            <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
              {[
                { label: 'Supplier', value: grn.supplierName, icon: <Truck className="h-3 w-3 text-muted-foreground/60" /> },
                { label: 'GRN Date', value: formatDate(grn.date), icon: <Calendar className="h-3 w-3 text-muted-foreground/60" /> },
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

            {/* Payment highlight panel */}
            <div className="flex items-stretch overflow-x-auto rounded-xl border border-emerald-300/40 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800/40">
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">We Paid</p>
                <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {formatCurrency(grn.supplierInvoiceAmount || grn.totalAmount || 0)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">Supplier invoice amount</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-emerald-300/40 dark:border-emerald-800/40 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">GRN Total</p>
                <p className="mt-0.5 font-mono text-sm font-semibold">{formatCurrency(grn.totalAmount || 0)}</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-emerald-300/40 dark:border-emerald-800/40 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Line Total</p>
                <p className="mt-0.5 font-mono text-sm font-semibold">{formatCurrency(totalLineValue)}</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-emerald-300/40 dark:border-emerald-800/40 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Inv. Date</p>
                <p className="mt-0.5 text-sm font-medium whitespace-nowrap">{grn.supplierInvoiceDate ? formatDate(grn.supplierInvoiceDate) : '—'}</p>
              </div>
            </div>

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
                              : `GRN ${r.resolvingGrns.map(n => n.split('-').slice(-1)[0]).join(', ')}`
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
                      onClick={() => { onClose(); navigate(`/purchase/returns?grnId=${grn.id}`) }}
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
                  <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                    <TableRow className="border-b border-border/40 hover:bg-transparent">
                      <TableHead className="h-9 w-10 px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ordered</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Free</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Damaged</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Short</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MRP</TableHead>
                      <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Line Value</TableHead>
                      <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expiry</TableHead>
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
                          <TableCell className="px-2 py-2.5 text-center text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                          <TableCell className="px-3 py-2.5 font-semibold text-sm">{item.productName}</TableCell>
                          <TableCell className="px-3 py-2.5"><span className="font-mono text-xs bg-muted/60 rounded px-2 py-1 whitespace-nowrap">{item.batchNumber}</span></TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono text-muted-foreground">{item.orderedQty > 0 ? item.orderedQty : '—'}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300">+{item.receivedQty}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono">
                            {(item.freeQty ?? 0) > 0 ? <span className="text-blue-600 dark:text-blue-400 font-semibold">+{item.freeQty}</span> : <span className="text-muted-foreground/40">—</span>}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono">
                            {damaged > 0 ? <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400"><XCircle className="h-3.5 w-3.5" />{damaged}</span> : <span className="text-muted-foreground/40">—</span>}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono">
                            {short > 0
                              ? <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />−{short}</span>
                              : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Full</span>
                            }
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono whitespace-nowrap">{formatCurrency(item.purchaseRate)}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono text-muted-foreground whitespace-nowrap">{formatCurrency(item.mrp)}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-mono font-semibold whitespace-nowrap">{formatCurrency(lineValue)}</TableCell>
                          <TableCell className="px-3 py-2.5">
                            {item.expiryDate ? (
                              <span className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
                                expired ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                : expiringSoon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                              )}>
                                {expired ? <XCircle className="h-3 w-3" /> : expiringSoon ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                {new Date(item.expiryDate).toLocaleDateString('en-IN')}
                                {expiringSoon && !expired && ` · ${days}d`}
                                {expired && ' · Expired'}
                              </span>
                            ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* ── Sticky Footer: Totals strip ── */}
          <div className="shrink-0 border-t border-border/40 bg-background">
            <div className="flex items-stretch overflow-x-auto bg-muted/20">
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Totals</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Products</p>
                <p className="mt-0.5 font-mono text-sm font-bold">{grn.items.length}</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Ordered</p>
                <p className="mt-0.5 font-mono text-sm font-bold">{totalOrdered}</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Received</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">+{totalReceived}</p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Free</p>
                <p className={cn('mt-0.5 font-mono text-sm font-bold', totalFree > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground/40')}>
                  {totalFree > 0 ? `+${totalFree}` : '—'}
                </p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Damaged</p>
                <p className={cn('mt-0.5 font-mono text-sm font-bold', totalDamaged > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/40')}>
                  {totalDamaged > 0 ? totalDamaged : '—'}
                </p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Short</p>
                <p className={cn('mt-0.5 font-mono text-sm font-bold', totalShort > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/40')}>
                  {totalShort > 0 ? `−${totalShort}` : '—'}
                </p>
              </div>
              <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 bg-primary/5 px-3 py-2 whitespace-nowrap">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Line Value</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-primary">{formatCurrency(totalLineValue)}</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
        onSuccess={() => onClose()}
      />
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────
const PAGE_SIZE = 15

export default function GRNListPage() {
  const [grns, setGrns] = useState<GRN[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedGrn, setSelectedGrn] = useState<GRN | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/grn')
      setGrns(res.data)
    } catch {
      toast.error('Failed to load GRN list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Deep-link support: open the GRN drawer when arrived with `?grnId=<id>`
  // (e.g. from the Supplier Detail page's GRNs tab). Runs only when URL param
  // or the loaded list changes.
  const { search: routeSearch } = useRoute()
  useEffect(() => {
    const params = new URLSearchParams(routeSearch)
    const target = params.get('grnId')
    if (!target || grns.length === 0) return
    if (selectedGrn?.id === target) return
    const match = grns.find((g) => g.id === target)
    if (match) setSelectedGrn(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch, grns])

  const filtered = useMemo(() => {
    if (!search.trim()) return grns
    const q = search.toLowerCase()
    return grns.filter(g =>
      g.grnNumber.toLowerCase().includes(q) ||
      g.supplierName.toLowerCase().includes(q) ||
      (g.supplierInvoiceNo ?? '').toLowerCase().includes(q)
    )
  }, [grns, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const stats = useMemo(() => {
    const totalReceived = grns.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.receivedQty + (i.freeQty ?? 0), 0), 0)
    const totalDamaged  = grns.reduce((s, g) => s + g.items.reduce((ss, i) => ss + (i.damageQty ?? 0), 0), 0)
    const totalShort    = grns.reduce((s, g) => s + g.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty).length, 0)
    return { totalReceived, totalDamaged, totalShort }
  }, [grns])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total GRNs',    value: grns.length,        icon: ClipboardList, color: 'text-primary',                              bg: 'bg-primary/10',         border: 'border-l-primary' },
          { label: 'Units Received',value: stats.totalReceived, icon: TrendingUp,    color: 'text-emerald-600 dark:text-emerald-400',    bg: 'bg-emerald-500/10',     border: 'border-l-emerald-500' },
          { label: 'Short Items',   value: stats.totalShort,    icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400',         bg: 'bg-amber-500/10',       border: 'border-l-amber-500' },
          { label: 'Damaged Units', value: stats.totalDamaged,  icon: ShieldAlert,   color: 'text-rose-600 dark:text-rose-400',           bg: 'bg-rose-500/10',        border: 'border-l-rose-500' },
        ].map(s => (
          <Card key={s.label} className={cn('border-l-[3px]', s.border)}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.bg)}>
                <s.icon className={cn('h-4 w-4', s.color)} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className={cn('text-xl font-bold font-mono leading-tight', s.color)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + actions */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={(val) => { setSearch(val); setCurrentPage(1) }}
        searchPlaceholder="Search GRN #, supplier or invoice..."
        resultsCount={filtered.length}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              className="border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={load}
            >
              <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
              onClick={() => navigate('/purchase/grn')}
            >
              <PackageCheck className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">New GRN</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        }
      />

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <CardContent className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
          </CardContent>
        ) : paged.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <PackageCheck className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {search ? 'No entries match your search' : 'No purchases received yet'}
            </p>
            {!search && <Button size="sm" onClick={() => navigate('/purchase/grn')}>Create First Entry</Button>}
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="pl-5">GRN #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-center">Products</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-center">Damaged</TableHead>
                    <TableHead className="text-center">Short</TableHead>
                    <TableHead className="text-right pr-5">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(grn => {
                    const totalRcv  = grn.items.reduce((s, i) => s + i.receivedQty + (i.freeQty ?? 0), 0)
                    const dmg       = grn.items.reduce((s, i) => s + (i.damageQty ?? 0), 0)
                    const shortItemsRow = grn.items.filter(i => i.orderedQty > 0 && i.receivedQty < i.orderedQty)
                    const shortCnt  = shortItemsRow.length
                    // Check if shortages are resolved by later supplementary GRNs against same PO
                    const laterGrnsRow = grn.poId
                      ? grns.filter(g => g.poId === grn.poId && g.id !== grn.id && new Date(g.date).getTime() >= new Date(grn.date).getTime())
                      : []
                    // Check if debit notes cover the shortage
                    const shortageDNsRow = (grn.purchaseReturns ?? []).filter(pr =>
                      /short|excess/i.test(pr.reason ?? '')
                    )
                    const resolvedCount = shortItemsRow.filter(it => {
                      const missing = it.orderedQty - it.receivedQty
                      const fulfilled = laterGrnsRow.reduce((s, g) => {
                        const m = g.items.find(gi => gi.productId === it.productId)
                        return s + (m ? m.receivedQty + (m.freeQty ?? 0) : 0)
                      }, 0)
                      const debited = shortageDNsRow.reduce((s, pr) => {
                        const m = pr.items.find(pi => pi.productId === it.productId)
                        return s + (m ? m.returnedQty : 0)
                      }, 0)
                      return (fulfilled + debited) >= missing
                    }).length
                    const allResolved = shortCnt > 0 && resolvedCount === shortCnt
                    const hasPO     = !!grn.poId
                    const hasIssues = dmg > 0 || (shortCnt > 0 && !allResolved)
                    return (
                      <TableRow
                        key={grn.id}
                        className={cn(
                          'cursor-pointer transition-colors',
                          hasIssues ? 'hover:bg-amber-50/30 dark:hover:bg-amber-950/10' : 'hover:bg-muted/30'
                        )}
                        onClick={() => setSelectedGrn(grn)}
                      >
                        <TableCell className="pl-5">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {grn.grnNumber}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(grn.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                              {grn.supplierName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">{grn.supplierName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {grn.supplierInvoiceNo || <span className="opacity-40">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={hasPO ? 'info' : 'secondary'} size="sm">
                            {hasPO ? 'Against PO' : 'Direct'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono font-semibold">{grn.items.length}</TableCell>
                        <TableCell className="text-right">
                          <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">+{totalRcv}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {dmg > 0
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-0.5 text-[10px] font-bold">
                                <XCircle className="h-2.5 w-2.5" />{dmg}
                              </span>
                            : <span className="text-muted-foreground/40 text-xs">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-center">
                          {shortCnt > 0
                            ? allResolved
                              ? <span
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold"
                                  title="Shortage resolved by later supplementary delivery"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />Resolved
                                </span>
                              : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold">
                                  <AlertTriangle className="h-2.5 w-2.5" />{shortCnt}
                                </span>
                            : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[10px]">
                                <CheckCircle2 className="h-3 w-3" />Full
                              </span>
                          }
                        </TableCell>
                        <TableCell className="text-right pr-5">
                          <span className="text-sm font-semibold font-mono">{formatCurrency(grn.supplierInvoiceAmount || grn.totalAmount)}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              itemsPerPage={PAGE_SIZE}
              className="border-t border-border/40 px-5"
            />
          </>
        )}
      </Card>

      {selectedGrn && <GRNDetailDialog grn={selectedGrn} allGrns={grns} onClose={() => setSelectedGrn(null)} />}
    </motion.div>
  )
}
