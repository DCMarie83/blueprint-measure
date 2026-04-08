// Generates and triggers a CSV download for all zones in a session.

export function exportCSV(session, zones) {
  const rows = []

  // Header row
  rows.push(['Zone Name', 'Type', 'Result', 'Unit'])

  // One row per zone
  zones.forEach(zone => {
    const unit = zone.measurement_type === 'SF' ? 'sq ft'
                : zone.measurement_type === 'LF' ? 'lin ft'
                : 'count'
    rows.push([zone.name, zone.measurement_type, zone.result ?? 0, unit])
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
  rows.push(['SUMMARY', '', '', ''])
  rows.push(['Total SF', 'SF', totalSF.toFixed(2), 'sq ft'])
  rows.push(['Total LF', 'LF', totalLF.toFixed(2), 'lin ft'])
  rows.push(['Total Count', 'count', totalCount, 'count'])

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
