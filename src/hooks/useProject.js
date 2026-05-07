import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useProject(projectId) {
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProject = useCallback(async () => {
    if (!user || !projectId) return
    setLoading(true)

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (projectError) {
      setError('Project not found.')
      setLoading(false)
      return
    }

    const { data: sessionsData, error: sessionsError } = await supabase
      .from('sessions')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })

    if (sessionsError) {
      setError(sessionsError.message)
    } else {
      setProject(projectData)
      setSessions(sessionsData ?? [])
    }

    setLoading(false)
  }, [user, projectId])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  return { project, sessions, loading, error, refetch: fetchProject }
}
