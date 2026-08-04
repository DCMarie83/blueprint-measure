import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useImpersonation } from '../context/ImpersonationContext'
import styles from './ImpersonationBanner.module.css'

export default function ImpersonationBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isImpersonating, actingAsCompany, stopImpersonation } = useImpersonation()

  if (!isImpersonating) return null

  async function handleExit() {
    await stopImpersonation()
    navigate('/admin/companies')
  }

  return (
    <div className={styles.banner}>
      <span>{t('common:impersonation.viewing', { name: actingAsCompany?.name || t('common:impersonation.tenantFallback') })}</span>
      <button className={styles.exitBtn} onClick={handleExit}>{t('common:impersonation.exit')}</button>
    </div>
  )
}
