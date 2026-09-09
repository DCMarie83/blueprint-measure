import { supabase } from '../lib/supabase'

// G80 shared document numbering. The DB owns the draw
// (generate_document_number via the existing generate_* RPCs, which skip any
// number already used by a quote or an invoice); this module only READS state
// for previews and settings — a preview never reserves a number.

export async function getNumberingInfo(companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select('numbering_mode, next_document_number, next_invoice_number, next_estimate_number')
    .eq('id', companyId)
    .single()
  if (error) throw new Error(error.message)
  return {
    mode: data.numbering_mode || 'prefixed',
    nextShared: Number(data.next_document_number) || 1,
    nextInvoice: Number(data.next_invoice_number) || 1,
    nextEstimate: Number(data.next_estimate_number) || 1,
  }
}

// Does any INVOICE on the company already carry this number? (Inheritance
// check for quote-to-invoice: the quote itself holding the number is fine.)
export async function invoiceNumberTaken(companyId, number) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('invoice_number', String(number))
    .limit(1)
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

async function docNumberTaken(companyId, number) {
  const [inv, est] = await Promise.all([
    supabase.from('invoices').select('id').eq('company_id', companyId).eq('invoice_number', String(number)).limit(1),
    supabase.from('estimates').select('id').eq('company_id', companyId).eq('estimate_number', String(number)).limit(1),
  ])
  if (inv.error) throw new Error(inv.error.message)
  if (est.error) throw new Error(est.error.message)
  return (inv.data ?? []).length > 0 || (est.data ?? []).length > 0
}

// What number the next draw WILL return, mirroring the generator: in shared
// mode the counter value skipping numbers already on the books; in prefixed
// mode the kind's own counter formatted. Read-only — nothing increments.
export async function previewNextNumber(companyId, kind, info = null) {
  const n = info ?? await getNumberingInfo(companyId)
  if (n.mode === 'shared') {
    let candidate = n.nextShared
    for (let i = 0; i < 25; i++) {
      if (!(await docNumberTaken(companyId, candidate))) return String(candidate)
      candidate += 1
    }
    return String(candidate)
  }
  const counter = kind === 'estimate' ? n.nextEstimate : n.nextInvoice
  const prefix = kind === 'estimate' ? 'EST' : 'INV'
  return `${prefix}-${new Date().getFullYear()}-${String(counter).padStart(4, '0')}`
}

// Highest numeric number already on the books (quotes AND invoices) — the
// floor the settings next-number field must stay above.
export async function maxUsedDocNumber(companyId) {
  const [inv, est] = await Promise.all([
    supabase.from('invoices').select('invoice_number').eq('company_id', companyId),
    supabase.from('estimates').select('estimate_number').eq('company_id', companyId),
  ])
  if (inv.error) throw new Error(inv.error.message)
  if (est.error) throw new Error(est.error.message)
  let max = 0
  for (const row of [...(inv.data ?? []), ...(est.data ?? [])]) {
    const s = String(row.invoice_number ?? row.estimate_number ?? '').trim()
    if (/^\d{1,9}$/.test(s)) max = Math.max(max, Number(s))
  }
  return max
}

export async function saveNumberingSettings(companyId, { mode, nextNumber }) {
  const patch = { numbering_mode: mode }
  if (mode === 'shared' && nextNumber != null) patch.next_document_number = nextNumber
  const { error } = await supabase.from('companies').update(patch).eq('id', companyId)
  if (error) throw new Error(error.message)
}
