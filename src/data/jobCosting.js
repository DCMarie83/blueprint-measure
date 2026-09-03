import { supabase } from '../lib/supabase'
import { materialBuyQuantity } from '../utils/measurements'
import { unitCostAtGrade } from '../lib/materialsView'

function num(v) { return Number(v) || 0 }

// Resolve an accepted estimate's quoted revenue. The locked single-price model
// stores the price on good_total with no variant selected (imported estimates
// included), while legacy variant estimates may point at better/best columns
// that later single-price writes zeroed. Resolve the selected variant's total
// first and fall back to good_total, so neither shape ever reads $0. One value
// per estimate: no double counting.
function getAcceptedTotal(est) {
  const v = est.accepted_variant || est.selected_variant
  const variantTotal = v ? num(est[`${v}_total`]) : 0
  return variantTotal > 0 ? variantTotal : num(est.good_total)
}

function computeMaterialsCost(orders, itemsByOrder) {
  let cost = 0
  let incomplete = false
  for (const order of orders) {
    const v = order.selected_variant
    if (!v) { incomplete = true; continue }
    const items = itemsByOrder[order.id] ?? []
    for (const it of items) {
      // Shared standard-grade fallback (same as the estimate margin card):
      // a line contributes 0 only when unitCostAtGrade resolves to 0.
      cost += materialBuyQuantity(it) * unitCostAtGrade(it, v)
    }
  }
  return { cost, incomplete }
}

// ── Portfolio view ──────────────────────────────────────────────────────

