import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice } from '@/types'
import { printPdfInPage } from '@/lib/printUtils'
import { formatDate } from '@/lib/utils'
import { getPdfLogo } from '@/lib/pdf/logo'
import api, { handleApiError } from '@/lib/api'
import { useSettingsStore } from '@/stores/settingsStore'

// Default company info — used only as fallback when the settings store
// hasn't loaded a business profile yet. The real values come from
// /settings/business via useSettingsStore (Settings > Business Profile).
const DEFAULT_COMPANY = {
  name: 'HOSPITAL SUPPLIERS',
  city: 'Madurai',
  address:
    'D.No: 12D/1, Ground Floor, North Portion, Technical School West, 4th Street, Sahaya Matha, Gnanaolipuram, Madurai - 625016',
  phone: '9994113242, 9994173036, 8870066824',
  email: 'hospitalsuppliers2004@gmail.com',
  gstin: '33AFAPB0063K1Z3',
  dlNo: 'MDU/5029/4769/20B,21B  MDU/6114/6114/20,21',
}

// Payment instructions printed under the items table, mirroring the challan
// layout the client works from. These used to be hard-coded names and numbers
// here; they now come from Settings -> Invoice & Payment so a phone number can
// be changed without a code change (the old comment here even said to move it
// into Settings "if it ever needs to change" — it did).
const PAYMENT_NOTE_TITLE = 'Kindly deposit Payment through Our'

