import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { printPdfInPage } from '@/lib/printUtils'
import { formatDate } from '@/lib/utils'
import { getPdfLogo } from '@/lib/pdf/logo'

// Fallback company info — used when the caller doesn't supply one. Real
// values come from the business profile in settings (passed via GrnPdfData).
const COMPANY_FALLBACK = {
  name: 'HOSPITAL SUPPLIERS',
  address: 'Hospital Suppliers, Madurai, Tamil Nadu',
  phone: '+91 452 234 5678',
  email: 'contact@hospitalsuppliers.in',
  gstin: '33AAAPL1234C1Z5',
  dlNo: 'TN-MDU-20B-01234 / TN-MDU-21B-01234',
}

export interface GrnPdfCompany {
  name?: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
  dlNo?: string
}

// jsPDF's Helvetica lacks the ₹ glyph (U+20B9) — it prints garbled — so use
// the "Rs." prefix, which renders cleanly on the PDF.
const fmt = (n: number) =>
  `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export interface GrnItemLike {
  productName: string
  batchNumber: string
  expiryDate: string | Date
  orderedQty: number
  receivedQty: number
  freeQty: number
  purchaseRate: number | string
  mrp: number | string
}

export interface GrnPdfData {
  grnNumber: string
  date?: string | Date
  supplierName: string
  supplierInvoiceNo?: string
  supplierInvoiceDate?: string | Date
  totalAmount: number | string
  // GST breakdown (optional). When present, the PDF prints a Taxable / CGST /
  // SGST / Grand Total summary instead of just a single total line.
  gst?: { taxable: number; cgst: number; sgst: number; total: number }
  items: GrnItemLike[]
  company?: GrnPdfCompany
}

export function generateGrnPdf(grn: GrnPdfData, options?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const company = { ...COMPANY_FALLBACK, ...(grn.company ?? {}) }

  const logo = getPdfLogo()
  if (logo) {
    try { doc.addImage(logo, 'PNG', 14, 8, 18, 18) } catch { /* bad image — skip */ }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(company.name, pageWidth / 2, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(company.address, pageWidth / 2, 21, { align: 'center' })
  doc.text(`Phone: ${company.phone}  |  Email: ${company.email}`, pageWidth / 2, 26, { align: 'center' })
  doc.text(`GSTIN: ${company.gstin}  |  DL No: ${company.dlNo}`, pageWidth / 2, 31, { align: 'center' })

  doc.setDrawColor(180)
  doc.line(14, 34, pageWidth - 14, 34)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PURCHASE RECEIVED NOTE', pageWidth / 2, 41, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  const dateStr = grn.date ? formatDate(grn.date) : formatDate(new Date())
  let y = 48
  doc.text(`PE No: ${grn.grnNumber}`, leftX, y)
  doc.text(`Date: ${dateStr}`, rightX, y)
  y += 5
  doc.text(`Supplier: ${grn.supplierName}`, leftX, y)
  if (grn.supplierInvoiceNo) doc.text(`Invoice No: ${grn.supplierInvoiceNo}`, rightX, y)
  y += 5
  if (grn.supplierInvoiceDate) {
    doc.text(`Supplier Inv Date: ${formatDate(grn.supplierInvoiceDate)}`, leftX, y)
    y += 3
  }

  autoTable(doc, {
    startY: y + 3,
    head: [['#', 'Product', 'Batch', 'Expiry', 'Ordered', 'Received', 'Free', 'Rate', 'MRP']],
    body: grn.items.map((it, i) => [
      i + 1,
      it.productName,
      it.batchNumber,
      new Date(it.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      it.orderedQty,
      it.receivedQty,
      it.freeQty,
      Number(it.purchaseRate).toFixed(2),
      Number(it.mrp).toFixed(2),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5, valign: 'middle' },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    // Explicit widths (sum = 182mm = full usable width after 14mm margins) so
    // the table fills the page evenly, and per-column alignment: counts
    // centred, money right-aligned, text left.
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },  // #
      1: { halign: 'left',   cellWidth: 50 }, // Product
      2: { halign: 'left',   cellWidth: 22 }, // Batch
      3: { halign: 'center', cellWidth: 18 }, // Expiry
      4: { halign: 'center', cellWidth: 16 }, // Ordered
      5: { halign: 'center', cellWidth: 18 }, // Received
      6: { halign: 'center', cellWidth: 12 }, // Free
      7: { halign: 'right',  cellWidth: 19 }, // Rate
      8: { halign: 'right',  cellWidth: 19 }, // MRP
    },
    // Header text is left-aligned by default — force each header cell to use
    // its column's alignment so labels sit directly above their values.
    didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
      if (data.section !== 'head') return
      const align = ['center', 'left', 'left', 'center', 'center', 'center', 'center', 'right', 'right'][data.column.index]
      if (align) data.cell.styles.halign = align
    },
    margin: { left: 14, right: 14 },
  })

  // ── Totals block — right-aligned: labels at labelX, amounts flush-right. ──
  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  const labelX = pageWidth - 74 // left edge of the totals block
  const valueX = pageWidth - 14 // right edge (amounts align here)
  const gst = grn.gst
  let ty = afterTableY

  doc.setFontSize(9)
  if (gst) {
    doc.setFont('helvetica', 'normal')
    const row = (label: string, amount: number) => {
      doc.text(label, labelX, ty)
      doc.text(fmt(amount), valueX, ty, { align: 'right' })
      ty += 5
    }
    row('Taxable Amount', gst.taxable)
    row('CGST', gst.cgst)
    row('SGST', gst.sgst)
    // Separator above the grand total.
    ty += 0.5
    doc.setDrawColor(180)
    doc.line(labelX, ty, valueX, ty)
    ty += 5
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('GRAND TOTAL', labelX, ty)
  doc.text(fmt(gst ? gst.total : Number(grn.totalAmount)), valueX, ty, { align: 'right' })

  const footerY = doc.internal.pageSize.getHeight() - 20
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text('Goods received in good condition. Subject to Madurai jurisdiction.', pageWidth / 2, footerY, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Received By', leftX, footerY + 8)
  doc.text('Authorised Signatory', pageWidth - 14, footerY + 8, { align: 'right' })

  if (options?.autoPrint) {
    doc.autoPrint()
    printPdfInPage(doc.output('bloburl').toString())
  }
  return doc
}

export function downloadGrnPdf(grn: GrnPdfData) {
  const doc = generateGrnPdf(grn)
  doc.save(`${grn.grnNumber}.pdf`)
}

export function printGrnPdf(grn: GrnPdfData) {
  generateGrnPdf(grn, { autoPrint: true })
}
