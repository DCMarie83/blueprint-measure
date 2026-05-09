import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Building2, Users, Package, FlaskConical,
         MessageSquare, AlertTriangle, Settings } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { BRAND } from '../../lib/config'
import Logo from '../../components/brand/Logo'
import { AdminDataProvider, useAdminData } from '../../context/AdminDataContext'
import styles from './AdminLayout.module.css'

const NAV_ITEMS = [
  { to: '/admin/overview',   label: 'Overview',        icon: LayoutDashboard },
  { to: '/admin/companies',  label: 'Companies',       icon: Building2 },
  { to: '/admin/users',      label: 'Users',           icon: Users },
  { to: '/admin/plans',      label: 'Plans',           icon: Package },
  { to: '/admin/test-logs',  label: 'Test Logs',       icon: FlaskConical },
  { to: '/admin/feedback',   label: 'Beta Feedback',   icon: MessageSquare },
  { to: '/admin/errors',     label: 'System Errors',   icon: AlertTriangle },
  { to: '/admin/system',     label: 'System',          icon: Settings },
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
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    sessionStorage.removeItem('bpm_password_recovery_pending')
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <>
      <div className={styles.sidebarHeader}>
        <span className={styles.logo}><Logo variant="mark" style={{ marginRight: 8 }} />{BRAND.name}</span>
        <span className={styles.adminBadge}>Admin</span>
      </div>
      <nav className={styles.nav}>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            >
              <span className={styles.navIcon}><Icon size={16} /></span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className={styles.sidebarFooter}>
        <span className={styles.footerEmail}>{user?.email}</span>
        <Link to="/accuracy-test" className={styles.footerLink}>Accuracy Test</Link>
        <Link to="/dashboard" className={styles.footerLink}>Back to Dashboard</Link>
        <button className={styles.signOutBtn} onClick={handleSignOut}>Sign Out</button>
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
