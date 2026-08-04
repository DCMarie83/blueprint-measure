import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import styles from './GreetingStrip.module.css'

export default function GreetingStrip({ firstName }) {
  const { t } = useTranslation()
  const { userProfile } = useAuth()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('dashboard:greeting.morning') : hour < 17 ? t('dashboard:greeting.afternoon') : t('dashboard:greeting.evening')

  const logoUrl = userProfile?.logo_url || null

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className={styles.hero}>
      {logoUrl && (
        <img src={logoUrl} alt="" className={styles.logo} />
      )}
      <h1 className={styles.title}>{t('dashboard:greeting.title')}</h1>
      <p className={styles.greeting}>{t('dashboard:greeting.line', { greeting, name: firstName })}</p>
      <p className={styles.date}>{formattedDate}</p>
    </div>
  )
}
