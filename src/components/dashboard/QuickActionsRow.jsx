import { Briefcase, Columns3, BookUser, GraduationCap, Clock, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import Modal from '../ui/Modal'
import NewProjectForm from '../auth/NewProjectForm'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getWeekHours } from '../../data/timeTracking'
import { useProjects } from '../../hooks/useProjects'
import { useSessions } from '../../hooks/useSessions'
import { useEstimates } from '../../hooks/useEstimates'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import styles from './QuickActionsRow.module.css'

export default function QuickActionsRow() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, userProfile, isSuperAdmin } = useAuth()
  const { createProject } = useProjects()
  const { createSession } = useSessions()
  const { createEstimate } = useEstimates()
  const [showModal, setShowModal] = useState(false)

  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'
  const { companyId } = useEffectiveCompany()

  // Week hours for non-admin tile
  const [weekHours, setWeekHours] = useState(null)
  useEffect(() => {
    if (isAdmin || !user?.id || !companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: cm } = await supabase
          .from('crew_members')
          .select('id')
          .eq('company_id', companyId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (cancelled || !cm) return
        const h = await getWeekHours(cm.id)
        if (!cancelled) setWeekHours(h)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [isAdmin, user?.id, companyId])

  async function handleCreateProject(fields, buildMethod) {
    const project = await createProject(fields)
    if (buildMethod === 'manual') {
      try {
        const est = await createEstimate(project.id)
        setShowModal(false)
        navigate(`/estimates/${est.id}`)
      } catch {
        setShowModal(false)
        navigate(`/project/${project.id}`)
      }
      return
    }
    try {
      const session = await createSession({
        projectId: project.id,
        projectName: project.name,
      })
      navigate(`/session/${session.id}`)
    } catch {
      navigate(`/project/${project.id}`)
    }
    setShowModal(false)
  }

  const timeDesc = isAdmin
    ? t('dashboard:quickActions.timeDescAdmin')
    : weekHours != null && weekHours > 0
      ? t('dashboard:quickActions.timeDescHours', { hours: weekHours.toFixed(1) })
      : t('dashboard:quickActions.timeDescLog')

  const cards = [
    {
      icon: Briefcase,
      label: t('dashboard:quickActions.newJob.label'),
      desc: t('dashboard:quickActions.newJob.desc'),
      onClick: () => setShowModal(true),
    },
    {
      icon: Columns3,
      label: t('dashboard:quickActions.viewJobs.label'),
      desc: t('dashboard:quickActions.viewJobs.desc'),
      onClick: () => navigate('/jobs'),
    },
    {
      icon: BookUser,
      label: t('dashboard:quickActions.clients.label'),
      desc: t('dashboard:quickActions.clients.desc'),
      onClick: () => navigate('/clients'),
    },
    {
      icon: GraduationCap,
      label: t('dashboard:quickActions.academy.label'),
      desc: t('dashboard:quickActions.academy.desc'),
      onClick: () => navigate('/academy'),
    },
    {
      icon: isAdmin ? Users : Clock,
      label: isAdmin ? t('dashboard:quickActions.manageTime') : t('dashboard:quickActions.logTime'),
      desc: timeDesc,
      onClick: () => navigate('/time'),
    },
  ]

  return (
    <>
      <div className={styles.grid}>
        {cards.map(card => (
          <div key={card.label} className={styles.card} onClick={card.onClick}>
            <card.icon size={24} className={styles.icon} />
            <span className={styles.label}>{card.label}</span>
            <span className={styles.desc}>{card.desc}</span>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={t('dashboard:quickActions.newJobModalTitle')} onClose={() => setShowModal(false)}>
          <NewProjectForm
            onCreate={handleCreateProject}
            onCancel={() => setShowModal(false)}
          />
        </Modal>
      )}
    </>
  )
}
