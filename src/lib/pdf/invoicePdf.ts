import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice } from '@/types'

const COMPANY = {
  name: 'HOSPITAL SUPPLIERS',
  city: 'Madurai',
  address: 'Hospital Suppliers, Madurai, Tamil Nadu',
  phone: '+91 452 234 5678',
  email: 'contact@hospitalsuppliers.in',
  gstin: '33AAAPL1234C1Z5',
  dlNo: 'TN-MDU-20B-01234 / TN-MDU-21B-01234',
}

const fmt = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })

export function generateInvoicePdf(invoice: Invoice, options?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(COMPANY.name, pageWidth / 2, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(COMPANY.address, pageWidth / 2, 21, { align: 'center' })
  doc.text(
    `Phone: ${COMPANY.phone}  |  Email: ${COMPANY.email}`,
    pageWidth / 2,
    26,
    { align: 'center' },
  )
  doc.text(
    `GSTIN: ${COMPANY.gstin}  |  DL No: ${COMPANY.dlNo}`,
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
  doc.text(`Date: ${new Date(invoice.date).toLocaleDateString('en-IN')}`, rightX, y)
  y += 5
  doc.text(`Billing Type: ${invoice.billingType}`, leftX, y)
  doc.text(`Payment Mode: ${invoice.paymentMode}`, rightX, y)
  y += 5
  doc.text(`Customer: ${invoice.customerName}`, leftX, y)
  if (invoice.doctorName) doc.text(`Doctor: ${invoice.doctorName}`, rightX, y)
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
      Number(it.discountPercent).toFixed(1),
      Number(it.gstPercent).toFixed(1),
      Number(it.amount).toFixed(2),
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
    margin: { left: 14, right: 14 },
  })

  const afterTableY = (doc as any).lastAutoTable.finalY + 6
  const summaryX = pageWidth - 80

  const row = (label: string, value: string, yPos: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, summaryX, yPos)
    doc.text(value, pageWidth - 14, yPos, { align: 'right' })
  }

  let sy = afterTableY
  row('Subtotal', fmt(Number(invoice.subtotal)), sy); sy += 5
  if (Number(invoice.productDiscount) > 0) {
    row('Discount', `- ${fmt(Number(invoice.productDiscount))}`, sy); sy += 5
  }
  row('Taxable', fmt(Number(invoice.taxableAmount)), sy); sy += 5
  row('CGST', fmt(Number(invoice.cgst)), sy); sy += 5
  row('SGST', fmt(Number(invoice.sgst)), sy); sy += 5
  if (Number(invoice.igst) > 0) {
    row('IGST', fmt(Number(invoice.igst)), sy); sy += 5
  }
  if (Math.abs(Number(invoice.roundOff)) > 0) {
    row('Round Off', fmt(Number(invoice.roundOff)), sy); sy += 5
  }
  sy += 2
  doc.setDrawColor(180)
  doc.line(summaryX - 2, sy - 1, pageWidth - 14, sy - 1)
  row('GRAND TOTAL', fmt(Number(invoice.grandTotal)), sy + 4, true)
  sy += 9
  if (Number(invoice.amountPaid) > 0) {
    row('Paid', fmt(Number(invoice.amountPaid)), sy); sy += 5
  }
  if (Number(invoice.changeReturned) > 0) {
    row('Change', fmt(Number(invoice.changeReturned)), sy); sy += 5
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
    window.open(doc.output('bloburl'), '_blank')
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

export function shareInvoiceViaWhatsApp(invoice: Invoice, phone?: string) {
  const message = encodeURIComponent(
    `Dear ${invoice.customerName},\n\nYour invoice ${invoice.invoiceNumber} for ${fmt(
      Number(invoice.grandTotal),
    )} has been generated.\n\nThank you for your business with ${COMPANY.name}.`,
  )
  const base = phone
    ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${message}`
    : `https://wa.me/?text=${message}`
  window.open(base, '_blank')
}
