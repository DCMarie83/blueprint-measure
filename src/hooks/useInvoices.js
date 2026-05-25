import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function isOverdue(invoice) {
  if (!invoice || invoice.status !== 'sent') return false
  if (!invoice.due_date) return false
  return new Date(invoice.due_date) < new Date()
}

export function useInvoices({ projectId, clientId, status: statusFilter, dateFrom, dateTo } = {}) {
  const { company } = useAuth()
  const companyId = company?.id
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
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => { fetchInvoice() }, [fetchInvoice])

  return { invoice, lineItems, loading, error, saving, setSaving, refetch: fetchInvoice }
}

export function useInvoiceMutations() {
  const { user, company } = useAuth()
  const companyId = company?.id
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
          rate: Number(li.rate) || 0,
          total: (Number(li.quantity) || 0) * (Number(li.rate) || 0),
          sort_order: i,
        }))
        const { error: liErr } = await supabase.from('invoice_line_items').insert(rows)
        if (liErr) throw new Error(liErr.message)
      }

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
          rate: Number(li.rate) || 0,
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

  async function markPaid(id, { paid_amount, payment_method, payment_notes }) {
    const { error: err } = await supabase.from('invoices').update({
      status: 'paid', paid_at: new Date().toISOString(), paid_amount: Number(paid_amount) || 0,
      payment_method: payment_method || null, payment_notes: payment_notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (err) throw new Error(err.message)
  }

  async function markVoid(id, reason) {
    const { error: err } = await supabase.from('invoices').update({
      status: 'void', void_reason: reason || null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (err) throw new Error(err.message)
  }

  return { createInvoice, updateInvoice, deleteInvoice, markSent, markPaid, markVoid, saving, error }
}
