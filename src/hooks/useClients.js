import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

export function useClients() {
  const { companyId } = useEffectiveCompany()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchClients = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('clients')
        .select('*, client_contacts(*), projects(id)')
        .eq('company_id', companyId)
        .order('display_name', { ascending: true })
      if (err) throw err
      const enriched = (data ?? []).map(c => ({
        ...c,
        active_jobs_count: (c.projects ?? []).length,
        projects: undefined,
      }))
      setClients(enriched)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { fetchClients() }, [fetchClients])

  async function createClient(payload, contacts = []) {
    if (!companyId) throw new Error('No company context')
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert({ ...payload, company_id: companyId })
      .select()
      .single()
    if (clientErr) throw clientErr

    if (contacts.length > 0) {
      const contactRows = contacts.map(c => ({ ...c, client_id: client.id }))
      const { error: contactsErr } = await supabase.from('client_contacts').insert(contactRows)
      if (contactsErr) throw contactsErr
    }

    await fetchClients()
    return client
  }

  async function updateClient(clientId, payload) {
    const { error: err } = await supabase
      .from('clients')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', clientId)
    if (err) throw err
    await fetchClients()
  }

  async function deleteClient(clientId) {
    const { error: err } = await supabase.from('clients').delete().eq('id', clientId)
    if (err) throw err
    await fetchClients()
  }

  return { clients, loading, error, refetch: fetchClients, createClient, updateClient, deleteClient }
}
