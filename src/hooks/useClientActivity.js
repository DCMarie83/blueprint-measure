import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

// Server-side paging: the first page is 10 rows, each "Show more" appends the
// next 25 via a range query (never a bigger refetch). `types` (array of
// activity_type values, or null for all) filters server-side; totalCount is
// an exact head count for the current filter.
const FIRST_PAGE = 10
const NEXT_PAGE = 25

export function useClientActivity(clientId, { types = null } = {}) {
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [activity, setActivity] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const typesKey = types ? types.join(',') : ''

  function baseQuery(select, opts) {
    let q = supabase.from('client_activity').select(select, opts).eq('client_id', clientId)
    if (typesKey) q = q.in('activity_type', typesKey.split(','))
    return q
  }

  const fetchActivity = useCallback(async () => {
    if (!clientId || !companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, count, error: err } = await baseQuery('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, FIRST_PAGE - 1)
      if (err) throw err
      setActivity(data ?? [])
      setTotalCount(count ?? (data?.length ?? 0))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, companyId, typesKey])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  const hasMore = activity.length < totalCount

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const from = activity.length
      const { data, error: err } = await baseQuery('*')
        .order('created_at', { ascending: false })
        .range(from, from + NEXT_PAGE - 1)
      if (err) throw err
      setActivity(prev => [...prev, ...(data ?? [])])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
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
    setTotalCount(prev => prev + 1)
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
    setTotalCount(prev => Math.max(0, prev - 1))
  }

  return { activity, totalCount, loading, loadingMore, error, addActivity, updateActivity, deleteActivity, refetch: fetchActivity, hasMore, loadMore }
}
