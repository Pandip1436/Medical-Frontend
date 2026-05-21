import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { printHtmlInPage } from '@/lib/printUtils'
import { formatDate } from '@/lib/utils'

// HTML-escape for safe interpolation into printable markup.
// Customer/lead/product fields can contain `<`, `>`, `&`, `"`, `'` that would
// otherwise break the table or, worse, execute inline scripts.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Convert an array of plain objects to a CSV blob and trigger download.
 *  Returns the number of data rows written so the caller can surface a
 *  "Exported N of M" confirmation — previously callers had no way to know
 *  whether the file matched the on-screen count (Bug #6: list said 51,
 *  file looked like 50, both because no trailing newline made wc -l
 *  under-count by 1, and because the caller didn't confirm the row count). */
export function exportToCsv(rows: Record<string, unknown>[], filename: string): number {
  if (!rows.length) return 0
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? ''
          const str = String(val)
          // Quote if contains comma, quote, or newline
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str
        })
        .join(','),
    ),
  ]
  // Trailing `\r\n` so `wc -l` and most text-editor "line count" reports
  // see N+1 lines (header + N rows) rather than N — matches RFC 4180.
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return rows.length
}

/** Generate a PDF table from an array of plain objects and trigger download */
export function exportToPdf(
  rows: Record<string, unknown>[],
  title: string,
  filename: string,
) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, pageWidth / 2, 15, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(
    `Generated on ${formatDate(new Date())}`,
    pageWidth / 2,
    21,
    { align: 'center' },
  )

  autoTable(doc, {
    startY: 28,
    head: [headers.map((h) => h.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()))],
    body: rows.map((row) => headers.map((h) => String(row[h] ?? ''))),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [45, 55, 72], textColor: 255 },
    margin: { left: 14, right: 14 },
  })

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

/** Print an array of plain objects in a new window */
export function printReport(rows: Record<string, unknown>[], title: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const headerRow = headers
    .map((h) => `<th>${escapeHtml(h.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()))}</th>`)
    .join('')
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${headers.map((h) => `<td>${escapeHtml(String(row[h] ?? ''))}</td>`).join('')}</tr>`,
    )
    .join('')

  const safeTitle = escapeHtml(title)
  const html = `<!DOCTYPE html><html><head><title>${safeTitle}</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;padding:16px}
    h2{text-align:center;margin-bottom:8px;font-size:14px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
    th{background:#2d3748;color:#fff}
    tr:nth-child(even){background:#f7f7f7}
    tr{page-break-inside:avoid}
    @media print{body{padding:0;font-size:10px}thead{display:table-header-group}}
    @media print and (max-width:480px){body{font-size:9px}}
  </style></head><body>
  <h2>${safeTitle}</h2>
  <p style="text-align:center;color:#666;font-size:10px">Generated on ${formatDate(new Date())}</p>
  <table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
  </body></html>`

  printHtmlInPage(html)
}
