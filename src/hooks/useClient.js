import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

export function useClient(clientId) {
  const { companyId } = useEffectiveCompany()
  const [client, setClient] = useState(null)
  const [contacts, setContacts] = useState([])
  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [estimates, setEstimates] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchClient = useCallback(async () => {
    if (!clientId || !companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('company_id', companyId)
        .single()
      if (clientErr) throw clientErr
      setClient(clientData)

      const { data: contactData } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
      setContacts(contactData ?? [])

      const { data: projectData } = await supabase
        .from('projects')
        .select('id, name, status, updated_at, kanban_column_id')
        .eq('client_id', clientId)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      setProjects(projectData ?? [])

      const projectIds = (projectData ?? []).map(p => p.id)

      // Invoices by FK union: invoices.client_id OR the client's projects.
      // Activity rows are a supplement, never the source of truth here.
      let invQuery = supabase
        .from('invoices')
        .select('id, invoice_number, status, total, paid_amount, due_date, created_at, project_id, client_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      invQuery = projectIds.length > 0
        ? invQuery.or(`client_id.eq.${clientId},project_id.in.(${projectIds.join(',')})`)
        : invQuery.eq('client_id', clientId)
      const { data: invoiceData } = await invQuery
      setInvoices(invoiceData ?? [])

      // Estimates reach a client only through its projects (no client_id column).
      let estimateData = []
      if (projectIds.length > 0) {
        const { data } = await supabase
          .from('estimates')
          .select('id, estimate_number, title, status, good_total, better_total, best_total, accepted_variant, selected_variant, smart_created, created_at, project_id')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })
        estimateData = data ?? []
      }
      setEstimates(estimateData)

      // Documents linked to the client directly or to its projects/invoices/estimates.
      try {
        const invoiceIds = (invoiceData ?? []).map(i => i.id)
        const estimateIds = estimateData.map(e => e.id)
        const orParts = [`and(linked_type.eq.client,linked_id.eq.${clientId})`]
        if (projectIds.length > 0) orParts.push(`and(linked_type.eq.project,linked_id.in.(${projectIds.join(',')}))`)
        if (invoiceIds.length > 0) orParts.push(`and(linked_type.eq.invoice,linked_id.in.(${invoiceIds.join(',')}))`)
        if (estimateIds.length > 0) orParts.push(`and(linked_type.eq.estimate,linked_id.in.(${estimateIds.join(',')}))`)
        const { data: docData } = await supabase
          .from('documents')
          .select('id, linked_type, linked_id, bucket_path, doc_type, original_filename, created_at')
          .eq('company_id', companyId)
          .or(orParts.join(','))
          .order('created_at', { ascending: false })
        setDocuments(docData ?? [])
      } catch { setDocuments([]) }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, companyId])

  useEffect(() => { fetchClient() }, [fetchClient])

  async function addContact(contact) {
    const { data, error: err } = await supabase
      .from('client_contacts')
      .insert({ ...contact, client_id: clientId })
      .select()
      .single()
    if (err) throw err
    setContacts(prev => [...prev, data])
    return data
  }

  async function updateContact(contactId, updates) {
    const { error: err } = await supabase
      .from('client_contacts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', contactId)
    if (err) throw err
    await fetchClient()
  }

  async function deleteContact(contactId) {
    const { error: err } = await supabase.from('client_contacts').delete().eq('id', contactId)
    if (err) throw err
    setContacts(prev => prev.filter(c => c.id !== contactId))
  }

  return { client, contacts, projects, invoices, estimates, documents, loading, error, refetch: fetchClient, addContact, updateContact, deleteContact }
}
