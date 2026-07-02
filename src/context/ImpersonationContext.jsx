import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const ImpersonationContext = createContext({
  actingAsCompanyId: null,
  actingAsCompany: null,
  sessionId: null,
  isImpersonating: false,
  loading: false,
  startImpersonation: async () => {},
  stopImpersonation: async () => {},
})

const STORAGE_COMPANY_KEY = 'bpm_impersonating_company_id'
const STORAGE_SESSION_KEY = 'bpm_impersonation_session_id'

export function ImpersonationProvider({ children }) {
  const { isSuperAdmin, superAdminChecked } = useAuth()
  const [actingAsCompanyId, setActingAsCompanyId] = useState(null)
  const [actingAsCompany, setActingAsCompany] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(false)

  const isImpersonating = !!actingAsCompanyId

  // Restore from sessionStorage on mount (after superAdminChecked)
  useEffect(() => {
    if (!superAdminChecked) return
    const storedCompanyId = sessionStorage.getItem(STORAGE_COMPANY_KEY)
    const storedSessionId = sessionStorage.getItem(STORAGE_SESSION_KEY)

    if (!storedCompanyId) return

    if (!isSuperAdmin) {
      // Defensive: clear stale keys if not a super admin
      sessionStorage.removeItem(STORAGE_COMPANY_KEY)
      sessionStorage.removeItem(STORAGE_SESSION_KEY)
      return
    }

    // Restore
    setLoading(true)
    ;(async () => {
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('*')
          .eq('id', storedCompanyId)
          .single()
        if (company) {
          setActingAsCompanyId(storedCompanyId)
          setActingAsCompany(company)
          setSessionId(storedSessionId || null)
        } else {
          sessionStorage.removeItem(STORAGE_COMPANY_KEY)
          sessionStorage.removeItem(STORAGE_SESSION_KEY)
        }
      } catch {
        sessionStorage.removeItem(STORAGE_COMPANY_KEY)
        sessionStorage.removeItem(STORAGE_SESSION_KEY)
      } finally {
        setLoading(false)
      }
    })()
  }, [superAdminChecked, isSuperAdmin])

  const startImpersonation = useCallback(async (companyId, { targetUserId = null, notes = '' } = {}) => {
    if (!isSuperAdmin) return
    setLoading(true)
    try {
      const { data: company, error: compErr } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single()
      if (compErr || !company) throw new Error(compErr?.message || 'Company not found')

      const { data: session, error: sessErr } = await supabase
        .from('impersonation_sessions')
        .insert({
          target_company_id: companyId,
          target_user_id: targetUserId || null,
          notes: notes || null,
        })
        .select('id')
        .single()
      if (sessErr) throw new Error(sessErr.message)

      setActingAsCompanyId(companyId)
      setActingAsCompany(company)
      setSessionId(session.id)
      sessionStorage.setItem(STORAGE_COMPANY_KEY, companyId)
      sessionStorage.setItem(STORAGE_SESSION_KEY, session.id)
    } catch (err) {
      console.error('Failed to start impersonation:', err)
      setActingAsCompanyId(null)
      setActingAsCompany(null)
      setSessionId(null)
      sessionStorage.removeItem(STORAGE_COMPANY_KEY)
      sessionStorage.removeItem(STORAGE_SESSION_KEY)
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin])

  const stopImpersonation = useCallback(async () => {
    if (sessionId) {
      try {
        await supabase
          .from('impersonation_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', sessionId)
      } catch (err) {
        console.error('Failed to close impersonation session:', err)
      }
    }
    setActingAsCompanyId(null)
    setActingAsCompany(null)
    setSessionId(null)
    sessionStorage.removeItem(STORAGE_COMPANY_KEY)
    sessionStorage.removeItem(STORAGE_SESSION_KEY)
  }, [sessionId])

  return (
    <ImpersonationContext.Provider value={{
      actingAsCompanyId, actingAsCompany, sessionId,
      isImpersonating, loading,
      startImpersonation, stopImpersonation,
    }}>
      {children}
    </ImpersonationContext.Provider>
  )
}

export function useImpersonation() {
  return useContext(ImpersonationContext)
}
