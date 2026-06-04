import jsPDF from 'jspdf'
import { printHtmlInPage } from '@/lib/printUtils'
import { formatDate } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { COMPANY, fmtINR } from './invoicePdf'

// One payment against an invoice — matches a row from GET /billing/:id/payments.
export interface ReceiptPayment {
  id: string | null
  receiptNumber: string | null
  amount: number
  paymentMode: string
  referenceNumber: string | null
  notes?: string | null
  createdAt: string
  source: 'INITIAL' | 'RECORDED'
}

// Minimal invoice context needed on the voucher (the full Invoice satisfies it).
export interface ReceiptInvoice {
  invoiceNumber: string
  customerName: string
  customerPhone?: string | null
  customerAddress?: string | null
  customerGstin?: string | null
  grandTotal: number | string
  amountPaid: number | string
}

const fmt = fmtINR

// Mirror invoicePdf's company source so the voucher header matches the invoice.
function getCompany() {
  const profile = useSettingsStore.getState().businessProfile
  if (!profile) return COMPANY
  return {
    name: profile.name || COMPANY.name,
    address: profile.address || COMPANY.address,
    phone: profile.phone || COMPANY.phone,
    email: profile.email || COMPANY.email,
    gstin: profile.gstin || COMPANY.gstin,
    dlNo: profile.drugLicense || COMPANY.dlNo,
  }
}

