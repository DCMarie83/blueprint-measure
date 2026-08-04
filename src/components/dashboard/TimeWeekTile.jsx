import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { supabase } from '../../lib/supabase'
import { getWeekHours } from '../../data/timeTracking'
import styles from './TimeWeekTile.module.css'

export default function TimeWeekTile() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [hours, setHours] = useState(null)

  useEffect(() => {
    if (!user?.id || !companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: cm } = await supabase
          .from('crew_members')
          .select('id')
          .eq('company_id', companyId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (cancelled || !cm) { if (!cancelled) setHours(0); return }
        const h = await getWeekHours(cm.id)
        if (!cancelled) setHours(h)
      } catch {
        if (!cancelled) setHours(0)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, companyId])

  if (hours === null) return null

  return (
    <section className={styles.tile}>
      <div className={styles.left}>
        <Clock size={18} className={styles.icon} />
        <div>
          <div className={styles.label}>{t('dashboard:timeWeek.label')}</div>
          <div className={styles.value}>{hours.toFixed(1)}</div>
        </div>
      </div>
      <Link to="/time" className={styles.logBtn}>{t('dashboard:timeWeek.logBtn')}</Link>
    </section>
  )
}
