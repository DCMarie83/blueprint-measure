import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

// One company-scoped batch of fetches for the Jobs board and list view,
// aggregated client-side into a per-project map. Render-only on the cards —
// never per-card queries.
//   map.get(projectId) → { billed, collected, approvedCO, openCoCount,
//                          invoiceCount, estimateCount, documentCount }
// billed excludes draft and void invoices; collected sums the payments
// ledger on non-void invoices — the same two definitions Reports and the
// job header use; approvedCO sums approved change_orders.amount;
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
          supabase.from('estimates').select('id, project_id, status, decline_reason, declined_at, change_request_comment, changes_requested_at, accepted_at, accepted_variant, selected_variant, good_total, better_total, best_total, sent_at, created_at').eq('company_id', companyId),
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
              latestResponse: null, quoted: 0, _quotedAt: null, _latestSentAt: null,
              sentAfterAccepted: false,
            })
          }
          return map.get(projectId)
        }

        const voidInvoiceIds = new Set()
        for (const inv of invoices ?? []) {
          if (!inv.project_id) continue
          invoiceProject.set(inv.id, inv.project_id)
          if (inv.status === 'void') voidInvoiceIds.add(inv.id)
          if (inv.status !== 'void') entry(inv.project_id).invoiceCount += 1
          if (inv.status !== 'draft' && inv.status !== 'void') {
            entry(inv.project_id).billed += Number(inv.total) || 0
          }
        }
        // Collected = the payments ledger on non-void invoices, the one
        // definition used by Reports, the job header, and Lite.
        for (const p of payments ?? []) {
          if (voidInvoiceIds.has(p.invoice_id)) continue
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
          const e = entry(est.project_id)
          e.estimateCount += 1
          // Quoted: the newest ACCEPTED estimate's resolved total (variant
          // total falling back to good_total — same coalesce as Reports).
          if (est.status === 'accepted') {
            const at = est.accepted_at || ''
            if (e._quotedAt == null || at > e._quotedAt) {
              const v = est.accepted_variant || est.selected_variant
              const variantTotal = v ? Number(est[`${v}_total`]) : 0
              e.quoted = variantTotal || Number(est.good_total) || 0
              e._quotedAt = at
            }
          }
          // Latest client response per project, for the card chips: declined
          // (with reason) or changes_requested (with comment), newest wins.
          const responses = []
          if (est.status === 'declined' && est.declined_at) responses.push({ type: 'declined', text: est.decline_reason || '', at: est.declined_at })
          if (est.status === 'changes_requested' && est.changes_requested_at) responses.push({ type: 'changes_requested', text: est.change_request_comment || '', at: est.changes_requested_at })
          for (const r of responses) {
            if (!e.latestResponse || r.at > e.latestResponse.at) e.latestResponse = r
          }
          if (est.status === 'sent') {
            const sentAt = est.sent_at || est.created_at || ''
            if (!e._latestSentAt || sentAt > e._latestSentAt) e._latestSentAt = sentAt
          }
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

        // A sent estimate newer than the accepted one: the follow-up quote is
        // out with the client (drives the board card's "Estimate sent" chip).
        for (const e of map.values()) {
          e.sentAfterAccepted = !!(e._quotedAt && e._latestSentAt && e._latestSentAt > e._quotedAt)
        }

        setMoneyMap(map)
      } catch { /* money strip is best-effort; board still renders */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId])

  return { moneyMap, loading }
}
