import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

export function useEstimates(projectId) {
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [estimates, setEstimates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchEstimates = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('estimates').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error: err } = await query
      if (err) throw err
      setEstimates(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, projectId])

  useEffect(() => { fetchEstimates() }, [fetchEstimates])

  async function createEstimate(projId) {
    if (!companyId || !user?.id) throw new Error('No company or user')
    const { data: estNum, error: rpcErr } = await supabase.rpc('generate_estimate_number', { p_company_id: companyId })
    if (rpcErr) throw new Error(rpcErr.message)
    const { data, error: err } = await supabase
      .from('estimates')
      .insert({
        project_id: projId,
        company_id: companyId,
        estimate_number: estNum,
        status: 'draft',
        created_by: user.id,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      })
      .select().single()
    if (err) throw new Error(err.message)
    await fetchEstimates()
    return data
  }

  async function updateEstimate(id, patch) {
    const { error: err } = await supabase.from('estimates').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchEstimates()
  }

  async function deleteEstimate(id) {
    const { error: err } = await supabase.from('estimates').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchEstimates()
  }

  return { estimates, loading, error, createEstimate, updateEstimate, deleteEstimate, refetch: fetchEstimates }
}

export function useEstimate(estimateId) {
  const [estimate, setEstimate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchEstimate = useCallback(async () => {
    if (!estimateId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('estimates')
        .select('*, estimate_line_items(*)')
        .eq('id', estimateId)
        .single()
      if (err) throw err
      setEstimate(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [estimateId])

  useEffect(() => { fetchEstimate() }, [fetchEstimate])

  return { estimate, loading, error, refetch: fetchEstimate }
}
