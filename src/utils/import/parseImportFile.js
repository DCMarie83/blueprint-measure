import Papa from 'papaparse'

export async function parseImportFile(file) {
  if (!file) throw new Error('No file selected')

  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim(),
        transform: v => String(v ?? '').trim(),
        complete: (results) => {
          if (!results.data?.length) { reject(new Error('File is empty or has no data rows')); return }
          resolve({ headers: results.meta.fields ?? [], rows: results.data })
        },
        error: (err) => reject(new Error(err.message || 'Failed to parse CSV')),
      })
    })
  }

  if (ext === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const buffer = await file.arrayBuffer()
    await workbook.xlsx.load(buffer)

    const ws = workbook.worksheets[0]
    if (!ws || ws.rowCount < 2) throw new Error('File is empty or has no data rows')

    const headerRow = ws.getRow(1)
    const headers = []
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim()
    })

    const rows = []
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const obj = {}
      let hasValue = false
      headers.forEach((h, i) => {
        const val = String(row.getCell(i + 1).value ?? '').trim()
        obj[h] = val
        if (val) hasValue = true
      })
      if (hasValue) rows.push(obj)
    }

    if (rows.length === 0) throw new Error('File has headers but no data rows')
    return { headers: headers.filter(Boolean), rows }
  }

  throw new Error(`Unsupported file type ".${ext}". Please upload a .csv or .xlsx file.`)
}
