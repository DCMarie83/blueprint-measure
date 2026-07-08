import { useEffect } from 'react'
import { useDateFormat } from '../../hooks/useDateFormat'
import { FEATURE_KEYS, useCompanyPlan } from '../../lib/plans'
import styles from './CompanyDrawer.module.css'

const FEATURES = FEATURE_KEYS

export default function CompanyDrawer({
  company, companyUsers, sessionsThisMonth, sessionsAllTime,
  zonesThisMonth, zonesLoading, onClose,
}) {
  const { formatDate } = useDateFormat()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const companyPlan = useCompanyPlan(company)

  if (!company) return null

  const flags = company.features ?? {}
  const fmt = (v) => v != null && v !== '' ? String(v) : '—'
  const fmtBool = (v) => v === true ? 'Yes' : v === false ? 'No' : '—'
  const fmtPrice = (v) => v != null ? `$${Number(v).toFixed(2)}` : '—'

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.companyName}>{company.name}</h2>
            <span className={styles.planBadge}>{companyPlan?.display_name ?? company.plan ?? 'Legacy'}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Activity */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Activity</h3>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionsThisMonth}</span>
                <span className={styles.statLabel}>sessions this month</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionsAllTime}</span>
                <span className={styles.statLabel}>sessions all time</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{zonesLoading ? '...' : zonesThisMonth}</span>
                <span className={styles.statLabel}>zones this month</span>
              </div>
            </div>
          </section>

          {/* Users */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Users ({companyUsers.length})</h3>
            {companyUsers.length === 0 ? (
              <p className={styles.emptyText}>No users assigned.</p>
            ) : (
              <table className={styles.usersTable}>
                <thead>
                  <tr>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th}>Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {companyUsers.map(u => (
                    <tr key={u.id}>
                      <td className={styles.td}>{u.email}</td>
                      <td className={styles.td}>
                        {u.last_sign_in_at
                          ? formatDate(u.last_sign_in_at)
                          : <span className={styles.muted}>Never</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Billing */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Billing</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
                <span style={{ fontWeight: 600 }}>{company.subscription_status ?? 'unknown'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Recurly Sub ID</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{company.recurly_subscription_id || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Recurly Account</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{company.recurly_account_code || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Status Changed</span>
                <span>{company.subscription_status_changed_at ? formatDate(company.subscription_status_changed_at) : '—'}</span>
              </div>
              {company.canceled_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Canceled At</span>
                  <span style={{ color: '#ef4444' }}>{formatDate(company.canceled_at)}</span>
                </div>
              )}
              {company.cancel_reason && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Cancel Reason</span>
                  <span style={{ maxWidth: 200, textAlign: 'right' }}>{company.cancel_reason}</span>
                </div>
              )}
            </div>
          </section>

          {/* Contact & Location */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Contact & Location</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              {[
                ['Address', [company.address_line1, company.address_line2].filter(Boolean).join(', ') || '—'],
                ['City', fmt(company.city)],
                ['State', fmt(company.state)],
                ['Zip', fmt(company.zip)],
                ['Business Phone', fmt(company.business_phone)],
                ['Billing Email', fmt(company.billing_email)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span style={{ textAlign: 'right', maxWidth: 200 }}>{val}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Business */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Business</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Trade Vertical</span>
                <span>{fmt(company.trade_vertical)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Created</span>
                <span>{company.created_at ? formatDate(company.created_at) : '—'}</span>
              </div>
            </div>
          </section>

          {/* Founder & Pricing */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Founder & Pricing</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Plan Key</span>
                <span>{fmt(company.plan_key)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Founder #</span>
                <span>{company.founding_member_number != null ? `#${company.founding_member_number}` : '—'}</span>
              </div>
              {/* When annual billing ships, check cadence to decide monthly vs annual display */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Locked Price</span>
                <span>{fmtPrice(company.locked_price_monthly)}</span>
              </div>
            </div>
          </section>

          {/* Attribution */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Attribution</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              {[
                ['UTM Source', fmt(company.utm_source)],
                ['UTM Medium', fmt(company.utm_medium)],
                ['UTM Campaign', fmt(company.utm_campaign)],
                ['UTM Content', fmt(company.utm_content)],
                ['UTM Term', fmt(company.utm_term)],
                ['Conversion Fired', company.conversion_fired_at ? formatDate(company.conversion_fired_at) : '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Trial */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Trial</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Trial Enabled</span>
                <span>{fmtBool(company.trial_enabled)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Trial Started</span>
                <span>{company.trial_started_at ? formatDate(company.trial_started_at) : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Trial Ends</span>
                <span>{company.trial_ends_at ? formatDate(company.trial_ends_at) : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Trial Days</span>
                <span>{company.trial_duration_days ?? '—'}</span>
              </div>
            </div>
          </section>

          {/* Flags */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Flags</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Card Required</span>
                <span>{fmtBool(company.card_required)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Internal</span>
                <span>{fmtBool(company.is_internal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Branding Quote</span>
                <span>{fmtBool(company.wants_branding_quote)}</span>
              </div>
            </div>
          </section>

          {/* Feature Flags */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Feature Flags</h3>
            <div className={styles.flagsList}>
              {FEATURES.map(({ key, label }) => (
                <div key={key} className={styles.flagItem}>
                  <span className={flags[key] ? styles.dotOn : styles.dotOff} />
                  <span className={flags[key] ? styles.flagOn : styles.flagOff}>{label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
