import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useClientActivity(clientId, { limit: initialLimit = 20 } = {}) {
  const { user, userProfile } = useAuth()
  const companyId = userProfile?.company_id
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [limit, setLimit] = useState(initialLimit)

  const fetchActivity = useCallback(async () => {
    if (!clientId || !companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('client_activity')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(limit + 1)
      if (err) throw err
      const rows = data ?? []
      if (rows.length > limit) {
        setHasMore(true)
        setActivity(rows.slice(0, limit))
      } else {
        setHasMore(false)
        setActivity(rows)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, companyId, limit])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  function loadMore() {
    setLimit(prev => prev + 20)
  }

  async function addActivity(payload) {
    if (!companyId || !user?.id) throw new Error('No company/user context')
    const { data, error: err } = await supabase
      .from('client_activity')
      .insert({
        ...payload,
        client_id: clientId,
        company_id: companyId,
        user_id: user.id,
        is_automated: payload.is_automated ?? false,
      })
      .select()
      .single()
    if (err) throw err
    setActivity(prev => [data, ...prev])
    return data
  }

  async function updateActivity(activityId, patch) {
    const { data, error: err } = await supabase
      .from('client_activity')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', activityId)
      .select()
      .single()
    if (err) throw err
    setActivity(prev => prev.map(a => a.id === activityId ? data : a))
    return data
  }

  async function deleteActivity(activityId) {
    const { error: err } = await supabase
      .from('client_activity')
      .delete()
      .eq('id', activityId)
    if (err) throw err
    setActivity(prev => prev.filter(a => a.id !== activityId))
  }

  return { activity, loading, error, addActivity, updateActivity, deleteActivity, refetch: fetchActivity, hasMore, loadMore }
}
