// Generates and triggers a CSV download for all zones in a session.
import { buildExportData, buildExportFilename } from './exportData'

export function exportCSV(session, zones, enabledFeatures = {}) {
  const { headers, rows, summary } = buildExportData(session, zones, enabledFeatures)

  const allRows = []
  allRows.push(headers)

  // Data rows — nulls become empty strings for CSV
  rows.forEach(row => allRows.push(row.map(cell => cell ?? '')))

  // Summary section
  const colCount = headers.length
  const typeIdx = headers.indexOf('Type')

  allRows.push(Array(colCount).fill(''))

  const summaryRow = Array(colCount).fill('')
  summaryRow[0] = 'SUMMARY'
  allRows.push(summaryRow)

  const sfRow = Array(colCount).fill('')
  sfRow[0] = 'Total SF'
  sfRow[typeIdx] = 'SF'; sfRow[typeIdx + 1] = summary.totalSF; sfRow[typeIdx + 2] = 'sq ft'
  allRows.push(sfRow)

  const lfRow = Array(colCount).fill('')
  lfRow[0] = 'Total LF'
  lfRow[typeIdx] = 'LF'; lfRow[typeIdx + 1] = summary.totalLF; lfRow[typeIdx + 2] = 'lin ft'
  allRows.push(lfRow)

  const countRow = Array(colCount).fill('')
  countRow[0] = 'Total Count'
  countRow[typeIdx] = 'count'; countRow[typeIdx + 1] = summary.totalCount; countRow[typeIdx + 2] = 'each'
  allRows.push(countRow)

  // Build CSV string
  const csv = allRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')

  // Trigger download
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildExportFilename(session) + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}
