import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDateFormat } from '../../hooks/useDateFormat'
import { FEATURE_KEYS, useCompanyPlan, usePlan } from '../../lib/plans'
import { resolveEntitlements } from '../../lib/entitlements'
import styles from './CompanyDrawer.module.css'

const FEATURES = FEATURE_KEYS

export default function CompanyDrawer({
  company, companyUsers, sessionsThisMonth, sessionsAllTime,
  zonesThisMonth, zonesLoading, onClose,
}) {
  const { formatDate } = useDateFormat()
  const { t } = useTranslation()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const companyPlan = useCompanyPlan(company)
  const rawPlan = usePlan(company?.plan_key)
  const entitlements = company ? resolveEntitlements(company, rawPlan) : null

  if (!company) return null

  const flags = company.features ?? {}
  const fmt = (v) => v != null && v !== '' ? String(v) : '—'
  const fmtBool = (v) => v === true ? t('admin:companyDrawer.yes') : v === false ? t('admin:companyDrawer.no') : '—'
  const fmtPrice = (v) => v != null ? `$${Number(v).toFixed(2)}` : '—'

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.companyName}>{company.name}</h2>
            <span className={styles.planBadge}>{companyPlan?.display_name ?? company.plan ?? t('admin:companyDrawer.legacy')}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Activity */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.activity')}</h3>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionsThisMonth}</span>
                <span className={styles.statLabel}>{t('admin:companyDrawer.sessionsThisMonth')}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionsAllTime}</span>
                <span className={styles.statLabel}>{t('admin:companyDrawer.sessionsAllTime')}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{zonesLoading ? '...' : zonesThisMonth}</span>
                <span className={styles.statLabel}>{t('admin:companyDrawer.zonesThisMonth')}</span>
              </div>
            </div>
          </section>

          {/* Users */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.usersTitle', { count: companyUsers.length })}</h3>
            {companyUsers.length === 0 ? (
              <p className={styles.emptyText}>{t('admin:companyDrawer.noUsers')}</p>
            ) : (
              <table className={styles.usersTable}>
                <thead>
                  <tr>
                    <th className={styles.th}>{t('admin:companyDrawer.email')}</th>
                    <th className={styles.th}>{t('admin:companyDrawer.lastLogin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {companyUsers.map(u => (
                    <tr key={u.id}>
                      <td className={styles.td}>{u.email}</td>
                      <td className={styles.td}>
                        {u.last_sign_in_at
                          ? formatDate(u.last_sign_in_at)
                          : <span className={styles.muted}>{t('admin:companyDrawer.never')}</span>
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
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.billing')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.status')}</span>
                <span style={{ fontWeight: 600 }}>{company.subscription_status ?? t('admin:companyDrawer.unknown')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.recurlySubId')}</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{company.recurly_subscription_id || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.recurlyAccount')}</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{company.recurly_account_code || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.statusChanged')}</span>
                <span>{company.subscription_status_changed_at ? formatDate(company.subscription_status_changed_at) : '—'}</span>
              </div>
              {company.canceled_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.canceledAt')}</span>
                  <span style={{ color: '#ef4444' }}>{formatDate(company.canceled_at)}</span>
                </div>
              )}
              {company.cancel_reason && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.cancelReason')}</span>
                  <span style={{ maxWidth: 200, textAlign: 'right' }}>{company.cancel_reason}</span>
                </div>
              )}
            </div>
          </section>

          {/* Contact & Location */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.contactLocation')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              {[
                [t('admin:companyDrawer.address'), [company.address_line1, company.address_line2].filter(Boolean).join(', ') || '—'],
                [t('admin:companyDrawer.city'), fmt(company.city)],
                [t('admin:companyDrawer.state'), fmt(company.state)],
                [t('admin:companyDrawer.zip'), fmt(company.zip)],
                [t('admin:companyDrawer.businessPhone'), fmt(company.business_phone)],
                [t('admin:companyDrawer.billingEmail'), fmt(company.billing_email)],
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
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.business')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.tradeVertical')}</span>
                <span>{fmt(company.trade_vertical)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.created')}</span>
                <span>{company.created_at ? formatDate(company.created_at) : '—'}</span>
              </div>
            </div>
          </section>

          {/* Founder & Pricing */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.founderPricing')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.planKey')}</span>
                <span>{fmt(company.plan_key)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.founderNumber')}</span>
                <span>{company.founding_member_number != null ? `#${company.founding_member_number}` : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.effectivePrice')}</span>
                <span>
                  {fmtPrice(entitlements?.priceMonthly)}
                  {company.locked_price_monthly != null && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 4 }}>{t('admin:companyDrawer.locked')}</span>}
                </span>
              </div>
            </div>
          </section>

          {/* Attribution */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.attribution')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              {[
                [t('admin:companyDrawer.utmSource'), fmt(company.utm_source)],
                [t('admin:companyDrawer.utmMedium'), fmt(company.utm_medium)],
                [t('admin:companyDrawer.utmCampaign'), fmt(company.utm_campaign)],
                [t('admin:companyDrawer.utmContent'), fmt(company.utm_content)],
                [t('admin:companyDrawer.utmTerm'), fmt(company.utm_term)],
                [t('admin:companyDrawer.conversionFired'), company.conversion_fired_at ? formatDate(company.conversion_fired_at) : '—'],
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
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.trial')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.trialEnabled')}</span>
                <span>{fmtBool(company.trial_enabled)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.trialStarted')}</span>
                <span>{company.trial_started_at ? formatDate(company.trial_started_at) : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.trialEnds')}</span>
                <span>{company.trial_ends_at ? formatDate(company.trial_ends_at) : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.trialDays')}</span>
                <span>{company.trial_duration_days ?? '—'}</span>
              </div>
            </div>
          </section>

          {/* Flags */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.flags')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.cardRequired')}</span>
                <span>{fmtBool(company.card_required)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.internal')}</span>
                <span>{fmtBool(company.is_internal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{t('admin:companyDrawer.brandingQuote')}</span>
                <span>{fmtBool(company.wants_branding_quote)}</span>
              </div>
            </div>
          </section>

          {/* Feature Flags */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('admin:companyDrawer.featureFlags')}</h3>
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
