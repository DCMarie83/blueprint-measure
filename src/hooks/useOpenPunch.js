import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// The single OPEN clock-in punch for a company, if one exists. State derives
// entirely from the DB (a partial unique index guarantees at most one open punch
// per company), NOT from localStorage — so the running timer survives an app
// close and follows the sub across devices. Backs both the LogPage timer bar and
// the /home compact indicator.
export function useOpenPunch(companyId) {
  const [openPunch, setOpenPunch] = useState(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!companyId) { setOpenPunch(null); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('work_entries')
      .select('id, project_id, clock_in_at, rate_snapshot, description, projects(name)')
      .eq('company_id', companyId)
      .not('clock_in_at', 'is', null)
      .is('clock_out_at', null)
      .maybeSingle()
    if (error) {
      console.warn('[useOpenPunch] fetch failed:', error.message)
      setOpenPunch(null)
    } else {
      setOpenPunch(data ?? null)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { refetch() }, [refetch])

  return { openPunch, loading, refetch }
}
