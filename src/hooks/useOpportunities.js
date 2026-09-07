import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'

// windowFrom / windowTo: ISO date strings bounding updated_at. Jobs outside
// the window are not loaded. Lost jobs never load onto the board regardless
// of window. totalCount counts every non-lost, non-deleted job so the board
// can read "Showing N of M jobs".
export function useOpportunities({ windowFrom = null, windowTo = null } = {}) {
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [columns, setColumns] = useState([])
  const [totalCount, setTotalCount] = useState(0)
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

      let projQuery = supabase
        .from('projects')
        .select('*, sessions(id)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('status', 'lost')
        .order('updated_at', { ascending: false })
      if (windowFrom) projQuery = projQuery.gte('updated_at', windowFrom)
      if (windowTo) projQuery = projQuery.lte('updated_at', windowTo + 'T23:59:59.999Z')
      const [{ data: projData, error: projErr }, { count, error: countErr }] = await Promise.all([
        projQuery,
        supabase.from('projects').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).is('deleted_at', null).neq('status', 'lost'),
      ])

      if (projErr) throw projErr
      if (countErr) throw countErr

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
      setTotalCount(count ?? 0)
    } catch (err) {
      setError(err.message ?? 'Failed to load board')
    } finally {
      setLoading(false)
    }
  }, [user, companyId, windowFrom, windowTo])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  // Moves are pure data: update the column and, when the target column carries
  // a status_key, sync projects.status to it. Client notifications belong to
  // the board's confirm dialog exclusively; nothing here ever emails.
  async function moveProject(projectId, fromColumnId, toColumnId) {
    const toCol = columns.find(c => c.id === toColumnId)

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
              { ...mp, kanban_column_id: toColumnId, ...(toCol?.status_key ? { status: toCol.status_key } : {}), updated_at: new Date().toISOString() },
              ...col.projects,
            ],
          }
        }
        return col
      })
    })

    // Persist. A null status_key leaves projects.status untouched.
    const patch = { kanban_column_id: toColumnId, updated_at: new Date().toISOString() }
    if (toCol?.status_key) patch.status = toCol.status_key
    const { error: updateError } = await supabase
      .from('projects')
      .update(patch)
      .eq('id', projectId)

    if (updateError) {
      await fetchBoard()
      return { error: updateError.message, column: toCol ?? null }
    }

    return { error: null, column: toCol ?? null }
  }

  return { columns, totalCount, loading, error, refetch: fetchBoard, moveProject }
}
