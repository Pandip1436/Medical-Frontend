import * as XLSX from 'xlsx'

/** Convert an array of plain objects to an Excel (.xlsx) file and trigger download */
export function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
  const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(workbook, finalFilename)
}

/**
 * Parse an Excel file and return an array of objects.
 * T is the expected type of the objects.
 */
export async function importFromExcel<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Read as 2D array to check for custom formats
        const rawRows = XLSX.utils.sheet_to_json<any[][]>(worksheet, { header: 1 })
        console.log("=== EXCEL IMPORT DEBUG ===");
        console.log("Raw Rows (first 20):", rawRows.slice(0, 20));
        
        // Detect Marg ERP format
        let isMargFormat = false
        let isMargProductFormat = false
        let isMargHsnFormat = false

        for (let i = 0; i < Math.min(rawRows.length, 50); i++) {
          const row = rawRows[i] || []
          let cells: string[] = []
          const rawCells = row.map(c => String(c || '').trim()).filter(c => c !== '')
          
          for (const raw of rawCells) {
            if (raw.includes('  ') || raw.includes('\t') || raw.includes('|')) {
              cells.push(...raw.split(/\s{2,}|\t+|\|+/).map(c => c.trim()).filter(c => c !== ''))
            } else {
              cells.push(raw)
            }
          }

          if (cells.length > 0 && cells[0] === 'PARTY NAME') {
            isMargFormat = true
            break
          }
          const rowStr = cells.join(' ').toUpperCase()
          if (rowStr.includes('ITEM WISE HSN/SAC MASTER') || (rowStr.includes('ITEM DESCRIPTION') && rowStr.includes('HSN/SAC'))) {
            isMargHsnFormat = true
            break
          } else if (rowStr.includes('ITEM DESCRIPTION') && (rowStr.includes('PURCHASE') || rowStr.includes('M.R.P.') || rowStr.includes('MRP'))) {
            isMargProductFormat = true
            break
          }
        }
        
        console.log("Format Detection:", { isMargFormat, isMargHsnFormat, isMargProductFormat });

        let records: any[] = []

        if (isMargFormat) {
          records = parseMargExcel(rawRows)
        } else if (isMargHsnFormat) {
          records = parseMargHsnExcel(rawRows)
        } else if (isMargProductFormat) {
          records = parseMargProductExcel(rawRows)
        } else {
          // Fallback: Try Marg product parser aggressively
          records = parseMargProductExcel(rawRows)
          if (records.length === 0) {
            records = XLSX.utils.sheet_to_json<any>(worksheet)
          }
        }

        console.log("Extracted Records:", records.length, records.slice(0, 5));

        if (records.length === 0) {
          if (rawRows.length === 0) {
            reject(new Error("File appears empty to parser. Try opening in Excel and saving as .xlsx"))
          } else {
            reject(new Error(`Extraction failed. Please check the Developer Console (F12) for exact error details.`))
          }
          return
        }

        resolve(records as any)
      } catch (err) {
        reject(new Error("File read error: " + (err as any).message))
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsBinaryString(file)
  })
}

function parseMargExcel(rows: any[][]): any[] {
  const records = []
  let currentRecord: any = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    const colA = row[0] ? String(row[0]).trim() : ''
    const colB = row[1] ? String(row[1]).trim() : ''
    const colC = row[2] ? String(row[2]).trim() : ''
    const colD = row[3] ? String(row[3]).trim() : ''

    // Skip entirely empty rows -> this signals end of a block
    if (!colA && !colB && !colC && !colD) {
      if (currentRecord) {
        records.push(currentRecord)
        currentRecord = null
      }
      continue
    }

    // Skip headers and irrelevant rows
    if (colA === 'PARTY NAME' || colA === '& ADDRESS' || colA.startsWith('SPONSORED')) {
      continue
    }

    if (!currentRecord) {
      currentRecord = {
        name: colA,
        addressLines: [],
        phones: [],
        gstin: '',
        dlNumber: '',
      }
      if (colB && !colB.includes('D.L.No') && !colB.includes('GSTIN')) currentRecord.phones.push(colB)
      if (colC) currentRecord.phones.push(colC)
      if (colD) currentRecord.phones.push(colD)
    } else {
      if (colA && !colA.includes('MARG ERP') && !colA.startsWith('Page ') && !colA.startsWith('Date ')) {
        currentRecord.addressLines.push(colA)
      }

      if (colB.includes('D.L.No')) {
        currentRecord.dlNumber = colC
        if (colD && !colD.includes('Date')) {
          currentRecord.dlNumber += ' ' + colD
        }
      } else if (colB.includes('GSTIN')) {
        currentRecord.gstin = colC
      } else if (colB && !colB.includes('Date')) {
        currentRecord.phones.push(colB)
      }

      if (colC && !colB.includes('D.L.No') && !colB.includes('GSTIN')) {
        currentRecord.phones.push(colC)
      }
      if (colD && !colD.includes('Date')) {
        currentRecord.phones.push(colD)
      }
    }
  }
  
  if (currentRecord) {
    records.push(currentRecord)
  }

  // Format into standard objects
  return records.map(r => {
    // Extract first valid 10-digit sequence for phone
    const allPhonesString = r.phones.join(' ').replace(/\D/g, '')
    const phoneMatch = allPhonesString.match(/\d{10}/)
    const phone = phoneMatch ? phoneMatch[0] : ''

    // Cleanup address
    const address = r.addressLines.filter(Boolean).join(', ')

    return {
      name: r.name,
      address: address,
      phone: phone,
      gstin: r.gstin,
      dlNumber: r.dlNumber,
    }
  })
}

