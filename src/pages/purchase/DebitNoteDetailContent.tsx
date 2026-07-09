import { useState, useCallback } from 'react'
import { Plus, CheckCircle2, Printer, Download } from 'lucide-react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { printDebitNotePdf, downloadDebitNotePdf } from '@/lib/pdf/notesPdf'
import { useSettingsStore } from '@/stores/settingsStore'
import type { ReturnDetail } from './DebitNotesPage'

// Shared debit-note detail body — used by the standalone detail page. Header
// (DN number, status) is rendered by the host. Self-contained: builds the PDF
// payload + owns the "Mark as Settled" handler, calling `onUpdated` afterwards.
interface DebitNoteDetailContentProps {
  debitNote: ReturnDetail
  onUpdated: () => void
}

export function DebitNoteDetailContent({ debitNote: d, onUpdated }: DebitNoteDetailContentProps) {
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const [submitting, setSubmitting] = useState(false)

  const settlementMode = d.settlementMode ?? 'REFUND'
  const isReplacement = settlementMode === 'REPLACEMENT'
  const isSettled = d.status === 'SETTLED'
  const hasReplacementGrn = !!d.replacementGrnId
  const displaySettlement = isSettled
    ? settlementMode === 'REFUND'
      ? 'Money Refunded'
      : settlementMode === 'REPLACEMENT'
        ? 'Replacement Received'
        : 'Adjusted against Outstanding'
    : settlementMode === 'REFUND'
      ? 'Pending Refund'
      : settlementMode === 'REPLACEMENT'
        ? (hasReplacementGrn ? 'Replacement PE Received' : 'Awaiting Replacement')
        : settlementMode === 'ADJUST'
          ? 'Pending Adjustment'
          : 'Pending'

  const handleSettle = useCallback(async () => {
    setSubmitting(true)
    try {
      await api.patch(`/purchase-returns/${d.id}`, { status: 'SETTLED' })
      toast.success('Debit Note marked as SETTLED')
      onUpdated()
    } catch {
      toast.error('Failed to update status')
    } finally {
      setSubmitting(false)
    }
  }, [d.id, onUpdated])

  const pdfData = {
    noteNo: d.noteNo,
    date: d.date,
    partyLabel: 'Supplier',
    partyName: d.partyName,
    partyPhone: d.supplierPhone ?? undefined,
    partyAddress: d.supplierAddress ?? undefined,
    referenceLabel: 'PE No',
    referenceValue: d.referenceValue,
    reason: d.reason,
    items: (d.items || []).map((it) => ({
      productName: it.productName,
      batchNumber: it.batchNumber,
      expiryDate: it.expiryDate,
      returnedQty: it.returnedQty,
      rate: Number(it.purchaseRate || it.rate || 0),
      gstPercent: Number(it.gstPercent || 0),
      amount: Number(it.amount || 0),
    })),
    subtotal: Number(d.subtotal),
    cgst: d.cgst != null ? Number(d.cgst) : undefined,
    sgst: d.sgst != null ? Number(d.sgst) : undefined,
    totalAmount: Number(d.totalAmount),
    footerLine: `Settlement: ${displaySettlement}`,
    company: businessProfile ? {
      name: businessProfile.name,
      address: businessProfile.address,
      phone: businessProfile.phone,
      email: businessProfile.email,
      gstin: businessProfile.gstin,
    } : undefined,
  }

  const totalsRows = ([
    { label: 'Subtotal', value: Number(d.subtotal) },
    d.cgst != null ? { label: 'CGST', value: Number(d.cgst) } : null,
    d.sgst != null ? { label: 'SGST', value: Number(d.sgst) } : null,
  ].filter(Boolean) as Array<{ label: string; value: number }>)

  return (
    <div className="space-y-5">
      {/* Supplier / PE Reference / Return Reason / Settlement — single row strip */}
      <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Supplier</p>
          {d.supplierId ? (
            <button
              type="button"
              onClick={() => navigate(`/purchase/suppliers/detail?supplierId=${d.supplierId}`)}
              className="mt-0.5 truncate text-left text-sm font-semibold text-sky-600 hover:underline dark:text-sky-400"
              title={d.partyName}
            >
              {d.partyName}
            </button>
          ) : (
            <p className="mt-0.5 text-sm font-medium truncate" title={d.partyName}>{d.partyName}</p>
          )}
          {d.supplierPhone && (
            <p className="font-mono text-[11px] text-muted-foreground truncate">{d.supplierPhone}</p>
          )}
          {d.supplierAddress && (
            <p className="text-[11px] text-muted-foreground truncate" title={d.supplierAddress}>{d.supplierAddress}</p>
          )}
        </div>
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">PE Reference</p>
          <p className="mt-0.5 font-mono text-xs font-medium truncate" title={d.referenceValue}>{d.referenceValue}</p>
        </div>
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Return Reason</p>
          <p className="mt-0.5 text-sm font-medium wrap-break-word" title={d.reason}>{d.reason}</p>
        </div>
        <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Settlement</p>
          <p className={cn(
            'mt-0.5 text-sm font-medium truncate',
            isSettled ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
          )} title={displaySettlement}>
            {displaySettlement}
          </p>
        </div>
      </div>

      {/* Items table */}
      <div className="overflow-x-auto rounded-xl border border-border/40">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
            <TableRow className="border-b border-border/40 hover:bg-transparent">
              <TableHead className="h-9 w-10 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
              <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
              <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
              <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Expiry</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">GST%</TableHead>
              <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(d.items || []).map((it, idx) => {
              const rate = Number(it.purchaseRate || it.rate || 0)
              const gst = Number(it.gstPercent || 0)
              const amount = Number(it.amount) || it.returnedQty * rate
              return (
                <TableRow key={idx} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                  <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="px-3 py-2.5 text-sm font-medium">{it.productName}</TableCell>
                  <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{it.batchNumber || '—'}</TableCell>
                  <TableCell className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {it.expiryDate ? formatDate(it.expiryDate) : '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{it.returnedQty}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(rate)}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{gst}%</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">
                    {formatCurrency(amount)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Totals — single horizontal strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/40 bg-muted/10 px-4 py-2.5">
        {totalsRows.map((row) => (
          <div key={row.label} className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">{row.label}</span>
            <span className="font-mono text-sm tabular-nums">{formatCurrency(row.value)}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2 border-l border-border/40 pl-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-primary">Total Debit</span>
          <span className="font-mono text-lg font-black tabular-nums text-primary">{formatCurrency(d.totalAmount)}</span>
        </div>
      </div>

      {/* ── Actions — sticky bar at the bottom of the viewport ── */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-col gap-2 rounded-b-2xl border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {!isSettled && isReplacement && (
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => {
              const params = new URLSearchParams({
                replacementReturnId: d.id,
                supplierId: d.supplierId ?? '',
                supplierName: d.partyName ?? '',
              })
              navigate(`/purchase/grn?${params.toString()}`)
            }}
          >
            <Plus className="h-4 w-4" />
            Receive Replacement
          </Button>
        )}
        {!isSettled && !isReplacement && (
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSettle} disabled={submitting}>
            <CheckCircle2 className="h-4 w-4" />
            Mark as Settled
          </Button>
        )}
        <Button variant="outline" className="gap-2" onClick={() => printDebitNotePdf(pdfData)}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button className="gap-2" onClick={() => downloadDebitNotePdf(pdfData)}>
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </div>
    </div>
  )
}
