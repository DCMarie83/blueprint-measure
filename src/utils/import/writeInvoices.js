import { supabase } from '../../lib/supabase'
import { makeClientCreator, makeProjectCreator } from './placeholders'
import { appendBatchId, buildUpdatePatch, normalizeUnit } from './importHelpers'
import { logImportActivity } from './activity'

// Writer for the Invoices + Payments import. Rows arrive from the review step
// with parsing, matching, status resolution, and due-date derivation applied:
//   invoice_number  may be '' — a placeholder IMPORT-<batch>-<rowN> is minted
//   job_name, client, notes (notes land in payment_notes, never invoices.notes)
//   _invoiceDate    'YYYY-MM-DD' (required) — becomes created_at/updated_at so
//                   reports bucket imported history into the right period
//   _total          number > 0, or null (_noTotal rows import as draft, total 0)
//   _amountPaid / _paidDate / _status / _method / _methodOriginal
//   _dueDate        derived from the matched client's billing terms
//   _lines          optional [{ description, category, item_type, unit, quantity, unit_rate }]
//   _projectId / _projectClientId / _clientId / _disposition / _existingId
//
// Line-item invariant enforced here: per-line total = quantity × unit_rate,
// subtotal = Σ line totals, and any gap to the header total is written as
// adjustment_amount so subtotal === total − adjustment always holds.
//
// Legacy invoice numbers are stored verbatim; generate_invoice_number is NEVER
// called, and no send-* edge function is ever invoked. clients.lifetime_value
// updates via the existing DB triggers on invoice_payments.
const VALID_ITEM_TYPES = new Set(['labor', 'material', 'supply', 'equipment', 'subcontractor', 'other'])

// One normalization for both the create and update paths: item_type coerced to
// the CHECK set (or 'other'/null), unit normalized. Per-line money honors the
// extracted printed total: qty×rate when both are present, else a printed-total
// line becomes a lump_sum (qty 1, rate = total). Lines with no description AND
// no money are dropped.
function normalizeInvoiceLines(rawLines) {
  const lines = (rawLines ?? []).map(li => {
    let qty = Number(li.quantity) || 0
    let rate = Number(li.unit_rate) || 0
    const printed = Number(li.total) || 0
    let unit = normalizeUnit(li.unit, 'each')
    let total = 0
    if (qty > 0 && rate > 0) {
      total = Math.round(qty * rate * 100) / 100
    } else if (printed > 0) {
      qty = 1
      unit = 'lump_sum'
      rate = printed
      total = printed
    }
    return {
      description: (li.description || '').trim(),
      category_name: (li.category || li.category_name || '').trim() || null,
      item_type: (li.item_type || '').trim().toLowerCase() || null,
      unit,
      quantity: qty,
      unit_rate: rate,
      total,
    }
  })
    .filter(li => li.description !== '' || li.total !== 0)
    .map((li, idx) => ({ ...li, description: li.description || '—', sort_order: idx }))
  for (const li of lines) {
    if (li.item_type && !VALID_ITEM_TYPES.has(li.item_type)) li.item_type = 'other'
  }
  return lines
}

