import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

export function isOverdue(invoice) {
  // viewed is treated like sent: a viewed invoice is still awaiting payment.
  if (!invoice || (invoice.status !== 'sent' && invoice.status !== 'viewed' && invoice.status !== 'partial')) return false
  if (!invoice.due_date) return false
  return new Date(invoice.due_date) < new Date()
}

export function useInvoices({ projectId, clientId, status: statusFilter, dateFrom, dateTo } = {}) {
  const { companyId } = useEffectiveCompany()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchInvoices = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('invoices')
        .select('*, projects(id, name, address, client_id, clients(id, display_name, primary_email))')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      if (statusFilter) query = query.eq('status', statusFilter)
      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo)
      const { data, error: err } = await query
      if (err) throw err

      let results = data ?? []
      if (clientId) {
        // Match either FK: invoices.client_id (set by imports and, now, by
        // createInvoice) OR the parent project's client.
        results = results.filter(inv => inv.client_id === clientId || inv.projects?.client_id === clientId)
      }
      setInvoices(results)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, projectId, clientId, statusFilter, dateFrom, dateTo])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  return { invoices, loading, error, refetch: fetchInvoices }
}

export function useInvoice(invoiceId) {
  const [invoice, setInvoice] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('*, invoice_line_items(*), estimates(id, estimate_number)')
        .eq('id', invoiceId)
        .maybeSingle()
      if (err) throw err
      setInvoice(data ?? null)
      setLineItems((data?.invoice_line_items ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))

      // Fetch payments
      const { data: pmts, error: pmtErr } = await supabase
        .from('invoice_payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: true })
        .order('created_at', { ascending: true })
      if (pmtErr) throw pmtErr
      setPayments(pmts ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => { fetchInvoice() }, [fetchInvoice])

  return { invoice, lineItems, payments, loading, error, saving, setSaving, refetch: fetchInvoice }
}

export function useInvoiceMutations() {
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function createInvoice({ project_id, estimate_id, invoice_number, title, due_date, notes, terms, adjustment_amount, adjustment_label, lineItems }) {
    if (!companyId || !user?.id) throw new Error('No company or user')
    setSaving(true)
    setError(null)
    try {
      // G80: an explicit number (edited in the form, or inherited from the
      // source quote in shared mode) is used as-is; a collision surfaces as
      // 23505 for the G60 inline error. Otherwise the number is drawn at save
      // through the generator (never reserved at form open).
      let invNum = String(invoice_number ?? '').trim()
      if (!invNum) {
        const { data, error: rpcErr } = await supabase.rpc('generate_invoice_number', { p_company_id: companyId })
        if (rpcErr) throw new Error(rpcErr.message)
        invNum = data
      }

      const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity || 0) * Number(li.rate || 0)), 0)
      const total = subtotal + (Number(adjustment_amount) || 0)

      // Stamp client_id from the project so client surfaces can read invoices
      // by their own FK instead of joining through projects.
      const { data: projRow } = await supabase.from('projects').select('client_id').eq('id', project_id).single()

      const { data: invoice, error: insErr } = await supabase
        .from('invoices')
        .insert({
          project_id,
          company_id: companyId,
          client_id: projRow?.client_id ?? null,
          estimate_id: estimate_id || null,
          invoice_number: invNum,
          title: title || null,
          status: 'draft',
          subtotal,
          adjustment_amount: Number(adjustment_amount) || 0,
          adjustment_label: adjustment_label || null,
          total,
          due_date: due_date || null,
          notes: notes || null,
          terms: terms || null,
          created_by: user.id,
        })
        .select()
        .single()
      if (insErr) {
        const e = new Error(insErr.message)
        e.code = insErr.code
        throw e
      }

      if (lineItems.length > 0) {
        const rows = lineItems.map((li, i) => ({
          invoice_id: invoice.id,
          description: li.description,
          category_name: li.category_name || null,
          item_type: li.item_type || null,
          unit: li.unit || 'each',
          quantity: Number(li.quantity) || 0,
          unit_rate: Number(li.rate) || 0,
          total: (Number(li.quantity) || 0) * (Number(li.rate) || 0),
          sort_order: i,
          source_estimate_line_item_id: li.source_estimate_line_item_id ?? null,
        }))
        const { error: liErr } = await supabase.from('invoice_line_items').insert(rows)
        if (liErr) throw new Error(liErr.message)
      }

      // Activity log (fire-and-forget)
      try {
        const { data: proj } = await supabase.from('projects').select('client_id').eq('id', project_id).single()
        if (proj?.client_id) {
          await supabase.from('client_activity').insert({
            client_id: proj.client_id, company_id: companyId, user_id: user.id,
            activity_type: 'invoice_created', title: `Invoice ${invNum} created`,
            is_automated: true, metadata: { invoice_id: invoice.id, invoice_number: invNum },
          })
        }
      } catch { /* activity logging is best-effort */ }

      return invoice
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function updateInvoice(id, { title, due_date, notes, terms, adjustment_amount, adjustment_label, lineItems }) {
    setSaving(true)
    setError(null)
    try {
      const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity || 0) * Number(li.rate || 0)), 0)
      const total = subtotal + (Number(adjustment_amount) || 0)

      const { data: current, error: curErr } = await supabase.from('invoices').select('status').eq('id', id).single()
      if (curErr) throw new Error(curErr.message)

      const { error: updErr } = await supabase
        .from('invoices')
        .update({
          title: title || null,
          subtotal,
          adjustment_amount: Number(adjustment_amount) || 0,
          adjustment_label: adjustment_label || null,
          total,
          due_date: due_date || null,
          notes: notes || null,
          terms: terms || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (updErr) throw new Error(updErr.message)

      // I27: line items update by id. Existing rows update in place (lineage
      // preserved), new rows insert, removed rows delete — never a blanket
      // delete-and-reinsert.
      const { data: existingRows, error: exErr } = await supabase.from('invoice_line_items').select('id').eq('invoice_id', id)
      if (exErr) throw new Error(exErr.message)
      const existingIds = new Set((existingRows ?? []).map(r => r.id))
      const keptIds = new Set()
      const inserts = []
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i]
        const fields = {
          description: li.description,
          category_name: li.category_name || null,
          item_type: li.item_type || null,
          unit: li.unit || 'each',
          quantity: Number(li.quantity) || 0,
          unit_rate: Number(li.rate) || 0,
          total: (Number(li.quantity) || 0) * (Number(li.rate) || 0),
          sort_order: i,
          source_estimate_line_item_id: li.source_estimate_line_item_id ?? null,
        }
        if (li.id && existingIds.has(li.id)) {
          keptIds.add(li.id)
          const { error: rowErr } = await supabase.from('invoice_line_items').update(fields).eq('id', li.id)
          if (rowErr) throw new Error(rowErr.message)
        } else {
          inserts.push({ ...fields, invoice_id: id })
        }
      }
      if (inserts.length > 0) {
        const { error: insErr } = await supabase.from('invoice_line_items').insert(inserts)
        if (insErr) throw new Error(insErr.message)
      }
      const removedIds = [...existingIds].filter(rid => !keptIds.has(rid))
      if (removedIds.length > 0) {
        const { error: delErr } = await supabase.from('invoice_line_items').delete().in('id', removedIds)
        if (delErr) throw new Error(delErr.message)
      }

      // I1: after any edit on a non-draft, the status re-derives against the
      // new total through the RPC, and the edit is on the record.
      if (current.status !== 'draft') {
        await applyPayment('rederive', id)
        logInvoiceActivity(id, 'invoice_edited_after_send', 'Invoice edited after sending; status re-derived from the ledger', { new_total: total })
      }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function deleteInvoice(id) {
    const { error: err } = await supabase.from('invoices').delete().eq('id', id)
    if (err) throw new Error(err.message)
  }

  // I5: mark a draft sent by hand, recording how it reached the client.
  // The email path is the send button (the edge function stamps 'email').
  async function markSent(id, deliveryMethod) {
    const { error: err } = await supabase.from('invoices').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      delivery_method: deliveryMethod || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (err) throw new Error(err.message)
    logInvoiceActivity(id, 'invoice_marked_sent', `Invoice marked sent (${deliveryMethod || 'unspecified'})`, { delivery_method: deliveryMethod || null })
  }

  async function logInvoiceActivity(invoiceId, activityType, title, extraMeta = {}) {
    try {
      const { data: inv } = await supabase.from('invoices').select('invoice_number, project_id').eq('id', invoiceId).single()
      if (!inv) return
      const { data: proj } = await supabase.from('projects').select('client_id').eq('id', inv.project_id).single()
      if (!proj?.client_id) return
      await supabase.from('client_activity').insert({
        client_id: proj.client_id, company_id: companyId, user_id: user?.id,
        activity_type: activityType, title, is_automated: true,
        metadata: { invoice_id: invoiceId, invoice_number: inv.invoice_number, ...extraMeta },
      })
    } catch { /* activity logging is best-effort */ }
  }

  // ── Payments: one door ────────────────────────────────────────────────────
  // Every ledger mutation goes through the apply_invoice_payment RPC: it locks
  // the invoice, does cent-rounded math, and derives status from the ledger.
  // The RPC never touches invoices.payment_method or payment_notes. Errors come
  // back as { error: <code> }; codes surface on err.code for the UI to map.
  async function applyPayment(action, invoiceId, params = {}) {
    const { data, error: rpcErr } = await supabase.rpc('apply_invoice_payment', {
      p_action: action,
      p_invoice_id: invoiceId,
      p_payment_id: params.paymentId ?? null,
      p_amount: params.amount ?? null,
      p_method: params.method ?? null,
      p_date: params.date ?? null,
      p_reference: params.reference ?? null,
      p_notes: params.notes ?? null,
      p_target_invoice_id: params.targetInvoiceId ?? null,
    })
    if (rpcErr) throw new Error(rpcErr.message)
    if (data?.error) {
      const err = new Error(data.error)
      err.code = data.error
      throw err
    }
    return data ?? {}
  }

  async function recordPayment(invoiceId, { amount, payment_method, payment_date, reference_number, notes }) {
    const result = await applyPayment('record', invoiceId, {
      amount: Number(amount) || 0,
      method: payment_method || null,
      date: payment_date || new Date().toISOString().slice(0, 10),
      reference: reference_number || null,
      notes: notes || null,
    })
    logInvoiceActivity(invoiceId, 'payment_recorded', `Payment of $${(Number(amount) || 0).toFixed(2)} recorded`, { amount: Number(amount), payment_method })
    return result
  }

  // G77: edit an existing payment in place. Same RPC, action 'update' — the
  // row id is preserved, invoice_id never changes, and status re-derives from
  // the ledger inside the same locked transaction. Pure data: no send-* call.
  async function updatePayment(paymentId, invoiceId, { amount, payment_method, payment_date, reference_number, notes }) {
    const result = await applyPayment('update', invoiceId, {
      paymentId,
      amount: Number(amount) || 0,
      method: payment_method || null,
      date: payment_date || new Date().toISOString().slice(0, 10),
      reference: reference_number || null,
      notes: notes || null,
    })
    const fmt = (v) => `$${(Number(v) || 0).toFixed(2)}`
    const oldAmount = result.old_amount ?? null
    const oldDate = result.old_date ?? null
    logInvoiceActivity(
      invoiceId,
      'payment_edited',
      `Payment edited: ${fmt(oldAmount)} on ${oldDate ?? '?'} changed to ${fmt(amount)} on ${payment_date || oldDate || '?'}`,
      { old_amount: Number(oldAmount) || 0, new_amount: Number(amount) || 0, old_date: oldDate, new_date: payment_date || oldDate },
    )
    return result
  }

  async function deletePayment(paymentId, invoiceId) {
    const result = await applyPayment('delete', invoiceId, { paymentId })
    logInvoiceActivity(invoiceId, 'payment_deleted', 'Payment removed')
    return result
  }

  // I6 override: move a payment row to another invoice of the same client.
  // The RPC validates the target (non-draft, non-void, same client) and
  // re-derives both invoices in one transaction. Both sides get an activity
  // row naming the other invoice.
  async function transferPayment(paymentId, invoiceId, targetInvoiceId) {
    const [{ data: pmt }, { data: sourceInv }, { data: targetInv }] = await Promise.all([
      supabase.from('invoice_payments').select('amount').eq('id', paymentId).single(),
      supabase.from('invoices').select('invoice_number').eq('id', invoiceId).single(),
      supabase.from('invoices').select('invoice_number').eq('id', targetInvoiceId).single(),
    ])
    const result = await applyPayment('transfer', invoiceId, { paymentId, targetInvoiceId })
    const amountStr = `$${(Number(pmt?.amount) || 0).toFixed(2)}`
    logInvoiceActivity(invoiceId, 'payment_transferred_out', `Payment of ${amountStr} transferred to invoice ${targetInv?.invoice_number ?? ''}`.trim(), { amount: Number(pmt?.amount) || 0, target_invoice_id: targetInvoiceId, target_invoice_number: targetInv?.invoice_number ?? null })
    logInvoiceActivity(targetInvoiceId, 'payment_transferred_in', `Payment of ${amountStr} transferred from invoice ${sourceInv?.invoice_number ?? ''}`.trim(), { amount: Number(pmt?.amount) || 0, source_invoice_id: invoiceId, source_invoice_number: sourceInv?.invoice_number ?? null })
    return result
  }

  async function markPaidInFull(invoiceId) {
    // Size the payment from the ledger, never the paid_amount cache.
    const [{ data: inv, error: fetchErr }, { data: pmts, error: pmtErr }] = await Promise.all([
      supabase.from('invoices').select('total, status').eq('id', invoiceId).single(),
      supabase.from('invoice_payments').select('amount').eq('invoice_id', invoiceId),
    ])
    if (fetchErr) throw new Error(fetchErr.message)
    if (pmtErr) throw new Error(pmtErr.message)

    const ledger = (pmts ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const remaining = Math.round(((Number(inv.total) || 0) - ledger) * 100) / 100
    if (remaining <= 0) {
      // Ledger already covers the total — re-derive so the status says so.
      await applyPayment('rederive', invoiceId)
      return
    }

    await recordPayment(invoiceId, { amount: remaining, payment_method: null, payment_date: null, reference_number: null, notes: 'Marked paid in full' })
  }

  // G60: manual invoice number edit. Trimmed, non-empty; a unique-index
  // collision on (company_id, invoice_number) surfaces as code 23505 so the
  // caller can show an inline conflict error. Never renumbers, never suffixes.
  async function updateInvoiceNumber(id, number) {
    const trimmed = String(number ?? '').trim()
    if (!trimmed) {
      const err = new Error('empty')
      err.code = 'EMPTY'
      throw err
    }
    const { data: before } = await supabase.from('invoices').select('invoice_number').eq('id', id).single()
    const { error: updErr } = await supabase
      .from('invoices')
      .update({ invoice_number: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updErr) {
      const err = new Error(updErr.message)
      err.code = updErr.code
      throw err
    }

    // G76: activity trail, same channel markVoid/reopenInvoice use.
    if (before?.invoice_number && before.invoice_number !== trimmed) {
      logInvoiceActivity(id, 'invoice_number_changed', `Invoice number changed from ${before.invoice_number} to ${trimmed}`, { from: before.invoice_number, to: trimmed })
    }
    return trimmed
  }

  async function markVoid(id, reason) {
    const { error: err } = await supabase.from('invoices').update({
      status: 'void', void_reason: reason || null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (err) throw new Error(err.message)
    logInvoiceActivity(id, 'invoice_voided', 'Invoice voided', { void_reason: reason })
  }

  async function reopenInvoice(id) {
    // Reopen from void re-derives from the ledger. A voided invoice had left
    // the building, so a missing sent_at is stamped first — otherwise the
    // derivation would land on draft, which the lifecycle guard forbids.
    const { data: inv, error: fetchErr } = await supabase.from('invoices').select('sent_at').eq('id', id).single()
    if (fetchErr) throw new Error(fetchErr.message)

    const patch = { void_reason: null, updated_at: new Date().toISOString() }
    if (!inv.sent_at) patch.sent_at = new Date().toISOString()
    const { error: updErr } = await supabase.from('invoices').update(patch).eq('id', id)
    if (updErr) throw new Error(updErr.message)

    await applyPayment('rederive', id)
    logInvoiceActivity(id, 'invoice_reopened', 'Invoice reopened')
  }

  return { createInvoice, updateInvoice, deleteInvoice, markSent, markPaidInFull, markVoid, reopenInvoice, recordPayment, updatePayment, deletePayment, transferPayment, updateInvoiceNumber, saving, error }
}
