import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Settings, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import styles from './UserMenu.module.css'

const ADMIN_EMAIL = 'main@ngautomationhub.com'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  contractor_admin: 'Admin',
  contractor_user: 'User',
}

export default function UserMenu() {
  const { user } = useAuth()
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

  // Fetch role once on mount
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

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const isSuperAdmin = user.email === ADMIN_EMAIL
  const roleLabel = role ? ROLE_LABELS[role] ?? role : null

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(v => !v)} aria-label="User menu">
        <span className={styles.avatar}>
          <User size={18} />
        </span>
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
            <button className={styles.menuItem} onClick={() => { navigate('/account'); setOpen(false) }}>
              <User size={15} />
              <span>Account</span>
            </button>
            {isSuperAdmin && (
              <button className={styles.menuItem} onClick={() => { navigate('/admin'); setOpen(false) }}>
                <Settings size={15} />
                <span>Admin</span>
              </button>
            )}
          </div>
          <div className={styles.menuDivider} />
          <div className={styles.menuSection}>
            <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleSignOut}>
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
