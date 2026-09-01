import { supabase } from '../../lib/supabase'

// Writer for the Time Entries import. Insert shape mirrors the app's own
// createTimeEntry (src/data/timeTracking.js): { company_id, crew_member_id,
// project_id, work_date, hours, notes } — cost_rate snapshotting stays with
// the existing DB-side mechanics, exactly as manual entry does.
//
// Crew is matched by name case-insensitively; unmatched names create an
// INACTIVE crew_members row (is_active: false) as a placeholder so imported
// hours never surface a phantom active worker. Jobs must match by name —
// there is no placeholder-job creation for time entries.
export async function writeTimeEntryRows({ rows, onProgress, companyId, crewIndex, projectIndex }) {
  const imported = []
  const skipped = []
  const failed = []
  const created = []

  const crewCache = new Map(crewIndex) // lower(name) → crew row

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const crewName = (row.crew || '').trim()
    const jobName = (row.job_name || '').trim()
    const label = `${crewName || `Row ${i + 2}`} — ${row._date ?? ''}`

    if (!row._date || !crewName || !(row._hours > 0)) {
      skipped.push({ name: label, reason: 'missing_fields' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    const project = projectIndex.get(jobName.toLowerCase()) ?? null
    if (!project) {
      skipped.push({ name: label, reason: 'no_job_match' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    try {
      let crew = crewCache.get(crewName.toLowerCase())
      if (!crew) {
        const { data, error } = await supabase
          .from('crew_members')
          .insert({ company_id: companyId, name: crewName, is_active: false })
          .select('id, name')
          .single()
        if (error) throw new Error(`Crew "${crewName}": ${error.message}`)
        crew = data
        crewCache.set(crewName.toLowerCase(), crew)
        created.push({ type: 'crew', name: crewName })
      }

      const { error: insErr } = await supabase.from('time_entries').insert({
        company_id: companyId,
        crew_member_id: crew.id,
        project_id: project.id,
        work_date: row._date,
        hours: row._hours,
        notes: (row.note || '').trim() || null,
      })
      if (insErr) throw new Error(insErr.message)

      imported.push({ name: label })
    } catch (err) {
      failed.push({ name: label, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated: [], skipped, failed, created }
}