// Build the payment lines from settings. Returns [] when nothing is configured,
// which suppresses the heading too rather than printing a bare label.
//
// `gapBefore` opens a blank half-line above a row. It marks the FIRST bank line
// so the UPI numbers and the bank account read as two separate groups instead of
// one seven-line wall — whichever bank field happens to be filled in first.
function getPaymentLines(): Array<{ text: string; gapBefore?: boolean }> {
  const s = useSettingsStore.getState().invoicePrint
  const lines: Array<{ text: string; gapBefore?: boolean }> = []

  s.gpay.forEach((g, i) => {
    if (i > 0) lines.push({ text: 'OR' })
    // "GPAY:" prefixes only the first entry, matching the challan stationery.
    lines.push({ text: `${i === 0 ? 'GPAY: ' : ''}${g.name}${g.number ? ` - ${g.number}` : ''}` })
  })

  const bank: string[] = []
  if (s.bankName) bank.push(s.bankName)
  if (s.bankAccountNumber) bank.push(`A/C: ${s.bankAccountNumber}`)
  if (s.bankIfsc) bank.push(`IFSC: ${s.bankIfsc}`)
  bank.forEach((text, i) => {
    // Only separate the groups when there is actually a GPay block above —
    // bank-only settings shouldn't start with a stray blank line.
    lines.push({ text, gapBefore: i === 0 && lines.length > 0 })
  })

  return lines
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

// ─── Layout geometry (mm, A4 210×297) ────────────────────────────────
// The document mirrors the client's delivery-challan stationery: one ruled
// outer frame with every block sitting in its own bordered band, rather than
// centred text floating on the page.
const M = 10                 // page margin / frame inset
const RIGHT = 200            // frame right edge
const FRAME_TOP = 10
const FRAME_BOTTOM = 285     // leaves room for the page-number strip
const HEAD_BOTTOM = 40       // business block + document title
const META_BOTTOM = 55       // invoice no/date | salesperson
const MID = 108              // vertical divider for the two-column bands
const HEAD_GUTTER = 4        // clear space between the business block and the title
const HEAD_MIN_INFO = 82     // address never wraps in less than this; title shrinks first
const PAY_BADGE_PT = 9       // PAID / CREDIT / PART PAID box under the title
const PAY_BADGE_H = 5.5

// What the document says about money, in one word under the title. Derived from
// the same two numbers the totals block prints, so the badge can never
// contradict them. Returns null where the question doesn't apply: a quotation
// (nothing is owed yet) and a zero-value document (a replacement, which is
// already marked NO CHARGE).
function paymentStatusLabel(invoice: Invoice): string | null {
  if (invoice.type === 'QUOTATION') return null
  const total = Number(invoice.grandTotal ?? 0)
  const paid = Number(invoice.amountPaid ?? 0)
  if (total <= 0.01) return null
  if (paid >= total - 0.01) return 'PAID'
  if (paid <= 0.01) return 'CREDIT'
  return 'PART PAID'
}

// Draws everything that repeats on every page: the outer frame, the business
// header and the document title. Registered as autoTable's didDrawPage so a
// multi-page invoice keeps its letterhead instead of only page one having it.
function drawPageChrome(
  doc: jsPDF,
  company: ReturnType<typeof getCompany>,
  title: string,
  logo: string | null,
  payStatus: string | null,
) {
  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.rect(M, FRAME_TOP, RIGHT - M, FRAME_BOTTOM - FRAME_TOP)
  doc.setLineWidth(0.2)

  // Logo left, business details beside it, document title hard right.
  let textX = M + 3
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', M + 3, FRAME_TOP + 3, 22, 22)
      textX = M + 28
    } catch { /* bad image — fall back to text at the margin */ }
  }

  // The document title is operator-editable (Settings -> Invoice & Payment), so
  // its width is not knowable at design time: "DELIVERY CHALLAN" is half again
  // as wide as the "TAX INVOICE" this header was first laid out for, and against
  // the old fixed 108mm address wrap it overlapped. Measure the real title,
  // shrink it if it would squeeze the business block below readable, then wrap
  // the address in whatever width is actually left over.
  const avail = RIGHT - 3 - textX
  doc.setFont('helvetica', 'bold')
  let titleSize = 19
  doc.setFontSize(titleSize)
  const maxTitleW = avail - HEAD_MIN_INFO - HEAD_GUTTER
  while (titleSize > 10 && doc.getTextWidth(title) > maxTitleW) {
    titleSize -= 0.5
    doc.setFontSize(titleSize)
  }
  const titleW = doc.getTextWidth(title)
  // The status badge sits under the title, so the space the address must keep
  // clear is whichever of the two is wider — with a short title the badge is
  // the one that would otherwise be run into.
  doc.setFontSize(PAY_BADGE_PT)
  const badgeW = payStatus ? doc.getTextWidth(payStatus) + 6 : 0
  const infoW = Math.max(30, avail - Math.max(titleW, badgeW) - HEAD_GUTTER)

  // Same treatment for the business name: shrink rather than run into the title
  // or wrap onto a second line, which would push the address past HEAD_BOTTOM.
  let nameSize = 13
  doc.setFontSize(nameSize)
  while (nameSize > 8 && doc.getTextWidth(company.name) > infoW) {
    nameSize -= 0.5
    doc.setFontSize(nameSize)
  }
  doc.text(company.name, textX, FRAME_TOP + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  // Address is one long line in the profile — wrap it inside the space left of
  // the title so it can never run under (or past) the document title.
  const addrLines = doc.splitTextToSize(company.address, infoW) as string[]
  let hy = FRAME_TOP + 12.5
  for (const line of addrLines.slice(0, 3)) {
    doc.text(line, textX, hy)
    hy += 3.4
  }
  doc.text(`Phone: ${company.phone}`, textX, hy); hy += 3.4
  // GSTIN / D.L. are independently suppressible (Settings -> Invoice &
  // Payment). Built as parts so hiding one doesn't leave the other's separator
  // stranded, and the whole line is skipped when both are off.
  const printOpts = useSettingsStore.getState().invoicePrint
  const idParts: string[] = []
  if (company.gstin && !printOpts.hideBusinessGstin) idParts.push(`GSTIN: ${company.gstin}`)
  if (company.dlNo && !printOpts.hideBusinessDl) idParts.push(`D.L.No: ${company.dlNo}`)
  if (idParts.length) doc.text(idParts.join('   '), textX, hy)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  doc.text(title, RIGHT - 3, FRAME_TOP + 15, { align: 'right' })

  // PAID / CREDIT / PART PAID, boxed under the title. Whether the counter staff
  // handing this over should be collecting money is the one thing worth reading
  // off the top of the page, so it goes with the title rather than being buried
  // in the totals column.
  if (payStatus) {
    doc.setFontSize(PAY_BADGE_PT)
    const w = doc.getTextWidth(payStatus) + 6
    const x = RIGHT - 3 - w
    const y = FRAME_TOP + 18.5
    doc.setLineWidth(0.35)
    doc.rect(x, y, w, PAY_BADGE_H)
    doc.setLineWidth(0.2)
    doc.text(payStatus, x + w / 2, y + 3.9, { align: 'center' })
  }

  doc.setLineWidth(0.4)
  doc.line(M, HEAD_BOTTOM, RIGHT, HEAD_BOTTOM)
  doc.setLineWidth(0.2)
}

