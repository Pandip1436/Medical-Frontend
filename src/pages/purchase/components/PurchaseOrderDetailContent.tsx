import { Download, Package, PackageCheck, Printer } from 'lucide-react'
import { navigate } from '@/lib/router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { downloadPoPdf, printPoPdf } from '@/lib/pdf/poPdf'
import type { PurchaseOrder } from '@/types'

const statusBadgeConfig: Record<
  string,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' | 'purple' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SENT: { label: 'Sent', variant: 'info' },
  ACKNOWLEDGED: { label: 'Confirmed', variant: 'success' },
  PARTIALLY_RECEIVED: { label: 'Partial', variant: 'warning' },
  FULLY_RECEIVED: { label: 'Received', variant: 'success' },
  CLOSED: { label: 'Closed', variant: 'purple' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

interface PurchaseOrderDetailContentProps {
  purchaseOrder: PurchaseOrder
  onRefresh?: () => void
}

export function PurchaseOrderDetailContent({ purchaseOrder: po, onRefresh }: PurchaseOrderDetailContentProps) {
  const canReceive = po.status === 'SENT' || po.status === 'ACKNOWLEDGED' || po.status === 'PARTIALLY_RECEIVED'
  const isPartial = po.status === 'PARTIALLY_RECEIVED'
  const cfg = statusBadgeConfig[po.status] ?? { label: po.status, variant: 'secondary' as const }

  const poDoc = {
    poNumber: po.poNumber,
    date: po.date,
    supplierName: po.supplierName,
    expectedDelivery: po.expectedDelivery,
    status: po.status,
    totalAmount: po.totalAmount,
    items: po.items,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Meta strip: Supplier / Expected Delivery / Status */}
        <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Supplier</p>
            <p
              className="mt-0.5 cursor-pointer truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              title={po.supplierName}
              onClick={() => navigate(`/purchase/suppliers/detail?supplierId=${po.supplierId}`)}
            >
              {po.supplierName}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Expected Delivery</p>
            <p className="mt-0.5 text-sm font-medium whitespace-nowrap">
              {po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Status</p>
            <div className="mt-0.5">
              <Badge variant={cfg.variant} size="sm" dot>{cfg.label}</Badge>
            </div>
          </div>
        </div>

        {/* Partial delivery banner */}
        {isPartial && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-800/30 dark:bg-amber-900/10">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Partial Delivery in Progress</p>
              <p className="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-400/70">
                Some items have been received. Click "Receive Remaining Goods" to create a supplementary GRN for the rest.
              </p>
            </div>
          </div>
        )}

        {/* Items table */}
        <div className="overflow-hidden rounded-xl border border-border/40">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
              <TableRow className="border-b border-border/40 hover:bg-transparent">
                <TableHead className="h-9 w-10 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                <TableHead className="h-9 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ordered</TableHead>
                <TableHead className="h-9 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((item, idx) => (
                <TableRow key={item.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                  <TableCell className="px-3 py-2.5 text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="px-3 py-2.5">
                    <p className="text-sm font-medium leading-snug">{item.productName}</p>
                    {item.remarks && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{item.remarks}</p>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center rounded-lg bg-blue-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {item.requiredQty}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className={cn(
                        'inline-flex items-center justify-center rounded-lg px-2.5 py-0.5 font-mono text-xs font-semibold',
                        item.receivedQty >= item.requiredQty
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : item.receivedQty > 0
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-muted/60 text-muted-foreground',
                      )}>
                        {item.receivedQty}
                      </span>
                      {item.receivedQty > 0 && item.receivedQty < item.requiredQty && (
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.min(100, (item.receivedQty / item.requiredQty) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                    {formatCurrency(item.expectedRate)}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">
                    {formatCurrency(item.requiredQty * item.expectedRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Sticky footer: grand total + actions */}
      <div className="shrink-0 border-t border-border/40 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between border-b border-border/40 bg-primary/5 px-5 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grand Total</p>
          <p className="font-mono text-base font-bold text-primary">{formatCurrency(po.totalAmount)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
          <Button variant="outline" className="gap-2" onClick={() => downloadPoPdf(poDoc)}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
          <Button className="gap-2" onClick={() => printPoPdf(poDoc)}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          {canReceive && (
            <Button
              variant={isPartial ? 'outline' : 'default'}
              className={cn(
                'gap-2',
                isPartial && 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20',
              )}
              onClick={() => navigate(`/purchase/grn?poId=${po.id}`)}
            >
              <PackageCheck className="h-4 w-4" />
              <span className="hidden sm:inline">{isPartial ? 'Receive Remaining' : 'Receive Goods'}</span>
              <span className="sm:hidden">Receive</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
