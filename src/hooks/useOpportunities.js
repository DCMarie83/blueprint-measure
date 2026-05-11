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
      const { data: colData, error: colErr } = await supabase
        .from('kanban_columns')
        .select('*')
        .eq('company_id', companyId)
        .order('position', { ascending: true })

      if (colErr) throw colErr

      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*, sessions(id)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })

      if (projErr) throw projErr

      const projects = (projData ?? []).map(p => ({
        ...p,
        session_count: p.sessions?.length ?? 0,
        sessions: undefined,
      }))

      const board = (colData ?? []).map(col => ({
        ...col,
        projects: projects.filter(p => p.kanban_column_id === col.id),
      }))

      setColumns(board)
    } catch (err) {
      setError(err.message ?? 'Failed to load board')
    } finally {
      setLoading(false)
    }
  }, [user, companyId])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  async function moveProject(projectId, fromColumnId, toColumnId) {
    // Optimistic local update
    setColumns(prev => {
      const movedProject = prev
        .find(c => c.id === fromColumnId)?.projects
        .find(p => p.id === projectId)
      if (!movedProject) return prev

      return prev.map(col => {
        if (col.id === fromColumnId) {
          return { ...col, projects: col.projects.filter(p => p.id !== projectId) }
        }
        if (col.id === toColumnId) {
          return {
            ...col,
            projects: [
              { ...movedProject, updated_at: new Date().toISOString() },
              ...col.projects,
            ],
          }
        }
        return col
      })
    })

    // Persist
    const { error: updateError } = await supabase
      .from('projects')
      .update({ kanban_column_id: toColumnId, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (updateError) {
      await fetchBoard()
      return { error: updateError.message }
    }
    return { error: null }
  }

  return { columns, loading, error, refetch: fetchBoard, moveProject }
}
