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

  async function createSession({ clientName, projectName }) {
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        client_name: clientName,
        project_name: projectName,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    setSessions(prev => [data, ...prev])
    return data
  }

  async function deleteSession(sessionId) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) throw new Error(error.message)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
  }

  return { sessions, loading, error, createSession, deleteSession, refetch: fetchSessions }
}