export async function getJobCostingRows(companyId, { from, to } = {}) {
  if (!companyId) return []

  // Fetch all data sources in parallel, scoped by company_id
  const [
    { data: projects },
    { data: estimates },
    { data: invoices },
    { data: payments },
    { data: timeEntries },
    { data: materialOrders },
    { data: materialItems },
    { data: expenses },
  ] = await Promise.all([
    supabase.from('projects').select('id, name, status, client_id, clients(display_name)').eq('company_id', companyId).is('deleted_at', null),
    supabase.from('estimates').select('id, project_id, status, accepted_at, accepted_variant, selected_variant, good_total, better_total, best_total').eq('company_id', companyId).eq('status', 'accepted'),
    supabase.from('invoices').select('id, project_id, total, status, created_at').eq('company_id', companyId).not('status', 'in', '(void,draft)'),
    supabase.from('invoice_payments').select('id, invoice_id, amount, payment_date').eq('company_id', companyId),
    supabase.from('time_entries').select('project_id, hours, cost_rate, work_date').eq('company_id', companyId),
    supabase.from('material_orders').select('id, project_id, selected_variant, created_at').eq('company_id', companyId),
    supabase.from('material_order_items').select('material_order_id, quantity, coats, unit, overage_pct, cost_premium, cost_standard, cost_commercial').eq('company_id', companyId),
    supabase.from('expenses').select('project_id, amount, expense_date').eq('company_id', companyId),
  ])

  // Index by project
  const invoiceById = {}
  for (const inv of (invoices ?? [])) { invoiceById[inv.id] = inv }

  const paymentsByInvoice = {}
  for (const p of (payments ?? [])) {
    ;(paymentsByInvoice[p.invoice_id] ??= []).push(p)
  }

  const estByProject = {}
  for (const e of (estimates ?? [])) {
    ;(estByProject[e.project_id] ??= []).push(e)
  }

  const invByProject = {}
  for (const inv of (invoices ?? [])) {
    ;(invByProject[inv.project_id] ??= []).push(inv)
  }

  const teByProject = {}
  for (const te of (timeEntries ?? [])) {
    ;(teByProject[te.project_id] ??= []).push(te)
  }

  const moByProject = {}
  for (const mo of (materialOrders ?? [])) {
    ;(moByProject[mo.project_id] ??= []).push(mo)
  }

  const moiByOrder = {}
  for (const moi of (materialItems ?? [])) {
    ;(moiByOrder[moi.material_order_id] ??= []).push(moi)
  }

  const expByProject = {}
  for (const ex of (expenses ?? [])) {
    ;(expByProject[ex.project_id] ??= []).push(ex)
  }

  const rows = []

  for (const proj of (projects ?? [])) {
    const pid = proj.id

    // Check if project has any activity in date range
    const projEstimates = estByProject[pid] ?? []
    const projInvoices = invByProject[pid] ?? []
    const projTimeEntries = teByProject[pid] ?? []
    const projOrders = moByProject[pid] ?? []
    const projExpenses = expByProject[pid] ?? []

    const projPayments = []
    for (const inv of projInvoices) {
      for (const p of (paymentsByInvoice[inv.id] ?? [])) projPayments.push(p)
    }

    if (from || to) {
      const inRange = (dateStr) => {
        if (!dateStr) return false
        const d = dateStr.slice(0, 10)
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      }
      const hasActivity =
        projEstimates.some(e => inRange(e.accepted_at)) ||
        projInvoices.some(i => inRange(i.created_at)) ||
        projPayments.some(p => inRange(p.payment_date)) ||
        projTimeEntries.some(t => inRange(t.work_date)) ||
        projOrders.some(o => inRange(o.created_at)) ||
        projExpenses.some(x => inRange(x.expense_date))
      if (!hasActivity) continue
    }

    // Quoted
    let quoted = 0
    let flag_no_accepted_estimate = false
    if (projEstimates.length > 0) {
      const best = [...projEstimates].sort((a, b) => (b.accepted_at || '').localeCompare(a.accepted_at || ''))[0]
      quoted = getAcceptedTotal(best)
    } else {
      flag_no_accepted_estimate = true
    }

    // Billed
    const billed = projInvoices.reduce((s, i) => s + num(i.total), 0)

    // Collected
    const collected = projPayments.reduce((s, p) => s + num(p.amount), 0)

    // Labor
    let laborCost = 0
    let flag_labor_incomplete = false
    for (const te of projTimeEntries) {
      if (te.cost_rate == null) flag_labor_incomplete = true
      laborCost += num(te.hours) * num(te.cost_rate)
    }

    // Materials
    const { cost: materialsCost, incomplete: flag_materials_incomplete } = computeMaterialsCost(projOrders, moiByOrder)

    // Expenses
    const expensesCost = projExpenses.reduce((s, x) => s + num(x.amount), 0)

    const totalCost = laborCost + materialsCost + expensesCost
    // Locked margin spec: estimated = quoted − cost (pct over quoted);
    // actual = billed − cost (pct over billed); cash position = collected −
    // cost, value only, no percentage. Percentages are withheld (null) when
    // the revenue term is 0 or when no cost records exist in range, so an
    // empty side never renders +100.0%.
    const hasCostData = projTimeEntries.length > 0 || projOrders.length > 0 || projExpenses.length > 0
    const estimatedMargin = quoted - totalCost
    const estimatedMarginPct = quoted > 0 && hasCostData ? (estimatedMargin / quoted) * 100 : null
    const actualMargin = billed - totalCost
    const actualMarginPct = billed > 0 && hasCostData ? (actualMargin / billed) * 100 : null
    const cashPosition = collected - totalCost
    const hasIncompleteData = flag_no_accepted_estimate || flag_labor_incomplete || flag_materials_incomplete

    rows.push({
      project_id: pid,
      project_name: proj.name,
      client_name: proj.clients?.display_name || 'No client',
      project_status: proj.status,
      quoted, billed, collected,
      laborCost, materialsCost, expensesCost, totalCost,
      estimatedMargin, estimatedMarginPct,
      actualMargin, actualMarginPct,
      cashPosition, hasCostData,
      hasIncompleteData,
      flag_no_accepted_estimate,
      flag_labor_incomplete,
      flag_materials_incomplete,
    })
  }

  rows.sort((a, b) => a.actualMargin - b.actualMargin)
  return rows
}

// ── Job detail ──────────────────────────────────────────────────────────

