import { Briefcase, Columns3, BookUser, GraduationCap, Clock, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Modal from '../ui/Modal'
import NewProjectForm from '../auth/NewProjectForm'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getWeekHours } from '../../data/timeTracking'
import { useProjects } from '../../hooks/useProjects'
import { useSessions } from '../../hooks/useSessions'
import { useEstimates } from '../../hooks/useEstimates'
import styles from './QuickActionsRow.module.css'

export default function QuickActionsRow() {
  const navigate = useNavigate()
  const { user, userProfile, isSuperAdmin } = useAuth()
  const { createProject } = useProjects()
  const { createSession } = useSessions()
  const { createEstimate } = useEstimates()
  const [showModal, setShowModal] = useState(false)

  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'
  const companyId = userProfile?.company_id

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
    ? 'Team timesheet & approvals'
    : weekHours != null && weekHours > 0
      ? `${weekHours.toFixed(1)} hrs this week`
      : 'Log your hours'

  const cards = [
    {
      icon: Briefcase,
      label: '+ New Job',
      desc: 'Create a new job',
      onClick: () => setShowModal(true),
    },
    {
      icon: Columns3,
      label: 'View Jobs',
      desc: 'Pipeline board',
      onClick: () => navigate('/jobs'),
    },
    {
      icon: BookUser,
      label: 'Manage Clients',
      desc: 'Client contacts',
      onClick: () => navigate('/clients'),
    },
    {
      icon: GraduationCap,
      label: 'RivetDog Academy',
      desc: 'Training videos & tutorials',
      onClick: () => navigate('/academy'),
    },
    {
      icon: isAdmin ? Users : Clock,
      label: isAdmin ? 'Manage Time' : 'Log Time',
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
        <Modal title="New Job" onClose={() => setShowModal(false)}>
          <NewProjectForm
            onCreate={handleCreateProject}
            onCancel={() => setShowModal(false)}
          />
        </Modal>
      )}
    </>
  )
}
