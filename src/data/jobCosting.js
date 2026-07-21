import { supabase } from '../lib/supabase'
import { materialBuyQuantity } from '../utils/measurements'

function num(v) { return Number(v) || 0 }

function getAcceptedTotal(est) {
  const v = est.accepted_variant || est.selected_variant || 'good'
  return num(est[`${v}_total`])
}

function computeMaterialsCost(orders, itemsByOrder) {
  let cost = 0
  let incomplete = false
  for (const order of orders) {
    const v = order.selected_variant
    if (!v) { incomplete = true; continue }
    const field = `cost_${v}`
    const items = itemsByOrder[order.id] ?? []
    for (const it of items) {
      const c = Number(it[field])
      if (!c || c < 0) continue
      cost += materialBuyQuantity(it) * c
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
    supabase.from('invoices').select('id, project_id, total, status, created_at').eq('company_id', companyId).neq('status', 'void'),
    supabase.from('invoice_payments').select('id, invoice_id, amount, payment_date').eq('company_id', companyId),
    supabase.from('time_entries').select('project_id, hours, cost_rate, work_date').eq('company_id', companyId),
    supabase.from('material_orders').select('id, project_id, selected_variant').eq('company_id', companyId),
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
    const estimatedMargin = quoted - totalCost
    const estimatedMarginPct = quoted > 0 ? (estimatedMargin / quoted) * 100 : null
    const actualMargin = collected - totalCost
    const actualMarginPct = collected > 0 ? (actualMargin / collected) * 100 : null
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
    supabase.from('invoices').select('id, project_id, total, status, created_at').eq('project_id', projectId).eq('company_id', companyId).neq('status', 'void'),
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
    const field = v ? `cost_${v}` : null
    const items = moiByOrder[order.id] ?? []
    let orderCost = 0
    if (field) {
      for (const it of items) {
        const c = Number(it[field])
        if (!c || c < 0) continue
        orderCost += materialBuyQuantity(it) * c
      }
    }
    return { title: order.title || 'Untitled', store: order.stores?.name || null, selectedVariant: v, cost: orderCost }
  })

  const expensesCost = (expenseRows ?? []).reduce((s, x) => s + num(x.amount), 0)
  const totalCost = laborCost + materialsCost + expensesCost
  const estimatedMargin = quoted - totalCost
  const estimatedMarginPct = quoted > 0 ? (estimatedMargin / quoted) * 100 : null
  const actualMargin = collected - totalCost
  const actualMarginPct = collected > 0 ? (actualMargin / collected) * 100 : null
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
    hasIncompleteData,
    flag_no_accepted_estimate, flag_labor_incomplete, flag_materials_incomplete,
    laborBreakdown,
    materialsBreakdown,
    expensesBreakdown: expenseRows ?? [],
  }
}