export async function getJobCostingDetail(companyId, projectId) {
  if (!companyId || !projectId) return null

  const [
    { data: project },
    { data: estimates },
    { data: invoices },
    { data: timeEntries },
    { data: materialOrders },
    { data: materialItems },
    { data: expenseRows },
  ] = await Promise.all([
    supabase.from('projects').select('id, name, status, client_id, clients(display_name)').eq('id', projectId).single(),
    supabase.from('estimates').select('id, project_id, status, accepted_at, accepted_variant, selected_variant, good_total, better_total, best_total').eq('project_id', projectId).eq('company_id', companyId).eq('status', 'accepted'),
    supabase.from('invoices').select('id, project_id, total, status, created_at').eq('project_id', projectId).eq('company_id', companyId).not('status', 'in', '(void,draft)'),
    supabase.from('time_entries').select('project_id, hours, cost_rate, crew_member_id, crew_members(name)').eq('project_id', projectId).eq('company_id', companyId),
    supabase.from('material_orders').select('id, project_id, title, selected_variant, stores(name)').eq('project_id', projectId).eq('company_id', companyId),
    supabase.from('material_order_items').select('material_order_id, quantity, coats, unit, overage_pct, cost_premium, cost_standard, cost_commercial').eq('company_id', companyId),
    supabase.from('expenses').select('id, expense_date, category, description, vendor, amount').eq('project_id', projectId).eq('company_id', companyId).order('expense_date', { ascending: false }),
  ])

  if (!project) return null

  // Payments for this project's invoices
  const invoiceIds = (invoices ?? []).map(i => i.id)
  let allPayments = []
  if (invoiceIds.length > 0) {
    const { data: pmts } = await supabase.from('invoice_payments').select('invoice_id, amount, payment_date').in('invoice_id', invoiceIds)
    allPayments = pmts ?? []
  }

  // Quoted
  const projEstimates = estimates ?? []
  let quoted = 0
  let flag_no_accepted_estimate = false
  if (projEstimates.length > 0) {
    const best = [...projEstimates].sort((a, b) => (b.accepted_at || '').localeCompare(a.accepted_at || ''))[0]
    quoted = getAcceptedTotal(best)
  } else {
    flag_no_accepted_estimate = true
  }

  const billed = (invoices ?? []).reduce((s, i) => s + num(i.total), 0)
  const collected = allPayments.reduce((s, p) => s + num(p.amount), 0)

  // Labor breakdown per crew member
  let laborCost = 0
  let flag_labor_incomplete = false
  const laborMap = {}
  for (const te of (timeEntries ?? [])) {
    if (te.cost_rate == null) flag_labor_incomplete = true
    const cid = te.crew_member_id
    if (!laborMap[cid]) laborMap[cid] = { name: te.crew_members?.name || '—', hours: 0, rate: num(te.cost_rate), cost: 0 }
    laborMap[cid].hours += num(te.hours)
    laborMap[cid].cost += num(te.hours) * num(te.cost_rate)
    laborCost += num(te.hours) * num(te.cost_rate)
  }
  const laborBreakdown = Object.values(laborMap).sort((a, b) => b.cost - a.cost)

  // Filter material items to only this project's orders
  const projOrders = materialOrders ?? []
  const orderIds = new Set(projOrders.map(o => o.id))
  const moiByOrder = {}
  for (const moi of (materialItems ?? [])) {
    if (!orderIds.has(moi.material_order_id)) continue
    ;(moiByOrder[moi.material_order_id] ??= []).push(moi)
  }
  const { cost: materialsCost, incomplete: flag_materials_incomplete } = computeMaterialsCost(projOrders, moiByOrder)

  // Materials breakdown per order
  const materialsBreakdown = projOrders.map(order => {
    const v = order.selected_variant
    const items = moiByOrder[order.id] ?? []
    let orderCost = 0
    if (v) {
      // Same standard-grade fallback as computeMaterialsCost.
      for (const it of items) {
        orderCost += materialBuyQuantity(it) * unitCostAtGrade(it, v)
      }
    }
    return { title: order.title || 'Untitled', store: order.stores?.name || null, selectedVariant: v, cost: orderCost }
  })

  const expensesCost = (expenseRows ?? []).reduce((s, x) => s + num(x.amount), 0)
  const totalCost = laborCost + materialsCost + expensesCost
  // Same locked margin spec as the portfolio rows (see getJobCostingRows).
  const hasCostData = (timeEntries ?? []).length > 0 || projOrders.length > 0 || (expenseRows ?? []).length > 0
  const estimatedMargin = quoted - totalCost
  const estimatedMarginPct = quoted > 0 && hasCostData ? (estimatedMargin / quoted) * 100 : null
  const actualMargin = billed - totalCost
  const actualMarginPct = billed > 0 && hasCostData ? (actualMargin / billed) * 100 : null
  const cashPosition = collected - totalCost
  const hasIncompleteData = flag_no_accepted_estimate || flag_labor_incomplete || flag_materials_incomplete

  return {
    project_id: project.id,
    project_name: project.name,
    client_name: project.clients?.display_name || 'No client',
    project_status: project.status,
    quoted, billed, collected,
    laborCost, materialsCost, expensesCost, totalCost,
    estimatedMargin, estimatedMarginPct,
    actualMargin, actualMarginPct,
    cashPosition, hasCostData,
    hasIncompleteData,
    flag_no_accepted_estimate, flag_labor_incomplete, flag_materials_incomplete,
    laborBreakdown,
    materialsBreakdown,
    expensesBreakdown: expenseRows ?? [],
  }
}

