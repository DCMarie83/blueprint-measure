import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

export function useProject(projectId) {
  const { user } = useAuth()
  const { companyId, isImpersonating } = useEffectiveCompany()
  const [project, setProject] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProject = useCallback(async () => {
    if (!user || !projectId) return
    // While impersonating, hold until the effective company resolves so we
    // never fire with an undefined company id.
    if (isImpersonating && !companyId) return
    setLoading(true)

    // Scope by the acted-on tenant's company when impersonating (a super admin's
    // auth id won't match the tenant's rows); otherwise keep the user_id filter.
    let query = supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
    query = isImpersonating
      ? query.eq('company_id', companyId)
      : query.eq('user_id', user.id)

    const { data: projectData, error: projectError } = await query
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
  }, [user, projectId, companyId, isImpersonating])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  return { project, sessions, loading, error, refetch: fetchProject }
}
