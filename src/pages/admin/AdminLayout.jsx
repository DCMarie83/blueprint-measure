import { NavLink, Outlet, Link } from 'react-router-dom'
import { AdminDataProvider, useAdminData } from '../../context/AdminDataContext'
import styles from './AdminLayout.module.css'

const NAV_ITEMS = [
  { to: '/admin/overview',   label: 'Overview',        icon: 'O' },
  { to: '/admin/companies',  label: 'Companies',       icon: 'C' },
  { to: '/admin/users',      label: 'Users',           icon: 'U' },
  { to: '/admin/plans',      label: 'Plans',           icon: 'P' },
  { to: '/admin/test-logs',  label: 'Test Logs',       icon: 'T' },
  { to: '/admin/feedback',   label: 'Beta Feedback',   icon: 'F' },
  { to: '/admin/errors',     label: 'System Errors',   icon: 'E' },
  { to: '/admin/system',     label: 'System',          icon: 'S' },
]

function AdminShell() {
  const { loading } = useAdminData()

  if (loading) {
    return (
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <SidebarContent />
        </aside>
        <main className={styles.main}>
          <div className={styles.loadingCenter}>Loading admin data…</div>
        </main>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <SidebarContent />
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

function SidebarContent() {
  return (
    <>
      <div className={styles.sidebarHeader}>
        <span className={styles.logo}>BlueprintMeasure</span>
        <span className={styles.adminBadge}>Admin</span>
      </div>
      <nav className={styles.nav}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className={styles.sidebarFooter}>
        <Link to="/accuracy-test" className={styles.footerLink}>Accuracy Test</Link>
        <Link to="/dashboard" className={styles.footerLink}>Back to Dashboard</Link>
      </div>
    </>
  )
}

export default function AdminLayout() {
  return (
    <AdminDataProvider>
      <AdminShell />
    </AdminDataProvider>
  )
}
