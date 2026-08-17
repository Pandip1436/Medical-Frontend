import * as XLSX from 'xlsx'

/**
 * Convert an array of plain objects to an Excel (.xlsx) file and trigger
 * download. When `title` is given it's written as a bold-ish heading row
 * merged across all columns at the top (like the PDF export's title), with the
 * data table below it.
 */
export function exportToExcel(rows: Record<string, unknown>[], filename: string, title?: string) {
  if (!rows.length) return
  // With a title, seed A1 with the title then write the data table below it
  // (headers at A2, data A3+); `origin` is a sheet_add_json option, not a
  // json_to_sheet one. Without a title the data starts at A1.
  const worksheet = XLSX.utils.aoa_to_sheet(title ? [[title]] : [])
  XLSX.utils.sheet_add_json(worksheet, rows, { origin: title ? 'A2' : 'A1' })
  if (title) {
    const colCount = Object.keys(rows[0]).length
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, colCount - 1) } },
    ]
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
  const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(workbook, finalFilename)
}
