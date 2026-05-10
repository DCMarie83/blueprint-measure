import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// This hook handles all database operations for sessions.
// It fetches sessions for the logged-in user and provides
// functions to create and delete them.
export function useSessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSessions = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setSessions(data)
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  async function createSession({ description, projectName, projectId }) {
    // Check blueprint limit before creating — skipped for super admin.
    if (user.email !== 'main@ngautomationhub.com') {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      const companyId = profile?.company_id
      let blueprintLimit = null
      if (companyId) {
        const { data: comp } = await supabase
          .from('companies')
          .select('blueprint_limit')
          .eq('id', companyId)
          .single()
        blueprintLimit = comp?.blueprint_limit ?? null
      }

      if (companyId && blueprintLimit != null) {
        // Find all users in the same company, then count their sessions this month.
        const { data: peers } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('company_id', companyId)

        const peerIds = (peers ?? []).map(p => p.user_id)

        const now        = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        const { count } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .in('user_id', peerIds)
          .gte('created_at', monthStart)

        if (count >= blueprintLimit) {
          throw new Error(
            'You have reached your monthly blueprint limit. Please upgrade your plan to continue.'
          )
        }
      }
    }

    // If no projectId supplied, auto-create a project (legacy 1:1 flow)
    let resolvedProjectId = projectId
    if (!resolvedProjectId) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name: projectName,
        })
        .select()
        .single()

      if (projectError) throw new Error(projectError.message)
      resolvedProjectId = project.id
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        project_id: resolvedProjectId,
        description: description ?? null,
        project_name: projectName || 'Blueprint',
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    setSessions(prev => [data, ...prev])
    return data
  }

  async function createSessionsBatch({ files, projectId }) {
    const results = []
    for (const file of files) {
      const name = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
      try {
        const { data, error } = await supabase
          .from('sessions')
          .insert({
            user_id: user.id,
            project_id: projectId,
            project_name: name || 'Blueprint',
          })
          .select()
          .single()
        if (error) throw new Error(error.message)
        results.push({ sessionId: data.id, file, name, error: null })
      } catch (err) {
        results.push({ sessionId: null, file, name, error: err.message })
      }
    }
    await fetchSessions()
    return results
  }

  async function deleteSession(sessionId) {
    // Clean up blueprint files from storage before deleting the DB row
    try {
      const prefix = `${user.id}/${sessionId}/`
      const { data: files } = await supabase.storage.from('blueprints').list(prefix)
      if (files && files.length > 0) {
        const paths = files.map(f => `${prefix}${f.name}`)
        await supabase.storage.from('blueprints').remove(paths)
      }
    } catch (e) {
      console.warn('[deleteSession] Storage cleanup failed, proceeding with delete:', e)
    }

    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) throw new Error(error.message)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
  }

  async function updateSession(sessionId, updates) {
    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setSessions(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s))
    return data
  }

  return { sessions, loading, error, createSession, createSessionsBatch, updateSession, deleteSession, refetch: fetchSessions }
}
