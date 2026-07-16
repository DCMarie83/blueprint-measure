import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIsLite } from '../hooks/useIsLite'
import Logo from './brand/Logo'
import UserMenu from './UserMenu'
import TrialBanner from './TrialBanner'
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

// Lite tenants get a deliberately tiny nav — Log is home, no contractor surfaces.
const LITE_NAV = [
  { to: '/log', label: 'Log' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/gcs', label: 'GCs' },
  { to: '/invoices', label: 'Invoices' },
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
  const { company } = useAuth()
  const { isLite } = useIsLite()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  const primaryNav = isLite ? LITE_NAV : CONTRACTOR_NAV
  const homeLink = isLite ? '/log' : '/dashboard'
  const hasTenantLogo = company?.logo_url && !logoError

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
