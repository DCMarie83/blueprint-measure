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

// A39: a hand-typed number can never leave the shared counter behind. ONE
// conditional update: it only lands in shared mode and only when the typed
// number is numeric and at or above the counter, so it can never move the
// counter backwards and needs no read first. Prefixed mode and non-numeric
// numbers are a no-op.
export async function advanceSharedCounterPast(companyId, number) {
  const s = String(number ?? '').trim()
  if (!companyId || !/^\d{1,9}$/.test(s)) return
  const typed = Number(s)
  const { error } = await supabase
    .from('companies')
    .update({ next_document_number: typed + 1 })
    .eq('id', companyId)
    .eq('numbering_mode', 'shared')
    .lte('next_document_number', typed)
  if (error) throw new Error(error.message)
}

// "Assign next number" keeps the number that went out on paper in the record's
// notes. The marker is stored data (one line, English, like activity titles);
// the detail pages read it back for the "Printed as" chip and translate the
// chip label, not the stored line.
const PRINTED_AS = /^Printed as (.+)$/gm

export function appendPrintedAs(notes, oldNumber) {
  const line = `Printed as ${String(oldNumber ?? '').trim()}`
  const existing = String(notes ?? '').trimEnd()
  return existing ? `${existing}\n${line}` : line
}

export function parsePrintedAs(notes) {
  return [...String(notes ?? '').matchAll(PRINTED_AS)].map(m => m[1].trim()).filter(Boolean)
}
