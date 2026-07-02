export async function downloadClientTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Clients')

  const headers = [
    'Client Name', 'Client Type (residential/commercial)', 'Business Name',
    'Email', 'Phone', 'Street', 'Unit', 'City', 'State', 'Zip', 'Notes',
  ]

  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
  })

  headers.forEach((_, i) => { ws.getColumn(i + 1).width = i === 0 ? 24 : 18 })

  ws.addRow([
    'Jane Smith', 'residential', '', 'jane@example.com', '(555) 123-4567',
    '456 Oak Ave', 'Unit 2', 'Springfield', 'OH', '45501', 'Referred by John',
  ])

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'rivetdog-client-import-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