// A compact half-page payment acknowledgement (voucher) for a single payment.
// Used for the Download action; printing goes through the HTML path below
// (printReceipt) so it works even when the browser is set to auto-download PDFs.
export function generateReceiptPdf(
  payment: ReceiptPayment,
  invoice: ReceiptInvoice,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const company = getCompany()

  // ── Company header ──────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(company.name, pageWidth / 2, 18, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(company.address, pageWidth / 2, 24, { align: 'center' })
  doc.text(`Phone: ${company.phone}  |  Email: ${company.email}`, pageWidth / 2, 29, { align: 'center' })
  doc.text(`GSTIN: ${company.gstin}  |  DL No: ${company.dlNo}`, pageWidth / 2, 34, { align: 'center' })

  doc.setDrawColor(180)
  doc.line(14, 37, pageWidth - 14, 37)

  // ── Title ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('PAYMENT RECEIPT', pageWidth / 2, 45, { align: 'center' })

  // ── Receipt meta ────────────────────────────────────────────
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  let y = 54
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Receipt No: ${payment.receiptNumber ?? '—'}`, leftX, y)
  doc.text(`Date: ${formatDate(payment.createdAt)}`, rightX, y)
  y += 6
  doc.text(`Against Invoice: ${invoice.invoiceNumber}`, leftX, y)
  doc.text(`Payment Mode: ${payment.paymentMode}`, rightX, y)
  if (payment.referenceNumber) {
    y += 6
    doc.text(`Reference: ${payment.referenceNumber}`, leftX, y)
  }
  y += 9

  // ── Received From (party block) ─────────────────────────────
  // Name bold + larger; address/phone/GSTIN beneath so the payer is
  // unambiguous on the printed voucher.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('RECEIVED FROM', leftX, y)
  y += 6
  doc.setFontSize(12)
  doc.text(invoice.customerName, leftX, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  if (invoice.customerAddress) {
    y += 5
    const addressLines = doc.splitTextToSize(invoice.customerAddress, pageWidth - leftX - 14)
    doc.text(addressLines, leftX, y)
    y += (addressLines.length - 1) * 4.5
  }
  if (invoice.customerPhone && invoice.customerPhone !== '0000000000') {
    y += 5
    doc.text(`Phone: ${invoice.customerPhone}`, leftX, y)
  }
  if (invoice.customerGstin) {
    y += 5
    doc.text(`GSTIN: ${invoice.customerGstin}`, leftX, y)
  }
  y += 9

  // ── Amount (large, boxed) ───────────────────────────────────
  doc.setDrawColor(180)
  doc.roundedRect(leftX, y, pageWidth - 28, 18, 2, 2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Amount Received', leftX + 5, y + 7)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(fmt(Number(payment.amount)), pageWidth - 19, y + 12, { align: 'right' })
  y += 26

  // ── Invoice settlement summary ──────────────────────────────
  const summaryX = pageWidth - 90
  const row = (label: string, value: string, yPos: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(10)
    doc.text(label, summaryX, yPos)
    doc.text(value, pageWidth - 14, yPos, { align: 'right' })
  }
  const grand = Number(invoice.grandTotal)
  const paid = Number(invoice.amountPaid)
  const balance = grand - paid
  row('Invoice Total', fmt(grand), y); y += 6
  row('Total Paid', fmt(paid), y); y += 6
  row('Balance Due', fmt(balance < 0 ? 0 : balance), y, true); y += 6

  // ── Footer ──────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 20
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text('This is a computer-generated payment receipt.', pageWidth / 2, footerY, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Authorised Signatory', pageWidth - 14, footerY + 8, { align: 'right' })

  return doc
}

function receiptFileName(payment: ReceiptPayment, invoice: ReceiptInvoice) {
  const base = payment.receiptNumber || `Receipt-${invoice.invoiceNumber}`
  return `${base.replace(/\//g, '-')}.pdf`
}

export function downloadReceiptPdf(payment: ReceiptPayment, invoice: ReceiptInvoice) {
  const doc = generateReceiptPdf(payment, invoice)
  doc.save(receiptFileName(payment, invoice))
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )

// Build the printable voucher as HTML and print via a hidden iframe. Unlike a
// PDF blob, an HTML document always opens the browser print dialog — even when
// Chrome is set to "Download PDFs instead of opening them" (which otherwise
// turns a PDF-blob print into a junk UUID download that won't open).
function receiptHtml(payment: ReceiptPayment, invoice: ReceiptInvoice): string {
  const c = getCompany()
  const grand = Number(invoice.grandTotal)
  const paid = Number(invoice.amountPaid)
  const balance = Math.max(0, grand - paid)
  const showPhone = invoice.customerPhone && invoice.customerPhone !== '0000000000'

  const partyLines = [
    invoice.customerAddress ? `<div>${esc(invoice.customerAddress)}</div>` : '',
    showPhone ? `<div>Phone: ${esc(invoice.customerPhone)}</div>` : '',
    invoice.customerGstin ? `<div>GSTIN: ${esc(invoice.customerGstin)}</div>` : '',
  ].join('')

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>${esc(payment.receiptNumber || 'Payment Receipt')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 24px 28px; font-size: 13px; }
  .center { text-align: center; }
  .company { font-size: 20px; font-weight: 700; }
  .sub { font-size: 11px; color: #333; margin-top: 2px; }
  hr { border: none; border-top: 1px solid #bbb; margin: 10px 0; }
  .title { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: 1px; margin: 6px 0 14px; }
  .meta { display: flex; justify-content: space-between; gap: 16px; }
  .meta > div { line-height: 1.7; }
  .party { margin-top: 16px; }
  .party .label { font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #555; }
  .party .name { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .party div { line-height: 1.6; }
  .amount-box { display: flex; justify-content: space-between; align-items: center;
    border: 1px solid #bbb; border-radius: 6px; padding: 12px 16px; margin: 18px 0; }
  .amount-box .lbl { font-size: 13px; }
  .amount-box .val { font-size: 22px; font-weight: 700; }
  .summary { width: 280px; margin-left: auto; }
  .summary div { display: flex; justify-content: space-between; line-height: 1.9; }
  .summary .bold { font-weight: 700; border-top: 1px solid #bbb; padding-top: 4px; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer .note { font-style: italic; font-size: 10px; color: #666; }
  @media print { body { padding: 12px 16px; } }
</style></head>
<body>
  <div class="center">
    <div class="company">${esc(c.name)}</div>
    <div class="sub">${esc(c.address)}</div>
    <div class="sub">Phone: ${esc(c.phone)} &nbsp;|&nbsp; Email: ${esc(c.email)}</div>
    <div class="sub">GSTIN: ${esc(c.gstin)} &nbsp;|&nbsp; DL No: ${esc(c.dlNo)}</div>
  </div>
  <hr />
  <div class="title">PAYMENT RECEIPT</div>
  <div class="meta">
    <div>
      <div><b>Receipt No:</b> ${esc(payment.receiptNumber ?? '—')}</div>
      <div><b>Against Invoice:</b> ${esc(invoice.invoiceNumber)}</div>
      ${payment.referenceNumber ? `<div><b>Reference:</b> ${esc(payment.referenceNumber)}</div>` : ''}
    </div>
    <div>
      <div><b>Date:</b> ${esc(formatDate(payment.createdAt))}</div>
      <div><b>Payment Mode:</b> ${esc(payment.paymentMode)}</div>
    </div>
  </div>
  <div class="party">
    <div class="label">RECEIVED FROM</div>
    <div class="name">${esc(invoice.customerName)}</div>
    ${partyLines}
  </div>
  <div class="amount-box">
    <div class="lbl">Amount Received</div>
    <div class="val">${esc(fmt(Number(payment.amount)))}</div>
  </div>
  <div class="summary">
    <div><span>Invoice Total</span><span>${esc(fmt(grand))}</span></div>
    <div><span>Total Paid</span><span>${esc(fmt(paid))}</span></div>
    <div class="bold"><span>Balance Due</span><span>${esc(fmt(balance))}</span></div>
  </div>
  <div class="footer">
    <div class="note">This is a computer-generated payment receipt.</div>
    <div>Authorised Signatory</div>
  </div>
</body></html>`
}

export function printReceipt(payment: ReceiptPayment, invoice: ReceiptInvoice) {
  printHtmlInPage(receiptHtml(payment, invoice))
}
