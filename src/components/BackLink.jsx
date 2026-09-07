import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import styles from './BackLink.module.css'

// The link goes exactly where it says: always the `to` prop. (A history-based
// variant shipped briefly and sent users to deleted records; never again.)
export default function BackLink({ to, label }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className={styles.backLink}>
      <ChevronLeft size={16} />
      <span>{t('misc:backLink.label', { label })}</span>
    </Link>
  )
}
