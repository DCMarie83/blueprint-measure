import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

export function useProject(projectId) {
  const { companyId } = useEffectiveCompany()
  const [project, setProject] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProject = useCallback(async () => {
    // Hold until the effective company resolves (own profile or the
    // impersonated tenant) so we never fire with an undefined company id.
    if (!projectId || !companyId) return
    setLoading(true)

    // Company-scoped, never user-owned: a job belongs to the company, and any
    // authenticated member must be able to open it (imported jobs can carry a
    // different member's user_id, or none at all). RLS enforces membership;
    // impersonation resolves through the effective company id.
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('company_id', companyId)
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
  }, [projectId, companyId])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  return { project, sessions, loading, error, refetch: fetchProject }
}
