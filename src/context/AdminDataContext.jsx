import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AdminDataContext = createContext(null)

export function AdminDataProvider({ children }) {
  const [companies, setCompanies] = useState([])
  const [users, setUsers] = useState([])
  const [userProfiles, setUserProfiles] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [
        { data: companiesData, error: companiesErr },
        { data: profilesData, error: profilesErr },
        { data: sessionsData, error: sessionsErr },
      ] = await Promise.all([
        supabase.from('companies').select('*').order('created_at', { ascending: true }),
        supabase.from('user_profiles').select('*').is('deleted_at', null),
        supabase.from('sessions').select('id, user_id, created_at, blueprint_url'),
      ])

      if (companiesErr) throw new Error('companies: ' + companiesErr.message)
      if (profilesErr) throw new Error('user_profiles: ' + profilesErr.message)
      if (sessionsErr) throw new Error('sessions: ' + sessionsErr.message)

      setCompanies(companiesData ?? [])
      setUserProfiles(profilesData ?? [])
      setSessions(sessionsData ?? [])

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list' },
      })
      if (fnErr) throw new Error('user list: ' + fnErr.message)
      setUsers(fnData?.users ?? [])
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Derived helpers
  function companyNameFor(userId) {
    const profile = userProfiles.find(p => p.user_id === userId)
    if (!profile?.company_id) return '—'
    return companies.find(c => c.id === profile.company_id)?.name ?? '—'
  }

  function profileCompanyIdFor(userId) {
    return userProfiles.find(p => p.user_id === userId)?.company_id ?? ''
  }

  function roleFor(userId) {
    return userProfiles.find(p => p.user_id === userId)?.role ?? 'contractor_user'
  }

  function sessionCountFor(companyId) {
    const ids = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
    return sessions.filter(s => ids.includes(s.user_id)).length
  }

  function sessionsThisMonthFor(companyId) {
    const now = new Date()
    const ids = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
    return sessions.filter(s => {
      const d = new Date(s.created_at)
      return ids.includes(s.user_id) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
  }

  const value = {
    companies, setCompanies,
    users, setUsers,
    userProfiles, setUserProfiles,
    sessions, setSessions,
    loading, loadError, loadAll,
    companyNameFor, profileCompanyIdFor, roleFor,
    sessionCountFor, sessionsThisMonthFor,
  }

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  )
}

export { AdminDataContext }

export function useAdminData() {
  const ctx = useContext(AdminDataContext)
  if (!ctx) throw new Error('useAdminData must be used within AdminDataProvider')
  return ctx
}
