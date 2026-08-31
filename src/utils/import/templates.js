// Client-side XLSX template downloads for the import wizards. Built with
// ExcelJS in the browser as a Blob — no static files, matching the original
// clients template exactly.

async function downloadTemplate({ sheetName, headers, sampleRow, filename }) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(sheetName)

  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
  })

  headers.forEach((_, i) => { ws.getColumn(i + 1).width = i === 0 ? 24 : 18 })

  ws.addRow(sampleRow)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadClientTemplate() {
  await downloadTemplate({
    sheetName: 'Clients',
    headers: [
      'Client Name', 'Client Type (residential/commercial)', 'Business Name',
      'Email', 'Phone', 'Street', 'Unit', 'City', 'State', 'Zip', 'Notes',
    ],
    sampleRow: [
      'Jane Smith', 'residential', '', 'jane@example.com', '(555) 123-4567',
      '456 Oak Ave', 'Unit 2', 'Springfield', 'OH', '45501', 'Referred by John',
    ],
    filename: 'rivetdog-client-import-template.xlsx',
  })
}

export async function downloadJobTemplate() {
  await downloadTemplate({
    sheetName: 'Jobs',
    headers: [
      'Job Name', 'Client', 'Address', 'Column', 'Status',
      'Contract Value', 'Scheduled Start', 'Estimated Completion',
    ],
    sampleRow: [
      'Kitchen Remodel', 'Jane Smith', '456 Oak Ave, Springfield, OH', 'Complete',
      'complete', '12500', '2026-03-01', '2026-04-15',
    ],
    filename: 'rivetdog-job-import-template.xlsx',
  })
}

export async function downloadInvoiceTemplate() {
  await downloadTemplate({
    sheetName: 'Invoices',
    headers: [
      'Invoice Number', 'Job Name', 'Client', 'Invoice Date', 'Total',
      'Amount Paid', 'Paid Date', 'Payment Method', 'Status', 'Notes',
    ],
    sampleRow: [
      '7511', 'Kitchen Remodel', 'Jane Smith', '2026-03-04', '12500',
      '12500', '2026-03-20', 'check', 'paid', 'Final invoice',
    ],
    filename: 'rivetdog-invoice-import-template.xlsx',
  })
}