// ── Period Summary (period-true P&L roll-up) ──────────────────────────────
// Every figure is CLIPPED to [from, to] by its own source date column, reusing
// the same per-source formulas as the portfolio (incl. the materials fallback).
// Date columns: quoted=estimates.accepted_at, billed/materials=created_at,
// collected=invoice_payments.payment_date, labor=time_entries.work_date,
// expenses=expenses.expense_date.
export async function getPeriodSummary(companyId, { from, to } = {}) {
  const empty = { quoted: 0, billed: 0, collected: 0, laborCost: 0, materialsCost: 0, expensesCost: 0, totalCost: 0, jobCount: 0, hasIncomplete: false, hasCostData: false }
  if (!companyId) return empty

  const clip = (q, col) => {
    if (from) q = q.gte(col, from)
    if (to) q = q.lte(col, to)
    return q
  }

  const [
    { data: estimates },
    { data: invoicesInRange },
    { data: invoiceMeta },
    { data: payments },
    { data: timeEntries },
    { data: materialOrders },
    { data: materialItems },
    { data: expenses },
  ] = await Promise.all([
    clip(supabase.from('estimates').select('project_id, accepted_at, accepted_variant, selected_variant, good_total, better_total, best_total').eq('company_id', companyId).eq('status', 'accepted'), 'accepted_at'),
    clip(supabase.from('invoices').select('project_id, total, status, created_at').eq('company_id', companyId).not('status', 'in', '(void,draft)'), 'created_at'),
    supabase.from('invoices').select('id, status, project_id').eq('company_id', companyId),
    clip(supabase.from('invoice_payments').select('invoice_id, amount, payment_date').eq('company_id', companyId), 'payment_date'),
    clip(supabase.from('time_entries').select('project_id, hours, cost_rate, work_date').eq('company_id', companyId), 'work_date'),
    clip(supabase.from('material_orders').select('id, project_id, selected_variant, created_at').eq('company_id', companyId), 'created_at'),
    supabase.from('material_order_items').select('material_order_id, quantity, coats, unit, overage_pct, cost_premium, cost_standard, cost_commercial').eq('company_id', companyId),
    clip(supabase.from('expenses').select('project_id, amount, expense_date').eq('company_id', companyId), 'expense_date'),
  ])

  const projectSet = new Set()
  const touch = (pid) => { if (pid) projectSet.add(pid) }

  // Quoted: sum of accepted totals for estimates accepted within the window.
  let quoted = 0
  for (const e of (estimates ?? [])) { quoted += getAcceptedTotal(e); touch(e.project_id) }

  // Billed: non-void / non-draft invoices issued (created) within the window.
  let billed = 0
  for (const i of (invoicesInRange ?? [])) { billed += num(i.total); touch(i.project_id) }

  // Void-invoice set + invoice→project map (all-time meta, used to attribute and
  // filter payments, which carry no project or status of their own).
  const voidIds = new Set()
  const invProject = {}
  for (const im of (invoiceMeta ?? [])) { invProject[im.id] = im.project_id; if (im.status === 'void') voidIds.add(im.id) }

  // Collected: payments in-window whose invoice isn't void.
  let collected = 0
  for (const p of (payments ?? [])) {
    if (voidIds.has(p.invoice_id)) continue
    collected += num(p.amount)
    touch(invProject[p.invoice_id])
  }

  // Labor: time entries worked in-window; per-entry cost_rate snapshot.
  let laborCost = 0
  let hasIncomplete = false
  for (const te of (timeEntries ?? [])) {
    if (te.cost_rate == null) hasIncomplete = true
    laborCost += num(te.hours) * num(te.cost_rate)
    touch(te.project_id)
  }

  // Materials: orders created in-window, priced with the shared fallback.
  const inRangeOrders = materialOrders ?? []
  for (const o of inRangeOrders) touch(o.project_id)
  const orderIds = new Set(inRangeOrders.map(o => o.id))
  const moiByOrder = {}
  for (const moi of (materialItems ?? [])) {
    if (!orderIds.has(moi.material_order_id)) continue
    ;(moiByOrder[moi.material_order_id] ??= []).push(moi)
  }
  const { cost: materialsCost, incomplete: matIncomplete } = computeMaterialsCost(inRangeOrders, moiByOrder)
  if (matIncomplete) hasIncomplete = true

  // Expenses in-window.
  let expensesCost = 0
  for (const x of (expenses ?? [])) { expensesCost += num(x.amount); touch(x.project_id) }

  return {
    quoted, billed, collected,
    laborCost, materialsCost, expensesCost,
    totalCost: laborCost + materialsCost + expensesCost,
    jobCount: projectSet.size,
    hasIncomplete,
    hasCostData: (timeEntries ?? []).length > 0 || inRangeOrders.length > 0 || (expenses ?? []).length > 0,
  }
}
