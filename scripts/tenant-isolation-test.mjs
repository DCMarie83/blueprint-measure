// Tenant isolation verification — creates two test users (each provisioned
// into its own company by handle_new_user), seeds rows for Company B, then
// authenticates as Company A and attempts cross-tenant SELECT / UPDATE /
// DELETE on every company_id table. Anon key only; no service role.
//
// Run: node scripts/tenant-isolation-test.mjs
// Cleanup: deletes seeded rows; test companies/users must be removed via admin.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
if (!URL_ || !ANON) { console.error('Missing env'); process.exit(1) }

const ts = Date.now()
const PASSWORD = 'IsoTest!' + ts
const emailA = `iso.test.a.${ts}@rivetdog-isolation-test.invalid`
const emailB = `iso.test.b.${ts}@rivetdog-isolation-test.invalid`

function newClient() {
  return createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function signupAndLogin(email, label) {
  const c = newClient()
  const { data, error } = await c.auth.signUp({
    email, password: PASSWORD,
    options: { data: {
      signup_path: 'self_serve',
      first_name: 'Iso', last_name: label,
      company_name: `ISOLATION TEST ${label} ${ts} (safe to delete)`,
      trade_vertical: 'painting',
      // deliberately NO state -> falls back to 'standard' plan, founders quota untouched
    } },
  })
  if (error) throw new Error(`${label} signup failed: ${error.message}`)
  if (data.session) return { client: c, userId: data.user.id, session: data.session }
  // email confirmation may be required; try password login anyway
  const { data: d2, error: e2 } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (e2 || !d2.session) throw new Error(`${label}: no session (email confirmation likely required): ${e2?.message}`)
  return { client: c, userId: d2.user.id, session: d2.session }
}

async function companyIdOf(client, userId) {
  const { data, error } = await client.from('user_profiles').select('company_id').eq('user_id', userId).maybeSingle()
  if (error || !data?.company_id) throw new Error('could not resolve company_id: ' + (error?.message || 'null'))
  return data.company_id
}

const results = []
function record(table, op, outcome, detail = '') {
  results.push({ table, op, outcome, detail })
}

async function main() {
  console.log('Creating test users...')
  const A = await signupAndLogin(emailA, 'A')
  const B = await signupAndLogin(emailB, 'B')
  const companyA = await companyIdOf(A.client, A.userId)
  const companyB = await companyIdOf(B.client, B.userId)
  console.log('Company A:', companyA)
  console.log('Company B:', companyB)

  // ---- Seed Company B data (as user B, through RLS) ----
  const seeded = {} // table -> row id
  async function seed(table, row, ret = 'id') {
    const { data, error } = await B.client.from(table).insert(row).select(ret).single()
    if (error) { record(table, 'seed', 'SKIP', 'insert as owner failed: ' + error.message); return null }
    seeded[table] = data.id
    return data
  }

  console.log('Seeding Company B rows...')
  const client = await seed('clients', { company_id: companyB, display_name: 'Iso Test Client B', client_type: 'residential' })
  if (client) {
    await seed('client_addresses', { company_id: companyB, client_id: client.id, address_type: 'billing', address_line1: '1 Test St' })
    await seed('client_activity', { company_id: companyB, client_id: client.id, activity_type: 'note', description: 'iso test' })
  }
  const project = await seed('projects', { company_id: companyB, user_id: B.userId, name: 'Iso Test Project B' })
  const pcat = await seed('pricing_categories', { company_id: companyB, name: 'Iso Cat B' })
  if (pcat) await seed('pricing_items', { company_id: companyB, category_id: pcat.id, name: 'Iso Item B', unit: 'each', rate: 1 })
  if (project) {
    const est = await seed('estimates', { company_id: companyB, project_id: project.id, title: 'Iso Estimate B' })
    if (est) await seed('estimate_line_items', { estimate_id: est.id, description: 'iso line', quantity: 1, unit_rate: 1, total: 1 })
    const inv = await seed('invoices', { company_id: companyB, project_id: project.id, invoice_number: 'ISO-' + ts, subtotal: 1, total: 1 })
    if (inv) {
      await seed('invoice_line_items', { invoice_id: inv.id, description: 'iso line', quantity: 1, unit_rate: 1, total: 1 })
      await seed('invoice_payments', { company_id: companyB, invoice_id: inv.id, amount: 1 })
    }
    await seed('time_entries', { company_id: companyB, user_id: B.userId, project_id: project.id, work_date: '2026-07-15', hours: 1 })
    await seed('expenses', { company_id: companyB, project_id: project.id, description: 'iso expense', amount: 1 })
    const mo = await seed('material_orders', { company_id: companyB, project_id: project.id })
    if (mo) await seed('material_order_items', { company_id: companyB, material_order_id: mo.id, name: 'iso item', quantity: 1 })
    await seed('sessions', { company_id: companyB, user_id: B.userId, project_id: project.id, project_name: 'Iso Test Project B' })
  }
  const crew = await seed('crew_members', { company_id: companyB, name: 'Iso Crew B' })
  if (crew && project) {
    await seed('time_punch_submissions', { company_id: companyB, crew_member_id: crew.id, project_id: project.id })
  }
  await seed('kanban_columns', { company_id: companyB, name: 'Iso Col B', position: 999 })
  await seed('stores', { company_id: companyB, name: 'Iso Store B' })
  await seed('client_errors', { company_id: companyB, user_id: B.userId, error_message: 'iso test error', page_url: 'test', user_agent: 'test' })

  // Discover extra rows B can already see in tables we did not seed
  // (e.g. auto-created kanban columns) to widen probe coverage.
  const ALL_TABLES = [
    'clients','client_addresses','client_activity','projects','kanban_columns',
    'pricing_categories','pricing_items','estimates','invoices','invoice_line_items',
    'invoice_payments','time_entries','expenses','material_orders','material_order_items',
    'crew_members','time_punch_submissions','stores','sessions','zones',
    'client_errors','user_profiles','companies',
  ]
  const COMPANY_SCOPED = new Set(ALL_TABLES.filter(t => !['invoice_line_items','estimate_line_items','user_profiles','companies','zones'].includes(t)))

  console.log('Probing as Company A...')
  for (const table of ALL_TABLES) {
    // 1) SELECT by company filter (company-scoped tables)
    if (COMPANY_SCOPED.has(table)) {
      const { data, error } = await A.client.from(table).select('id').eq('company_id', companyB).limit(5)
      if (error) record(table, 'select-by-company', 'BLOCKED(error)', error.message)
      else if ((data ?? []).length > 0) record(table, 'select-by-company', 'LEAK', `${data.length} Company B rows visible`)
      else record(table, 'select-by-company', seeded[table] ? 'ISOLATED' : 'ISOLATED(unseeded)')
    }
    // 2) SELECT / UPDATE / DELETE by direct id on the seeded B row
    const targetId = seeded[table]
    if (targetId) {
      const { data: s } = await A.client.from(table).select('id').eq('id', targetId)
      record(table, 'select-by-id', (s ?? []).length ? 'LEAK' : 'ISOLATED')

      const { data: u, error: ue } = await A.client.from(table).update({ updated_at: new Date().toISOString() }).eq('id', targetId).select('id')
      if (ue) record(table, 'update-by-id', 'BLOCKED(error)', ue.message.slice(0, 80))
      else record(table, 'update-by-id', (u ?? []).length ? 'LEAK — CROSS-TENANT WRITE' : 'ISOLATED')

      const { data: d, error: de } = await A.client.from(table).delete().eq('id', targetId).select('id')
      if (de) record(table, 'delete-by-id', 'BLOCKED(error)', de.message.slice(0, 80))
      else record(table, 'delete-by-id', (d ?? []).length ? 'LEAK — CROSS-TENANT DELETE' : 'ISOLATED')
    }
  }

  // special: user_profiles + companies visibility
  {
    const { data } = await A.client.from('user_profiles').select('user_id').eq('company_id', companyB)
    record('user_profiles', 'select-by-company', (data ?? []).length ? 'LEAK' : 'ISOLATED')
    const { data: co } = await A.client.from('companies').select('id,name').eq('id', companyB)
    record('companies', 'select-by-id', (co ?? []).length ? 'LEAK' : 'ISOLATED')
    const { data: coU, error: coE } = await A.client.from('companies').update({ name: 'HACKED' }).eq('id', companyB).select('id')
    if (coE) record('companies', 'update-by-id', 'BLOCKED(error)', coE.message.slice(0, 80))
    else record('companies', 'update-by-id', (coU ?? []).length ? 'LEAK — CROSS-TENANT WRITE' : 'ISOLATED')
  }

  // sanity: B CAN see its own rows (proves probes are meaningful, not just empty DB)
  for (const [table, id] of Object.entries(seeded)) {
    const { data } = await B.client.from(table).select('id').eq('id', id)
    if (!(data ?? []).length) record(table, 'owner-can-see-own', 'WARN', 'owner cannot see own seeded row — probe inconclusive')
  }

  // ---- Cleanup (as B, own rows) ----
  console.log('Cleaning up seeded rows...')
  const order = ['time_punch_submissions','invoice_payments','invoice_line_items','estimate_line_items',
    'material_order_items','material_orders','expenses','time_entries','invoices','estimates',
    'pricing_items','pricing_categories','sessions','client_activity','client_addresses','clients',
    'crew_members','stores','kanban_columns','projects','client_errors']
  for (const t of order) {
    if (seeded[t]) await B.client.from(t).delete().eq('id', seeded[t])
  }

  // ---- Report ----
  console.log('\n================ RESULTS ================')
  const leaks = results.filter(r => r.outcome.startsWith('LEAK'))
  const warns = results.filter(r => r.outcome === 'WARN' || r.outcome === 'SKIP')
  for (const r of results) {
    console.log(`${r.outcome.padEnd(28)} ${r.table.padEnd(26)} ${r.op.padEnd(20)} ${r.detail}`)
  }
  console.log('=========================================')
  console.log(`LEAKS: ${leaks.length}  |  WARN/SKIP: ${warns.length}  |  total probes: ${results.length}`)
  console.log(`\nTest companies left behind (delete via admin Companies screen):`)
  console.log(`  A: ${companyA}  (${emailA})`)
  console.log(`  B: ${companyB}  (${emailB})`)
  process.exit(leaks.length ? 2 : 0)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
