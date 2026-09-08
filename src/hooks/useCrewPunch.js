import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// THE shared open-punch state for a crew member. Both the in-app clock on
// My Time and the RivetPay link operate on the same time_punch_submissions
// row: this hook reads the open row directly (tps_select covers a member's
// own rows), and clock in/out go through the SAME rivetpay RPCs the link
// uses, keyed by the crew row's link_token — so a punch opened on either
// surface shows and closes on the other.
export function useCrewPunch(crewMember) {
  const [openPunch, setOpenPunch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refetch = useCallback(async () => {
    if (!crewMember?.id) { setOpenPunch(null); setLoading(false); return }
    const { data } = await supabase
      .from('time_punch_submissions')
      .select('id, project_id, clock_in_at, description, projects(name)')
      .eq('crew_member_id', crewMember.id)
      .eq('status', 'open')
      .maybeSingle()
    setOpenPunch(data ?? null)
    setLoading(false)
  }, [crewMember?.id])

  useEffect(() => { refetch() }, [refetch])

  async function clockIn(projectId, description = '') {
    if (!crewMember?.link_token) throw new Error('No clock link for this crew member')
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('rivetpay_clock_in', {
        p_token: crewMember.link_token,
        p_project_id: projectId,
        p_lat: null,
        p_lng: null,
        p_description: description || null,
      })
      if (error) throw error
      if (data?.error && data.error !== 'already_open') throw new Error(data.error)
      await refetch()
      return data
    } finally { setBusy(false) }
  }

  async function clockOut() {
    if (!crewMember?.link_token) throw new Error('No clock link for this crew member')
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('rivetpay_clock_out', {
        p_token: crewMember.link_token,
        p_lat: null,
        p_lng: null,
      })
      if (error) throw error
      if (data?.error && data.error !== 'no_open') throw new Error(data.error)
      await refetch()
      return data
    } finally { setBusy(false) }
  }

  return { openPunch, loading, busy, clockIn, clockOut, refetch }
}
