// Generates and triggers a CSV download for all zones in a session.
import { getMaxReach, estimatePaint } from './measurements'

export function exportCSV(session, zones, enabledFeatures = {}) {
  const rows = []
  const hasPaint = !!enabledFeatures.paint_calculator

  // Header row
  const header = ['Zone Name', 'Description', 'Surface Type']
  if (hasPaint) header.push('Coats', 'Surface Finish')
  header.push('Type', 'Result', 'Unit', 'Max Reach (ft)')
  if (hasPaint) header.push('Est. Paint (gal)')
  header.push('Notes')
  rows.push(header)

  // One row per zone
  zones.forEach(zone => {
    // Numeric output for spreadsheet formula compatibility. Type + Unit columns carry the unit.
    // SF and LF both stored as decimal (LF = decimal feet); round to 2 places. Count = whole number.
    const result = (zone.measurement_type === 'SF' || zone.measurement_type === 'LF')
      ? Math.round((zone.result ?? 0) * 100) / 100
      : Math.round(zone.result ?? 0)
    const unit = zone.measurement_type === 'SF' ? 'sq ft'
                : zone.measurement_type === 'LF' ? 'lin ft'
                : 'each'
    const maxReach = getMaxReach(zone)
    const row = [
      zone.name,
      zone.description ?? '',
      zone.surface_type ?? '',
    ]
    if (hasPaint) {
      row.push(zone.coat_count ?? 1)
      row.push(zone.surface_finish ?? 'smooth')
    }
    row.push(zone.measurement_type, result, unit)
    row.push(maxReach !== null ? maxReach : '')
    if (hasPaint) {
      const paintGal = estimatePaint(zone)
      row.push(paintGal !== null ? paintGal : '')
    }
    row.push(zone.notes ?? '')
    rows.push(row)
  })

  // Summary row — totals broken out by type
  const totalSF = zones
    .filter(z => z.measurement_type === 'SF')
    .reduce((sum, z) => sum + (z.result ?? 0), 0)
  const totalLF = zones
    .filter(z => z.measurement_type === 'LF')
    .reduce((sum, z) => sum + (z.result ?? 0), 0)
  const totalCount = zones
    .filter(z => z.measurement_type === 'count')
    .reduce((sum, z) => sum + (z.result ?? 0), 0)

  const colCount = header.length
  const emptyRow = Array(colCount).fill('')
  rows.push(emptyRow)
  const summaryRow = Array(colCount).fill('')
  summaryRow[0] = 'SUMMARY'
  rows.push(summaryRow)

  const sfRow = Array(colCount).fill('')
  sfRow[0] = 'Total SF'
  const typeIdx = header.indexOf('Type')
  sfRow[typeIdx] = 'SF'; sfRow[typeIdx + 1] = Math.round(totalSF * 100) / 100; sfRow[typeIdx + 2] = 'sq ft'
  rows.push(sfRow)

  const lfRow = Array(colCount).fill('')
  lfRow[0] = 'Total LF'
  lfRow[typeIdx] = 'LF'; lfRow[typeIdx + 1] = Math.round(totalLF * 100) / 100; lfRow[typeIdx + 2] = 'lin ft'
  rows.push(lfRow)

  const countRow = Array(colCount).fill('')
  countRow[0] = 'Total Count'
  countRow[typeIdx] = 'count'; countRow[typeIdx + 1] = Math.round(totalCount); countRow[typeIdx + 2] = 'each'
  rows.push(countRow)

  // Build CSV string
  const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')

  // Trigger download
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${session.project_name}${session.description ? '_' + session.description : ''}_measurements.csv`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
  a.click()
  URL.revokeObjectURL(url)
}