function parseMargProductExcel(rows: any[][]): any[] {
  const records = []
  let currentGenericName = 'Unknown Category'

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    let cells: string[] = []
    const rawCells = row.map(c => String(c || '').trim()).filter(c => c !== '')
    
    for (const raw of rawCells) {
      if (raw.includes('  ') || raw.includes('\t') || raw.includes('|')) {
        cells.push(...raw.split(/\s{2,}|\t+|\|+/).map(c => c.trim()).filter(c => c !== ''))
      } else {
        cells.push(raw)
      }
    }

    if (cells.length === 0) continue

    const firstCell = cells[0].toUpperCase()
    if (firstCell.includes('+---') || firstCell.includes('----')) continue
    if (firstCell.includes('S.') || firstCell.includes('ITEM DESCRIPTION') || firstCell.includes('PURCHASE')) continue
    if (firstCell.includes('MARG ERP') || firstCell.startsWith('PAGE ') || firstCell.startsWith('DATE ')) continue
    if (firstCell.includes('HOSPITAL SUPPLIERS') || firstCell.includes('PRICE LIST') || firstCell.includes('PRODUCT MRP')) continue

    if (cells.length === 1) {
      currentGenericName = cells[0]
      continue
    }

    if (cells.length < 3) continue

    // Find contiguous numeric block scanning left-to-right to support trailing text columns
    const numCells = cells.map(c => Number(c.replace(/,/g, '')))
    let numBlockStart = -1
    let numBlockLen = 0

    for (let j = 1; j < cells.length; j++) {
      if (!isNaN(numCells[j])) {
        if (numBlockStart === -1) numBlockStart = j
        numBlockLen++
      } else if (numBlockStart !== -1) {
        if (numBlockLen >= 2) break
        numBlockStart = -1
        numBlockLen = 0
      }
    }

    if (numBlockStart === -1 || numBlockLen < 2) continue

    let purchaseRate = 0
    let mrp = 0
    let gstRate = 0

    if (numBlockLen >= 4) {
      purchaseRate = numCells[numBlockStart]
      mrp = numCells[numBlockStart + 1]
      gstRate = numCells[numBlockStart + 2]
    } else if (numBlockLen === 3) {
      purchaseRate = numCells[numBlockStart]
      mrp = numCells[numBlockStart + 1]
      gstRate = numCells[numBlockStart + 2]
    } else {
      purchaseRate = numCells[numBlockStart]
      mrp = numCells[numBlockStart + 1]
    }

    const hasIndex = /^\s*\d+\.?\s*$/.test(cells[0])
    const nameStartIndex = hasIndex ? 1 : 0
    const nameParts = cells.slice(nameStartIndex, numBlockStart)

    if (nameParts.length === 0) continue

    let name = nameParts.join(' ')
    let packSize = '1'

    const lastPart = nameParts[nameParts.length - 1]
    if (/\d|'S|GM|ML|TAB|CAP|VIAL|NOS|PCS/i.test(lastPart)) {
      packSize = lastPart
      name = nameParts.slice(0, -1).join(' ') || name
    }

    records.push({
      name: name,
      genericName: currentGenericName,
      categoryName: currentGenericName,
      packSize: packSize,
      purchaseRate: purchaseRate || 0,
      mrp: mrp || 0,
      gstRate: gstRate || 0,
    })
  }

  return records
}

function parseMargHsnExcel(rows: any[][]): any[] {
  const records = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    let cells: string[] = []
    const rawCells = row.map(c => String(c || '').trim()).filter(c => c !== '')
    
    for (const raw of rawCells) {
      if (raw.includes('  ') || raw.includes('\t') || raw.includes('|')) {
        cells.push(...raw.split(/\s{2,}|\t+|\|+/).map(c => c.trim()).filter(c => c !== ''))
      } else {
        cells.push(raw)
      }
    }

    if (cells.length === 0) continue

    const firstCell = cells[0].toUpperCase()
    if (firstCell.includes('+---') || firstCell.includes('----')) continue
    if (firstCell.includes('ITEM DESCRIPTION') || firstCell.includes('MARG ERP') || firstCell.startsWith('PAGE ') || firstCell.startsWith('DATE ') || firstCell.includes('ITEM WISE HSN')) continue
    if (firstCell.includes('PRINT HEALTH') || firstCell.includes('E-MAIL') || firstCell.includes('PHONE') || firstCell.includes('DL.NO')) continue

    if (cells.length < 3) continue

    const hasIndex = /^\s*\d+\.?\s*$/.test(cells[0])
    const nameCol = hasIndex ? cells[1] : cells[0]
    const oldTaxCol = hasIndex ? cells[2] : cells[1]
    const gstCol = hasIndex ? cells[3] : cells[2]
    const hsnCol = hasIndex ? cells[4] : cells[3]
    const hsnGstCol = hasIndex ? cells[5] : cells[4]

    const parts = (nameCol || '').split(/\s+/)
    let name = nameCol
    let packSize = '1'

    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1]
      if (/\d|'S|GM|ML|TAB|CAP|PCS|VIAL|NOS/i.test(lastPart)) {
        packSize = lastPart
        name = parts.slice(0, -1).join(' ')
      }
    }

    const hsnParts = (hsnCol || '').split(/\s+/)
    const hsnCode = hsnParts[0] || ''

    const gstRaw = gstCol || hsnGstCol || ''
    const gstParts = gstRaw.split(/\s+/)
    const gstRate = parseFloat(gstParts[gstParts.length - 1]) || 0

    records.push({
      name: name,
      packSize: packSize,
      hsnCode: hsnCode,
      gstRate: gstRate,
      __isHsnUpdate: true,
    })
  }

  return records
}
