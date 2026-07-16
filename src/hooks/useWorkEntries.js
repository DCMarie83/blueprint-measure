import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

// Daily work entries for one job (project). Each row is either a PIECE entry
// (work_item_id + quantity × rate_snapshot) or an HOURLY entry (hours × rate).
// amount is computed and stored client-side — there is no DB total trigger,
// same as invoices.
export function useWorkEntries(projectId, { dateFrom, dateTo } = {}) {
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchEntries = useCallback(async () => {
    if (!companyId || !projectId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('work_entries')
        .select('*, work_items(name, unit)')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
      if (dateFrom) query = query.gte('work_date', dateFrom)
      if (dateTo) query = query.lte('work_date', dateTo)
      const { data, error: err } = await query
        .order('work_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (err) throw err
      setEntries(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, projectId, dateFrom, dateTo])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  async function createEntry(payload) {
    if (!companyId || !projectId) throw new Error('No company/job context')
    const { data, error: err } = await supabase
      .from('work_entries')
      .insert({ ...payload, company_id: companyId, project_id: projectId, created_by: user?.id })
      .select('*, work_items(name, unit)')
      .single()
    if (err) throw new Error(err.message)
    await fetchEntries()
    return data
  }

  async function updateEntry(id, fields) {
    const { error: err } = await supabase.from('work_entries').update(fields).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchEntries()
  }

  async function deleteEntry(id) {
    const { error: err } = await supabase.from('work_entries').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  return { entries, loading, error, refetch: fetchEntries, createEntry, updateEntry, deleteEntry }
}
