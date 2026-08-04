import { NavLink, Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Building2, Users, Package, FlaskConical,
         MessageSquare, AlertTriangle, Settings, GraduationCap, Compass, Flag, Eye, PaintRoller } from 'lucide-react'
import { BRAND } from '../../lib/config'
import Logo from '../../components/brand/Logo'
import UserMenu from '../../components/UserMenu'
import { AdminDataProvider, useAdminData } from '../../context/AdminDataContext'
import styles from './AdminLayout.module.css'

const NAV_ITEMS = [
  { to: '/admin/overview',   label: 'admin:layout.nav.overview',        icon: LayoutDashboard },
  { to: '/admin/companies',  label: 'admin:layout.nav.companies',       icon: Building2 },
  { to: '/admin/users',      label: 'admin:layout.nav.users',           icon: Users },
  { to: '/admin/plans',      label: 'admin:layout.nav.plans',           icon: Package },
  { to: '/admin/materials-catalog', label: 'admin:layout.nav.materialsCatalog', icon: PaintRoller },
  { to: '/admin/test-logs',  label: 'admin:layout.nav.testLogs',        icon: FlaskConical },
  { to: '/admin/feedback',   label: 'admin:layout.nav.betaFeedback',    icon: MessageSquare },
  { to: '/admin/errors',     label: 'admin:layout.nav.systemErrors',    icon: AlertTriangle },
  { to: '/admin/academy',    label: 'admin:layout.nav.academy',          icon: GraduationCap },
  { to: '/admin/resources',  label: 'admin:layout.nav.resources',        icon: Compass },
  { to: '/admin/founders',   label: 'admin:layout.nav.founders',         icon: Flag },
  { to: '/admin/impersonation-log', label: 'admin:layout.nav.accessLog', icon: Eye },
  { to: '/admin/system',     label: 'admin:layout.nav.system',          icon: Settings },
]

function AdminShell() {
  const { loading } = useAdminData()
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <SidebarContent />
        </aside>
        <main className={styles.main}>
          <header className={styles.topHeader}>
            <div className={styles.topHeaderInner}>
              <UserMenu />
            </div>
          </header>
          <div className={styles.mainContent}>
            <div className={styles.loadingCenter}>{t('admin:layout.loadingData')}</div>
          </div>
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
        <header className={styles.topHeader}>
          <div className={styles.topHeaderInner}>
            <UserMenu />
          </div>
        </header>
        <div className={styles.mainContent}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function SidebarContent() {
  const { t } = useTranslation()
  return (
    <>
      <div className={styles.sidebarHeader}>
        <span className={styles.logo}><Logo variant="mark" style={{ marginRight: 8 }} />{BRAND.name}</span>
        <span className={styles.adminBadge}>{t('admin:layout.adminBadge')}</span>
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
              <span className={styles.navLabel}>{t(item.label)}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className={styles.sidebarFooter}>
        <Link to="/accuracy-test" className={styles.footerLink}>{t('admin:layout.accuracyTest')}</Link>
        <Link to="/dashboard" className={styles.footerLink}>{t('admin:layout.backToDashboard')}</Link>
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
