import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { printPdfInPage } from '@/lib/printUtils'
import { formatDate } from '@/lib/utils'

const COMPANY_FALLBACK = {
  name: 'HOSPITAL SUPPLIERS',
  address: 'Hospital Suppliers, Madurai, Tamil Nadu',
  phone: '+91 452 234 5678',
  email: 'contact@hospitalsuppliers.in',
  gstin: '33AAAPL1234C1Z5',
}

export interface NotePdfCompany {
  name?: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
}

const fmt = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })

type NoteKind = 'CREDIT' | 'DEBIT'

interface NoteItem {
  productName: string
  batchNumber: string
  expiryDate?: string
  returnedQty: number
  rate: number
  gstPercent: number
  amount: number
}

interface NoteData {
  noteNo: string
  date: string
  partyLabel: string
  partyName: string
  referenceLabel: string
  referenceValue: string
  reason: string
  items: NoteItem[]
  subtotal: number
  cgst?: number
  sgst?: number
  igst?: number
  totalAmount: number
  footerLine?: string
  company?: NotePdfCompany
}

function buildNotePdf(kind: NoteKind, note: NoteData, options?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const company = { ...COMPANY_FALLBACK, ...(note.company ?? {}) }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(company.name, pageWidth / 2, 15, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(company.address, pageWidth / 2, 21, { align: 'center' })
  doc.text(`GSTIN: ${company.gstin}`, pageWidth / 2, 26, { align: 'center' })
  doc.setDrawColor(180)
  doc.line(14, 29, pageWidth - 14, 29)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  // Short-billing debit notes are billing claims, not goods returns — title
  // them differently so the supplier reads it correctly.
  const isShortBilling =
    kind === 'DEBIT' && /short.*delivery|short.*supply/i.test(note.reason ?? '')
  const title =
    kind === 'CREDIT'
      ? 'CREDIT NOTE'
      : isShortBilling
        ? 'SHORT-BILLING DEBIT NOTE'
        : 'DEBIT NOTE'
  doc.text(title, pageWidth / 2, 36, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  let y = 43
  doc.text(`Note No: ${note.noteNo}`, leftX, y)
  doc.text(`Date: ${formatDate(note.date)}`, rightX, y)
  y += 5
  doc.text(`${note.partyLabel}: ${note.partyName}`, leftX, y)
  doc.text(`${note.referenceLabel}: ${note.referenceValue}`, rightX, y)
  y += 5
  doc.text(`Reason: ${note.reason}`, leftX, y, { maxWidth: pageWidth - 28 })

  autoTable(doc, {
    startY: y + 6,
    head: [['#', 'Product', 'Batch', 'Expiry', 'Qty', 'Rate', 'GST%', 'Amount']],
    body: note.items.map((it, i) => [
      i + 1,
      it.productName,
      it.batchNumber,
      it.expiryDate
        ? new Date(it.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        : '-',
      it.returnedQty,
      Number(it.rate).toFixed(2),
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
  row('Subtotal', fmt(Number(note.subtotal)), sy); sy += 5
  if (Number(note.cgst ?? 0) > 0) { row('CGST', fmt(Number(note.cgst)), sy); sy += 5 }
  if (Number(note.sgst ?? 0) > 0) { row('SGST', fmt(Number(note.sgst)), sy); sy += 5 }
  if (Number(note.igst ?? 0) > 0) { row('IGST', fmt(Number(note.igst)), sy); sy += 5 }
  sy += 2
  doc.setDrawColor(180)
  doc.line(summaryX - 2, sy - 1, pageWidth - 14, sy - 1)
  row('TOTAL', fmt(Number(note.totalAmount)), sy + 4, true)

  if (note.footerLine) {
    const footerY = doc.internal.pageSize.getHeight() - 20
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.text(note.footerLine, pageWidth / 2, footerY, { align: 'center' })
  }

  if (options?.autoPrint) {
    doc.autoPrint()
    printPdfInPage(doc.output('bloburl').toString())
  }
  return doc
}

export type { NoteData }

export function downloadCreditNotePdf(note: NoteData) {
  const doc = buildNotePdf('CREDIT', note)
  doc.save(`${note.noteNo}.pdf`)
}

export function printCreditNotePdf(note: NoteData) {
  buildNotePdf('CREDIT', note, { autoPrint: true })
}

export function downloadDebitNotePdf(note: NoteData) {
  const doc = buildNotePdf('DEBIT', note)
  doc.save(`${note.noteNo}.pdf`)
}

export function printDebitNotePdf(note: NoteData) {
  buildNotePdf('DEBIT', note, { autoPrint: true })
}