// "Label : value" with the colons lined up, as on the reference challan.
function labelled(doc: jsPDF, label: string, value: string, x: number, y: number, colonX: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(label, x, y)
  doc.text(':', colonX, y)
  doc.setFont('helvetica', 'bold')
  doc.text(value, colonX + 2.5, y)
  doc.setFont('helvetica', 'normal')
}

export function generateInvoicePdf(invoice: Invoice, options?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const company = getCompany()
  const logo = getPdfLogo()

  // A replacement invoice fulfils a REPLACEMENT credit note at no charge.
  // Detect via the flag (set on reprint) or the REPL/ number series (set at
  // save time, before the credit-note link exists).
  const isReplacement =
    invoice.isReplacement === true ||
    (invoice.invoiceNumber ?? '').toUpperCase().startsWith('REPL')
  const isQuote = invoice.type === 'QUOTATION'
  // A quotation is always titled QUOTATION — it isn't the invoice document, so
  // the configured title doesn't apply to it.
  const title = isQuote
    ? 'QUOTATION'
    : useSettingsStore.getState().invoicePrint.documentTitle || 'DELIVERY CHALLAN'

  const payStatus = paymentStatusLabel(invoice)
  drawPageChrome(doc, company, title, logo, payStatus)

  // ── Meta band: document no/date on the left, salesperson on the right ──
  doc.line(M, META_BOTTOM, RIGHT, META_BOTTOM)
  doc.line(MID, HEAD_BOTTOM, MID, META_BOTTOM)
  const noLabel = isQuote ? 'Quotation No' : 'Invoice No'
  const dateLabel = isQuote ? 'Quotation Date' : 'Invoice Date'
  labelled(doc, noLabel, invoice.invoiceNumber, M + 3, HEAD_BOTTOM + 5.5, M + 26)
  labelled(doc, dateLabel, formatDate(invoice.date), M + 3, HEAD_BOTTOM + 11, M + 26)
  if (invoice.salespersonName) {
    labelled(doc, 'Sales person', invoice.salespersonName, MID + 3, HEAD_BOTTOM + 5.5, MID + 26)
  }
  // Due date is a credit-invoice concept; a quotation has no payment due.
  if (invoice.dueDate && !isQuote) {
    labelled(doc, 'Due Date', formatDate(invoice.dueDate), MID + 3, HEAD_BOTTOM + 11, MID + 26)
  } else {
    labelled(doc, 'Payment', invoice.paymentMode ?? '-', MID + 3, HEAD_BOTTOM + 11, MID + 26)
  }

  // ── Party band ──
  // Height follows the content: a walk-in with just a name gets a single-line
  // band instead of a fixed box with a blank half.
  const phoneSuffix =
    invoice.customerPhone && invoice.customerPhone !== '0000000000'
      ? ` (${invoice.customerPhone})`
      : ''
  const partyBits: string[] = []
  if (invoice.customerAddress) partyBits.push(invoice.customerAddress)
  // Suppressible via Settings -> Invoice & Payment. (There is no customer D.L.
  // on the Invoice type this renderer receives, so the matching "hide customer
  // D.L." toggle only has an effect on the backend-rendered WhatsApp copy.)
  if (invoice.customerGstin && !useSettingsStore.getState().invoicePrint.hideCustomerGstin) {
    partyBits.push(`GSTIN: ${invoice.customerGstin}`)
  }
  if (invoice.doctorName) partyBits.push(`Doctor: ${invoice.doctorName}`)
  doc.setFontSize(8)
  const partyLines = partyBits.length
    ? (doc.splitTextToSize(partyBits.join('   |   '), RIGHT - M - 6) as string[]).slice(0, 2)
    : []
  const partyBottom = META_BOTTOM + 8.5 + partyLines.length * 3.8

  doc.line(M, partyBottom, RIGHT, partyBottom)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`${invoice.customerName}${phoneSuffix}`, M + 3, META_BOTTOM + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  if (partyLines.length) doc.text(partyLines, M + 3, META_BOTTOM + 10)
  if (isReplacement) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(2, 132, 199)
    doc.text('REPLACEMENT - NO CHARGE', RIGHT - 3, META_BOTTOM + 5.5, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
  }

  // ── Items ──
  // Column set follows the reference challan (#, Description, MRP, Batch, Qty,
  // Rate, Amount) plus the two a tax invoice cannot omit: Expiry (drug
  // traceability) and GST% (rate-wise tax). Quotations drop batch and expiry.
  const head = isQuote
    ? ['#', 'Description', 'MRP', 'Qty', 'Rate', 'GST%', 'Amount']
    : ['#', 'Description', 'MRP', 'Batch No', 'Expiry', 'Qty', 'Rate', 'GST%', 'Amount']
  const columnStyles = (isQuote
    ? {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'left',   cellWidth: 82 },
        2: { halign: 'right',  cellWidth: 20 },
        3: { halign: 'center', cellWidth: 16 },
        4: { halign: 'right',  cellWidth: 22 },
        5: { halign: 'center', cellWidth: 14 },
        6: { halign: 'right',  cellWidth: 27 },
      }
    : {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'left',   cellWidth: 58 },
        2: { halign: 'right',  cellWidth: 17 },
        3: { halign: 'left',   cellWidth: 22 },
        4: { halign: 'center', cellWidth: 16 },
        5: { halign: 'center', cellWidth: 14 },
        6: { halign: 'right',  cellWidth: 20 },
        7: { halign: 'center', cellWidth: 12 },
        8: { halign: 'right',  cellWidth: 22 },
      }) as Record<number, { halign: 'left' | 'center' | 'right'; cellWidth: number }>

  autoTable(doc, {
    startY: partyBottom,
    head: [head],
    body: invoice.items.map((it, i) => {
      const amt = Number(it.amount || 0)
      const qty = `${it.quantity}`
      const tail = [
        qty,
        Number(it.rate).toFixed(2),
        Number(it.gstPercent).toFixed(2),
        amt.toFixed(2),
      ]
      return isQuote
        ? [i + 1, it.productName, Number(it.mrp).toFixed(2), ...tail]
        : [
            i + 1,
            it.productName,
            Number(it.mrp).toFixed(2),
            it.batchNumber || '-',
            it.batchNumber && it.expiryDate
              ? new Date(it.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
              : '-',
            ...tail,
          ]
    }),
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 1.6,
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineWidth: 0.2,
    },
    columnStyles,
    // Header labels sit directly above their values.
    didParseCell: (data) => {
      if (data.section !== 'head') return
      const align = columnStyles[data.column.index]?.halign
      if (align) data.cell.styles.halign = align
    },
    // Continuation pages get the same letterhead and start below it.
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawPageChrome(doc, company, title, logo, payStatus)
    },
    margin: { left: M, right: pageWidth - RIGHT, top: HEAD_BOTTOM + 4, bottom: 60 },
  })

  // ── Payment note (left) + totals (right) ──
  const tableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const balanceDue = Math.max(0, Number(invoice.grandTotal) - Number(invoice.amountPaid))

  const totals: [string, string, boolean][] = [['Sub Total', fmt2(Number(invoice.subtotal)), false]]
  if (Number(invoice.productDiscount) > 0) {
    totals.push(['Discount', `- ${fmt2(Number(invoice.productDiscount))}`, false])
  }
  totals.push(['Taxable', fmt2(Number(invoice.taxableAmount)), false])
  if (Number(invoice.cgst) > 0) totals.push(['CGST', fmt2(Number(invoice.cgst)), false])
  if (Number(invoice.sgst) > 0) totals.push(['SGST', fmt2(Number(invoice.sgst)), false])
  if (Number(invoice.igst) > 0) totals.push(['IGST', fmt2(Number(invoice.igst)), false])
  if (Number(invoice.deliveryCharge) > 0) {
    totals.push(['Delivery / Packaging', fmt2(Number(invoice.deliveryCharge)), false])
  }
  for (const c of (invoice.additionalCharges ?? [])) {
    if ((c?.label ?? '').trim() === '' || Number(c?.amount) === 0) continue
    totals.push([String(c.label).trim(), fmt2(Number(c.amount) || 0), false])
  }
  if (Math.abs(Number(invoice.roundOff)) > 0) {
    totals.push(['Round Off', fmt2(Number(invoice.roundOff)), false])
  }
  totals.push(['Total', fmt2(Number(invoice.grandTotal)), true])
  if (Number(invoice.amountPaid) > 0) totals.push(['Paid', fmt2(Number(invoice.amountPaid)), false])
  if (balanceDue > 0) totals.push(['Balance Due', fmt2(balanceDue), true])

  const bandTop = tableEnd
  const bandHeight = Math.max(totals.length * 5 + 6, 30)
  const bandBottom = bandTop + bandHeight
  // No box around this band: the payment note on the left is one tall cell that
  // runs from the items table down to the rule under the signature, so the only
  // rules here are the centre divider and — on the right half only — the line
  // separating the totals from the signature panel below.
  doc.line(MID, bandTop, MID, bandBottom)

  // Payment instructions, mirroring the challan's left-hand block. Skipped
  // entirely (heading included) when nothing is configured in Settings.
  const paymentLines = getPaymentLines()
  if (paymentLines.length) {
    doc.setFont('helvetica', 'bolditalic')
    doc.setFontSize(8.5)
    doc.text(PAYMENT_NOTE_TITLE, M + 3, bandTop + 6)
    doc.setFont('helvetica', 'bold')
    let py = bandTop + 11
    for (const line of paymentLines) {
      if (line.gapBefore) py += 3.5
      doc.text(line.text, M + 3, py)
      py += 4.5
    }
    doc.setFont('helvetica', 'normal')
  }

  let ty = bandTop + 6
  for (const [label, value, bold] of totals) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 9.5 : 8.5)
    doc.text(label, MID + 4, ty)
    doc.text(value, RIGHT - 3, ty, { align: 'right' })
    ty += 5
  }

  // ── Signature panel ──
  // Sits under the totals; the left column stays clear, as on the challan.
  const signTop = bandBottom
  const signHeight = 26
  doc.rect(MID, signTop, RIGHT - MID, signHeight)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`For ${company.name}`, (MID + RIGHT) / 2, signTop + signHeight - 4, { align: 'center' })

  // A full-width rule closes the signature row. Below it the page is one open
  // area — no centre divider — matching the challan.
  doc.line(M, signTop + signHeight, RIGHT, signTop + signHeight)

  // ── Page numbers, outside the frame like the reference ──
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.text(`${p} / ${pages}`, RIGHT, pageHeight - 8, { align: 'right' })
  }

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
    handleApiError(err, 'Could not prepare share link — please try again')
    throw err
  }
  const message = `${headline}\n\nDownload: ${url}\n\nRegards,\n${getCompany().name}`
  window.open(buildWaUrl(phone, message), '_blank', 'noopener,noreferrer')
}
