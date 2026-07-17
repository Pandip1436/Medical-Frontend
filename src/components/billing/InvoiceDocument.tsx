import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { COMPANY } from '@/lib/pdf/invoicePdf'
import type { Invoice } from '@/types'

// Styled, on-screen invoice document — the same full-width layout the New Sale
// page shows in its "Invoice Preview" dialog, extracted so the invoice detail
// page (and anywhere else) can render an identical preview from an Invoice.
// This is a screen representation of the document; the printed/downloaded PDF
// is still produced by invoicePdf.ts.

function useCompany() {
  const profile = useSettingsStore(s => s.businessProfile)
  return {
    name: profile?.name || COMPANY.name,
    address: profile?.address || COMPANY.address,
    phone: profile?.phone || COMPANY.phone,
    email: profile?.email || COMPANY.email,
    gstin: profile?.gstin || COMPANY.gstin,
    dlNo: profile?.drugLicense || COMPANY.dlNo,
  }
}

const num = (v: unknown) => Number(v ?? 0)

export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const company = useCompany()
  const items = invoice.items ?? []
  const isQuotation = invoice.type === 'QUOTATION'
  const phone = invoice.customerPhone && invoice.customerPhone !== '0000000000' ? invoice.customerPhone : null
  const grandTotal = num(invoice.grandTotal)
  const amountPaid = num(invoice.amountPaid)
  const change = num(invoice.changeReturned)
  // Remaining payable after part-payment (credit / partial sales). Clamp at 0
  // so fully-paid invoices never show a negative balance.
  const balanceDue = Math.max(0, grandTotal - amountPaid)

  const totalsRows: { label: string; value: string; rose?: boolean; dim?: boolean }[] = [
    { label: 'Subtotal', value: formatCurrency(num(invoice.subtotal)) },
    ...(num(invoice.productDiscount) > 0
      ? [{ label: 'Discount', value: `− ${formatCurrency(num(invoice.productDiscount))}`, rose: true }]
      : []),
    { label: 'Taxable Value', value: formatCurrency(num(invoice.taxableAmount)) },
    ...(num(invoice.cgst) > 0
      ? [{ label: 'CGST', value: formatCurrency(num(invoice.cgst)) }, { label: 'SGST', value: formatCurrency(num(invoice.sgst)) }]
      : []),
    ...(num(invoice.igst) > 0 ? [{ label: 'IGST', value: formatCurrency(num(invoice.igst)) }] : []),
    ...(num(invoice.deliveryCharge) > 0 ? [{ label: 'Delivery / Packaging', value: formatCurrency(num(invoice.deliveryCharge)) }] : []),
    ...(num(invoice.roundOff) !== 0
      ? [{ label: 'Round Off', value: `${num(invoice.roundOff) > 0 ? '+' : ''}${num(invoice.roundOff).toFixed(2)}`, dim: true }]
      : []),
  ]

  return (
    <div className="flex flex-col bg-white dark:bg-zinc-900">
      {/* ── Company header strip ── */}
      <div className="flex flex-col gap-2 border-b-2 border-primary bg-primary/5 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-50">{company.name}</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{company.address}</p>
        </div>
        <div className="space-y-0.5 text-left text-xs text-zinc-400 dark:text-zinc-500 sm:text-right">
          <p>Ph: {company.phone} &nbsp;·&nbsp; {company.email}</p>
          <p>GSTIN: {company.gstin} &nbsp;·&nbsp; DL No: {company.dlNo}</p>
        </div>
        <div className="shrink-0 sm:ml-6">
          <span className="inline-block rounded-lg bg-primary px-4 py-1.5 text-xs font-black uppercase tracking-widest text-primary-foreground">
            {isQuotation ? 'Quotation' : 'Tax Invoice'}
          </span>
        </div>
      </div>

      {/* ── Bill To + Invoice Meta ── */}
      <div className="grid grid-cols-1 divide-y divide-border/40 border-b border-border/30 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-4 sm:col-span-2 sm:px-6">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Bill To</p>
          {/* Customer name with the billing-type (RETAIL/WHOLESALE) tag beside it.
              The payment-mode (CREDIT/…) tag now lives up by the invoice number. */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black leading-snug text-zinc-900 dark:text-zinc-50">{invoice.customerName}</p>
            <Badge variant={invoice.billingType === 'WHOLESALE' ? 'purple' : 'info'} size="sm">{invoice.billingType}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-start gap-x-4 gap-y-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {phone && <span>{phone}</span>}
            {invoice.customerAddress && <span className="leading-relaxed">{invoice.customerAddress}</span>}
            {invoice.customerGstin && <span className="font-mono text-xs">GSTIN: {invoice.customerGstin}</span>}
          </div>
          {invoice.salespersonName && (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Salesperson: </span>
              <span className="text-zinc-700 dark:text-zinc-300">{invoice.salespersonName}</span>
            </p>
          )}
        </div>
        <div className="space-y-3 px-4 py-4 text-left sm:px-6 sm:text-right">
          <div>
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">{isQuotation ? 'Quotation No' : 'Invoice No'}</p>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {!isQuotation && invoice.paymentMode && (
                <Badge variant={invoice.paymentMode === 'CREDIT' ? 'warning' : 'success'} size="sm">{invoice.paymentMode}</Badge>
              )}
              <p className="break-all font-mono text-xl font-black text-primary">{invoice.invoiceNumber}</p>
            </div>
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Date</p>
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
              {new Date(invoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          {invoice.dueDate && (
            <div>
              <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Due Date</p>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                {new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Items table ── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-175">
          <thead>
            <tr className="bg-zinc-800 text-white dark:bg-zinc-950">
              <th className="w-10 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider">Product Name</th>
              <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider">Batch</th>
              <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider">Expiry</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Qty</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">MRP</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Rate</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Disc%</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Taxable</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">GST%</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">GST ₹</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr
                key={it.id ?? i}
                className={cn(
                  'border-b border-zinc-100 dark:border-zinc-700/50',
                  i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50/80 dark:bg-zinc-800/50',
                )}
              >
                <td className="px-4 py-3.5 text-center text-xs text-zinc-400">{i + 1}</td>
                <td className="px-4 py-3.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{it.productName}</td>
                <td className="px-4 py-3.5 text-center font-mono text-xs text-zinc-500">{it.batchNumber || '—'}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-center text-xs text-zinc-500">
                  {it.expiryDate ? new Date(it.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td className="px-4 py-3.5 text-right text-sm font-bold text-zinc-900 dark:text-zinc-100">{it.quantity}</td>
                <td className="px-4 py-3.5 text-right font-mono text-xs text-zinc-400">{num(it.mrp).toFixed(2)}</td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300">{num(it.rate).toFixed(2)}</td>
                <td className="px-4 py-3.5 text-right text-xs text-zinc-400">{num(it.discountPercent).toFixed(1)}%</td>
                {/* Pre-GST taxable base — amount is GST-inclusive: amount ÷ (1 + gst%). */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-zinc-700 dark:text-zinc-300">{formatCurrency(num(it.amount) / (1 + num(it.gstPercent) / 100))}</td>
                <td className="px-4 py-3.5 text-right text-xs text-zinc-400">{num(it.gstPercent).toFixed(1)}%</td>
                {/* GST value in ₹ = amount − taxable. */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-zinc-700 dark:text-zinc-300">{formatCurrency(num(it.amount) - num(it.amount) / (1 + num(it.gstPercent) / 100))}</td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(num(it.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Totals + footer ── */}
      <div className="border-t-2 border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-700 sm:flex-row sm:items-stretch sm:justify-between sm:divide-x sm:divide-y-0">
          {/* Left — terms */}
          <div className="flex flex-1 flex-col justify-between gap-3 px-6 py-4">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">Payment Terms</p>
              <p className="text-sm text-zinc-500">
                Mode: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{invoice.paymentMode}</span>
              </p>
              {amountPaid > 0 && (
                <div className="mt-1 flex flex-wrap gap-6 text-sm">
                  <span className="font-semibold text-emerald-600">Paid: {formatCurrency(amountPaid)}</span>
                  {change > 0 && <span className="text-zinc-500">Change: {formatCurrency(change)}</span>}
                  {balanceDue > 0 && (
                    <span className="font-semibold text-rose-500">Balance: {formatCurrency(balanceDue)}</span>
                  )}
                </div>
              )}
            </div>
            <p className="text-[10px] italic text-zinc-400">
              Goods once sold will not be taken back or exchanged. Subject to Madurai jurisdiction.
            </p>
          </div>

          {/* Right — totals summary */}
          <div className="space-y-1.5 px-6 py-4 sm:min-w-75">
            {totalsRows.map((row) => (
              <div key={row.label} className="flex justify-between text-sm">
                <span className={cn(row.dim ? 'text-zinc-300' : 'text-zinc-500')}>{row.label}</span>
                <span className={cn('font-mono', row.rose ? 'font-semibold text-rose-500' : 'text-zinc-700 dark:text-zinc-300')}>{row.value}</span>
              </div>
            ))}
            <div className="mt-1 border-t-2 border-zinc-900 pt-2 dark:border-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-base font-black text-zinc-900 dark:text-zinc-50">Grand Total</span>
                <span className="font-mono text-2xl font-black text-primary">{formatCurrency(grandTotal)}</span>
              </div>
              {balanceDue > 0 && (
                <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-zinc-300 pt-1.5 dark:border-zinc-600">
                  <span className="text-sm font-bold uppercase tracking-wide text-rose-500">Balance Due</span>
                  <span className="font-mono text-lg font-black text-rose-500">{formatCurrency(balanceDue)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Far right — signature */}
          <div className="hidden min-w-35 flex-col items-center justify-end px-8 py-4 text-center sm:flex">
            <div className="mb-1.5 w-24 border-t border-zinc-400" />
            <p className="text-xs font-semibold text-zinc-500">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  )
}
