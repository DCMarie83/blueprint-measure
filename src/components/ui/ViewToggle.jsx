import { useTranslation } from 'react-i18next'
import { LayoutGrid, List } from 'lucide-react'
import styles from './ViewToggle.module.css'

export default function ViewToggle({ view, onChange, options }) {
  const { t } = useTranslation()
  const opts = options ?? [
    { value: 'list', icon: List, label: t('ui:viewToggle.listView') },
    { value: 'card', icon: LayoutGrid, label: t('ui:viewToggle.cardView') },
  ]
  return (
    <div className={styles.toggle}>
      {opts.map(opt => {
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            className={`${styles.btn} ${view === opt.value ? styles.btnActive : ''}`}
            onClick={() => onChange(opt.value)}
            aria-label={opt.label}
            title={opt.label}
          >
            <Icon size={16} />
          </button>
        )
      })}
    </div>
  )
}
