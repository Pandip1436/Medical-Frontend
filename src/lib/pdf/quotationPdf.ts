import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { COMPANY, fmtINR, uploadAndShareUrl } from './invoicePdf'
import { formatDate } from '@/lib/utils'

// Quotation list rows carry less than invoices (no batch/GST/expiry). This
// generator targets that slim shape directly so we don't have to invent
// invoice-grade fields just to print a PDF.
export interface QuotationDoc {
  quotationNumber: string
  date: string
  customerName: string
  customerPhone?: string
  // `amount` is the GST-INCLUSIVE line total (post-discount); `gstPercent` is
  // the line's tax rate. Both optional so legacy callers still type-check —
  // the table falls back to qty × rate / 0% GST when absent.
  items: { name: string; qty: number; rate: number; gstPercent?: number; amount?: number }[]
  deliveryCharge?: number
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
  doc.text(`Date: ${formatDate(qt.date)}`, rightX, y)
  y += 5
  doc.text(`Customer: ${qt.customerName}`, leftX, y)
  if (qt.customerPhone) {
    doc.text(`Phone: ${qt.customerPhone}`, rightX, y)
  }
  y += 3

  autoTable(doc, {
    startY: y + 3,
    head: [['#', 'Description', 'Qty', 'Rate', 'Taxable', 'GST %', 'Amount']],
    body: qt.items.map((it, i) => {
      // Prices are GST-inclusive: back the tax out of the line amount rather
      // than adding it on top.
      const lineAmount = it.amount != null ? Number(it.amount) : it.qty * Number(it.rate)
      const gstPct = Number(it.gstPercent ?? 0)
      const taxable = gstPct > 0 ? lineAmount / (1 + gstPct / 100) : lineAmount
      return [
        i + 1,
        it.name,
        it.qty,
        Number(it.rate).toFixed(2),
        taxable.toFixed(2),
        `${gstPct}%`,
        lineAmount.toFixed(2),
      ]
    }),
    styles: { fontSize: 9, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    // Explicit widths (sum = 182mm = full usable width) + per-column alignment
    // applied to header and body so labels sit over their values.
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },  // #
      1: { halign: 'left',   cellWidth: 60 }, // Description
      2: { halign: 'center', cellWidth: 16 }, // Qty
      3: { halign: 'right',  cellWidth: 22 }, // Rate
      4: { halign: 'right',  cellWidth: 26 }, // Taxable
      5: { halign: 'center', cellWidth: 18 }, // GST %
      6: { halign: 'right',  cellWidth: 32 }, // Amount
    },
    didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
      if (data.section !== 'head') return
      const align = ['center', 'left', 'center', 'right', 'right', 'center', 'right'][data.column.index]
      if (align) data.cell.styles.halign = align
    },
    margin: { left: 14, right: 14 },
  })

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  let totalY = afterTableY

  // Taxable + GST summary (GST backed out of inclusive line amounts) so the
  // breakdown reconciles: Taxable + GST + Delivery = Total.
  const sumTaxable = qt.items.reduce((s, it) => {
    const amt = it.amount != null ? Number(it.amount) : it.qty * Number(it.rate)
    const g = Number(it.gstPercent ?? 0)
    return s + (g > 0 ? amt / (1 + g / 100) : amt)
  }, 0)
  const sumGst = qt.items.reduce((s, it) => {
    const amt = it.amount != null ? Number(it.amount) : it.qty * Number(it.rate)
    const g = Number(it.gstPercent ?? 0)
    return s + (g > 0 ? amt - amt / (1 + g / 100) : 0)
  }, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Taxable', pageWidth - 60, totalY)
  doc.text(fmtINR(sumTaxable), pageWidth - 14, totalY, { align: 'right' })
  totalY += 6
  doc.text('GST', pageWidth - 60, totalY)
  doc.text(fmtINR(sumGst), pageWidth - 14, totalY, { align: 'right' })
  totalY += 6

  if (Number(qt.deliveryCharge) > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Delivery / Packaging', pageWidth - 60, totalY)
    doc.text(fmtINR(Number(qt.deliveryCharge)), pageWidth - 14, totalY, { align: 'right' })
    totalY += 6
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total', pageWidth - 60, totalY)
  doc.text(fmtINR(Number(qt.total)), pageWidth - 14, totalY, { align: 'right' })

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
