import { CircleCheck, Circle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ONBOARDING_CALENDAR_URL } from '../../lib/config'
import styles from './GettingStartedChecklist.module.css'

const items = [
  { key: 'hasLogo', label: 'dashboard:checklist.addLogo', link: '/settings' },
  { key: 'hasTeam', label: 'dashboard:checklist.inviteTeam', link: '/dashboard/team' },
  { key: 'hasTradeVertical', label: 'dashboard:checklist.setTrade', link: '/settings' },
  { key: 'hasFirstJob', label: 'dashboard:checklist.createFirstJob', link: '#' },
  { key: 'hasFirstBlueprint', label: 'dashboard:checklist.uploadFirstBlueprint', link: '#' },
  { key: 'hasBookedOnboarding', label: 'dashboard:checklist.bookOnboarding', link: ONBOARDING_CALENDAR_URL, external: true },
]

// Items that participate in the progress bar (excludes always-actionable external links).
const trackableItems = items.filter(i => !i.external)

export default function GettingStartedChecklist({ checklist }) {
  const { t } = useTranslation()
  const completeCount = trackableItems.filter(i => checklist[i.key]).length
  const total = trackableItems.length

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{t('dashboard:checklist.title')}</span>
        <span className={styles.progress}>{t('dashboard:checklist.progress', { completed: completeCount, total })}</span>
      </div>

      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${(completeCount / total) * 100}%` }}
        />
      </div>

      <div className={styles.list}>
        {items.map(item => {
          const done = !item.external && checklist[item.key]
          return (
            <div key={item.key} className={styles.item}>
              {done ? (
                <CircleCheck size={18} className={styles.itemDone} />
              ) : (
                <Circle size={18} className={styles.itemTodo} />
              )}
              <span>{t(item.label)}</span>
              {item.external ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.itemLink}>
                  {t('dashboard:checklist.setUp')}
                </a>
              ) : item.link !== '#' && (
                <Link to={item.link} className={styles.itemLink}>
                  {done ? t('dashboard:checklist.view') : t('dashboard:checklist.setUp')}
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
