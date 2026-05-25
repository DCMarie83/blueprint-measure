import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useClientAddresses(clientId) {
  const { userProfile } = useAuth()
  const companyId = userProfile?.company_id
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAddresses = useCallback(async () => {
    if (!clientId || !companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('client_addresses')
        .select('*')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
      if (err) throw err
      setAddresses(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, companyId])

  useEffect(() => { fetchAddresses() }, [fetchAddresses])

  async function addAddress(payload) {
    if (!companyId) throw new Error('No company context')
    const { data, error: err } = await supabase
      .from('client_addresses')
      .insert({ ...payload, client_id: clientId, company_id: companyId })
      .select()
      .single()
    if (err) throw err
    setAddresses(prev => [...prev, data])
    return data
  }

  async function updateAddress(addressId, patch) {
    const { data, error: err } = await supabase
      .from('client_addresses')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', addressId)
      .select()
      .single()
    if (err) throw err
    setAddresses(prev => prev.map(a => a.id === addressId ? data : a))
    return data
  }

  async function deleteAddress(addressId) {
    const { error: err } = await supabase
      .from('client_addresses')
      .delete()
      .eq('id', addressId)
    if (err) throw err
    setAddresses(prev => prev.filter(a => a.id !== addressId))
  }

  async function setPrimary(addressId) {
    // Clear all primaries for this client, then set the target
    const { error: clearErr } = await supabase
      .from('client_addresses')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .neq('id', addressId)
    if (clearErr) throw clearErr

    const { error: setErr } = await supabase
      .from('client_addresses')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', addressId)
    if (setErr) throw setErr

    await fetchAddresses()
  }

  return { addresses, loading, error, addAddress, updateAddress, deleteAddress, setPrimary, refetch: fetchAddresses }
}
