import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

export function useProjects() {
  const { user } = useAuth()
  const { companyId, isImpersonating } = useEffectiveCompany()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProjects = useCallback(async () => {
    // Scope by the EFFECTIVE company so impersonation shows the acted-on tenant's
    // jobs, not the raw auth user's. Gating on companyId (not user) also holds the
    // fetch during an impersonation switch until the effective company resolves.
    if (!companyId) { setLoading(false); return }
    setLoading(true)

    // Fetch projects with session count
    const { data, error: fetchError } = await supabase
      .from('projects')
      .select('*, sessions(id, updated_at, created_at)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      const enriched = (data ?? []).map(p => {
        const sessions = p.sessions ?? []
        const lastSessionUpdate = sessions.length > 0
          ? sessions.reduce((max, s) => s.updated_at > max ? s.updated_at : max, '')
          : null
        // Find the first session by created_at for smart-route (single-blueprint jobs skip Job Overview)
        const firstSession = sessions.length > 0
          ? sessions.reduce((earliest, s) => s.created_at < earliest.created_at ? s : earliest, sessions[0])
          : null
        return {
          ...p,
          session_count: sessions.length,
          first_session_id: firstSession?.id ?? null,
          last_activity: lastSessionUpdate && lastSessionUpdate > p.updated_at
            ? lastSessionUpdate
            : p.updated_at,
          sessions: undefined, // don't leak the full array into state
        }
      })
      setProjects(enriched)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  async function createProject({ name, address, clientId }) {
    if (!companyId) throw new Error('No company assigned. Contact support.')

    // Fetch the first kanban column for this company
    const { data: firstCol, error: colErr } = await supabase
      .from('kanban_columns')
      .select('id')
      .eq('company_id', companyId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (colErr || !firstCol) throw new Error('No kanban columns found for this company.')

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        company_id: companyId,
        kanban_column_id: firstCol.id,
        name,
        client_id: clientId || null,
        address: address || null,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    setProjects(prev => [{ ...data, session_count: 0, last_activity: data.updated_at }, ...prev])
    return data
  }

  async function softDeleteProject(projectId) {
    // Scope by the acted-on tenant's company when impersonating (a super admin's
    // auth id won't match the tenant's rows); otherwise keep the user_id filter.
    let query = supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', projectId)
    query = isImpersonating
      ? query.eq('company_id', companyId)
      : query.eq('user_id', user.id)

    const { error } = await query

    if (error) throw new Error(error.message)
    setProjects(prev => prev.filter(p => p.id !== projectId))
  }

  async function updateProject(projectId, fields) {
    // RLS (projects_update_tenant) scopes to same-company — no client-side user_id filter needed.
    const { data, error } = await supabase
      .from('projects')
      .update(fields)
      .eq('id', projectId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    setProjects(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p))
    return data
  }

  return { projects, loading, error, createProject, softDeleteProject, updateProject, refetch: fetchProjects }
}
