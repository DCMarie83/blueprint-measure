import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

export function isOverdue(invoice) {
  if (!invoice || (invoice.status !== 'sent' && invoice.status !== 'partial')) return false
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
        .select('*, projects(id, name, client_id, clients(id, display_name))')
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
        results = results.filter(inv => inv.projects?.client_id === clientId)
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
        .select('*, invoice_line_items(*)')
        .eq('id', invoiceId)
        .single()
      if (err) throw err
      setInvoice(data)
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

  async function createInvoice({ project_id, estimate_id, title, due_date, notes, terms, adjustment_amount, adjustment_label, lineItems }) {
    if (!companyId || !user?.id) throw new Error('No company or user')
    setSaving(true)
    setError(null)
    try {
      const { data: invNum, error: rpcErr } = await supabase.rpc('generate_invoice_number', { p_company_id: companyId })
      if (rpcErr) throw new Error(rpcErr.message)

      const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity || 0) * Number(li.rate || 0)), 0)
      const total = subtotal + (Number(adjustment_amount) || 0)

      const { data: invoice, error: insErr } = await supabase
        .from('invoices')
        .insert({
          project_id,
          company_id: companyId,
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
      if (insErr) throw new Error(insErr.message)

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

      // Replace line items: delete all then re-insert
      await supabase.from('invoice_line_items').delete().eq('invoice_id', id)
      if (lineItems.length > 0) {
        const rows = lineItems.map((li, i) => ({
          invoice_id: id,
          description: li.description,
          category_name: li.category_name || null,
          item_type: li.item_type || null,
          unit: li.unit || 'each',
          quantity: Number(li.quantity) || 0,
          unit_rate: Number(li.rate) || 0,
          total: (Number(li.quantity) || 0) * (Number(li.rate) || 0),
          sort_order: i,
        }))
        const { error: liErr } = await supabase.from('invoice_line_items').insert(rows)
        if (liErr) throw new Error(liErr.message)
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

  async function markSent(id) {
    const { error: err } = await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
    if (err) throw new Error(err.message)
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

  // ── Compute status from paid total ────────────────────────────────────────
  // Returns { status, paid_at } to write on the invoice.
  function computeStatusFromPayments(newPaidAmount, invoice) {
    const total = Number(invoice.total) || 0
    if (newPaidAmount >= total && total > 0) {
      return { status: 'paid', paid_at: invoice.paid_at || new Date().toISOString() }
    }
    if (newPaidAmount > 0) {
      return { status: 'partial', paid_at: null }
    }
    // No payments — revert to sent or draft
    return { status: invoice.sent_at ? 'sent' : 'draft', paid_at: null }
  }

  // ── Payment functions ─────────────────────────────────────────────────────

  async function recordPayment(invoiceId, { amount, payment_method, payment_date, reference_number, notes }) {
    // Fetch parent invoice for company_id + status check
    const { data: inv, error: fetchErr } = await supabase.from('invoices').select('company_id, total, paid_at, sent_at, status').eq('id', invoiceId).single()
    if (fetchErr) throw new Error(fetchErr.message)
    if (inv.status === 'void') throw new Error('Cannot record payment on a voided invoice')

    const { error: insErr } = await supabase.from('invoice_payments').insert({
      invoice_id: invoiceId,
      company_id: inv.company_id,
      amount: Number(amount) || 0,
      payment_method: payment_method || null,
      payment_date: payment_date || new Date().toISOString().slice(0, 10),
      reference_number: reference_number || null,
      notes: notes || null,
      recorded_by: user?.id,
    })
    if (insErr) throw new Error(insErr.message)

    // Recompute cached sum
    const { data: pmts } = await supabase.from('invoice_payments').select('amount').eq('invoice_id', invoiceId)
    const newPaidAmount = (pmts ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const { status, paid_at } = computeStatusFromPayments(newPaidAmount, inv)

    const { error: updErr } = await supabase.from('invoices').update({
      paid_amount: newPaidAmount,
      status,
      paid_at,
      payment_method: null,
      payment_notes: null,
      updated_at: new Date().toISOString(),
    }).eq('id', invoiceId)
    if (updErr) throw new Error(updErr.message)

    logInvoiceActivity(invoiceId, 'payment_recorded', `Payment of $${Number(amount).toFixed(2)} recorded`, { amount: Number(amount), payment_method })
  }

  async function deletePayment(paymentId, invoiceId) {
    const { error: delErr } = await supabase.from('invoice_payments').delete().eq('id', paymentId)
    if (delErr) throw new Error(delErr.message)

    // Recompute cached sum
    const { data: inv } = await supabase.from('invoices').select('total, paid_at, sent_at, status').eq('id', invoiceId).single()
    const { data: pmts } = await supabase.from('invoice_payments').select('amount').eq('invoice_id', invoiceId)
    const newPaidAmount = (pmts ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const { status, paid_at } = computeStatusFromPayments(newPaidAmount, inv)

    const { error: updErr } = await supabase.from('invoices').update({
      paid_amount: newPaidAmount,
      status,
      paid_at,
      payment_method: null,
      payment_notes: null,
      updated_at: new Date().toISOString(),
    }).eq('id', invoiceId)
    if (updErr) throw new Error(updErr.message)

    logInvoiceActivity(invoiceId, 'payment_deleted', 'Payment removed')
  }

  async function markPaidInFull(invoiceId) {
    const { data: inv, error: fetchErr } = await supabase.from('invoices').select('total, paid_amount, company_id, sent_at, paid_at, status').eq('id', invoiceId).single()
    if (fetchErr) throw new Error(fetchErr.message)
    if (inv.status === 'void') throw new Error('Cannot record payment on a voided invoice')

    const remaining = (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0)
    if (remaining <= 0) {
      // Already fully paid — just flip status
      await supabase.from('invoices').update({ status: 'paid', paid_at: inv.paid_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invoiceId)
      return
    }

    await recordPayment(invoiceId, { amount: remaining, payment_method: null, payment_date: null, reference_number: null, notes: 'Marked paid in full' })
  }

  async function markVoid(id, reason) {
    const { error: err } = await supabase.from('invoices').update({
      status: 'void', void_reason: reason || null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (err) throw new Error(err.message)
    logInvoiceActivity(id, 'invoice_voided', 'Invoice voided', { void_reason: reason })
  }

  async function reopenInvoice(id) {
    // Recompute status from existing payments
    const { data: inv, error: fetchErr } = await supabase.from('invoices').select('total, paid_at, sent_at, status').eq('id', id).single()
    if (fetchErr) throw new Error(fetchErr.message)

    const { data: pmts } = await supabase.from('invoice_payments').select('amount').eq('invoice_id', id)
    const paidAmount = (pmts ?? []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const { status, paid_at } = computeStatusFromPayments(paidAmount, inv)

    const { error: updErr } = await supabase.from('invoices').update({
      status,
      paid_at,
      paid_amount: paidAmount,
      void_reason: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (updErr) throw new Error(updErr.message)
    logInvoiceActivity(id, 'invoice_reopened', 'Invoice reopened')
  }

  return { createInvoice, updateInvoice, deleteInvoice, markSent, markPaidInFull, markVoid, reopenInvoice, recordPayment, deletePayment, saving, error }
}
