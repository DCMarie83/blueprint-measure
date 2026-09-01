import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

// One company-scoped fetch of invoices, payments, and change orders,
// aggregated client-side into a per-project money map for the Jobs board and
// list view. Render-only on the cards — no per-card queries.
//   map.get(projectId) → { billed, collected, approvedCO, openCoCount }
// billed excludes draft and void invoices (matching Reports); collected sums
// the payments ledger; approvedCO sums approved change_orders.amount;
// openCoCount counts proposed change orders.
export function useJobMoneyMap() {
  const { companyId } = useEffectiveCompany()
  const [moneyMap, setMoneyMap] = useState(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [{ data: invoices }, { data: payments }, { data: changeOrders }] = await Promise.all([
          supabase.from('invoices').select('id, project_id, total, status').eq('company_id', companyId),
          supabase.from('invoice_payments').select('invoice_id, amount').eq('company_id', companyId),
          supabase.from('change_orders').select('project_id, amount, status').eq('company_id', companyId),
        ])
        if (cancelled) return

        const invoiceProject = new Map()
        const map = new Map()
        const entry = (projectId) => {
          if (!map.has(projectId)) map.set(projectId, { billed: 0, collected: 0, approvedCO: 0, openCoCount: 0 })
          return map.get(projectId)
        }

        for (const inv of invoices ?? []) {
          if (!inv.project_id) continue
          invoiceProject.set(inv.id, inv.project_id)
          if (inv.status !== 'draft' && inv.status !== 'void') {
            entry(inv.project_id).billed += Number(inv.total) || 0
          }
        }
        for (const p of payments ?? []) {
          const projectId = invoiceProject.get(p.invoice_id)
          if (!projectId) continue
          entry(projectId).collected += Number(p.amount) || 0
        }
        for (const co of changeOrders ?? []) {
          if (!co.project_id) continue
          const e = entry(co.project_id)
          if (co.status === 'approved') e.approvedCO += Number(co.amount) || 0
          if (co.status === 'proposed') e.openCoCount += 1
        }

        setMoneyMap(map)
      } catch { /* money strip is best-effort; board still renders */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId])

  return { moneyMap, loading }
}
