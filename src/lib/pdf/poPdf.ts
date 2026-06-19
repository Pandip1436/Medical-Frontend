import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { printPdfInPage } from '@/lib/printUtils'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatDate } from '@/lib/utils'
import { getPdfLogo } from '@/lib/pdf/logo'

const DEFAULT_COMPANY = {
  name: 'HOSPITAL SUPPLIERS',
  address: 'Hospital Suppliers, Madurai, Tamil Nadu',
  phone: '+91 452 234 5678',
  email: 'contact@hospitalsuppliers.in',
  gstin: '33AAAPL1234C1Z5',
}

function getCompany() {
  const profile = useSettingsStore.getState().businessProfile
  if (!profile) return DEFAULT_COMPANY
  return {
    name: profile.name || DEFAULT_COMPANY.name,
    address: profile.address || DEFAULT_COMPANY.address,
    phone: profile.phone || DEFAULT_COMPANY.phone,
    email: profile.email || DEFAULT_COMPANY.email,
    gstin: profile.gstin || DEFAULT_COMPANY.gstin,
  }
}

// jsPDF's Helvetica lacks the ₹ glyph (U+20B9) — it prints garbled — so use
// the "Rs." prefix, which renders cleanly on the PDF.
const fmt = (n: number) =>
  `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
  const company = getCompany()

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
  doc.text(`GSTIN: ${company.gstin}`, pageWidth / 2, 31, { align: 'center' })

  doc.setDrawColor(180)
  doc.line(14, 34, pageWidth - 14, 34)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('PURCHASE ORDER', pageWidth / 2, 41, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  const dateStr = po.date ? formatDate(po.date) : formatDate(new Date())
  let y = 48
  doc.text(`PO No: ${po.poNumber}`, leftX, y)
  doc.text(`Date: ${dateStr}`, rightX, y)
  y += 5
  doc.text(`Supplier: ${po.supplierName}`, leftX, y)
  doc.text(`Status: ${po.status}`, rightX, y)
  y += 5
  if (po.expectedDelivery) {
    doc.text(`Expected Delivery: ${formatDate(po.expectedDelivery)}`, leftX, y)
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
      // Round line total to paise (2 decimal places) before display so IEEE-754
      // artifacts (e.g., 38.970000000000006) never leak into printed PDFs.
      (Math.round(it.requiredQty * Number(it.expectedRate) * 100) / 100).toFixed(2),
      it.remarks ?? '',
    ]),
    styles: { fontSize: 8, cellPadding: 1.5, valign: 'middle' },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 8 },   // #
      2: { cellWidth: 22 },  // Ordered Qty
      3: { cellWidth: 22 },  // Received Qty
      4: { cellWidth: 24 },  // Rate
      5: { cellWidth: 26 },  // Amount
    },
    // Align header AND body identically per column so the numbers sit directly
    // under their labels (#, quantities centred; money right-aligned).
    didParseCell: (data) => {
      const i = data.column.index;
      if (i === 0 || i === 2 || i === 3) data.cell.styles.halign = 'center';
      else if (i === 4 || i === 5) data.cell.styles.halign = 'right';
    },
    margin: { left: 14, right: 14 },
  })

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
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
    printPdfInPage(doc.output('bloburl').toString())
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
