import { Link, useLocation } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIsLite } from '../hooks/useIsLite'
import { useLiteNavSections } from '../hooks/useLiteNavSections'
import { supabase } from '../lib/supabase'
import Logo from './brand/Logo'
import UserMenu from './UserMenu'
import TrialBanner from './TrialBanner'
import LanguageToggle from './LanguageToggle'
import styles from './AppHeader.module.css'

const CONTRACTOR_NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/clients', label: 'Clients' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/time', label: 'Time' },
  { to: '/academy', label: 'Academy' },
  { to: '/resources', label: 'Resources' },
  { to: '/reports', label: 'Reports' },
]

// Lite tenants get a deliberately tiny nav — Home leads, Log stays the composer.
const LITE_NAV = [
  { to: '/home', label: 'Home' },
  { to: '/log', label: 'Log' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/gcs', label: 'GCs' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/reports', label: 'Reports' },
]

function NavLink({ to, label, active, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
    >
      {label}
    </Link>
  )
}

export default function AppHeader({ extras = null }) {
  const location = useLocation()
  const { company, user, refreshUserProfile } = useAuth()
  const { isLite, resolved } = useIsLite()
  const liteSections = useLiteNavSections(isLite && resolved)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Lite nav appends Academy/Resources AFTER Reports, but only for the lite
  // family and only once there is at least one lite-visible row in that section
  // (zero lite content = the item does not exist). Contractor nav is untouched.
  const primaryNav = useMemo(() => {
    if (!isLite) return CONTRACTOR_NAV
    const nav = [...LITE_NAV]
    if (liteSections.academy) nav.push({ to: '/academy', label: 'Academy' })
    if (liteSections.resources) nav.push({ to: '/resources', label: 'Resources' })
    return nav
  }, [isLite, liteSections])
  const homeLink = isLite ? '/home' : '/dashboard'
  const hasTenantLogo = company?.logo_url && !logoError

  // Persist the header's language choice onto the signed-in user's OWN profile
  // row (user.id). LanguageToggle already applied the change locally; this only
  // durably saves it. Impersonation targets the admin's own row (see AppLayout),
  // so no guard is needed here.
  async function persistLanguage(lang) {
    if (!user?.id) return
    try {
      await supabase.from('user_profiles').update({ language: lang }).eq('user_id', user.id)
      await refreshUserProfile()
    } catch (err) {
      console.error('Failed to persist language preference', err)
    }
  }

  return (
    <>
      <TrialBanner />
      <header className={styles.header}>
        <div className={styles.left}>
          <Link to={homeLink} className={styles.logoLink} aria-label={hasTenantLogo ? `${company.name} home` : 'RivetDog home'}>
            {hasTenantLogo ? (
              <>
                <img
                  src={company.logo_url}
                  alt={`${company.name} logo`}
                  onError={() => setLogoError(true)}
                  className={styles.tenantLogo}
                />
                <span className={styles.tenantName}>{company.name}</span>
              </>
            ) : (
              <Logo variant="mark" />
            )}
          </Link>
          <nav className={styles.primaryNav}>
            {primaryNav.map(item => (
              <NavLink key={item.to} to={item.to} label={item.label} active={isActive(item.to)} />
            ))}
          </nav>
        </div>

        <div className={styles.right}>
          {extras}
          <button
            className={styles.hamburger}
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>
          <LanguageToggle onPersist={persistLanguage} />
          <UserMenu />
        </div>
      </header>

      {mobileOpen && (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setMobileOpen(false)} />
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>Menu</span>
              <button
                className={styles.drawerClose}
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <nav className={styles.drawerNav}>
              {primaryNav.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  active={isActive(item.to)}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </>
      )}
    </>
  )
}
