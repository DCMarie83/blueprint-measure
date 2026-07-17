import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { GC_CLIENT_TYPE } from '../lib/lite'
import { getEffectiveTimeZone, startOfToday, startOfMonth, startOfYear, weekRange } from '../lib/effectiveTime'
import { isOpenPunch } from '../lib/lite'

// One aggregate read for the Lite home. Five batched company-scoped queries run
// in parallel (invoices, work_entries, invoice_payments, clients, projects) —
// never N+1 — and every figure is computed client-side here, matching the
// invoice/job precedents (there is no DB total trigger). Gated on companyId so
// it never fetches with an unresolved (impersonation-switching) company.
//
// Statuses that count as "owed / outstanding": sent, viewed, partial. 'draft'
// is not yet billed to anyone; 'void' is dead; 'paid' only feeds paidCount.
const OUTSTANDING_STATUSES = new Set(['sent', 'viewed', 'partial'])

// A reminder can go out at most once every 72 hours (mirrors the invoice detail).
const REMIND_THROTTLE_MS = 72 * 60 * 60 * 1000

const EMPTY = {
  owed: { total: 0, invoicedAwaiting: 0, loggedNotInvoiced: 0 },
  earnedMTD: 0,
  earnedYTD: 0,
  loggedThisWeek: 0,
  outstanding: { count: 0, amount: 0 },
  paidCount: 0,
  oldestUnpaid: null,
  jumpBackIn: null,
  flags: { hasGC: false, hasEntry: false, hasInvoice: false },
}

export function useLiteHomeStats(companyId) {
  const { userProfile } = useAuth()
  const tz = getEffectiveTimeZone(userProfile)
  const [stats, setStats] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      // ── Window boundaries in the user's effective zone ─────────────
      const todayStr = startOfToday(tz)
      const monthStartStr = startOfMonth(tz)
      const yearStartStr = startOfYear(tz)
      const { from: weekStartStr, to: weekEndStr } = weekRange(tz)

      // ── Five parallel, company-scoped reads ────────────────────────
      const [invRes, entRes, payRes, cliRes, projRes] = await Promise.all([
        supabase.from('invoices')
          .select('id, invoice_number, status, total, paid_amount, sent_at, created_at, due_date, last_reminded_at, client_id, project_id')
          .eq('company_id', companyId),
        supabase.from('work_entries')
          .select('project_id, amount, invoice_id, work_date, created_at, clock_in_at, clock_out_at')
          .eq('company_id', companyId),
        supabase.from('invoice_payments')
          .select('amount, payment_date')
          .eq('company_id', companyId),
        supabase.from('clients')
          .select('id, display_name, business_name, client_type')
          .eq('company_id', companyId),
        supabase.from('projects')
          .select('id, name, client_id')
          .eq('company_id', companyId)
          .is('deleted_at', null),
      ])
      for (const r of [invRes, entRes, payRes, cliRes, projRes]) {
        if (r.error) throw new Error(r.error.message)
      }
      const invoices = invRes.data ?? []
      // Open (running) punches are not billable work yet — they carry no hours or
      // amount. Drop them from EVERY entry-derived figure below; the timer bar
      // surfaces the live punch on its own.
      const entries = (entRes.data ?? []).filter(e => !isOpenPunch(e))
      const payments = payRes.data ?? []
      const clients = cliRes.data ?? []
      const projects = projRes.data ?? []

      const gcNameById = {}
      for (const c of clients) gcNameById[c.id] = c.business_name || c.display_name
      const projById = {}
      for (const p of projects) projById[p.id] = p

      // ── Owed to you ────────────────────────────────────────────────
      let invoicedAwaiting = 0
      let outstandingCount = 0
      let paidCount = 0
      for (const inv of invoices) {
        if (OUTSTANDING_STATUSES.has(inv.status)) {
          const net = Math.max(0, (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0))
          invoicedAwaiting += net
          outstandingCount += 1
        } else if (inv.status === 'paid') {
          paidCount += 1
        }
      }
      const loggedNotInvoiced = entries
        .filter(e => !e.invoice_id)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0)

      // ── Earned = payments recorded in the window ───────────────────
      let earnedMTD = 0, earnedYTD = 0
      for (const p of payments) {
        const d = String(p.payment_date || '').slice(0, 10)
        if (!d) continue
        const amt = Number(p.amount) || 0
        if (d >= yearStartStr) earnedYTD += amt
        if (d >= monthStartStr) earnedMTD += amt
      }

      // ── Logged this week (Mon–Sun, local) ──────────────────────────
      const loggedThisWeek = entries
        .filter(e => e.work_date && e.work_date >= weekStartStr && e.work_date <= weekEndStr)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0)

      // ── Oldest unpaid (by sent_at, else created_at) ────────────────
      let oldestUnpaid = null
      for (const inv of invoices) {
        if (!OUTSTANDING_STATUSES.has(inv.status)) continue
        const ref = inv.sent_at || inv.created_at
        if (!ref) continue
        if (!oldestUnpaid || new Date(ref) < new Date(oldestUnpaid._ref)) {
          oldestUnpaid = {
            id: inv.id,
            invoice_number: inv.invoice_number,
            gcName: gcNameById[inv.client_id] || 'No GC',
            days: Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86400000)),
            // Overdue ONLY when a due date is set and today is strictly past it.
            // No due date → never red (stays "outstanding" orange downstream).
            overdue: !!inv.due_date && todayStr > String(inv.due_date).slice(0, 10),
            // Remindable = eligible status (guaranteed here) AND outside the 72h
            // throttle. Drives the home card's "Remind" affordance.
            remindable: !inv.last_reminded_at || (Date.now() - new Date(inv.last_reminded_at).getTime() >= REMIND_THROTTLE_MS),
            _ref: ref,
          }
        }
      }
      if (oldestUnpaid) delete oldestUnpaid._ref

      // ── Jump back in (last job touched by a work_entry) ────────────
      let latest = null
      for (const e of entries) {
        const key = `${e.work_date || ''} ${e.created_at || ''}`
        if (!latest || key > latest._key) latest = { ...e, _key: key }
      }
      let jumpBackIn = null
      if (latest && projById[latest.project_id]) {
        const proj = projById[latest.project_id]
        const unbilled = entries
          .filter(e => e.project_id === proj.id && !e.invoice_id)
          .reduce((s, e) => s + (Number(e.amount) || 0), 0)
        jumpBackIn = {
          projectId: proj.id,
          name: proj.name,
          gcName: gcNameById[proj.client_id] || 'No GC',
          unbilled,
        }
      }

      setStats({
        owed: {
          total: invoicedAwaiting + loggedNotInvoiced,
          invoicedAwaiting,
          loggedNotInvoiced,
        },
        earnedMTD,
        earnedYTD,
        loggedThisWeek,
        outstanding: { count: outstandingCount, amount: invoicedAwaiting },
        paidCount,
        oldestUnpaid,
        jumpBackIn,
        flags: {
          hasGC: clients.some(c => c.client_type === GC_CLIENT_TYPE),
          hasEntry: entries.length > 0,
          hasInvoice: invoices.length > 0,
        },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, tz])

  useEffect(() => { fetch() }, [fetch])

  return { ...stats, loading, error, refetch: fetch }
}
