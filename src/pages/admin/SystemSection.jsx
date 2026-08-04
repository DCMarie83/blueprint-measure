import { useTranslation } from 'react-i18next'
import styles from './sections.module.css'

export default function SystemSection() {
  const { t } = useTranslation()
  return (
    <div>
      <h1 className={styles.pageTitle}>{t('admin:system.title')}</h1>
      <div className={styles.sectionCard}>
        <h2 className={styles.sectionCardTitle}>{t('admin:system.statusTitle')}</h2>
        <p className={styles.empty}>
          {t('admin:system.comingSoon')}
        </p>
      </div>
    </div>
  )
}
