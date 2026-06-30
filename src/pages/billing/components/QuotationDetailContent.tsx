import { Send, ArrowRightLeft, CheckCircle2, XCircle, Share2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CustomerNameLine } from '@/components/shared/CustomerNameLine'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { shareQuotationViaWhatsApp } from '@/lib/pdf/quotationPdf'
import type { Quotation, QuotationStatus } from '../QuotationsPage'

const statusBadgeVariant: Record<QuotationStatus, 'success' | 'warning' | 'info' | 'purple' | 'destructive' | 'secondary'> = {
  CONVERTED: 'success',
  ACCEPTED: 'success',
  SENT: 'info',
  DRAFT: 'secondary',
  REJECTED: 'destructive',
}

const statusLabel: Record<QuotationStatus, string> = {
  CONVERTED: 'Converted',
  ACCEPTED: 'Accepted',
  SENT: 'Sent',
  DRAFT: 'Draft',
  REJECTED: 'Rejected',
}

interface QuotationDetailContentProps {
  quotation: Quotation
  onUpdated: () => void
}

export function QuotationDetailContent({ quotation: qt, onUpdated }: QuotationDetailContentProps) {
  const canMarkSent = qt.status === 'DRAFT'
  const canAccept = qt.status === 'DRAFT' || qt.status === 'SENT'
  const canReject = qt.status === 'DRAFT' || qt.status === 'SENT' || qt.status === 'ACCEPTED'
  const canConvert = qt.status !== 'CONVERTED' && qt.status !== 'REJECTED'

  const handleStatus = async (status: QuotationStatus) => {
    try {
      await api.patch(`/quotations/${qt.id}/status`, { status })
      toast.success(`Quotation ${qt.quotationNumber} marked as ${status.toLowerCase()}`)
      onUpdated()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Status update failed')
    }
  }

  const handleConvert = () => {
    sessionStorage.setItem('quotation_prefill', JSON.stringify({
      quotationId: qt.id,
      quotationNumber: qt.quotationNumber,
      customerId: qt.customerId ?? '',
      customerName: qt.customerName,
      customerPhone: qt.customerPhone ?? '',
      deliveryCharge: Number(qt.deliveryCharge) || 0,
      items: qt.items.map((it) => ({
        productName: it.name,
        quantity: it.qty,
        rate: it.rate,
        amount: it.qty * it.rate,
      })),
    }))
    navigate(`/billing/new?from=quotation&t=${Date.now()}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Meta strip: Customer / Items / Status */}
        <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Customer</p>
            <CustomerNameLine
              name={qt.customerName}
              phone={qt.customerPhone}
              onNameClick={qt.customerId ? () => navigate(`/customers/detail?customerId=${qt.customerId}`) : undefined}
              className="mt-0.5"
            />
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Items</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium whitespace-nowrap">
              <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
              {qt.items.length} {qt.items.length === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Status</p>
            <div className="mt-0.5">
              <Badge variant={statusBadgeVariant[qt.status]} size="sm" dot>
                {statusLabel[qt.status]}
              </Badge>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="overflow-hidden rounded-xl border border-border/40">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
              <TableRow className="border-b border-border/40 hover:bg-transparent">
                <TableHead className="h-9 w-10 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {qt.items.map((item, idx) => (
                <TableRow key={idx} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                  <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="px-3 py-2.5 text-sm font-medium">
                    {item.name}
                    {(item.discountPercent > 0 || item.gstPercent > 0) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        {item.discountPercent > 0 && <span>−{item.discountPercent}% disc</span>}
                        {item.discountPercent > 0 && item.gstPercent > 0 && <span className="text-border">·</span>}
                        {item.gstPercent > 0 && <span>+{item.gstPercent}% GST</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm">{item.qty}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.rate)}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Sticky footer: totals + actions */}
      <div className="shrink-0 border-t border-border/40 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
        {Number(qt.subtotal) > 0 && (
          <div className="flex items-center justify-between px-5 py-1.5 text-xs text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-mono">{formatCurrency(Number(qt.subtotal))}</span>
          </div>
        )}
        {(Number(qt.cgst) > 0 || Number(qt.sgst) > 0) && (
          <div className="flex items-center justify-between px-5 py-1.5 text-xs text-muted-foreground">
            <span>CGST + SGST</span>
            <span className="font-mono">{formatCurrency(Number(qt.cgst) + Number(qt.sgst))}</span>
          </div>
        )}
        {Number(qt.deliveryCharge) > 0 && (
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-2 text-xs text-muted-foreground">
            <span>Delivery / Packaging</span>
            <span className="font-mono">{formatCurrency(Number(qt.deliveryCharge))}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-b border-border/40 bg-primary/5 px-5 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="font-mono text-base font-bold">{formatCurrency(qt.total)}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
          {!canMarkSent && !canAccept && !canReject && !canConvert && (
            <p className="text-xs text-muted-foreground italic">
              No further actions for {statusLabel[qt.status].toLowerCase()} quotations.
            </p>
          )}
          {canReject && (
            <Button variant="outline" className="gap-2 text-rose-700 hover:text-rose-700 dark:text-rose-400" onClick={() => handleStatus('REJECTED')}>
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
          )}
          {canAccept && (
            <Button variant="outline" className="gap-2 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400" onClick={() => handleStatus('ACCEPTED')}>
              <CheckCircle2 className="h-4 w-4" />
              Accept
            </Button>
          )}
          {canMarkSent && (
            <Button className="gap-2" onClick={() => handleStatus('SENT')}>
              <Send className="h-4 w-4" />
              Mark as Sent
            </Button>
          )}
          {canConvert && (
            <Button variant={canMarkSent || canAccept ? 'outline' : 'default'} className="gap-2" onClick={handleConvert}>
              <ArrowRightLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Convert to Invoice</span>
              <span className="sm:hidden">Convert</span>
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => shareQuotationViaWhatsApp(qt, qt.customerPhone)}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>
      </div>
    </div>
  )
}
