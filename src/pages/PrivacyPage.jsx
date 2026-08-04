import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import styles from './LoginPage.module.css'

export default function PrivacyPage() {
  const { t } = useTranslation()
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Logo variant="full" />
        </div>
        <h1 className={styles.title}>{t('legal:privacy.title')}</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          {t('legal:privacy.body', { brand: BRAND.name })}{' '}
          <a href="mailto:support@rivetdog.com" style={{ color: 'var(--color-primary)' }}>support@rivetdog.com</a>.
        </p>
        <Link to="/signup" className={styles.backLink}>{t('legal:backToSignup')}</Link>
      </div>
    </div>
  )
}
