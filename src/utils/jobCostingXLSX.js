const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
const CURRENCY_FMT = '$#,##0.00'
const PCT_FMT = '0.0"%"'

export async function exportJobCostingXLSX({ rows, totals, period, company }) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Job Costing')

  let currentRow = 1

  // ── Header block ─────────────────────────────────────────
  const nameCell = ws.getCell(currentRow, 1)
  nameCell.value = company?.name || 'Company'
  nameCell.font = { bold: true, size: 16 }
  currentRow += 1

  const titleCell = ws.getCell(currentRow, 1)
  titleCell.value = 'Job Costing Report'
  titleCell.font = { bold: true, size: 12 }
  currentRow += 1

  const periodCell = ws.getCell(currentRow, 1)
  periodCell.value = `${period.from} to ${period.to}`
  periodCell.font = { size: 10, italic: true, color: { argb: 'FF666666' } }
  currentRow += 2

  // ── Column headers ───────────────────────────────────────
  const headers = [
    'Job', 'Client', 'Quoted', 'Billed', 'Collected',
    'Labor', 'Materials', 'Expenses', 'Total Cost',
    'Est. Margin', 'Est. Margin %', 'Actual Margin', 'Actual Margin %',
  ]

  const headerRowNum = currentRow
  const headerRow = ws.getRow(headerRowNum)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = { vertical: 'middle' }
  })
  headerRow.commit()
  currentRow += 1

  ws.views = [{ state: 'frozen', ySplit: headerRowNum, xSplit: 0 }]

  // Column widths
  const widths = [28, 20, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Money column indices (0-based): 2-12
  const moneyCols = new Set([2, 3, 4, 5, 6, 7, 8, 9, 11])
  const pctCols = new Set([10, 12])

  // ── Data rows ────────────────────────────────────────────
  for (const r of rows) {
    const exRow = ws.getRow(currentRow)
    const vals = [
      r.project_name, r.client_name,
      r.quoted, r.billed, r.collected,
      r.laborCost, r.materialsCost, r.expensesCost, r.totalCost,
      r.estimatedMargin, r.estimatedMarginPct != null ? r.estimatedMarginPct / 100 : null,
      r.actualMargin, r.actualMarginPct != null ? r.actualMarginPct / 100 : null,
    ]
    vals.forEach((v, i) => {
      const cell = exRow.getCell(i + 1)
      cell.value = v
      if (moneyCols.has(i)) cell.numFmt = CURRENCY_FMT
      if (pctCols.has(i) && v != null) cell.numFmt = PCT_FMT
    })
    exRow.commit()
    currentRow += 1
  }

  // ── Totals row ───────────────────────────────────────────
  const blendedPct = totals.collected > 0 ? (totals.collected - totals.totalCost) / totals.collected : null
  const estTotalMargin = totals.quoted - totals.totalCost
  const estTotalPct = totals.quoted > 0 ? estTotalMargin / totals.quoted : null
  const totLabor = rows.reduce((s, r) => s + r.laborCost, 0)
  const totMaterials = rows.reduce((s, r) => s + r.materialsCost, 0)
  const totExpenses = rows.reduce((s, r) => s + r.expensesCost, 0)

  const totRow = ws.getRow(currentRow)
  const totVals = [
    `Total (${rows.length} jobs)`, '',
    totals.quoted, totals.billed, totals.collected,
    totLabor, totMaterials, totExpenses, totals.totalCost,
    estTotalMargin, estTotalPct,
    totals.collected - totals.totalCost, blendedPct,
  ]
  totVals.forEach((v, i) => {
    const cell = totRow.getCell(i + 1)
    cell.value = v
    cell.font = { bold: true }
    if (moneyCols.has(i)) cell.numFmt = CURRENCY_FMT
    if (pctCols.has(i) && v != null) cell.numFmt = PCT_FMT
  })
  totRow.commit()

  // ── Download ─────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `JobCosting_${period.from}_to_${period.to}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
