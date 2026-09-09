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
// Legacy invoice numbers are stored verbatim; generate_invoice_number is
// called ONLY for the explicit G69 "renumber" resolution (the operator chose
// it on the collision card), and no send-* edge function is ever invoked.
// clients.lifetime_value updates via the existing DB triggers on
// invoice_payments.
//
// G69 collision review: rows arriving with _disposition 'review' carry a
// _resolution chosen on the collision card ({ action: 'skip' | 'revise' |
// 'addon' | 'renumber' }). One number = one record: nothing is ever suffixed
// and the unique index is never widened.
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

const isBlank = (v) => v == null || v === ''
const isBlankMoney = (v) => v == null || Number(v) === 0

// docMode: the money boundary. File import is the money writer; document
// import attaches documents and fills blanks. A doc-mode update may fill
// header fields only where the existing value is blank/null and may run the
// zero-line skeleton fill; it NEVER overwrites a non-blank total, subtotal,
// status, created_at, due_date, client_id, or notes.
export async function writeInvoiceRows({
  rows, batchId, onProgress, companyId, userId, existingNumbers, placeholderColumnId, docMode = false,
}) {
  const imported = []
  const updated = []
  const skipped = []
  const failed = []
  const created = []
  const reviewed = []
  const r2 = (v) => Math.round(v * 100) / 100

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

      // ── G69: resolved collision rows ────────────────────────
      // The number already exists on the company. The operator chose an action
      // on the review card; unresolved rows never reach this writer.
      let effectiveNumber = number
      let renumberedFrom = null
      if (row._disposition === 'review' && row._existingId) {
        const action = row._resolution?.action
        if (!action) {
          skipped.push({ name: label, reason: 'needs_review' })
          onProgress?.(i + 1, rows.length)
          continue
        }

        if (action === 'skip') {
          // Drop the incoming row. In document mode the batch's source document
          // still attaches to the EXISTING invoice: afterImport links whatever
          // _createdId points at, so it is aimed at the existing record here.
          row._createdId = row._existingId
          reviewed.push({ name: label, action, invoiceId: row._existingId, invoiceNumber: label })
          onProgress?.(i + 1, rows.length)
          continue
        }

        if (action === 'revise' || action === 'addon') {
          const { data: ex, error: exErr } = await supabase
            .from('invoices')
            .select('id, status, total, subtotal, adjustment_amount, client_id, import_source, invoice_line_items(id, sort_order), invoice_payments(amount)')
            .eq('id', row._existingId)
            .single()
          if (exErr) throw new Error(exErr.message)

          // Same refusals the card shows, enforced again at write time.
          if (ex.status === 'paid' || ex.status === 'void') {
            throw new Error(`Refused: invoice ${label} is ${ex.status} and its totals cannot change`)
          }
          const ledger = r2((ex.invoice_payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0))

          let lines = normalizeInvoiceLines(row._lines)
          if (lines.length === 0 && row._total == null) {
            throw new Error('Refused: the file row has no total and no line items to apply')
          }
          // A header-only file row still revises/adds as one lump-sum line so
          // the subtotal === total − adjustment invariant holds.
          if (lines.length === 0) {
            lines = normalizeInvoiceLines([{ description: `Imported ${label}`, total: row._total }])
          }
          const lineSum = r2(lines.reduce((s, li) => s + li.total, 0))
          const oldTotal = Number(ex.total) || 0

          let patch
          if (action === 'revise') {
            // Replace the line items; the total comes from the incoming row.
            const newTotal = row._total ?? lineSum
            if (newTotal < ledger) {
              throw new Error(`Refused: the new total $${newTotal.toFixed(2)} is below the $${ledger.toFixed(2)} already paid`)
            }
            if ((ex.invoice_line_items ?? []).length > 0) {
              const { error: delErr } = await supabase.from('invoice_line_items').delete().eq('invoice_id', row._existingId)
              if (delErr) throw new Error(delErr.message)
            }
            const { error: liErr } = await supabase.from('invoice_line_items').insert(
              lines.map(li => ({ ...li, invoice_id: row._existingId }))
            )
            if (liErr) throw new Error(`Line items failed: ${liErr.message}`)
            const adjustment = r2(newTotal - lineSum)
            patch = {
              subtotal: lineSum,
              adjustment_amount: adjustment,
              adjustment_label: adjustment !== 0 ? 'Import adjustment' : null,
              total: newTotal,
            }
          } else {
            // Add on: append the incoming lines and recompute the total.
            const addAmount = row._total ?? lineSum
            const newTotal = r2(oldTotal + addAmount)
            if (newTotal < ledger) {
              throw new Error(`Refused: the new total $${newTotal.toFixed(2)} is below the $${ledger.toFixed(2)} already paid`)
            }
            const maxSort = (ex.invoice_line_items ?? []).reduce((m, li) => Math.max(m, li.sort_order ?? 0), -1)
            const { error: liErr } = await supabase.from('invoice_line_items').insert(
              lines.map((li, idx) => ({ ...li, sort_order: maxSort + 1 + idx, invoice_id: row._existingId }))
            )
            if (liErr) throw new Error(`Line items failed: ${liErr.message}`)
            const newSubtotal = r2((Number(ex.subtotal) || 0) + lineSum)
            const adjustment = r2(newTotal - newSubtotal)
            patch = {
              subtotal: newSubtotal,
              adjustment_amount: adjustment,
              adjustment_label: adjustment !== 0 ? 'Import adjustment' : null,
              total: newTotal,
            }
          }
          patch.import_source = appendBatchId(ex.import_source, batchId)
          patch.updated_at = new Date().toISOString()
          const { error: updErr } = await supabase.from('invoices').update(patch).eq('id', row._existingId)
          if (updErr) throw new Error(updErr.message)

          // A non-draft re-derives its status against the new total through
          // the one payment door.
          if (ex.status !== 'draft') {
            const { data: rd, error: rdErr } = await supabase.rpc('apply_invoice_payment', {
              p_action: 'rederive', p_invoice_id: row._existingId,
              p_payment_id: null, p_amount: null, p_method: null, p_date: null,
              p_reference: null, p_notes: null, p_target_invoice_id: null,
            })
            if (rdErr) throw new Error(rdErr.message)
            if (rd?.error) throw new Error(`Status rederive failed: ${rd.error}`)
          }

          await logImportActivity({
            companyId,
            userId,
            clientId: ex.client_id,
            activityType: 'invoice_edited_after_send',
            title: `Invoice ${label} ${action === 'revise' ? 'revised' : 'added onto'} by import`,
            metadata: {
              import_source: batchId, invoice_id: row._existingId, invoice_number: label,
              old_total: oldTotal, new_total: patch.total,
            },
          })

          row._createdId = row._existingId
          reviewed.push({ name: label, action, invoiceId: row._existingId, invoiceNumber: label })
          onProgress?.(i + 1, rows.length)
          continue
        }

        if (action === 'renumber') {
          // Next free number from the company's sequence: the SAME generator
          // the app uses. The sequence can trail hand-entered numbers, so keep
          // drawing until a free one comes out. Never suffix, never widen.
          let newNumber = null
          for (let attempt = 0; attempt < 20 && !newNumber; attempt++) {
            const { data: gen, error: genErr } = await supabase.rpc('generate_invoice_number', { p_company_id: companyId })
            if (genErr) throw new Error(genErr.message)
            if (gen && !seenNumbers.has(String(gen).trim().toLowerCase())) newNumber = String(gen).trim()
          }
          if (!newNumber) throw new Error('Could not find a free invoice number')
          renumberedFrom = label
          effectiveNumber = newNumber
          // falls through to the normal insert path below
        }
      }

      // ── Update existing invoice ─────────────────────────────
      if (row._disposition === 'update' && row._existingId) {
        let clientId = row._clientId ?? null
        if (!clientId && clientText) clientId = await createClient(clientText)

        const hasDate = !!row._invoiceDate
        const hasTotal = row._total != null
        const prevStatus = row._existing?.status ?? null

        // The current record is needed for doc-mode blank checks and for the
        // zero-line skeleton fill.
        let existingInv = null
        if (docMode || row._lines?.length > 0) {
          const { data, error: exErr } = await supabase
            .from('invoices')
            .select('total, status, due_date, client_id, payment_method, payment_notes, paid_amount, invoice_line_items(id)')
            .eq('id', row._existingId)
            .single()
          if (exErr) throw new Error(exErr.message)
          existingInv = data
        }

        let patch
        if (docMode) {
          // Fill-only-when-blank. Status and created_at are never written by
          // doc-mode updates (a D4 draft skeleton keeps its status until a
          // file import moves it with an explicit value).
          patch = buildUpdatePatch({
            total: hasTotal && isBlankMoney(existingInv.total) ? row._total : null,
            subtotal: hasTotal && isBlankMoney(existingInv.total) ? row._total : null,
            due_date: hasDate && isBlank(existingInv.due_date) ? row._dueDate : null,
            client_id: clientText && isBlank(existingInv.client_id) ? clientId : null,
            payment_method: (raw.payment_method || '').trim() && isBlank(existingInv.payment_method) ? row._method : null,
            payment_notes: isBlank(existingInv.payment_notes) ? paymentNotes : null,
          })
        } else {
          // File import: the money writer. Status moves only via an explicitly
          // recognized value; unrecognized text skips the field entirely.
          patch = buildUpdatePatch({
            status: row._explicitStatus ?? null,
            total: hasTotal ? row._total : null,
            subtotal: hasTotal ? row._total : null,
            due_date: hasDate ? row._dueDate : null,
            payment_method: (raw.payment_method || '').trim() ? row._method : null,
            payment_notes: paymentNotes,
            client_id: clientText ? clientId : null,
            created_at: hasDate ? row._invoiceDate : null,
            updated_at: hasDate ? row._invoiceDate : null,
          })
          // Lifecycle stamps on an explicit status flip, from the document
          // date with a now() fallback.
          if (patch.status && patch.status !== prevStatus) {
            const stamp = row._invoiceDate || new Date().toISOString()
            if (patch.status === 'sent') patch.sent_at = stamp
            if (patch.status === 'paid') patch.paid_at = row._paidDate || row._invoiceDate || new Date().toISOString()
          }
        }
        patch.import_source = appendBatchId(row._existing?.import_source, batchId)
        if (!patch.updated_at) patch.updated_at = new Date().toISOString()

        // Extracted / sheet lines fill in a header-only skeleton: insert them
        // ONLY when the existing invoice has zero line items, and keep the
        // subtotal === total − adjustment invariant in the same update.
        if (row._lines?.length > 0) {
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

        // I4: paid_amount is never written without its ledger row. A file paid
        // amount for an existing invoice with an EMPTY ledger creates the
        // invoice_payments row (dated from the file's paid date, else the
        // invoice date), then the RPC re-derives status and the cache. An
        // invoice that already has ledger rows is left alone — the ledger is
        // the record, blanks never overwrite.
        if ((raw.amount_paid || '').trim() && row._amountPaid > 0) {
          const { data: ledgerRows, error: ledgerErr } = await supabase
            .from('invoice_payments').select('id').eq('invoice_id', row._existingId).limit(1)
          if (ledgerErr) throw new Error(ledgerErr.message)
          if ((ledgerRows ?? []).length === 0) {
            const paymentDate = row._paidDate || row._invoiceDate || new Date().toISOString().slice(0, 10)
            const { error: pmtErr } = await supabase.from('invoice_payments').insert({
              invoice_id: row._existingId,
              company_id: companyId,
              amount: row._amountPaid,
              payment_method: row._method,
              payment_date: paymentDate,
              created_at: paymentDate,
              notes: `imported ${batchId}`,
              recorded_by: userId,
            })
            if (pmtErr) throw new Error(`Payment failed: ${pmtErr.message}`)
            const { data: rd, error: rdErr } = await supabase.rpc('apply_invoice_payment', {
              p_action: 'rederive', p_invoice_id: row._existingId,
              p_payment_id: null, p_amount: null, p_method: null, p_date: null,
              p_reference: null, p_notes: null, p_target_invoice_id: null,
            })
            if (rdErr) throw new Error(rdErr.message)
            if (rd?.error) throw new Error(`Status rederive failed: ${rd.error}`)
          }
        }

        row._createdId = row._existingId
        updated.push({ name: label })
        onProgress?.(i + 1, rows.length)
        continue
      }

      // ── Insert new invoice ──────────────────────────────────
      const numberKey = effectiveNumber.toLowerCase()
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
          invoice_number: effectiveNumber,
          notes: renumberedFrom ? `Printed as ${renumberedFrom}` : null,
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
          metadata: { import_source: batchId, invoice_id: invoice.id, invoice_number: effectiveNumber },
        })
      }

      await logImportActivity({
        companyId,
        userId,
        clientId: activityClientId,
        activityType: 'invoice_created',
        title: `Invoice ${effectiveNumber} imported`,
        createdAt: row._invoiceDate,
        metadata: { import_source: batchId, invoice_id: invoice.id, invoice_number: effectiveNumber },
      })

      seenNumbers.add(numberKey)
      if (renumberedFrom) {
        reviewed.push({ name: renumberedFrom, action: 'renumber', invoiceId: invoice.id, invoiceNumber: effectiveNumber })
      } else {
        imported.push({ name: label })
      }
    } catch (err) {
      failed.push({ name: label, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated, skipped, failed, created, reviewed }
}
