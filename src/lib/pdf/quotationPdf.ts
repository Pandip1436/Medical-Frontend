import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { COMPANY, fmtINR, uploadAndShareUrl } from './invoicePdf'
import { formatDate } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'

// Live business details, falling back to the bundled constant before the
// settings store has loaded. This used to read COMPANY directly, so editing
// Settings > Business Profile changed every document except the quotation.
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
  // User-defined extra charges (Commission, Handling, …) — non-taxable add-ons
  // already folded into `total`; each prints as its own line.
  additionalCharges?: { label: string; amount: number }[]
  total: number
}

export function generateQuotationPdf(qt: QuotationDoc) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  const company = getCompany()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(company.name, pageWidth / 2, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  // The address is one long line now, so wrap it rather than letting it run off
  // both edges of the page.
  const addr = doc.splitTextToSize(company.address, pageWidth - 28) as string[]
  doc.text(addr, pageWidth / 2, 21, { align: 'center' })
  const afterAddr = 21 + (addr.length - 1) * 4
  doc.text(`Phone: ${company.phone}  |  Email: ${company.email}`, pageWidth / 2, afterAddr + 5, { align: 'center' })
  doc.text(`GSTIN: ${company.gstin}  |  DL No: ${company.dlNo}`, pageWidth / 2, afterAddr + 10, { align: 'center' })

  // Everything below the letterhead shifts with it, so a wrapped address can't
  // collide with the rule or the title.
  const ruleY = afterAddr + 13
  doc.setDrawColor(180)
  doc.line(14, ruleY, pageWidth - 14, ruleY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('QUOTATION', pageWidth / 2, ruleY + 7, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const leftX = 14
  const rightX = pageWidth / 2 + 5
  let y = ruleY + 14
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
  for (const c of (qt.additionalCharges ?? [])) {
    if ((c?.label ?? '').trim() === '' || Number(c?.amount) === 0) continue
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(String(c.label).trim(), pageWidth - 60, totalY)
    doc.text(fmtINR(Number(c.amount) || 0), pageWidth - 14, totalY, { align: 'right' })
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
