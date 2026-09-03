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
    'Est. Margin', 'Est. Margin %', 'Actual Margin', 'Actual Margin %', 'Cash Position',
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
  const widths = [28, 20, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Money column indices (0-based)
  const moneyCols = new Set([2, 3, 4, 5, 6, 7, 8, 9, 11, 13])
  const pctCols = new Set([10, 12])

  // ── Data rows ────────────────────────────────────────────
  // Locked spec: actual margin percent over billed; cash position value only;
  // blocked sides (revenue 0, or no cost records) export as blank cells so the
  // sheet never shows +100.0% from an empty side.
  for (const r of rows) {
    const estBlocked = r.quoted <= 0 || !r.hasCostData
    const actBlocked = r.billed <= 0 || !r.hasCostData
    const cashBlocked = r.collected <= 0 || !r.hasCostData
    const exRow = ws.getRow(currentRow)
    const vals = [
      r.project_name, r.client_name,
      r.quoted, r.billed, r.collected,
      r.laborCost, r.materialsCost, r.expensesCost, r.totalCost,
      estBlocked ? null : r.estimatedMargin, estBlocked || r.estimatedMarginPct == null ? null : r.estimatedMarginPct / 100,
      actBlocked ? null : r.actualMargin, actBlocked || r.actualMarginPct == null ? null : r.actualMarginPct / 100,
      cashBlocked ? null : r.cashPosition,
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
  const anyCostData = rows.some(r => r.hasCostData)
  const estTotalBlocked = totals.quoted <= 0 || !anyCostData
  const actTotalBlocked = totals.billed <= 0 || !anyCostData
  const cashTotalBlocked = totals.collected <= 0 || !anyCostData
  const estTotalMargin = totals.quoted - totals.totalCost
  const estTotalPct = estTotalBlocked ? null : estTotalMargin / totals.quoted
  const actTotalMargin = totals.billed - totals.totalCost
  const actTotalPct = actTotalBlocked ? null : actTotalMargin / totals.billed
  const totLabor = rows.reduce((s, r) => s + r.laborCost, 0)
  const totMaterials = rows.reduce((s, r) => s + r.materialsCost, 0)
  const totExpenses = rows.reduce((s, r) => s + r.expensesCost, 0)

  const totRow = ws.getRow(currentRow)
  const totVals = [
    `Total (${rows.length} jobs)`, '',
    totals.quoted, totals.billed, totals.collected,
    totLabor, totMaterials, totExpenses, totals.totalCost,
    estTotalBlocked ? null : estTotalMargin, estTotalPct,
    actTotalBlocked ? null : actTotalMargin, actTotalPct,
    cashTotalBlocked ? null : totals.collected - totals.totalCost,
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
