import { useNavigate } from 'react-router-dom'
import { useImpersonation } from '../context/ImpersonationContext'
import styles from './ImpersonationBanner.module.css'

export default function ImpersonationBanner() {
  const navigate = useNavigate()
  const { isImpersonating, actingAsCompany, stopImpersonation } = useImpersonation()

  if (!isImpersonating) return null

  async function handleExit() {
    await stopImpersonation()
    navigate('/admin/companies')
  }

  return (
    <div className={styles.banner}>
      <span>Viewing {actingAsCompany?.name || 'tenant'} as super admin</span>
      <button className={styles.exitBtn} onClick={handleExit}>Exit</button>
    </div>
  )
}
