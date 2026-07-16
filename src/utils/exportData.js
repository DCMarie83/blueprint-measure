// Single source of truth for measurement export data.
// Both CSV and XLSX exports consume this to stay in sync.
import { getMaxReach } from './measurements'

export function buildExportData(session, zones) {
  // Header row
  const headers = ['Zone Name', 'Description', 'Surface Type',
    'Type', 'Result', 'Unit', 'Max Reach (ft)', 'Notes']

  // Data rows
  const rows = zones.map(zone => {
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
    row.push(zone.measurement_type, result, unit)
    row.push(maxReach !== null ? maxReach : null)
    row.push(zone.notes ?? '')
    return row
  })

  // Totals
  const totalSF = zones
    .filter(z => z.measurement_type === 'SF')
    .reduce((sum, z) => sum + (z.result ?? 0), 0)
  const totalLF = zones
    .filter(z => z.measurement_type === 'LF')
    .reduce((sum, z) => sum + (z.result ?? 0), 0)
  const totalCount = zones
    .filter(z => z.measurement_type === 'count')
    .reduce((sum, z) => sum + (z.result ?? 0), 0)

  return {
    headers,
    rows,
    summary: {
      totalSF:    Math.round(totalSF * 100) / 100,
      totalLF:    Math.round(totalLF * 100) / 100,
      totalCount: Math.round(totalCount),
    },
  }
}

// Build the base filename used by all exports (no extension).
export function buildExportFilename(session) {
  return `${session.project_name}${session.description ? '_' + session.description : ''}_measurements`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
}
