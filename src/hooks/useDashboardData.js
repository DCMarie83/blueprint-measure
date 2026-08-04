import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'
import { useImpersonation } from '../context/ImpersonationContext'
import { DASHBOARD_TIPS } from '../data/dashboardTips'

export function useDashboardData() {
  const { user, userProfile } = useAuth()
  const { companyId } = useEffectiveCompany()
  const { isImpersonating } = useImpersonation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const fetch = useCallback(async () => {
    if (!user || !companyId) return
    setLoading(true)
    setError(null)

    try {
      // Parallel queries
      const [companyRes, projectsRes, sessionsRes, profilesRes, columnsRes, clientsRes] = await Promise.all([
        supabase.from('companies').select('created_at, trade_vertical').eq('id', companyId).single(),
        supabase.from('projects').select('id, name, address, status, created_at, updated_at, kanban_column_id, sessions(id, created_at)').eq('company_id', companyId).is('deleted_at', null).order('updated_at', { ascending: false }),
        supabase.from('sessions').select('id, project_name, project_id, created_at').eq(isImpersonating ? 'company_id' : 'user_id', isImpersonating ? companyId : user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('user_profiles').select('user_id').eq('company_id', companyId).is('deleted_at', null),
        supabase.from('kanban_columns').select('id, name, position, column_key').eq('company_id', companyId).order('position', { ascending: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      ])

      if (companyRes.error) throw companyRes.error
      if (projectsRes.error) throw projectsRes.error

      const company = companyRes.data
      const projects = projectsRes.data ?? []
      const sessions = sessionsRes.data ?? []
      const teamCount = (profilesRes.data ?? []).length
      const columns = columnsRes.data ?? []

      // Enrich projects with session_count
      const enrichedProjects = projects.map(p => ({
        ...p,
        session_count: p.sessions?.length ?? 0,
        sessions: undefined,
      }))

      // Stats
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const allSessions = projects.flatMap(p => p.sessions ?? [])

      const stats = {
        activeJobs: enrichedProjects.filter(p => p.status === 'active').length,
        clientCount: clientsRes.count ?? 0,
        blueprintsThisWeek: allSessions.filter(s => s.created_at >= weekAgo).length,
        jobsThisMonth: enrichedProjects.filter(p => p.created_at >= monthStart).length,
        teamMembers: teamCount,
      }

      // Pipeline preview (top 2 per column)
      const pipeline = columns.map(col => {
        const colProjects = enrichedProjects.filter(p => p.kanban_column_id === col.id)
        return {
          id: col.id,
          name: col.name,
          column_key: col.column_key,
          count: colProjects.length,
          projects: colProjects.slice(0, 2).map(p => ({
            id: p.id, name: p.name, address: p.address, session_count: p.session_count, updated_at: p.updated_at,
          })),
        }
      })

      // Checklist
      const totalJobs = enrichedProjects.length
      const companyAge = company.created_at ? (Date.now() - new Date(company.created_at).getTime()) / 86400000 : 999
      const isNewUser = totalJobs < 3 || companyAge <= 14
      const hasFirstJob = totalJobs > 0
      const hasFirstBlueprint = allSessions.length > 0

      const checklist = {
        hasLogo: false, // logo_url column doesn't exist yet
        hasTeam: teamCount > 1,
        hasFirstJob,
        hasFirstBlueprint,
        hasTradeVertical: !!company.trade_vertical,
        completeCount: [false, teamCount > 1, hasFirstJob, hasFirstBlueprint, !!company.trade_vertical].filter(Boolean).length,
        allComplete: false, // can't be true until logo_url exists
      }

      // Recent activity (union of project_created + blueprint_added)
      const recentActivity = []
      enrichedProjects.slice(0, 10).forEach(p => {
        recentActivity.push({
          type: 'project_created',
          label: `Job "${p.name}" created`,
          timestamp: p.created_at,
          link: `/project/${p.id}`,
        })
      })
      sessions.slice(0, 10).forEach(s => {
        recentActivity.push({
          type: 'blueprint_added',
          label: `Blueprint added to "${s.project_name}"`,
          timestamp: s.created_at,
          link: `/session/${s.id}`,
        })
      })
      recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      // Tip of the day
      const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
      const tip = DASHBOARD_TIPS.length > 0 ? DASHBOARD_TIPS[dayOfYear % DASHBOARD_TIPS.length] : null

      // Extract first name from full_name
      const firstName = (userProfile?.full_name || user?.email?.split('@')[0] || 'there').split(' ')[0]

      setData({
        firstName,
        todayDate: now,
        isNewUser,
        hasZeroJobs: totalJobs === 0,
        checklist,
        pipeline,
        stats,
        recentActivity: recentActivity.slice(0, 5),
        tip,
      })
    } catch (err) {
      setError(err.message ?? 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [user, companyId, isImpersonating, userProfile?.full_name])

  useEffect(() => { fetch() }, [fetch])

  return { loading, error, ...(data ?? {}), refetch: fetch }
}
