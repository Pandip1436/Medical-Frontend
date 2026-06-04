import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'sonner'
import type { Invoice } from '@/types'
import { printPdfInPage } from '@/lib/printUtils'
import { formatDate } from '@/lib/utils'
import api from '@/lib/api'
import { useSettingsStore } from '@/stores/settingsStore'

// Default company info — used only as fallback when the settings store
// hasn't loaded a business profile yet. The real values come from
// /settings/business via useSettingsStore.
const DEFAULT_COMPANY = {
  name: 'HOSPITAL SUPPLIERS',
  city: 'Madurai',
  address: 'Hospital Suppliers, Madurai, Tamil Nadu',
  phone: '+91 452 234 5678',
  email: 'contact@hospitalsuppliers.in',
  gstin: '33AAAPL1234C1Z5',
  dlNo: 'TN-MDU-20B-01234 / TN-MDU-21B-01234',
}

function getCompany() {
  const profile = useSettingsStore.getState().businessProfile
  if (!profile) return DEFAULT_COMPANY
  return {
    name: profile.name || DEFAULT_COMPANY.name,
    city: DEFAULT_COMPANY.city,
    address: profile.address || DEFAULT_COMPANY.address,
    phone: profile.phone || DEFAULT_COMPANY.phone,
    email: profile.email || DEFAULT_COMPANY.email,
    gstin: profile.gstin || DEFAULT_COMPANY.gstin,
    dlNo: profile.drugLicense || DEFAULT_COMPANY.dlNo,
  }
}

// Backward-compat export: existing call sites reference COMPANY directly.
export const COMPANY = DEFAULT_COMPANY

