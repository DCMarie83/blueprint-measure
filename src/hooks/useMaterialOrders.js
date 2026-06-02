import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// List + create + delete for material orders on a project.
// Mirrors useEstimates. The single-order builder hook comes in the next pass.
export function useMaterialOrders(projectId) {
  const { user, userProfile } = useAuth()
  const companyId = userProfile?.company_id
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('material_orders')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error: err } = await query
      if (err) throw err
      setOrders(data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, projectId])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  async function createOrder(projId) {
    if (!companyId || !user?.id) throw new Error('No company or user')
    const { data, error: err } = await supabase
      .from('material_orders')
      .insert({ project_id: projId, company_id: companyId, status: 'draft', created_by: user.id })
      .select()
      .single()
    if (err) throw new Error(err.message)
    await fetchOrders()
    return data
  }

  const updateOrder = useCallback(async (orderId, patch) => {
    const { data, error } = await supabase
      .from('material_orders')
      .update(patch)
      .eq('id', orderId)
      .select()
      .single()
    if (error) throw error
    setOrders(prev => prev.map(o => (o.id === orderId ? data : o)))
    return data
  }, [])

  async function deleteOrder(id) {
    const { error: err } = await supabase.from('material_orders').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchOrders()
  }

  return { orders, loading, error, createOrder, updateOrder, deleteOrder, refetch: fetchOrders }
}
