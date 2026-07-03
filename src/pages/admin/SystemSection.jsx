import { useState } from 'react'
import { usePlatformSettings } from '../../context/PlatformSettingsContext'
import styles from './sections.module.css'

export default function SystemSection() {
  const { getSetting, setSetting, loading } = usePlatformSettings()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const checkoutEnabled = getSetting('subscribe_button_enabled', false)

  async function handleToggleCheckout() {
    const next = !checkoutEnabled
    const confirmed = window.confirm(
      next
        ? 'Enable checkout? Customers will be able to reach the /subscribe page and start a paid subscription.'
        : 'Disable checkout? The three Subscribe CTAs will dead-end at a friendly "coming soon" notice.'
    )
    if (!confirmed) return
    setSaving(true)
    setError(null)
    try {
      await setSetting('subscribe_button_enabled', next)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>System</h1>

      <div className={styles.sectionCard}>
        <h2 className={styles.sectionCardTitle}>Platform Settings</h2>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.flagGroup}>
          <label className={styles.flagRow} style={{ cursor: saving || loading ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              className={styles.flagCheck}
              checked={!!checkoutEnabled}
              onChange={handleToggleCheckout}
              disabled={saving || loading}
            />
            <span className={checkoutEnabled ? styles.flagLabelOn : styles.flagLabel}>
              Allow customers to reach checkout (/subscribe)
            </span>
            {checkoutEnabled && <span className={styles.flagOnBadge}>ON</span>}
          </label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0 22px' }}>
            Off = the three Subscribe CTAs dead-end at a friendly notice. Flip on when billing is ready.
          </p>
        </div>
      </div>

      <div className={styles.sectionCard}>
        <h2 className={styles.sectionCardTitle}>System Status</h2>
        <p className={styles.empty}>
          Anthropic API credits, deploy info, system status — coming soon.
        </p>
      </div>
    </div>
  )
}