// jsPDF's built-in Helvetica has no glyph for the ₹ sign (U+20B9), so the
// `currency: 'INR'` symbol prints as a garbled superscript. Use the "Rs."
// prefix instead — it renders cleanly and is unambiguous on a printed invoice.
export const fmtINR = (n: number) =>
  `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const fmt = fmtINR

// Two-decimal money formatter for the totals summary. The tax lines carry paise
// (e.g. CGST 14.25), so rounding them to whole rupees for display hides the
// paise and makes the round-off look unexplained. Showing 2 decimals here keeps
// the breakdown self-consistent: Taxable + GST + Delivery ± Round Off = Grand
// Total, all visible.
const fmt2 = (n: number) =>
  `Rs. ${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function generateInvoicePdf(invoice: Invoice, options?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const company = getCompany()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(company.name, pageWidth / 2, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(company.address, pageWidth / 2, 21, { align: 'center' })
  doc.text(
    `Phone: ${company.phone}  |  Email: ${company.email}`,
    pageWidth / 2,
    26,
    { align: 'center' },
  )
  doc.text(
    `GSTIN: ${company.gstin}  |  DL No: ${company.dlNo}`,
    pageWidth / 2,
    31,
    { align: 'center' },
  )

  doc.setDrawColor(180)
  doc.line(14, 34, pageWidth - 14, 34)

  const title = invoice.type === 'QUOTATION' ? 'QUOTATION' : 'TAX INVOICE'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(title, pageWidth / 2, 41, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  let y = 48
  doc.text(`Invoice No: ${invoice.invoiceNumber}`, leftX, y)
  doc.text(`Date: ${formatDate(invoice.date)}`, rightX, y)
  y += 5
  doc.text(`Billing Type: ${invoice.billingType}`, leftX, y)
  doc.text(`Payment Mode: ${invoice.paymentMode}`, rightX, y)
  if (invoice.dueDate) {
    y += 5
    doc.text(`Due Date: ${formatDate(invoice.dueDate)}`, leftX, y)
  }
  y += 5
  doc.text(`Customer: ${invoice.customerName}`, leftX, y)
  if (invoice.doctorName) doc.text(`Doctor: ${invoice.doctorName}`, rightX, y)
  if (invoice.customerPhone && invoice.customerPhone !== '0000000000') {
    y += 5
    doc.text(`Phone: ${invoice.customerPhone}`, leftX, y)
  }
  if (invoice.customerAddress) {
    y += 5
    // Wrap long addresses to the usable page width so they don't overflow.
    const addressLines = doc.splitTextToSize(`Address: ${invoice.customerAddress}`, pageWidth - leftX - 14)
    doc.text(addressLines, leftX, y)
    y += (addressLines.length - 1) * 4
  }
  if (invoice.customerGstin) {
    y += 5
    doc.text(`Customer GSTIN: ${invoice.customerGstin}`, leftX, y)
  }
  y += 3

  autoTable(doc, {
    startY: y + 3,
    head: [[
      '#', 'Product', 'Batch', 'Expiry', 'Qty', 'MRP', 'Rate', 'Disc%', 'GST%', 'Amount',
    ]],
    body: invoice.items.map((it, i) => [
      i + 1,
      it.productName,
      it.batchNumber,
      new Date(it.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      it.quantity,
      Number(it.mrp).toFixed(2),
      Number(it.rate).toFixed(2),
      Number(it.discountPercent).toFixed(2),
      Number(it.gstPercent).toFixed(2),
      // Full line amount with paise — never rounded/hidden.
      Number(it.amount || 0).toFixed(2),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    columnStyles: {
      0: { halign: 'right', cellWidth: 8 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
    },
    // Right-align the header labels of the numeric columns so they sit directly
    // above their right-aligned values (columnStyles alone leaves the head cells
    // left-aligned, which makes the figures look shifted from their headers).
    didParseCell: (data) => {
      if (data.section === 'head' && [0, 4, 5, 6, 7, 8, 9].includes(data.column.index)) {
        data.cell.styles.halign = 'right'
      }
    },
    margin: { left: 14, right: 14 },
  })

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const summaryX = pageWidth - 80

  const row = (label: string, value: string, yPos: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, summaryX, yPos)
    doc.text(value, pageWidth - 14, yPos, { align: 'right' })
  }

  let sy = afterTableY
  row('Subtotal', fmt2(Number(invoice.subtotal)), sy); sy += 5
  if (Number(invoice.productDiscount) > 0) {
    row('Discount', `- ${fmt2(Number(invoice.productDiscount))}`, sy); sy += 5
  }
  row('Taxable', fmt2(Number(invoice.taxableAmount)), sy); sy += 5
  row('CGST', fmt2(Number(invoice.cgst)), sy); sy += 5
  row('SGST', fmt2(Number(invoice.sgst)), sy); sy += 5
  if (Number(invoice.igst) > 0) {
    row('IGST', fmt2(Number(invoice.igst)), sy); sy += 5
  }
  if (Number(invoice.deliveryCharge) > 0) {
    row('Delivery / Packaging', fmt2(Number(invoice.deliveryCharge)), sy); sy += 5
  }
  if (Math.abs(Number(invoice.roundOff)) > 0) {
    row('Round Off', fmt2(Number(invoice.roundOff)), sy); sy += 5
  }
  sy += 2
  doc.setDrawColor(180)
  doc.line(summaryX - 2, sy - 1, pageWidth - 14, sy - 1)
  row('GRAND TOTAL', fmt2(Number(invoice.grandTotal)), sy + 4, true)
  sy += 9
  if (Number(invoice.amountPaid) > 0) {
    row('Paid', fmt2(Number(invoice.amountPaid)), sy); sy += 5
  }
  if (Number(invoice.changeReturned) > 0) {
    row('Change', fmt2(Number(invoice.changeReturned)), sy); sy += 5
  }

  const footerY = doc.internal.pageSize.getHeight() - 20
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text(
    'Goods once sold will not be taken back or exchanged. Subject to Madurai jurisdiction.',
    pageWidth / 2,
    footerY,
    { align: 'center' },
  )
  doc.setFont('helvetica', 'normal')
  doc.text('Authorised Signatory', pageWidth - 14, footerY + 8, { align: 'right' })

  if (options?.autoPrint) {
    doc.autoPrint()
    printPdfInPage(doc.output('bloburl').toString())
  }
  return doc
}

export function downloadInvoicePdf(invoice: Invoice) {
  const doc = generateInvoicePdf(invoice)
  doc.save(`${invoice.invoiceNumber}.pdf`)
}

export function printInvoicePdf(invoice: Invoice) {
  generateInvoicePdf(invoice, { autoPrint: true })
}

export function invoicePdfBlob(invoice: Invoice): Blob {
  const doc = generateInvoicePdf(invoice)
  return doc.output('blob')
}

// Returns an object URL pointing at the rendered PDF, suitable for an <iframe>
// preview. Callers own the URL's lifecycle and must URL.revokeObjectURL() it
// when the preview is dismissed to avoid leaking the blob.
export function invoicePdfBlobUrl(invoice: Invoice): string {
  const doc = generateInvoicePdf(invoice)
  return doc.output('bloburl').toString()
}

// Build a wa.me link. India default: a bare 10-digit number gets the `91` prefix;
// a longer string is assumed to already include the country code.
export function buildWaUrl(phone: string | undefined, text: string): string {
  const message = encodeURIComponent(text)
  if (!phone) return `https://wa.me/?text=${message}`
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${withCountry}?text=${message}`
}

// Share an invoice/quotation PDF on WhatsApp. The flow:
//   1. Upload the PDF to the backend (POST /shared-files) → get a public link
//   2. Open wa.me/{customerPhone} pre-filled with a message containing the link
// WhatsApp opens to the right customer's chat, the user taps Send, the customer
// taps the link to download the PDF.
export async function shareInvoiceViaWhatsApp(invoice: Invoice, phone?: string): Promise<void> {
  const docKind = invoice.type === 'QUOTATION' ? 'quotation' : 'invoice'
  const prefix = invoice.type === 'QUOTATION' ? 'Quotation' : 'Invoice'
  const headline =
    `Dear ${invoice.customerName}, your ${docKind} ${invoice.invoiceNumber} ` +
    `for ${fmt(Number(invoice.grandTotal))} is ready.`
  const blob = invoicePdfBlob(invoice)
  // Sanitize the number — invoice numbers contain `/` which would split the
  // R2 key into folders. Replace with `-` so the filename stays one segment.
  const safeNumber = invoice.invoiceNumber.replace(/\//g, '-')
  const file = new File([blob], `${prefix}-${safeNumber}.pdf`, { type: 'application/pdf' })
  await uploadAndShareUrl(file, phone, headline, invoice.invoiceNumber)
}

// Shared by invoicePdf + quotationPdf. Uploads the PDF blob, then opens
// WhatsApp pre-filled with the download link. Throws on upload failure so
// callers can decide whether to surface a retry path.
export async function uploadAndShareUrl(
  file: File,
  phone: string | undefined,
  headline: string,
  label: string,
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  form.append('label', label)
  let url: string
  try {
    const res = await api.post('/shared-files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    url = res.data.url
  } catch (err) {
    toast.error('Could not prepare share link — please try again')
    throw err
  }
  const message = `${headline}\n\nDownload: ${url}\n\nRegards,\n${getCompany().name}`
  window.open(buildWaUrl(phone, message), '_blank', 'noopener,noreferrer')
}
