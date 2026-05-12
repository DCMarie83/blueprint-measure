import { LayoutGrid, List } from 'lucide-react'
import styles from './ViewToggle.module.css'

export default function ViewToggle({ view, onChange }) {
  return (
    <div className={styles.toggle}>
      <button
        className={`${styles.btn} ${view === 'list' ? styles.btnActive : ''}`}
        onClick={() => onChange('list')}
        aria-label="List view"
        title="List view"
      >
        <List size={16} />
      </button>
      <button
        className={`${styles.btn} ${view === 'card' ? styles.btnActive : ''}`}
        onClick={() => onChange('card')}
        aria-label="Card view"
        title="Card view"
      >
        <LayoutGrid size={16} />
      </button>
    </div>
  )
}
