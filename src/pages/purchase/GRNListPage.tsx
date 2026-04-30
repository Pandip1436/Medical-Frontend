import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  PackageCheck, Search, ChevronLeft, ChevronRight,
  AlertTriangle, Package, Printer, RefreshCw,
  ClipboardList, TrendingUp, Truck, Calendar,
  FileText, CheckCircle2, XCircle, ShieldAlert,
  RotateCcw, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import type { GRN } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────
function fmtGrnNo(raw: string) {
  const seq = raw.split('-').slice(-2).join('-')
  return `HS/GRN/25-26/${seq}`
}

function daysUntilExpiry(expiryDate: string) {
  return Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000)
}

// ─── GRN Detail Dialog ────────────────────────────────────────
function GRNDetailDialog({ grn, allGrns, onClose }: { grn: GRN; allGrns: GRN[]; onClose: () => void }) {
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
      // (a) Goods-based resolution
      const fulfilledQty = laterGrns.reduce((s, g) => {
        const match = g.items.find(gi => gi.productId === it.productId)
        return s + (match ? match.receivedQty + (match.freeQty ?? 0) : 0)
      }, 0)
      const resolvingGrns = laterGrns
        .filter(g => g.items.some(gi => gi.productId === it.productId && gi.receivedQty > 0))
        .map(g => g.grnNumber)
      // (b) Financial resolution via debit note
      const debitedQty = shortageDebitNotes.reduce((s, pr) => {
        const match = pr.items.find(pi => pi.productId === it.productId)
        return s + (match ? match.returnedQty : 0)
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
  <title>GRN — ${fmtGrnNo(grn.grnNumber)}</title>
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
      <div class="org-name">PBIMS</div>
      <div class="org-sub">Hospital Suppliers — HQ Madurai</div>
    </div>
    <div style="text-align:center">
      <div class="doc-title">Goods Receipt Note</div>
      <div class="doc-grn">${fmtGrnNo(grn.grnNumber)}</div>
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
      <b>PBIMS — Hospital Suppliers</b><br/>
      GRN: ${fmtGrnNo(grn.grnNumber)} &nbsp;·&nbsp; Date: ${formatDate(grn.date)}<br/>
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
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-2xl md:w-[95vw] md:max-w-7xl md:h-[92vh] flex flex-col overflow-hidden">

        {/* ══ HEADER ══════════════════════════════════════════════ */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <PackageCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <DialogTitle className="text-base font-bold font-mono tracking-tight">{fmtGrnNo(grn.grnNumber)}</DialogTitle>
              <Badge variant={hasPO ? 'info' : 'secondary'} size="sm">{hasPO ? 'Against PO' : 'Direct Entry'}</Badge>
              {isSupplementary && <Badge variant="purple" size="sm">Supplementary</Badge>}
              {totalDamaged > 0 && <Badge variant="destructive" size="sm">{totalDamaged} Damaged</Badge>}
              {totalShort > 0 && resolvedShortages.length < shortItems.length && <Badge variant="warning" size="sm">{totalShort} Short</Badge>}
              {resolvedShortages.length > 0 && resolvedShortages.length === shortItems.length && <Badge variant="success" size="sm">Shortage Resolved</Badge>}
              <span className="text-muted-foreground/40 hidden sm:inline">·</span>
              <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"><Truck className="h-3 w-3" /><span className="font-medium text-foreground">{grn.supplierName}</span></span>
              <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{formatDate(grn.date)}</span>
              <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3" />{grn.supplierInvoiceNo || '—'}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>

        {/* ══ STATS + PAYMENT ROW ═════════════════════════════════ */}
        <div className="shrink-0 flex border-b border-border/50">

          {/* ── Left: 6 compact stat chips ── */}
          <div className="flex divide-x divide-border/40 flex-1 bg-muted/10">
            {[
              { label: 'Products', value: String(grn.items.length),                                  color: 'text-foreground' },
              { label: 'Ordered',  value: totalOrdered > 0 ? String(totalOrdered) : '—',             color: 'text-foreground' },
              { label: 'Received', value: `+${totalReceived}`,                                       color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Free',     value: totalFree > 0 ? `+${totalFree}` : '—',                     color: totalFree > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground/50' },
              { label: 'Damaged',  value: totalDamaged > 0 ? String(totalDamaged) : '—',             color: totalDamaged > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/50' },
              { label: 'Short',    value: totalShort > 0 ? `−${totalShort}` : '✓ Full',              color: totalShort > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="flex flex-col justify-center px-4 py-2.5 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{s.label}</p>
                <p className={cn('text-base font-bold font-mono leading-tight mt-0.5 whitespace-nowrap', s.color)}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* ── Right: Payment highlight panel ── */}
          <div className="shrink-0 flex border-l border-border/50 bg-emerald-50/60 dark:bg-emerald-950/20">
            {/* Amount we paid */}
            <div className="flex flex-col justify-center px-5 py-2.5 border-r border-border/40">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">We Paid</p>
              <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                {formatCurrency(grn.supplierInvoiceAmount || grn.totalAmount || 0)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Supplier invoice amount</p>
            </div>
            {/* Supporting details */}
            <div className="flex flex-col justify-center gap-1 px-5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 shrink-0">GRN Total</span>
                <span className="font-mono font-semibold text-foreground">{formatCurrency(grn.totalAmount || 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Line Total</span>
                <span className="font-mono font-semibold text-foreground">{formatCurrency(totalLineValue)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Inv. Date</span>
                <span className="font-medium text-foreground">{grn.supplierInvoiceDate ? formatDate(grn.supplierInvoiceDate) : '—'}</span>
              </div>
            </div>
          </div>

        </div>

        {/* ══ ALERT BANNERS ═══════════════════════════════════════ */}
        {(shortItems.length > 0 || damagedItems.length > 0 || resolvedShortages.length > 0) && (
          <div className="shrink-0 px-7 py-2.5 flex flex-wrap gap-2 border-b border-border/40 bg-muted/5">
            {resolvedShortages.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3.5 py-2 dark:border-emerald-800/40 dark:bg-emerald-900/10">
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
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50/60 px-3.5 py-2 dark:border-amber-800/40 dark:bg-amber-900/10">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Short Supply — {totalShort} unit{totalShort !== 1 ? 's' : ''}</p>
                <div className="flex gap-1 ml-1">{shortItems.map((it, idx) => (
                  <span key={idx} className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    {it.productName} ({it.orderedQty}→{it.receivedQty})
                  </span>
                ))}</div>
                <Button size="sm" variant="outline"
                  className="ml-2 gap-1 text-amber-700 border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 h-7 px-2.5 text-[11px]"
                  onClick={() => {
                    const shortPayload = shortItems.map(it => ({
                      productId: it.productId,
                      productName: it.productName,
                      orderedQty: it.orderedQty,
                      receivedQty: it.receivedQty,
                      rate: Number(it.purchaseRate),
                      batchNumber: it.batchNumber,
                      expiryDate: it.expiryDate,
                      gstPercent: 12,
                      supplierId: grn.supplierId,
                      supplierName: grn.supplierName,
                    }))
                    const params = new URLSearchParams({
                      shortageGrnId: grn.id,
                      supplierId: grn.supplierId,
                      supplierName: grn.supplierName,
                      shortItems: JSON.stringify(shortPayload),
                    })
                    onClose()
                    navigate(`/purchase/returns?${params.toString()}`)
                  }}>
                  <FileText className="h-3 w-3" /> Raise Debit Note
                </Button>
              </div>
            )}
            {damagedItems.length > 0 && (
              <div className="flex items-center gap-2.5 rounded-lg border border-rose-300/60 bg-rose-50/60 px-3.5 py-2 dark:border-rose-800/40 dark:bg-rose-900/10">
                <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Damaged — {totalDamaged} unit{totalDamaged !== 1 ? 's' : ''}</p>
                <div className="flex gap-1 ml-1">{damagedItems.map((it, idx) => (
                  <span key={idx} className="rounded-full bg-rose-100 dark:bg-rose-900/30 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                    {it.productName} ({it.damageQty})
                  </span>
                ))}</div>
                <Button size="sm" variant="outline"
                  className="ml-2 gap-1 text-rose-600 border-rose-300 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 h-7 px-2.5 text-[11px]"
                  onClick={() => { onClose(); navigate(`/purchase/returns?grnId=${grn.id}`) }}>
                  <RotateCcw className="h-3 w-3" /> Raise Return
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ══ ITEMS TABLE ═════════════════════════════════════════ */}
        <div className="flex-1 overflow-auto min-h-0">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card border-b-2 border-border/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-7 w-12 text-center">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Free</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
                <TableHead className="text-right">Short</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Line Value</TableHead>
                <TableHead className="pr-7">Expiry</TableHead>
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
                    'h-14 border-b border-border/30',
                    damaged > 0 && 'bg-rose-50/40 dark:bg-rose-950/10',
                    short > 0 && !damaged && 'bg-amber-50/40 dark:bg-amber-950/10',
                  )}>
                    <TableCell className="pl-7 text-center text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                    <TableCell className="font-semibold text-sm">{item.productName}</TableCell>
                    <TableCell><span className="font-mono text-xs bg-muted/60 rounded px-2 py-1">{item.batchNumber}</span></TableCell>
                    <TableCell className="text-right text-sm font-mono text-muted-foreground">{item.orderedQty > 0 ? item.orderedQty : '—'}</TableCell>
                    <TableCell className="text-right text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300">+{item.receivedQty}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {(item.freeQty ?? 0) > 0 ? <span className="text-blue-600 dark:text-blue-400 font-semibold">+{item.freeQty}</span> : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {damaged > 0 ? <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400"><XCircle className="h-3.5 w-3.5" />{damaged}</span> : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {short > 0
                        ? <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />−{short}</span>
                        : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Full</span>
                      }
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">{formatCurrency(item.purchaseRate)}</TableCell>
                    <TableCell className="text-right text-sm font-mono text-muted-foreground">{formatCurrency(item.mrp)}</TableCell>
                    <TableCell className="text-right text-sm font-mono font-semibold">{formatCurrency(lineValue)}</TableCell>
                    <TableCell className="pr-7">
                      {item.expiryDate ? (
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
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
              {/* Totals row */}
              <TableRow className="bg-muted/30 border-t-2 border-border/50 font-semibold">
                <TableCell className="pl-7 text-center text-xs text-muted-foreground" colSpan={3}>TOTALS</TableCell>
                <TableCell className="text-right text-sm font-mono">{totalOrdered}</TableCell>
                <TableCell className="text-right text-sm font-mono text-emerald-700 dark:text-emerald-300">+{totalReceived}</TableCell>
                <TableCell className="text-right text-sm font-mono text-blue-600">{totalFree > 0 ? `+${totalFree}` : '—'}</TableCell>
                <TableCell className="text-right text-sm font-mono text-rose-600">{totalDamaged > 0 ? totalDamaged : '—'}</TableCell>
                <TableCell className="text-right text-sm font-mono text-amber-600">{totalShort > 0 ? `−${totalShort}` : '—'}</TableCell>
                <TableCell colSpan={2} />
                <TableCell className="text-right text-sm font-mono text-primary">{formatCurrency(totalLineValue)}</TableCell>
                <TableCell className="pr-7" />
              </TableRow>
            </TableBody>
          </Table>
        </div>

      </DialogContent>
    </Dialog>
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
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Goods Received</h1>
          <p className="text-sm text-muted-foreground">All purchase receipts — against PO and direct entries</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button size="sm" onClick={() => navigate('/purchase/grn')} className="gap-1.5">
            <PackageCheck className="h-4 w-4" /> New GRN
          </Button>
        </div>
      </div>

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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search GRN #, supplier or invoice..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
        />
      </div>

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
              {search ? 'No GRNs match your search' : 'No goods received yet'}
            </p>
            {!search && <Button size="sm" onClick={() => navigate('/purchase/grn')}>Create First GRN</Button>}
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
                            {fmtGrnNo(grn.grnNumber)}
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

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border/40 px-5 py-3 bg-muted/10">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span> of <span className="font-medium text-foreground">{filtered.length}</span> receipts
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-xs text-muted-foreground px-1">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {selectedGrn && <GRNDetailDialog grn={selectedGrn} allGrns={grns} onClose={() => setSelectedGrn(null)} />}
    </motion.div>
  )
}
