import { CircleCheck, Circle } from 'lucide-react'
import { Link } from 'react-router-dom'
import styles from './GettingStartedChecklist.module.css'

const items = [
  { key: 'hasLogo', label: 'Add company logo', link: '/settings' },
  { key: 'hasTeam', label: 'Invite team members', link: '/dashboard/team' },
  { key: 'hasTradeVertical', label: 'Set trade vertical', link: '/settings' },
  { key: 'hasFirstJob', label: 'Create your first job', link: '#' },
  { key: 'hasFirstBlueprint', label: 'Upload your first blueprint', link: '#' },
]

export default function GettingStartedChecklist({ checklist }) {
  const completeCount = items.filter(i => checklist[i.key]).length

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Getting Started</span>
        <span className={styles.progress}>{completeCount} of 5 complete</span>
      </div>

      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${(completeCount / 5) * 100}%` }}
        />
      </div>

      <div className={styles.list}>
        {items.map(item => {
          const done = checklist[item.key]
          return (
            <div key={item.key} className={styles.item}>
              {done ? (
                <CircleCheck size={18} className={styles.itemDone} />
              ) : (
                <Circle size={18} className={styles.itemTodo} />
              )}
              <span>{item.label}</span>
              {item.link !== '#' && (
                <Link to={item.link} className={styles.itemLink}>
                  {done ? 'View' : 'Set up'}
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
