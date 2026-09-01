import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

// Change orders for one job (public.change_orders, prod table). CRUD is
// plain client-side writes — no numbering RPC, no sends, no triggers.
export function useChangeOrders(projectId) {
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [changeOrders, setChangeOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchChangeOrders = useCallback(async () => {
    if (!projectId || !companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('change_orders')
        .select('*')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (err) throw err
      setChangeOrders(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId, companyId])

  useEffect(() => { fetchChangeOrders() }, [fetchChangeOrders])

  async function createChangeOrder({ co_number, title, description, amount, status }) {
    if (!companyId || !projectId) throw new Error('No company or project')
    const finalStatus = status || 'proposed'
    const { data, error: err } = await supabase
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: co_number?.trim() || null,
        source: 'manual',
        title: title.trim(),
        description: description?.trim() || null,
        amount: amount != null && amount !== '' ? Number(amount) : null,
        status: finalStatus,
        approved_at: finalStatus === 'approved' ? new Date().toISOString() : null,
        created_by: user?.id ?? null,
      })
      .select()
      .single()
    if (err) throw new Error(err.message)
    setChangeOrders(prev => [...prev, data])
    return data
  }

  async function updateChangeOrder(id, patch) {
    const update = { ...patch, updated_at: new Date().toISOString() }
    if (patch.status === 'approved' && !patch.approved_at) {
      const existing = changeOrders.find(co => co.id === id)
      if (!existing?.approved_at) update.approved_at = new Date().toISOString()
    }
    const { data, error: err } = await supabase
      .from('change_orders')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (err) throw new Error(err.message)
    setChangeOrders(prev => prev.map(co => co.id === id ? data : co))
    return data
  }

  async function deleteChangeOrder(id) {
    const { error: err } = await supabase.from('change_orders').delete().eq('id', id)
    if (err) throw new Error(err.message)
    setChangeOrders(prev => prev.filter(co => co.id !== id))
  }

  const approvedTotal = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + (Number(co.amount) || 0), 0)

  return { changeOrders, approvedTotal, loading, error, refetch: fetchChangeOrders, createChangeOrder, updateChangeOrder, deleteChangeOrder }
}
