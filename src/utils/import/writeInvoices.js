import { supabase } from '../../lib/supabase'
import { makeClientCreator, makeProjectCreator } from './placeholders'

// Writer for the Invoices + Payments import. Rows arrive from the review step
// with parsing, matching and status resolution already applied:
//   invoice_number, job_name, client (raw text), notes
//   _invoiceDate  'YYYY-MM-DD' (required)
//   _total        number > 0 (required)
//   _amountPaid   number >= 0
//   _paidDate     'YYYY-MM-DD' or null
//   _status       final status (explicit valid status wins, else derived)
//   _method       normalized payment method or null
//   _methodOriginal  original text when an unknown method was coerced to 'other'
//   _projectId / _projectClientId  matched project, or null (placeholder created)
//   _clientId     matched client id, or null
//
// Legacy invoice numbers are stored verbatim; generate_invoice_number is NEVER
// called, and no send-* edge function is ever invoked. Status/paid_amount are
// written directly — clients.lifetime_value updates via the existing DB
// triggers on invoices/invoice_payments.
export async function writeInvoiceRows({
  rows, batchId, onProgress, companyId, userId, existingNumbers, placeholderColumnId,
}) {
  const imported = []
  const skipped = []
  const failed = []
  const created = []

  const seenNumbers = new Set(existingNumbers)
  const createClient = makeClientCreator({ companyId, batchId, created })
  const createProject = makeProjectCreator({
    companyId, userId, batchId, created, kanbanColumnId: placeholderColumnId,
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const number = (row.invoice_number || '').trim()
    const label = number || `Row ${i + 2}`

    const numberKey = number.toLowerCase()
    if (seenNumbers.has(numberKey)) {
      skipped.push({ name: label, reason: 'duplicate_number' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    try {
      const clientText = (row.client || '').trim()
      let clientId = row._clientId ?? null
      if (!clientId && clientText) {
        clientId = await createClient(clientText)
      }

      let projectId = row._projectId ?? null
      let projectClientId = row._projectClientId ?? null
      if (!projectId) {
        const proj = await createProject(row.job_name, { clientId, clientName: clientText })
        projectId = proj.id
        projectClientId = proj.client_id
      }

      const status = row._status
      const paidAt = status === 'paid' ? (row._paidDate || row._invoiceDate) : null

      const { data: invoice, error: insErr } = await supabase
        .from('invoices')
        .insert({
          company_id: companyId,
          project_id: projectId,
          client_id: clientText ? clientId : projectClientId,
          invoice_number: number,
          status,
          subtotal: row._total,
          total: row._total,
          sent_at: row._invoiceDate,
          paid_amount: row._amountPaid > 0 ? row._amountPaid : null,
          paid_at: paidAt,
          payment_method: row._method,
          payment_notes: row._methodOriginal ? `Original payment method: ${row._methodOriginal}` : null,
          notes: (row.notes || '').trim() || null,
          created_by: userId,
          import_source: batchId,
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)

      if (row._amountPaid > 0) {
        const { error: pmtErr } = await supabase.from('invoice_payments').insert({
          invoice_id: invoice.id,
          company_id: companyId,
          amount: row._amountPaid,
          payment_method: row._method,
          payment_date: row._paidDate || row._invoiceDate,
          notes: `imported ${batchId}`,
          recorded_by: userId,
        })
        if (pmtErr) {
          seenNumbers.add(numberKey)
          throw new Error(`Invoice created but payment failed: ${pmtErr.message}`)
        }
        // No client-side ledger recompute here: the invoice row already carries
        // the correct paid_amount/status, and the LTV triggers do the rest.
      }

      seenNumbers.add(numberKey)
      imported.push({ name: label })
    } catch (err) {
      failed.push({ name: label, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, skipped, failed, created }
}
