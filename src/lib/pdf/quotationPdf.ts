import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { COMPANY, fmtINR, uploadAndShareUrl } from './invoicePdf'

// Quotation list rows carry less than invoices (no batch/GST/expiry). This
// generator targets that slim shape directly so we don't have to invent
// invoice-grade fields just to print a PDF.
export interface QuotationDoc {
  quotationNumber: string
  date: string
  customerName: string
  items: { name: string; qty: number; rate: number }[]
  total: number
}

export function generateQuotationPdf(qt: QuotationDoc) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(COMPANY.name, pageWidth / 2, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(COMPANY.address, pageWidth / 2, 21, { align: 'center' })
  doc.text(`Phone: ${COMPANY.phone}  |  Email: ${COMPANY.email}`, pageWidth / 2, 26, { align: 'center' })
  doc.text(`GSTIN: ${COMPANY.gstin}  |  DL No: ${COMPANY.dlNo}`, pageWidth / 2, 31, { align: 'center' })

  doc.setDrawColor(180)
  doc.line(14, 34, pageWidth - 14, 34)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('QUOTATION', pageWidth / 2, 41, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  let y = 48
  doc.text(`Quotation No: ${qt.quotationNumber}`, leftX, y)
  doc.text(`Date: ${new Date(qt.date).toLocaleDateString('en-IN')}`, rightX, y)
  y += 5
  doc.text(`Customer: ${qt.customerName}`, leftX, y)
  y += 3

  autoTable(doc, {
    startY: y + 3,
    head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
    body: qt.items.map((it, i) => [
      i + 1,
      it.name,
      it.qty,
      Number(it.rate).toFixed(2),
      (it.qty * Number(it.rate)).toFixed(2),
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    columnStyles: {
      0: { halign: 'right', cellWidth: 10 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total', pageWidth - 60, afterTableY)
  doc.text(fmtINR(Number(qt.total)), pageWidth - 14, afterTableY, { align: 'right' })

  const footerY = doc.internal.pageSize.getHeight() - 20
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text(
    'This quotation is valid for 7 days from the date of issue. Subject to Madurai jurisdiction.',
    pageWidth / 2,
    footerY,
    { align: 'center' },
  )
  doc.setFont('helvetica', 'normal')
  doc.text('Authorised Signatory', pageWidth - 14, footerY + 8, { align: 'right' })

  return doc
}

export function quotationPdfBlob(qt: QuotationDoc): Blob {
  return generateQuotationPdf(qt).output('blob')
}

export function downloadQuotationPdf(qt: QuotationDoc) {
  generateQuotationPdf(qt).save(`${qt.quotationNumber}.pdf`)
}

export async function shareQuotationViaWhatsApp(qt: QuotationDoc, phone?: string): Promise<void> {
  const headline =
    `Dear ${qt.customerName}, please find quotation ${qt.quotationNumber} ` +
    `for ${fmtINR(Number(qt.total))}.`
  const blob = quotationPdfBlob(qt)
  // Sanitize the number — quotation numbers contain `/` which would split the
  // R2 key into folders. Replace with `-` so the filename stays one segment.
  const safeNumber = qt.quotationNumber.replace(/\//g, '-')
  const file = new File([blob], `Quotation-${safeNumber}.pdf`, { type: 'application/pdf' })
  await uploadAndShareUrl(file, phone, headline, qt.quotationNumber)
}
