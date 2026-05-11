import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useOpportunities() {
  const { user, userProfile } = useAuth()
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const companyId = userProfile?.company_id

  const fetchBoard = useCallback(async () => {
    if (!user || !companyId) return
    setLoading(true)
    setError(null)

    try {
      // Fetch kanban columns for this company
      const { data: colData, error: colErr } = await supabase
        .from('kanban_columns')
        .select('*')
        .eq('company_id', companyId)
        .order('position', { ascending: true })

      if (colErr) throw colErr

      // Fetch active projects for this company
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*, sessions(id)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })

      if (projErr) throw projErr

      // Enrich projects with session_count
      const projects = (projData ?? []).map(p => ({
        ...p,
        session_count: p.sessions?.length ?? 0,
        sessions: undefined,
      }))

      // Group projects under their columns
      const board = (colData ?? []).map(col => ({
        ...col,
        projects: projects.filter(p => p.kanban_column_id === col.id),
      }))

      setColumns(board)
    } catch (err) {
      setError(err.message ?? 'Failed to load opportunities')
    } finally {
      setLoading(false)
    }
  }, [user, companyId])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  return { columns, loading, error, refetch: fetchBoard }
}
