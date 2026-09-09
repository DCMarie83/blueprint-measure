import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Shared invoice-list sort + ledger sums, used by BOTH the Pro invoice list
// and the Lite invoice list — one implementation, per the Lane K rule.
// Sort semantics follow the Job Costing portfolio pattern: click a header to
// sort, click again to flip, blanks last in both directions, the active sort
// persisted in sessionStorage as "col:asc|desc".

export const INVOICE_COLUMNS = [
  { key: 'number', labelKey: 'invoices:table.number', align: 'left' },
  { key: 'client', labelKey: 'invoices:table.client', align: 'left' },
  { key: 'job', labelKey: 'invoices:table.job', align: 'left' },
  { key: 'date', labelKey: 'invoices:table.date', align: 'left' },
  { key: 'due_date', labelKey: 'invoices:table.dueDate', align: 'left' },
  { key: 'total', labelKey: 'invoices:table.total', align: 'right' },
  { key: 'paid', labelKey: 'invoices:table.paid', align: 'right' },
  { key: 'balance', labelKey: 'invoices:table.balance', align: 'right' },
  { key: 'status', labelKey: 'invoices:table.status', align: 'left' },
  { key: 'last_reminded', labelKey: 'invoices:table.lastReminded', align: 'left' },
]

const COLUMN_KEYS = INVOICE_COLUMNS.map(c => c.key)

// Money and date columns open newest/largest first; text columns open A→Z.
const DESC_FIRST = new Set(['date', 'due_date', 'total', 'paid', 'balance', 'last_reminded'])

export const STATUS_RANK = { draft: 0, sent: 1, viewed: 2, partial: 3, paid: 4, void: 5 }

// Numeric invoice numbers order numerically; other text (INV-…) follows
// alphabetically; IMPORT-* placeholder numbers group after everything;
// blank numbers last of all.
export function invoiceNumberKey(num) {
  const s = String(num ?? '').trim()
  if (s === '') return { group: 3, num: 0, text: '' }
  if (/^import-/i.test(s)) return { group: 2, num: 0, text: s.toLowerCase() }
  if (/^\d+$/.test(s)) return { group: 0, num: Number(s), text: s }
  return { group: 1, num: 0, text: s.toLowerCase() }
}

function compareNumbers(a, b) {
  const ka = invoiceNumberKey(a.invoice_number)
  const kb = invoiceNumberKey(b.invoice_number)
  if (ka.group !== kb.group) return ka.group - kb.group
  if (ka.group === 0) return ka.num - kb.num
  return ka.text.localeCompare(kb.text)
}

const r2 = (v) => Math.round(v * 100) / 100

// Ledger-derived paid for one invoice (0 when it has no ledger rows).
export function paidOf(inv, paidMap) {
  return r2(Number(paidMap?.get(inv.id)) || 0)
}

// Balance = total − ledger paid. A void invoice owes nothing: its balance is
// blank (null), never a number, so it sorts after every real balance.
export function balanceOf(inv, paidMap) {
  if (inv.status === 'void') return null
  return r2((Number(inv.total) || 0) - paidOf(inv, paidMap))
}

// null/'' → blank; used for the blanks-last rule.
function sortValue(inv, col, ctx) {
  switch (col) {
    case 'client': return ctx.clientNameOf(inv) || null
    case 'job': return inv.projects?.name || null
    case 'date': return inv.created_at ? new Date(inv.created_at).getTime() : null
    case 'due_date': return inv.due_date ? new Date(inv.due_date).getTime() : null
    case 'total': return Number(inv.total) || 0
    case 'paid': return paidOf(inv, ctx.paidMap)
    case 'balance': return balanceOf(inv, ctx.paidMap)
    case 'status': return STATUS_RANK[inv.status] ?? 9
    case 'last_reminded': return inv.last_reminded_at ? new Date(inv.last_reminded_at).getTime() : null
    default: return null
  }
}

// Blank rows sort after every row with data in BOTH directions (the Lane K
// rule); the sort is stable, so blanks keep their relative order.
export function sortInvoiceRows(rows, col, asc, ctx) {
  return [...rows].sort((a, b) => {
    if (col === 'number') {
      const cmp = compareNumbers(a, b)
      const aBlank = invoiceNumberKey(a.invoice_number).group === 3
      const bBlank = invoiceNumberKey(b.invoice_number).group === 3
      if (aBlank !== bBlank) return aBlank ? 1 : -1
      return asc ? cmp : -cmp
    }
    const va = sortValue(a, col, ctx)
    const vb = sortValue(b, col, ctx)
    const aBlank = va == null || va === ''
    const bBlank = vb == null || vb === ''
    if (aBlank !== bBlank) return aBlank ? 1 : -1
    if (aBlank) return 0
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return asc ? va - vb : vb - va
  })
}

// Sort state with sessionStorage persistence. Default: invoice date, newest
// first. Old dropdown values under the same key fail validation and fall back.
export function useInvoiceSort(storageKey) {
  const [sortCol, setSortCol] = useState(() => {
    try {
      const [col] = (sessionStorage.getItem(storageKey) || '').split(':')
      if (COLUMN_KEYS.includes(col)) return col
    } catch { /* storage unavailable */ }
    return 'date'
  })
  const [sortAsc, setSortAsc] = useState(() => {
    try {
      const [col, dir] = (sessionStorage.getItem(storageKey) || '').split(':')
      if (COLUMN_KEYS.includes(col)) return dir === 'asc'
    } catch { /* storage unavailable */ }
    return false
  })
  function handleSort(col) {
    const nextAsc = col === sortCol ? !sortAsc : !DESC_FIRST.has(col)
    setSortCol(col)
    setSortAsc(nextAsc)
    try { sessionStorage.setItem(storageKey, `${col}:${nextAsc ? 'asc' : 'desc'}`) } catch { /* ignore */ }
  }
  return { sortCol, sortAsc, handleSort }
}

// One query for the whole list: every ledger row for the company, summed per
// invoice client-side. Never a per-row fetch.
export function useInvoicePaidMap(companyId) {
  const [paidMap, setPaidMap] = useState(() => new Map())
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('invoice_payments')
        .select('invoice_id, amount')
        .eq('company_id', companyId)
      if (cancelled || error) return
      const map = new Map()
      for (const p of data ?? []) {
        map.set(p.invoice_id, (map.get(p.invoice_id) || 0) + (Number(p.amount) || 0))
      }
      setPaidMap(map)
    })()
    return () => { cancelled = true }
  }, [companyId])
  return paidMap
}
