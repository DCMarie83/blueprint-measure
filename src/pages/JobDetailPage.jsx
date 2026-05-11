import { useParams, Link } from 'react-router-dom'
import Logo from '../components/brand/Logo'
import UserMenu from '../components/UserMenu'
import styles from './DashboardPage.module.css'

export default function JobDetailPage() {
  const { id } = useParams()
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}><Logo variant="mark" /></div>
        <UserMenu />
      </header>
      <main className={styles.main}>
        <Link to="/opportunities" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 24, display: 'block' }}>← Opportunities</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Job Details</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Job {id} — full details coming Friday</p>
      </main>
    </div>
  )
}
