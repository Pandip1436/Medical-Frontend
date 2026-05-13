import { useState } from 'react'
import {
  Printer, Download, Share2, ShoppingCart, Wallet,
  User, Stethoscope, CreditCard, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { downloadInvoicePdf, printInvoicePdf, shareInvoiceViaWhatsApp } from '@/lib/pdf/invoicePdf'
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
  const [collectMode, setCollectMode] = useState('CASH')
  const [collectSubmitting, setCollectSubmitting] = useState(false)

  const handleCollectPayment = async () => {
    if (!collectAmount) return
    setCollectSubmitting(true)
    try {
      const res = await api.patch(`/billing/${invoice.id}/collect-payment`, {
        amountReceived: parseFloat(collectAmount),
        paymentMode: collectMode,
      })
      toast.success('Payment collected successfully')
      setCollectAmount('')
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

  return (
    <div className="space-y-4">
      {/* Meta info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer</p>
            <p className="font-medium">{invoice.customerName}</p>
          </div>
        </div>
        {invoice.doctorName && (
          <div className="flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Doctor</p>
              <p className="font-medium">{invoice.doctorName}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment</p>
            <p className="font-medium capitalize">{invoice.paymentMode.toLowerCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Billing Type</p>
            <p className="font-medium capitalize">{invoice.billingType.toLowerCase()}</p>
          </div>
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
              <TableHead className="text-right">GST%</TableHead>
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
                <TableCell className="text-right text-xs text-muted-foreground">{Number(item.gstPercent).toFixed(1)}%</TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(item.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-4 text-sm">
        {[
          { label: 'Subtotal', value: invoice.subtotal },
          Number(invoice.productDiscount) > 0 ? { label: 'Discount', value: -Number(invoice.productDiscount) } : null,
          { label: 'Taxable', value: invoice.taxableAmount },
          { label: 'CGST', value: invoice.cgst },
          { label: 'SGST', value: invoice.sgst },
          Number(invoice.igst) > 0 ? { label: 'IGST', value: invoice.igst } : null,
          Math.abs(Number(invoice.roundOff)) > 0 ? { label: 'Round Off', value: invoice.roundOff } : null,
        ].filter(Boolean).map((row) => (
          <div key={row!.label} className="flex justify-between text-muted-foreground">
            <span>{row!.label}</span>
            <span className="font-mono">{formatCurrency(row!.value)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-border/40 pt-2 font-bold">
          <span>Grand Total</span>
          <span className="font-mono text-base text-emerald-600 dark:text-emerald-400">{formatCurrency(grandTotal)}</span>
        </div>
        {amountPaid > 0 && (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>Paid</span>
            <span className="font-mono">{formatCurrency(amountPaid)}</span>
          </div>
        )}
        {outstanding > 0.01 && (
          <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
            <span>Outstanding</span>
            <span className="font-mono">{formatCurrency(outstanding)}</span>
          </div>
        )}
      </div>

      {/* Collect Payment — credit/partial only */}
      {(invoice.status === 'CREDIT' || invoice.status === 'PARTIAL') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Collect Payment — Outstanding: {formatCurrency(outstanding)}
          </p>
          <div className="flex gap-2">
            <Select value={collectMode} onValueChange={setCollectMode}>
              <SelectTrigger className="w-32 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['CASH', 'CARD', 'UPI', 'CHEQUE'].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Amount"
              className="h-9 text-sm"
              value={collectAmount}
              onChange={(e) => setCollectAmount(e.target.value)}
              max={outstanding}
            />
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={collectSubmitting || !collectAmount}
              onClick={handleCollectPayment}
            >
              <Wallet className="h-4 w-4" />
              {collectSubmitting ? 'Saving…' : 'Collect'}
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1 gap-2 min-w-24" onClick={() => printInvoicePdf(invoice)}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button variant="outline" className="flex-1 gap-2 min-w-24" onClick={() => downloadInvoicePdf(invoice)}>
          <Download className="h-4 w-4" />
          Download
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => shareInvoiceViaWhatsApp(invoice)}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <Button
          variant="outline"
          className="gap-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40"
          onClick={handleRepurchase}
        >
          <ShoppingCart className="h-4 w-4" />
          Repurchase
        </Button>
      </div>
    </div>
  )
}
