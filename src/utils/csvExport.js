// Generates and triggers a CSV download for all zones in a session.
import { getMaxReach, estimatePaint } from './measurements'
import { formatSF, formatLF } from './fractions'

export function exportCSV(session, zones) {
  const rows = []

  // Header row
  rows.push(['Zone Name', 'Description', 'Surface Type', 'Coats', 'Surface Finish', 'Type', 'Result', 'Unit', 'Max Reach (ft)', 'Est. Paint (gal)', 'Notes'])

  // One row per zone
  zones.forEach(zone => {
    const result = zone.measurement_type === 'SF'
      ? formatSF(zone.result ?? 0)
      : zone.measurement_type === 'LF'
      ? formatLF(zone.result ?? 0)
      : `${Math.round(zone.result ?? 0)} items`
    const unit = zone.measurement_type === 'SF' ? 'sq ft'
                : zone.measurement_type === 'LF' ? 'lin ft'
                : 'each'
    const maxReach = getMaxReach(zone)
    const paintGal = estimatePaint(zone)
    rows.push([
      zone.name,
      zone.description ?? '',
      zone.surface_type ?? '',
      zone.coat_count ?? 1,
      zone.surface_finish ?? 'smooth',
      zone.measurement_type,
      result,
      unit,
      maxReach !== null ? maxReach : '',
      paintGal !== null ? paintGal : '',
      zone.notes ?? '',
    ])
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

  rows.push([]) // blank separator
  rows.push(['SUMMARY', '', '', '', '', '', '', '', '', '', ''])
  rows.push(['Total SF', '', '', '', '', 'SF', formatSF(totalSF), 'sq ft', '', '', ''])
  rows.push(['Total LF', '', '', '', '', 'LF', formatLF(totalLF), 'lin ft', '', '', ''])
  rows.push(['Total Count', '', '', '', '', 'count', Math.round(totalCount) + ' items', 'each', '', '', ''])

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
