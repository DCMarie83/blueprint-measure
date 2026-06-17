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

export async function getActiveProjects(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, client_name')
    .eq('company_id', companyId)
    .eq('status', 'active')
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
// entries: [{ crew_member_id, hours, crew_members?: { name } }]
// crew: [{ id, name, cost_rate }]
// Returns [{ crewMemberId, name, rate, hours, pay }] sorted by pay desc.
export function summarizePay(entries, crew) {
  const rateLookup = {}
  const nameLookup = {}
  for (const c of (crew || [])) {
    rateLookup[c.id] = Number(c.cost_rate) || 0
    nameLookup[c.id] = c.name
  }
  const byWorker = {}
  for (const e of entries) {
    const cmId = e.crew_member_id
    if (!byWorker[cmId]) {
      byWorker[cmId] = {
        crewMemberId: cmId,
        name: e.crew_members?.name || nameLookup[cmId] || '—',
        rate: rateLookup[cmId] ?? 0,
        hours: 0,
        pay: 0,
      }
    }
    byWorker[cmId].hours += Number(e.hours)
  }
  const rows = Object.values(byWorker)
  for (const r of rows) { r.pay = r.hours * r.rate }
  rows.sort((a, b) => b.pay - a.pay)
  return rows
}

export async function getPayReport(companyId, { from, to } = {}) {
  if (!companyId) return []
  let query = supabase
    .from('time_entries')
    .select('hours, crew_member_id, crew_members(name, cost_rate)')
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
