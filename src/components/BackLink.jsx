import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import styles from './BackLink.module.css'

export default function BackLink({ to, label }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className={styles.backLink}>
      <ChevronLeft size={16} />
      <span>{t('misc:backLink.label', { label })}</span>
    </Link>
  )
}
