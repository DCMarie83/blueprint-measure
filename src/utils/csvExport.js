// Generates and triggers a CSV download for all zones in a session.
import { getMaxReach, estimatePaint } from './measurements'
import { formatSFPrecise, formatLF } from './fractions'

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
    const result = zone.measurement_type === 'SF'
      ? formatSFPrecise(zone.result ?? 0)
      : zone.measurement_type === 'LF'
      ? formatLF(zone.result ?? 0)
      : `${Math.round(zone.result ?? 0)} items`
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
  sfRow[typeIdx] = 'SF'; sfRow[typeIdx + 1] = formatSFPrecise(totalSF); sfRow[typeIdx + 2] = 'sq ft'
  rows.push(sfRow)

  const lfRow = Array(colCount).fill('')
  lfRow[0] = 'Total LF'
  lfRow[typeIdx] = 'LF'; lfRow[typeIdx + 1] = formatLF(totalLF); lfRow[typeIdx + 2] = 'lin ft'
  rows.push(lfRow)

  const countRow = Array(colCount).fill('')
  countRow[0] = 'Total Count'
  countRow[typeIdx] = 'count'; countRow[typeIdx + 1] = Math.round(totalCount) + ' items'; countRow[typeIdx + 2] = 'each'
  rows.push(countRow)

  // Build CSV string
  const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${session.client_name}_${session.project_name}_measurements.csv`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
  a.click()
  URL.revokeObjectURL(url)
}
