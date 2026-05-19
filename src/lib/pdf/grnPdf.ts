import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { printPdfInPage } from '@/lib/printUtils'

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

const fmt = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })

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
  items: GrnItemLike[]
  company?: GrnPdfCompany
}

export function generateGrnPdf(grn: GrnPdfData, options?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const company = { ...COMPANY_FALLBACK, ...(grn.company ?? {}) }

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
  doc.text('GOODS RECEIPT NOTE', pageWidth / 2, 41, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  const dateStr = grn.date ? new Date(grn.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')
  let y = 48
  doc.text(`GRN No: ${grn.grnNumber}`, leftX, y)
  doc.text(`Date: ${dateStr}`, rightX, y)
  y += 5
  doc.text(`Supplier: ${grn.supplierName}`, leftX, y)
  if (grn.supplierInvoiceNo) doc.text(`Invoice No: ${grn.supplierInvoiceNo}`, rightX, y)
  y += 5
  if (grn.supplierInvoiceDate) {
    doc.text(`Supplier Inv Date: ${new Date(grn.supplierInvoiceDate).toLocaleDateString('en-IN')}`, leftX, y)
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
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    columnStyles: {
      0: { halign: 'right', cellWidth: 8 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const summaryX = pageWidth - 80
  doc.setFont('helvetica', 'bold')
  doc.text('GRAND TOTAL', summaryX, afterTableY)
  doc.text(fmt(Number(grn.totalAmount)), pageWidth - 14, afterTableY, { align: 'right' })

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
