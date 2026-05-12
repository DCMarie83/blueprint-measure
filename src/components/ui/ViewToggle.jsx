import { LayoutGrid, List } from 'lucide-react'
import styles from './ViewToggle.module.css'

const DEFAULT_OPTIONS = [
  { value: 'list', icon: List, label: 'List view' },
  { value: 'card', icon: LayoutGrid, label: 'Card view' },
]

export default function ViewToggle({ view, onChange, options = DEFAULT_OPTIONS }) {
  return (
    <div className={styles.toggle}>
      {options.map(opt => {
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
