import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { MapPin, AlertTriangle, Copy, Check } from 'lucide-react'
import { getCrewMemberById, getCrewMemberPunches, updateCrewMember, sendRivetPayLinkEmail } from '../data/timeTracking'
import styles from './CrewMemberPage.module.css'

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

export default function CrewMemberPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [cm, setCm] = useState(null)
  const [punches, setPunches] = useState([])
  const [loading, setLoading] = useState(true)

  // Rate edit
  const [rateSaving, setRateSaving] = useState(false)

  // Link toggle
  const [linkSaving, setLinkSaving] = useState(false)

  // Email
  const [email, setEmail] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  // Message type drives styling (error vs success) — never sniff the text, which
  // breaks once the message is translated.
  const [emailMsgType, setEmailMsgType] = useState('error')

  // Copy
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [member, punchList] = await Promise.all([
          getCrewMemberById(id),
          getCrewMemberPunches(id),
        ])
        if (!cancelled) {
          setCm(member)
          setPunches(punchList)
          setEmail(member.email || '')
        }
      } catch {
        if (!cancelled) setCm(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // Totals
  const { monthHours, lifetimeHours } = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    let month = 0, life = 0
    for (const p of punches) {
      if (p.status !== 'approved' || !p.hours) continue
      life += Number(p.hours)
      if (new Date(p.clock_in_at || p.created_at) >= monthStart) month += Number(p.hours)
    }
    return { monthHours: month, lifetimeHours: life }
  }, [punches])

  async function handleRateSave(value) {
    if (!cm) return
    setRateSaving(true)
    try {
      await updateCrewMember(cm.id, { cost_rate: value === '' ? null : Number(value) })
      setCm(prev => ({ ...prev, cost_rate: value === '' ? null : Number(value) }))
    } catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setRateSaving(false) }
  }

  async function handleToggleLink() {
    if (!cm) return
    setLinkSaving(true)
    try {
      await updateCrewMember(cm.id, { link_enabled: !cm.link_enabled })
      setCm(prev => ({ ...prev, link_enabled: !prev.link_enabled }))
    } catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setLinkSaving(false) }
  }

  async function handleCopy() {
    if (!cm) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/rivetpay/${cm.link_token}`)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { alert(t('time:errors.copyFailedShort')) }
  }

  async function handleSendEmail() {
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setEmailMsg(t('time:share.invalidEmailShort')); setEmailMsgType('error'); return }
    setEmailSending(true); setEmailMsg('')
    try {
      if (trimmed !== (cm.email || '')) {
        await updateCrewMember(cm.id, { email: trimmed })
        setCm(prev => ({ ...prev, email: trimmed }))
      }
      await sendRivetPayLinkEmail(cm.id, trimmed)
      setEmailMsg(t('time:share.sent'))
      setEmailMsgType('success')
    } catch (err) { setEmailMsg(t('time:errors.generic', { error: err.message || t('time:share.failedFallback') })); setEmailMsgType('error') }
    finally { setEmailSending(false) }
  }

  function renderLoc(lat, lng, source) {
    if (source === 'manual') return <span className={styles.muted}>{t('time:punch.manual')}</span>
    if (lat) return <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className={styles.locLink}><MapPin size={10} /> {t('time:punch.loc')}</a>
    return <span className={styles.noLocBadge}><AlertTriangle size={10} /> {t('time:punch.noLocation')}</span>
  }

  if (loading) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('common:misc.loading')}</p></main></div>
  if (!cm) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('time:crewMember.notFound')}</p></main></div>

  const linkUrl = `${window.location.origin}/rivetpay/${cm.link_token}`

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <Link to="/time" className={styles.backLink}>{t('time:crewMember.backToTime')}</Link>

        {/* Profile header */}
        <div className={styles.profileHeader}>
          <h1 className={styles.name}>{cm.name}</h1>
          <div className={styles.badges}>
            <span className={cm.is_active ? styles.badgeActive : styles.badgeInactive}>{cm.is_active ? t('time:roster.active') : t('time:roster.inactive')}</span>
            <span className={styles.typeBadge}>{cm.user_id ? t('time:roster.login') : t('time:crewMember.linkOnly')}</span>
          </div>
          {cm.phone && <div className={styles.infoRow}><span className={styles.label}>{t('time:crewMember.phone')}</span> {cm.phone}</div>}
          <div className={styles.infoRow}>
            <span className={styles.label}>{t('time:crewMember.rate')}</span>
            <input
              type="number"
              className={styles.rateInput}
              step="0.01"
              min="0"
              placeholder="—"
              defaultValue={cm.cost_rate ?? ''}
              onBlur={e => handleRateSave(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              disabled={rateSaving}
            />
            <span className={styles.muted}>{t('time:crewMember.perHour')}</span>
          </div>
        </div>

        {/* RivetPay controls */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('time:crewMember.clockInLink')}</h2>
          <div className={styles.linkRow}>
            <label className={styles.toggleLabel}>
              <input type="checkbox" checked={cm.link_enabled ?? true} onChange={handleToggleLink} disabled={linkSaving} />
              {cm.link_enabled !== false ? t('time:roster.on') : t('time:roster.off')}
            </label>
          </div>
          {cm.link_enabled !== false && (
            <>
              <div className={styles.urlRow}>
                <input type="text" readOnly className={styles.urlInput} value={linkUrl} />
                <button className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? <><Check size={14} /> {t('time:share.copied')}</> : <><Copy size={14} /> {t('time:share.copy')}</>}
                </button>
              </div>
              <div className={styles.emailRow}>
                <input
                  type="email"
                  className={styles.emailInput}
                  placeholder={t('time:share.emailPlaceholder')}
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailMsg('') }}
                />
                <button className={styles.sendBtn} onClick={handleSendEmail} disabled={emailSending}>
                  {emailSending ? t('time:share.sending') : t('common:action.send')}
                </button>
              </div>
              {emailMsg && <p className={emailMsgType === 'error' ? styles.errorMsg : styles.successMsg}>{emailMsg}</p>}
            </>
          )}
        </div>

        {/* Totals */}
        <div className={styles.totalsRow}>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>{t('time:crewMember.thisMonth')}</div>
            <div className={styles.totalValue}>{t('time:units.hrs', { value: monthHours.toFixed(1) })}</div>
            <div className={styles.totalSub}>{t('time:crewMember.approvedHours')}</div>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>{t('time:crewMember.lifetime')}</div>
            <div className={styles.totalValue}>{t('time:units.hrs', { value: lifetimeHours.toFixed(1) })}</div>
            <div className={styles.totalSub}>{t('time:crewMember.approvedHours')}</div>
          </div>
        </div>

        {/* Clock log */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('time:crewMember.clockLog')}</h2>
          {punches.length === 0 ? (
            <p className={styles.muted}>{t('time:crewMember.noSubmissions')}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr>
                  <th className={styles.th}>{t('time:table.date')}</th>
                  <th className={styles.th}>{t('time:table.job')}</th>
                  <th className={styles.th}>{t('time:table.clockIn')}</th>
                  <th className={styles.th}>{t('time:table.clockOut')}</th>
                  <th className={styles.th}>{t('time:table.hours')}</th>
                  <th className={styles.th}>{t('time:table.status')}</th>
                  <th className={styles.th}>{t('time:table.source')}</th>
                </tr></thead>
                <tbody>
                  {punches.map(p => (
                    <tr key={p.id} className={styles.tr}>
                      <td className={styles.td}>{fmtDate(p.clock_in_at || p.created_at)}</td>
                      <td className={styles.td}>{p.projects?.name || '—'}</td>
                      <td className={styles.td}>
                        <span style={{ fontSize: 12 }}>{fmtTime(p.clock_in_at)}</span>
                        <span style={{ marginLeft: 6 }}>{renderLoc(p.clock_in_lat, p.clock_in_lng, p.source)}</span>
                      </td>
                      <td className={styles.td}>
                        {p.clock_out_at ? (
                          <>
                            <span style={{ fontSize: 12 }}>{fmtTime(p.clock_out_at)}</span>
                            <span style={{ marginLeft: 6 }}>{renderLoc(p.clock_out_lat, p.clock_out_lng, p.source)}</span>
                          </>
                        ) : p.status === 'open' ? (
                          <span className={styles.muted}>—</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td className={styles.td} style={{ fontWeight: 600 }}>{p.hours ? Number(p.hours).toFixed(2) : '—'}</td>
                      <td className={styles.td}>
                        <span className={
                          p.status === 'approved' ? styles.badgeActive
                          : p.status === 'rejected' ? styles.badgeInactive
                          : p.status === 'open' ? styles.badgeOpen
                          : styles.badgeSubmitted
                        }>{p.status}</span>
                      </td>
                      <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