export async function writeInvoiceRows({
  rows, batchId, onProgress, companyId, userId, existingNumbers, placeholderColumnId,
}) {
  const imported = []
  const updated = []
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
    const raw = row._raw ?? row
    const number = (row.invoice_number || '').trim() || `IMPORT-${batchId}-${i + 2}`
    const label = number

    try {
      const clientText = (row.client || '').trim()
      const noteText = (row.notes || '').trim()
      const methodNote = row._methodOriginal ? `Original payment method: ${row._methodOriginal}` : ''
      const paymentNotes = [noteText, methodNote].filter(Boolean).join(' · ') || null

      // ── Update existing invoice ─────────────────────────────
      if (row._disposition === 'update' && row._existingId) {
        let clientId = row._clientId ?? null
        if (!clientId && clientText) clientId = await createClient(clientText)

        const hasDate = !!row._invoiceDate
        const hasTotal = row._total != null
        const patch = buildUpdatePatch({
          status: (raw.status || '').trim() ? row._status : null,
          total: hasTotal ? row._total : null,
          subtotal: hasTotal ? row._total : null,
          paid_amount: (raw.amount_paid || '').trim() && row._amountPaid > 0 ? row._amountPaid : null,
          paid_at: row._status === 'paid' ? (row._paidDate || row._invoiceDate) : null,
          due_date: hasDate ? row._dueDate : null,
          payment_method: (raw.payment_method || '').trim() ? row._method : null,
          payment_notes: paymentNotes,
          client_id: clientText ? clientId : null,
          created_at: hasDate ? row._invoiceDate : null,
          updated_at: hasDate ? row._invoiceDate : null,
        })
        patch.import_source = appendBatchId(row._existing?.import_source, batchId)
        if (!patch.updated_at) patch.updated_at = new Date().toISOString()

        // Extracted / sheet lines fill in a header-only skeleton: insert them
        // ONLY when the existing invoice has zero line items, and keep the
        // subtotal === total − adjustment invariant in the same update.
        if (row._lines?.length > 0) {
          const { data: existingInv, error: exErr } = await supabase
            .from('invoices')
            .select('total, invoice_line_items(id)')
            .eq('id', row._existingId)
            .single()
          if (exErr) throw new Error(exErr.message)
          if ((existingInv.invoice_line_items?.length ?? 0) === 0) {
            const lines = normalizeInvoiceLines(row._lines)
            const { error: liErr } = await supabase.from('invoice_line_items').insert(
              lines.map(li => ({ ...li, invoice_id: row._existingId }))
            )
            if (liErr) throw new Error(`Line items failed: ${liErr.message}`)
            const lineSum = Math.round(lines.reduce((s, li) => s + li.total, 0) * 100) / 100
            const headerTotal = patch.total ?? (Number(existingInv.total) || 0)
            const adjustment = Math.round((headerTotal - lineSum) * 100) / 100
            patch.subtotal = lineSum
            patch.adjustment_amount = adjustment
            patch.adjustment_label = adjustment !== 0 ? 'Import adjustment' : null
          }
        }

        const { error: updErr } = await supabase.from('invoices').update(patch).eq('id', row._existingId)
        if (updErr) throw new Error(updErr.message)
        updated.push({ name: label })
        onProgress?.(i + 1, rows.length)
        continue
      }

      // ── Insert new invoice ──────────────────────────────────
      const numberKey = number.toLowerCase()
      if (seenNumbers.has(numberKey)) {
        skipped.push({ name: label, reason: 'duplicate_number' })
        onProgress?.(i + 1, rows.length)
        continue
      }

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

      const noTotal = row._total == null
      const total = noTotal ? 0 : row._total
      const status = noTotal ? 'draft' : row._status
      const amountPaid = noTotal ? 0 : row._amountPaid

      // Line items: per-line total = qty × rate; subtotal = line sum; the gap
      // to the header total becomes adjustment_amount (subtotal === total − adjustment).
      const lines = normalizeInvoiceLines(row._lines)
      const lineSum = Math.round(lines.reduce((s, li) => s + li.total, 0) * 100) / 100
      const subtotal = lines.length > 0 ? lineSum : total
      const adjustment = lines.length > 0 ? Math.round((total - lineSum) * 100) / 100 : 0

      const paidAt = status === 'paid' ? (row._paidDate || row._invoiceDate) : null

      const { data: invoice, error: insErr } = await supabase
        .from('invoices')
        .insert({
          company_id: companyId,
          project_id: projectId,
          client_id: clientText ? clientId : projectClientId,
          invoice_number: number,
          status,
          subtotal,
          adjustment_amount: adjustment,
          adjustment_label: adjustment !== 0 ? 'Import adjustment' : null,
          total,
          sent_at: status === 'draft' ? null : row._invoiceDate,
          due_date: row._dueDate,
          paid_amount: amountPaid > 0 ? amountPaid : null,
          paid_at: paidAt,
          payment_method: row._method,
          payment_notes: paymentNotes,
          created_by: userId,
          created_at: row._invoiceDate,
          updated_at: row._invoiceDate,
          import_source: batchId,
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)
      row._createdId = invoice.id

      if (lines.length > 0) {
        const { error: liErr } = await supabase.from('invoice_line_items').insert(
          lines.map(li => ({ ...li, invoice_id: invoice.id }))
        )
        if (liErr) {
          seenNumbers.add(numberKey)
          throw new Error(`Invoice created but line items failed: ${liErr.message}`)
        }
      }

      const activityClientId = clientText ? clientId : projectClientId

      if (amountPaid > 0) {
        const paymentDate = row._paidDate || row._invoiceDate
        const { error: pmtErr } = await supabase.from('invoice_payments').insert({
          invoice_id: invoice.id,
          company_id: companyId,
          amount: amountPaid,
          payment_method: row._method,
          payment_date: paymentDate,
          created_at: paymentDate,
          notes: `imported ${batchId}`,
          recorded_by: userId,
        })
        if (pmtErr) {
          seenNumbers.add(numberKey)
          throw new Error(`Invoice created but payment failed: ${pmtErr.message}`)
        }
        // No client-side ledger recompute: the invoice row already carries the
        // correct paid_amount/status, and the LTV triggers do the rest.
        await logImportActivity({
          companyId,
          userId,
          clientId: activityClientId,
          activityType: 'invoice_paid',
          title: `Payment of $${amountPaid.toFixed(2)} received`,
          createdAt: paymentDate,
          metadata: { import_source: batchId, invoice_id: invoice.id, invoice_number: number },
        })
      }

      await logImportActivity({
        companyId,
        userId,
        clientId: activityClientId,
        activityType: 'invoice_created',
        title: `Invoice ${number} imported`,
        createdAt: row._invoiceDate,
        metadata: { import_source: batchId, invoice_id: invoice.id, invoice_number: number },
      })

      seenNumbers.add(numberKey)
      imported.push({ name: label })
    } catch (err) {
      failed.push({ name: label, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated, skipped, failed, created }
}
