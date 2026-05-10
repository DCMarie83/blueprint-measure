import { Link } from 'react-router-dom'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import styles from './LoginPage.module.css'

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Logo variant="full" />
        </div>
        <h1 className={styles.title}>Terms of Service</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          The {BRAND.name} Terms of Service are being finalized and will be published here before launch.
          For questions, contact <a href="mailto:support@blueprintmeasure.com" style={{ color: 'var(--color-primary)' }}>support@blueprintmeasure.com</a>.
        </p>
        <Link to="/signup" className={styles.backLink}>← Back to sign up</Link>
      </div>
    </div>
  )
}
