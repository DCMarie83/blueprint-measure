import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

export function useOpportunities() {
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
    // Capture pre-move state for portal email trigger
    const fromCol = columns.find(c => c.id === fromColumnId)
    const toCol = columns.find(c => c.id === toColumnId)
    const movedProject = fromCol?.projects?.find(p => p.id === projectId)

    // Optimistic local update
    setColumns(prev => {
      const mp = prev.find(c => c.id === fromColumnId)?.projects?.find(p => p.id === projectId)
      if (!mp) return prev

      return prev.map(col => {
        if (col.id === fromColumnId) {
          return { ...col, projects: col.projects.filter(p => p.id !== projectId) }
        }
        if (col.id === toColumnId) {
          return {
            ...col,
            projects: [
              { ...mp, kanban_column_id: toColumnId, updated_at: new Date().toISOString() },
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

    // Auto-email on first move to Scheduled column (fire-and-forget)
    if (
      toCol?.name === 'Scheduled' &&
      !movedProject?.portal_email_sent_at &&
      movedProject?.client_id
    ) {
      ;(async () => {
        try {
          await supabase.from('projects').update({ portal_enabled: true }).eq('id', projectId)
          const { error: invokeErr } = await supabase.functions.invoke('send-portal-email', {
            body: { project_id: projectId },
          })
          if (invokeErr) console.error('Portal email invoke failed', invokeErr)
          await fetchBoard()
        } catch (err) {
          console.error('Portal email trigger failed', err)
        }
      })()
    }

    return { error: null }
  }

  return { columns, loading, error, refetch: fetchBoard, moveProject }
}
