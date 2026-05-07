import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useProjects() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProjects = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Fetch projects with session count
    const { data, error: fetchError } = await supabase
      .from('projects')
      .select('*, sessions(id, updated_at)')
      .eq('user_id', user.id)
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
        return {
          ...p,
          session_count: sessions.length,
          last_activity: lastSessionUpdate && lastSessionUpdate > p.updated_at
            ? lastSessionUpdate
            : p.updated_at,
          sessions: undefined, // don't leak the full array into state
        }
      })
      setProjects(enriched)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  async function createProject({ name, clientName, address }) {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name,
        client_name: clientName || null,
        address: address || null,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    setProjects(prev => [{ ...data, session_count: 0, last_activity: data.updated_at }, ...prev])
    return data
  }

  async function softDeleteProject(projectId) {
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', user.id)

    if (error) throw new Error(error.message)
    setProjects(prev => prev.filter(p => p.id !== projectId))
  }

  async function updateProject(projectId, fields) {
    const { data, error } = await supabase
      .from('projects')
      .update(fields)
      .eq('id', projectId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    setProjects(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p))
    return data
  }

  return { projects, loading, error, createProject, softDeleteProject, updateProject, refetch: fetchProjects }
}
