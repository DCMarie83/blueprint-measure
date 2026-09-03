import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

// One company-scoped batch of fetches for the Jobs board and list view,
// aggregated client-side into a per-project map. Render-only on the cards —
// never per-card queries.
//   map.get(projectId) → { billed, collected, approvedCO, openCoCount,
//                          invoiceCount, estimateCount, documentCount }
// billed excludes draft and void invoices (matching Reports); collected sums
// the payments ledger; approvedCO sums approved change_orders.amount;
// openCoCount counts proposed change orders. invoiceCount counts non-void
// invoices; documentCount counts documents linked to the job directly or to
// its invoices/estimates.
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
        const [{ data: invoices }, { data: payments }, { data: changeOrders }, { data: estimates }, { data: documents }] = await Promise.all([
          supabase.from('invoices').select('id, project_id, total, status').eq('company_id', companyId),
          supabase.from('invoice_payments').select('invoice_id, amount').eq('company_id', companyId),
          supabase.from('change_orders').select('project_id, amount, status').eq('company_id', companyId),
          supabase.from('estimates').select('id, project_id').eq('company_id', companyId),
          supabase.from('documents').select('linked_type, linked_id').eq('company_id', companyId).in('linked_type', ['project', 'invoice', 'estimate']),
        ])
        if (cancelled) return

        const invoiceProject = new Map()
        const estimateProject = new Map()
        const map = new Map()
        const entry = (projectId) => {
          if (!map.has(projectId)) {
            map.set(projectId, {
              billed: 0, collected: 0, approvedCO: 0, openCoCount: 0,
              invoiceCount: 0, estimateCount: 0, documentCount: 0,
            })
          }
          return map.get(projectId)
        }

        for (const inv of invoices ?? []) {
          if (!inv.project_id) continue
          invoiceProject.set(inv.id, inv.project_id)
          if (inv.status !== 'void') entry(inv.project_id).invoiceCount += 1
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
        for (const est of estimates ?? []) {
          if (!est.project_id) continue
          estimateProject.set(est.id, est.project_id)
          entry(est.project_id).estimateCount += 1
        }
        for (const doc of documents ?? []) {
          const projectId = doc.linked_type === 'project'
            ? doc.linked_id
            : doc.linked_type === 'invoice'
              ? invoiceProject.get(doc.linked_id)
              : estimateProject.get(doc.linked_id)
          if (!projectId) continue
          entry(projectId).documentCount += 1
        }

        setMoneyMap(map)
      } catch { /* money strip is best-effort; board still renders */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId])

  return { moneyMap, loading }
}
