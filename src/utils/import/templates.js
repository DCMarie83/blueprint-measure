// Client-side XLSX template downloads for the import wizards. Built with
// ExcelJS in the browser as a Blob — no static files, matching the original
// clients template exactly. Multi-sheet templates (e.g. an optional
// "Line Items" sheet) share the same header styling per sheet.

async function downloadTemplate({ sheets, filename }) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name)
    const headerRow = ws.addRow(sheet.headers)
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
    })
    sheet.headers.forEach((_, i) => { ws.getColumn(i + 1).width = i === 0 ? 24 : 18 })
    for (const row of sheet.sampleRows) ws.addRow(row)
  }

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
    sheets: [{
      name: 'Clients',
      headers: [
        'Client Name', 'Client Type (residential/commercial)', 'Business Name',
        'Email', 'Phone', 'Street', 'Unit', 'City', 'State', 'Zip', 'Notes',
      ],
      sampleRows: [[
        'Jane Smith', 'residential', '', 'jane@example.com', '(555) 123-4567',
        '456 Oak Ave', 'Unit 2', 'Springfield', 'OH', '45501', 'Referred by John',
      ]],
    }],
    filename: 'rivetdog-client-import-template.xlsx',
  })
}

export async function downloadJobTemplate() {
  await downloadTemplate({
    sheets: [{
      name: 'Jobs',
      headers: [
        'Job Name', 'Client', 'Address', 'Column', 'Status',
        'Contract Value', 'Scheduled Start', 'Estimated Completion',
      ],
      sampleRows: [[
        'Kitchen Remodel', 'Jane Smith', '456 Oak Ave, Springfield, OH', 'Complete',
        'complete', '12500', '2026-03-01', '2026-04-15',
      ]],
    }],
    filename: 'rivetdog-job-import-template.xlsx',
  })
}

export async function downloadInvoiceTemplate() {
  await downloadTemplate({
    sheets: [
      {
        name: 'Invoices',
        headers: [
          'Invoice Number', 'Job Name', 'Client', 'Invoice Date', 'Total',
          'Amount Paid', 'Paid Date', 'Payment Method', 'Status', 'Notes',
        ],
        sampleRows: [[
          '7511', 'Kitchen Remodel', 'Jane Smith', '2026-03-04', '12500',
          '12500', '2026-03-20', 'check', 'paid', 'Final invoice',
        ]],
      },
      {
        name: 'Line Items',
        headers: ['Invoice Number', 'Description', 'Category', 'Item Type', 'Unit', 'Quantity', 'Unit Rate'],
        sampleRows: [
          ['7511', 'Wall paint - 2 coats', 'Interior', 'labor', 'sf', '2400', '1.50'],
          ['7511', 'Trim and doors', 'Interior', 'labor', 'lf', '300', '3.00'],
        ],
      },
    ],
    filename: 'rivetdog-invoice-import-template.xlsx',
  })
}

export async function downloadEstimateTemplate() {
  await downloadTemplate({
    sheets: [
      {
        name: 'Estimates',
        headers: ['Estimate Number', 'Job Name', 'Client', 'Estimate Date', 'Total', 'Status', 'Notes'],
        sampleRows: [[
          'Q-2041', 'Kitchen Remodel', 'Jane Smith', '2026-02-10', '12500', 'accepted', 'Signed on site',
        ]],
      },
      {
        name: 'Line Items',
        headers: ['Estimate Number', 'Description', 'Category', 'Unit', 'Quantity', 'Unit Rate'],
        sampleRows: [
          ['Q-2041', 'Wall paint - 2 coats', 'Interior', 'sf', '2400', '1.50'],
          ['Q-2041', 'Ceilings - flat finish', 'Interior', 'sf', '800', '1.25'],
        ],
      },
    ],
    filename: 'rivetdog-estimate-import-template.xlsx',
  })
}

export async function downloadChangeOrderTemplate() {
  await downloadTemplate({
    sheets: [{
      name: 'Change Orders',
      headers: [
        'CO Number', 'Job Name', 'Title', 'Description', 'Amount',
        'Status', 'Approved Date', 'Approved By', 'Source', 'External Ref',
      ],
      sampleRows: [[
        'CO-3', 'Kitchen Remodel', 'Add pantry cabinets', 'Client requested extra uppers', '1850',
        'approved', '2026-03-12', 'Jane Smith', 'buildertrend', 'BT-88213',
      ]],
    }],
    filename: 'rivetdog-change-order-import-template.xlsx',
  })
}

export async function downloadTimeEntryTemplate() {
  await downloadTemplate({
    sheets: [{
      name: 'Time Entries',
      headers: ['Date', 'Crew', 'Job Name', 'Hours', 'Note'],
      sampleRows: [['2026-03-05', 'Miguel Torres', 'Kitchen Remodel', '8', 'Prep and prime']],
    }],
    filename: 'rivetdog-time-import-template.xlsx',
  })
}

export async function downloadPricingTemplate() {
  await downloadTemplate({
    sheets: [{
      name: 'Pricing',
      headers: ['Name', 'Unit', 'Rate', 'Category', 'Description'],
      sampleRows: [['Wall paint - 2 coats, premium', 'sf', '1.85', 'Interior', 'Two coats, mid-sheen']],
    }],
    filename: 'rivetdog-pricing-import-template.xlsx',
  })
}
