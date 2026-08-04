import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { User, Settings, Users, LogOut, ChevronDown, DollarSign, Building2, FlaskConical } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useImpersonation } from '../context/ImpersonationContext'
import { useIsLite } from '../hooks/useIsLite'
import { LITE_SANDBOX_COMPANY_ID } from '../lib/config'
import ThemeToggle from './ThemeToggle'
import styles from './UserMenu.module.css'

// role -> i18n key under common:role.*; resolved with t() at render.
const ROLE_LABELS = {
  super_admin: 'common:role.super_admin',
  contractor_admin: 'common:role.contractor_admin',
  contractor_user: 'common:role.contractor_user',
}

export default function UserMenu() {
  const { t } = useTranslation()
  const { user, isSuperAdmin } = useAuth()
  const { isImpersonating, actingAsCompanyId, startImpersonation, stopImpersonation } = useImpersonation()
  const { isLite } = useIsLite()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('keydown', onEsc)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => { if (data?.role) setRole(data.role) })
  }, [user])

  if (!user) return null

  async function handleSignOut() {
    sessionStorage.removeItem('bpm_password_recovery_pending')
    await supabase.auth.signOut()
    navigate('/login')
  }

  // One-click Lite sandbox for super admins: start (or switch to) an impersonation
  // session on the sandbox tenant via the SAME machinery the admin drawer uses —
  // real impersonation_sessions row, banner, audit trail. If already acting as a
  // different company, end that session first so the prior audit row is closed
  // cleanly before the new one opens (no swap, no bypass). Then land in /log.
  async function handleLiteSandbox() {
    setOpen(false)
    if (actingAsCompanyId === LITE_SANDBOX_COMPANY_ID) {
      navigate('/log')
      return
    }
    if (isImpersonating) await stopImpersonation()
    await startImpersonation(LITE_SANDBOX_COMPANY_ID, { notes: 'Time & Pay Lite sandbox (one-click)' })
    navigate('/log')
  }

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || t('common:role.userFallback')
  const roleLabel = role ? (ROLE_LABELS[role] ? t(ROLE_LABELS[role]) : role) : null

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(v => !v)} aria-label={t('common:userMenu.trigger')}>
        <User size={16} />
        <span className={styles.triggerLabel}>{t('common:userMenu.label')}</span>
        <ChevronDown size={14} className={open ? styles.chevronOpen : ''} />
      </button>
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <div className={styles.headerInfo}>
              <span className={styles.displayName}>{displayName}</span>
              <span className={styles.email}>{user.email}</span>
            </div>
            {roleLabel && (
              <span className={`${styles.roleBadge} ${isSuperAdmin ? styles.roleBadgeAccent : ''}`}>
                {roleLabel}
              </span>
            )}
          </div>
          <div className={styles.menuSection}>
            <div className={styles.menuItem} style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('common:userMenu.theme')}</span>
              <ThemeToggle />
            </div>
            <button className={styles.menuItem} onClick={() => { navigate('/settings'); setOpen(false) }}>
              <Settings size={15} />
              <span>{t('common:userMenu.settings')}</span>
            </button>
            {isLite && (
              <button className={styles.menuItem} onClick={() => { navigate('/business'); setOpen(false) }}>
                <Building2 size={15} />
                <span>{t('common:userMenu.businessInfo')}</span>
              </button>
            )}
            {!isLite && (role === 'contractor_admin' || isSuperAdmin) && (
              <button className={styles.menuItem} onClick={() => { navigate('/pricing'); setOpen(false) }}>
                <DollarSign size={15} />
                <span>{t('common:userMenu.pricingLibrary')}</span>
              </button>
            )}
            {!isLite && role === 'contractor_admin' && (
              <button className={styles.menuItem} onClick={() => { navigate('/dashboard/team'); setOpen(false) }}>
                <Users size={15} />
                <span>{t('common:userMenu.manageTeam')}</span>
              </button>
            )}
            {isSuperAdmin && LITE_SANDBOX_COMPANY_ID && (
              <button className={styles.menuItem} onClick={handleLiteSandbox}>
                <FlaskConical size={15} />
                <span>{t('common:userMenu.liteSandbox')}</span>
              </button>
            )}
            {isSuperAdmin && (
              <button className={styles.menuItem} onClick={() => { navigate('/admin'); setOpen(false) }}>
                <Settings size={15} />
                <span>{t('common:userMenu.admin')}</span>
              </button>
            )}
          </div>
          <div className={styles.menuDivider} />
          <div className={styles.menuSection}>
            <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleSignOut}>
              <LogOut size={15} />
              <span>{t('common:userMenu.signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
