import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import styles from './BackLink.module.css'

export default function BackLink({ to, label }) {
  return (
    <Link to={to} className={styles.backLink}>
      <ChevronLeft size={16} />
      <span>Back to {label}</span>
    </Link>
  )
}
