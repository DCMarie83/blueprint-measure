import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import styles from './BackLink.module.css'

// History-based back: when the user arrived here from inside the app, go back
// to the page they left (its state intact); the fixed `to` path is the
// fallback for direct loads. location.key is 'default' only on the first
// entry of the session's history stack.
export default function BackLink({ to, label }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const canGoBack = location.key !== 'default'
  return (
    <Link
      to={to}
      className={styles.backLink}
      onClick={(e) => {
        if (canGoBack) {
          e.preventDefault()
          navigate(-1)
        }
      }}
    >
      <ChevronLeft size={16} />
      <span>{t('misc:backLink.label', { label })}</span>
    </Link>
  )
}
