import { Briefcase, FileUp, Columns3, BookUser } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import Modal from '../ui/Modal'
import NewProjectForm from '../auth/NewProjectForm'
import { useProjects } from '../../hooks/useProjects'
import { useSessions } from '../../hooks/useSessions'
import styles from './QuickActionsRow.module.css'

export default function QuickActionsRow() {
  const navigate = useNavigate()
  const { createProject } = useProjects()
  const { createSession } = useSessions()
  const [showModal, setShowModal] = useState(false)

  async function handleCreateProject(fields) {
    const project = await createProject(fields)
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

  const cards = [
    {
      icon: Briefcase,
      label: '+ New Job',
      desc: 'Create a new job',
      onClick: () => setShowModal(true),
    },
    {
      icon: FileUp,
      label: '+ Add Blueprint',
      desc: 'Upload to existing job',
      onClick: () => navigate('/opportunities'),
    },
    {
      icon: Columns3,
      label: 'View Opportunities',
      desc: 'Pipeline board',
      onClick: () => navigate('/opportunities'),
    },
    {
      icon: BookUser,
      label: 'Manage Clients',
      desc: 'Client contacts',
      onClick: () => navigate('/clients'),
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
