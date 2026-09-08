import { supabase } from '../lib/supabase'

// ── Crew roster ──────────────────────────────────────────────────────────

export async function getCrewMembers(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getAllCrewMembers(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .eq('company_id', companyId)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getCrewMemberById(id) {
  const { data, error } = await supabase
    .from('crew_members')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getCrewMemberPunches(crewMemberId) {
  const { data, error } = await supabase
    .from('time_punch_submissions')
    .select('id, clock_in_at, clock_in_lat, clock_in_lng, clock_out_at, clock_out_lat, clock_out_lng, hours, status, source, created_at, projects(name)')
    .eq('crew_member_id', crewMemberId)
    .order('clock_in_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function ensureMyCrewMember(companyId, userId, fullName) {
  if (!companyId || !userId) return null
  const { data: existing } = await supabase
    .from('crew_members')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return existing
  const { data, error } = await supabase
    .from('crew_members')
    .insert({ company_id: companyId, name: fullName || 'Me', user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createCrewMember({ companyId, name }) {
  const { data, error } = await supabase
    .from('crew_members')
    .insert({ company_id: companyId, name })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCrewMember(id, patch) {
  const { error } = await supabase
    .from('crew_members')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteCrewMember(id) {
  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('id', id)
  if (error) {
    if (error.message?.includes('restrict') || error.code === '23503') {
      throw new Error('This worker has time entries. Deactivate them instead of deleting.')
    }
    throw error
  }
}

// ── Projects (job picker) ────────────────────────────────────────────────

// Every non-deleted job on the company, with status so the pickers can group
// working jobs ahead of closed ones. The old status = 'active' filter matched
// only the legacy default value, hiding every job carrying a kanban status.
export async function getActiveProjects(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, client_name, status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ── Time entries ─────────────────────────────────────────────────────────

export async function getMyTimeEntries(myCrewMemberId, { from, to } = {}) {
  if (!myCrewMemberId) return []
  let query = supabase
    .from('time_entries')
    .select('*, projects(name, client_name), crew_members(name)')
    .eq('crew_member_id', myCrewMemberId)
    .order('work_date', { ascending: false })
  if (from) query = query.gte('work_date', from)
  if (to) query = query.lte('work_date', to)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getCompanyTimeEntries(companyId, { from, to } = {}) {
  if (!companyId) return []
  let query = supabase
    .from('time_entries')
    .select('*, projects(name, client_name), crew_members(name)')
    .eq('company_id', companyId)
    .order('work_date', { ascending: false })
  if (from) query = query.gte('work_date', from)
  if (to) query = query.lte('work_date', to)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createTimeEntry({ companyId, crewMemberId, projectId, workDate, hours, notes }) {
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      company_id: companyId,
      crew_member_id: crewMemberId,
      project_id: projectId,
      work_date: workDate,
      hours,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createCrewDayEntries({ companyId, projectId, workDate, rows }) {
  const valid = rows.filter(r => r.crewMemberId && r.hours && Number(r.hours) > 0)
  if (valid.length === 0) return []
  const inserts = valid.map(r => ({
    company_id: companyId,
    crew_member_id: r.crewMemberId,
    project_id: projectId,
    work_date: workDate,
    hours: Number(r.hours),
    notes: r.notes || null,
  }))
  const { data, error } = await supabase
    .from('time_entries')
    .insert(inserts)
    .select()
  if (error) throw error
  return data ?? []
}

export async function updateTimeEntry(id, patch) {
  const update = {}
  if (patch.crewMemberId !== undefined) update.crew_member_id = patch.crewMemberId
  if (patch.projectId !== undefined) update.project_id = patch.projectId
  if (patch.workDate !== undefined) update.work_date = patch.workDate
  if (patch.hours !== undefined) update.hours = patch.hours
  if (patch.notes !== undefined) update.notes = patch.notes || null
  const { error } = await supabase
    .from('time_entries')
    .update(update)
    .eq('id', id)
  if (error) throw error
}

export async function deleteTimeEntry(id) {
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// Pure helper: build pay summary from entries + crew roster.
// Uses the per-entry cost_rate snapshot (not the crew member's current rate)
// so the report matches historical pay statements.
// entries: [{ crew_member_id, hours, cost_rate, crew_members?: { name } }]
// crew: [{ id, name }]  (name fallback only)
// Returns [{ crewMemberId, name, rate (blended), hours, pay }] sorted by pay desc.
export function summarizePay(entries, crew) {
  const nameLookup = {}
  for (const c of (crew || [])) {
    nameLookup[c.id] = c.name
  }
  const byWorker = {}
  for (const e of entries) {
    const cmId = e.crew_member_id
    if (!byWorker[cmId]) {
      byWorker[cmId] = {
        crewMemberId: cmId,
        name: e.crew_members?.name || nameLookup[cmId] || '—',
        hours: 0,
        pay: 0,
        hasMissingRate: false,
        unpricedHours: 0,
      }
    }
    const h = Number(e.hours) || 0
    const entryPay = h * (Number(e.cost_rate) || 0)
    byWorker[cmId].hours += h
    byWorker[cmId].pay += entryPay
    // Money math unchanged; this only records that some hours priced at $0.
    if (e.cost_rate == null || !(Number(e.cost_rate) > 0)) {
      byWorker[cmId].hasMissingRate = true
      byWorker[cmId].unpricedHours += h
    }
  }
  const rows = Object.values(byWorker)
  for (const r of rows) { r.rate = r.hours > 0 ? r.pay / r.hours : 0 }
  rows.sort((a, b) => b.pay - a.pay)
  return rows
}

// Per-worker paystub data with job-level breakdown.
// Uses per-entry cost_rate snapshot for pay, with blended display rate.
// Returns [{ crewMemberId, name, rate (blended), totalHours, totalPay, jobs: [{ job, hours, pay }] }]
export function paystubRows(entries, crew) {
  const nameLookup = {}
  for (const c of (crew || [])) {
    nameLookup[c.id] = c.name
  }
  const byWorker = {}
  for (const e of entries) {
    const cmId = e.crew_member_id
    if (!byWorker[cmId]) {
      byWorker[cmId] = {
        crewMemberId: cmId,
        name: e.crew_members?.name || nameLookup[cmId] || '—',
        totalHours: 0,
        totalPay: 0,
        jobMap: {},
      }
    }
    const w = byWorker[cmId]
    const h = Number(e.hours) || 0
    const entryPay = h * (Number(e.cost_rate) || 0)
    const jobName = e.projects?.name || '—'
    if (!w.jobMap[jobName]) w.jobMap[jobName] = { hours: 0, pay: 0 }
    w.jobMap[jobName].hours += h
    w.jobMap[jobName].pay += entryPay
    w.totalHours += h
    w.totalPay += entryPay
  }
  const result = []
  for (const w of Object.values(byWorker)) {
    const rate = w.totalHours > 0 ? w.totalPay / w.totalHours : 0
    const jobs = Object.entries(w.jobMap)
      .map(([job, { hours, pay }]) => ({ job, hours, pay }))
      .sort((a, b) => b.hours - a.hours)
    result.push({ crewMemberId: w.crewMemberId, name: w.name, rate, totalHours: w.totalHours, totalPay: w.totalPay, jobs })
  }
  result.sort((a, b) => b.totalPay - a.totalPay)
  return result
}

export async function getPayReport(companyId, { from, to } = {}) {
  if (!companyId) return []
  let query = supabase
    .from('time_entries')
    .select('hours, cost_rate, crew_member_id, crew_members(name, cost_rate)')
    .eq('company_id', companyId)
  if (from) query = query.gte('work_date', from)
  if (to) query = query.lte('work_date', to)
  const { data, error } = await query
  if (error) throw error
  // Use summarizePay with entries themselves as crew source (they carry crew_members join)
  const crewFromEntries = []
  const seen = new Set()
  for (const e of (data ?? [])) {
    if (!seen.has(e.crew_member_id)) {
      seen.add(e.crew_member_id)
      crewFromEntries.push({ id: e.crew_member_id, name: e.crew_members?.name || '—', cost_rate: e.crew_members?.cost_rate })
    }
  }
  return summarizePay(data ?? [], crewFromEntries)
}

// Per-worker pay statement data with day-by-day entries and job breakdown.
export async function getPayStatementData(companyId, crewMemberId, { from, to } = {}) {
  if (!companyId || !crewMemberId) return { data: null, error: 'Missing companyId or crewMemberId' }
  try {
    const [{ data: crew, error: crewErr }, entriesResult] = await Promise.all([
      supabase.from('crew_members').select('id, name, cost_rate').eq('id', crewMemberId).single(),
      (async () => {
        let q = supabase.from('time_entries').select('work_date, hours, cost_rate, projects(name)')
          .eq('company_id', companyId).eq('crew_member_id', crewMemberId)
          .order('work_date', { ascending: true })
        if (from) q = q.gte('work_date', from)
        if (to) q = q.lte('work_date', to)
        return q
      })(),
    ])
    if (crewErr) throw crewErr
    if (entriesResult.error) throw entriesResult.error

    const entries = (entriesResult.data ?? []).map(e => ({
      work_date: e.work_date,
      jobName: e.projects?.name || 'No job',
      hours: Number(e.hours) || 0,
      cost_rate: Number(e.cost_rate) || 0,
    }))

    const jobMap = {}
    let totalHours = 0, totalPay = 0
    for (const e of entries) {
      const pay = e.hours * e.cost_rate
      totalHours += e.hours
      totalPay += pay
      if (!jobMap[e.jobName]) jobMap[e.jobName] = { jobName: e.jobName, hours: 0, pay: 0 }
      jobMap[e.jobName].hours += e.hours
      jobMap[e.jobName].pay += pay
    }
    const byJob = Object.values(jobMap).sort((a, b) => b.hours - a.hours)

    return {
      data: {
        worker: { id: crew.id, name: crew.name, rate: Number(crew.cost_rate) || 0 },
        period: { from, to },
        entries,
        byJob,
        totalHours,
        totalPay,
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: err.message || String(err) }
  }
}

export async function getWeekHours(myCrewMemberId) {
  if (!myCrewMemberId) return 0
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diffToMon)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const from = monday.toISOString().slice(0, 10)
  const to = sunday.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('time_entries')
    .select('hours')
    .eq('crew_member_id', myCrewMemberId)
    .gte('work_date', from)
    .lte('work_date', to)
  if (error) throw error
  return (data ?? []).reduce((sum, r) => sum + Number(r.hours), 0)
}

// ── Punch submissions (RivetPay Link) ────────────────────────────────────

export async function getPendingPunches(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('time_punch_submissions')
    .select('*, crew_members(name), projects(name)')
    .eq('company_id', companyId)
    .in('status', ['submitted', 'open'])
    .order('status', { ascending: true })
    .order('clock_in_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function approvePunch(id) {
  const { data, error } = await supabase.rpc('rivetpay_approve_submission', { p_id: id })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || 'Approval failed')
  return data
}

export async function rejectPunch(id) {
  const { error } = await supabase
    .from('time_punch_submissions')
    .update({ status: 'rejected' })
    .eq('id', id)
  if (error) throw error
}

export async function sendRivetPayLinkEmail(crewMemberId, email) {
  const { data, error } = await supabase.functions.invoke('send-rivetpay-link', {
    body: { crewMemberId, email },
  })
  if (error) throw new Error(error.message || 'Send failed')
  if (!data?.ok) throw new Error(data?.error || 'Send failed')
  return data
}

export async function closeOpenPunch(id, hours) {
  const { error } = await supabase
    .from('time_punch_submissions')
    .update({ hours: Number(hours), clock_out_at: new Date().toISOString(), status: 'submitted' })
    .eq('id', id)
  if (error) throw error
}

// ── Dated rates (crew_rates) ─────────────────────────────────────────────
// crew_members.cost_rate stays synced to the rate in effect today so every
// existing reader (pay snapshot trigger fallback, statement header, roster)
// keeps working.

export async function getCrewRates(crewMemberId) {
  const { data, error } = await supabase
    .from('crew_rates')
    .select('*')
    .eq('crew_member_id', crewMemberId)
    .order('effective_from', { ascending: false })
  if (error) throw error
  return data ?? []
}

function rateInEffect(rates, dateStr) {
  const applicable = rates.filter(r =>
    r.effective_from <= dateStr && (r.effective_to == null || r.effective_to >= dateStr))
  if (applicable.length === 0) return null
  return [...applicable].sort((a, b) => (b.effective_from || '').localeCompare(a.effective_from || ''))[0]
}

async function syncCurrentRate(crewMemberId) {
  const today = new Date().toISOString().slice(0, 10)
  const rates = await getCrewRates(crewMemberId)
  const current = rateInEffect(rates, today)
  await supabase.from('crew_members')
    .update({ cost_rate: current ? Number(current.rate) : null })
    .eq('id', crewMemberId)
}

export async function addCrewRate({ companyId, crewMemberId, rate, effectiveFrom, note }) {
  // Close the previous open row the day before the new one starts.
  const dayBefore = new Date(effectiveFrom + 'T00:00:00')
  dayBefore.setDate(dayBefore.getDate() - 1)
  const closeTo = dayBefore.toISOString().slice(0, 10)
  const { data: open } = await supabase
    .from('crew_rates')
    .select('id, effective_from')
    .eq('crew_member_id', crewMemberId)
    .is('effective_to', null)
  for (const row of (open ?? [])) {
    if (row.effective_from < effectiveFrom) {
      await supabase.from('crew_rates').update({ effective_to: closeTo }).eq('id', row.id)
    }
  }
  const { error } = await supabase.from('crew_rates').insert({
    company_id: companyId,
    crew_member_id: crewMemberId,
    rate: Number(rate),
    effective_from: effectiveFrom,
    effective_to: null,
    note: (note || '').trim() || null,
  })
  if (error) throw error
  await syncCurrentRate(crewMemberId)
}

export async function updateCrewRate(id, crewMemberId, patch) {
  const { error } = await supabase.from('crew_rates').update(patch).eq('id', id)
  if (error) throw error
  await syncCurrentRate(crewMemberId)
}

export async function deleteCrewRate(id, crewMemberId) {
  const { error } = await supabase.from('crew_rates').delete().eq('id', id)
  if (error) throw error
  await syncCurrentRate(crewMemberId)
}

// Open (current) rates for the whole company, for the roster's "since" line.
export async function getOpenCrewRates(companyId) {
  const { data, error } = await supabase
    .from('crew_rates')
    .select('crew_member_id, rate, effective_from')
    .eq('company_id', companyId)
    .is('effective_to', null)
  if (error) throw error
  const map = {}
  for (const r of (data ?? [])) {
    if (!map[r.crew_member_id] || r.effective_from > map[r.crew_member_id].effective_from) {
      map[r.crew_member_id] = r
    }
  }
  return map
}

// ── Unpriced hours ───────────────────────────────────────────────────────

export async function repriceUnpricedTimeEntries({ companyId, from, to, crewMemberId }) {
  const { data, error } = await supabase.rpc('reprice_unpriced_time_entries', {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
    p_crew_member_id: crewMemberId || null,
  })
  if (error) throw error
  return data
}

// ── Assignments (project_assignments) ────────────────────────────────────

export async function getProjectAssignments(projectId) {
  const { data, error } = await supabase
    .from('project_assignments')
    .select('id, crew_member_id, crew_members(id, name, is_active)')
    .eq('project_id', projectId)
  if (error) throw error
  return data ?? []
}

export async function getCrewAssignments(crewMemberId) {
  const { data, error } = await supabase
    .from('project_assignments')
    .select('id, project_id, projects(id, name, status)')
    .eq('crew_member_id', crewMemberId)
  if (error) throw error
  return data ?? []
}

export async function assignCrewToProject(projectId, crewMemberIds) {
  const rows = crewMemberIds.map(id => ({ project_id: projectId, crew_member_id: id }))
  // Ignore duplicate-pair conflicts: assigning an already-assigned member is a no-op.
  const { error } = await supabase.from('project_assignments').upsert(rows, { onConflict: 'project_id,crew_member_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function removeAssignment(id) {
  const { error } = await supabase.from('project_assignments').delete().eq('id', id)
  if (error) throw error
}

// ── Crew identity: link a crew row to a company user by email ────────────
// Called when a crew email is saved (crew page / share modal) and after a
// team invite. One crew row per user per company (unique index enforces it).
export async function linkCrewToUserByEmail({ crewMemberId, email, companyId, userId = null }) {
  try {
    let targetUserId = userId
    if (!targetUserId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('company_id', companyId)
        .eq('email', email)
        .maybeSingle()
      targetUserId = profile?.user_id ?? null
    }
    if (!targetUserId) return false
    const { error } = await supabase
      .from('crew_members')
      .update({ user_id: targetUserId })
      .eq('id', crewMemberId)
      .is('user_id', null)
    return !error
  } catch { return false }
}
