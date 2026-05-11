import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useClient(clientId) {
  const { userProfile } = useAuth()
  const companyId = userProfile?.company_id
  const [client, setClient] = useState(null)
  const [contacts, setContacts] = useState([])
  const [projects, setProjects] = useState([])
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

  return { client, contacts, projects, loading, error, refetch: fetchClient, addContact, updateContact, deleteContact }
}
