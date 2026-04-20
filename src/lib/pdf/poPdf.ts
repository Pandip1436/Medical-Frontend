import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const COMPANY = {
  name: 'HOSPITAL SUPPLIERS',
  address: 'Hospital Suppliers, Madurai, Tamil Nadu',
  phone: '+91 452 234 5678',
  email: 'contact@hospitalsuppliers.in',
  gstin: '33AAAPL1234C1Z5',
}

const fmt = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })

export interface PoItemLike {
  productName: string
  requiredQty: number
  receivedQty: number
  expectedRate: number | string
  remarks?: string
}

export interface PoPdfData {
  poNumber: string
  date?: string | Date
  supplierName: string
  expectedDelivery?: string | Date
  status: string
  totalAmount: number | string
  items: PoItemLike[]
}

export function generatePoPdf(po: PoPdfData, options?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(COMPANY.name, pageWidth / 2, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(COMPANY.address, pageWidth / 2, 21, { align: 'center' })
  doc.text(`Phone: ${COMPANY.phone}  |  Email: ${COMPANY.email}`, pageWidth / 2, 26, { align: 'center' })
  doc.text(`GSTIN: ${COMPANY.gstin}`, pageWidth / 2, 31, { align: 'center' })

  doc.setDrawColor(180)
  doc.line(14, 34, pageWidth - 14, 34)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PURCHASE ORDER', pageWidth / 2, 41, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  const dateStr = po.date ? new Date(po.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')
  let y = 48
  doc.text(`PO No: ${po.poNumber}`, leftX, y)
  doc.text(`Date: ${dateStr}`, rightX, y)
  y += 5
  doc.text(`Supplier: ${po.supplierName}`, leftX, y)
  doc.text(`Status: ${po.status}`, rightX, y)
  y += 5
  if (po.expectedDelivery) {
    doc.text(`Expected Delivery: ${new Date(po.expectedDelivery).toLocaleDateString('en-IN')}`, leftX, y)
    y += 3
  }

  autoTable(doc, {
    startY: y + 3,
    head: [['#', 'Product', 'Ordered Qty', 'Received Qty', 'Rate', 'Amount', 'Remarks']],
    body: po.items.map((it, i) => [
      i + 1,
      it.productName,
      it.requiredQty,
      it.receivedQty,
      Number(it.expectedRate).toFixed(2),
      (it.requiredQty * Number(it.expectedRate)).toFixed(2),
      it.remarks ?? '',
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    columnStyles: {
      0: { halign: 'right', cellWidth: 8 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const afterTableY = (doc as any).lastAutoTable.finalY + 6
  const summaryX = pageWidth - 80
  doc.setFont('helvetica', 'bold')
  doc.text('GRAND TOTAL', summaryX, afterTableY)
  doc.text(fmt(Number(po.totalAmount)), pageWidth - 14, afterTableY, { align: 'right' })

  const footerY = doc.internal.pageSize.getHeight() - 20
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text('Subject to Madurai jurisdiction.', pageWidth / 2, footerY, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.text('Prepared By', leftX, footerY + 8)
  doc.text('Authorised Signatory', pageWidth - 14, footerY + 8, { align: 'right' })

  if (options?.autoPrint) {
    doc.autoPrint()
    window.open(doc.output('bloburl'), '_blank')
  }
  return doc
}

export function downloadPoPdf(po: PoPdfData) {
  const doc = generatePoPdf(po)
  doc.save(`${po.poNumber}.pdf`)
}

export function printPoPdf(po: PoPdfData) {
  generatePoPdf(po, { autoPrint: true })
}
