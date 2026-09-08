import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { MapPin, AlertTriangle, Copy, Check } from 'lucide-react'
import {
  getCrewMemberById, getCrewMemberPunches, updateCrewMember, sendRivetPayLinkEmail,
  getCrewRates, addCrewRate, deleteCrewRate, getCrewAssignments, getMyTimeEntries,
  linkCrewToUserByEmail,
} from '../data/timeTracking'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import styles from './CrewMemberPage.module.css'
import { ScrollbarInside } from '../components/common/FloatingScrollbar'

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
  const { companyId } = useEffectiveCompany()
  const [cm, setCm] = useState(null)
  const [punches, setPunches] = useState([])
  const [entries, setEntries] = useState([])
  const [rates, setRates] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  // Add-rate form
  const [rateValue, setRateValue] = useState('')
  const [rateFrom, setRateFrom] = useState(new Date().toISOString().slice(0, 10))
  const [rateNote, setRateNote] = useState('')
  const [rateBusy, setRateBusy] = useState(false)

  async function reloadRates() {
    try { setRates(await getCrewRates(id)) } catch { /* section renders empty */ }
  }

  async function handleAddRate(e) {
    e.preventDefault()
    if (!rateValue || !rateFrom) return
    setRateBusy(true)
    try {
      await addCrewRate({ companyId, crewMemberId: id, rate: rateValue, effectiveFrom: rateFrom, note: rateNote })
      setRateValue(''); setRateNote('')
      await reloadRates()
      setCm(prev => prev ? { ...prev } : prev)
    } catch (err) { alert(t('time:errors.generic', { error: err.message })) }
    finally { setRateBusy(false) }
  }

  async function handleDeleteRate(rateId) {
    if (!window.confirm(t('time:rates.deleteConfirm'))) return
    try { await deleteCrewRate(rateId, id); await reloadRates() }
    catch (err) { alert(t('time:errors.generic', { error: err.message })) }
  }

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
        const [member, punchList, entryList, rateList, assignList] = await Promise.all([
          getCrewMemberById(id),
          getCrewMemberPunches(id),
          getMyTimeEntries(id),
          getCrewRates(id).catch(() => []),
          getCrewAssignments(id).catch(() => []),
        ])
        if (!cancelled) {
          setCm(member)
          setPunches(punchList)
          setEntries(entryList)
          setRates(rateList)
          setAssignments(assignList)
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

  // Totals: the time ledger (time_entries) is the record of hours. Punches
  // only show below while pending approval.
  const { monthHours, lifetimeHours } = useMemo(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    let month = 0, life = 0
    for (const e of entries) {
      const h = Number(e.hours) || 0
      life += h
      if ((e.work_date || '') >= monthStart) month += h
    }
    return { monthHours: month, lifetimeHours: life }
  }, [entries])

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
        // Crew identity: an email matching a company user links the crew row.
        await linkCrewToUserByEmail({ crewMemberId: cm.id, email: trimmed, companyId })
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
        {/* Crew pages are reached from the Team tab; the link says Time and
            goes to the Team tab of Time, always. */}
        <Link to="/time?tab=team" className={styles.backLink}>{t('time:crewMember.backToTime')}</Link>

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
            <span style={{ fontWeight: 700 }}>{cm.cost_rate != null ? `$${Number(cm.cost_rate).toFixed(2)}` : t('time:rates.noneSet')}</span>
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

        {/* Dated rates */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('time:rates.title')}</h2>
          <form onSubmit={handleAddRate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--color-text-muted)' }}>
              {t('time:rates.rateLabel')}
              <input type="number" step="0.01" min="0" required value={rateValue} onChange={e => setRateValue(e.target.value)}
                style={{ width: 100, padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--color-text-muted)' }}>
              {t('time:rates.fromLabel')}
              <input type="date" required value={rateFrom} onChange={e => setRateFrom(e.target.value)}
                style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--color-text-muted)', flex: 1, minWidth: 140 }}>
              {t('time:rates.noteLabel')}
              <input type="text" value={rateNote} onChange={e => setRateNote(e.target.value)}
                style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
            </label>
            <button type="submit" disabled={rateBusy}
              style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              {rateBusy ? '…' : t('time:rates.addRate')}
            </button>
          </form>
          {rates.length === 0 ? (
            <p className={styles.muted}>{t('time:rates.empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rates.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, minWidth: 70 }}>${Number(r.rate).toFixed(2)}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {r.effective_from}{r.effective_to ? ` ${t('time:rates.to')} ${r.effective_to}` : ` ${t('time:rates.open')}`}
                  </span>
                  {r.note && <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{r.note}</span>}
                  <button onClick={() => handleDeleteRate(r.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    {t('common:action.delete')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assigned jobs */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('time:assignments.crewTitle', { count: assignments.length })}</h2>
          {assignments.length === 0 ? (
            <p className={styles.muted}>{t('time:assignments.crewEmpty')}</p>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {assignments.map(a => (
                <Link key={a.id} to={`/project/${a.project_id}`} style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-pill, 9999px)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', textDecoration: 'none' }}>
                  {a.projects?.name || '—'}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Hours: the time ledger */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('time:crewMember.hoursTitle', { count: entries.length })}</h2>
          {entries.length === 0 ? (
            <p className={styles.muted}>{t('time:crewMember.noHours')}</p>
          ) : (
            <div className={styles.tableWrap}><ScrollbarInside />
              <table className={styles.table}>
                <thead><tr>
                  <th className={styles.th}>{t('time:table.date')}</th>
                  <th className={styles.th}>{t('time:table.job')}</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>{t('time:table.hours')}</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>{t('time:table.cost')}</th>
                </tr></thead>
                <tbody>
                  {entries.slice(0, 50).map(e => (
                    <tr key={e.id} className={styles.tr}>
                      <td className={styles.td}>{e.work_date}</td>
                      <td className={styles.td}>{e.projects?.name || '—'}</td>
                      <td className={styles.td} style={{ textAlign: 'right' }}>{Number(e.hours).toFixed(2)}</td>
                      <td className={styles.td} style={{ textAlign: 'right' }}>
                        {e.cost_rate == null
                          ? <span style={{ color: 'var(--color-warning, #d97706)', fontSize: 12 }}>{t('time:unpriced.noRate')}</span>
                          : `$${(Number(e.entry_cost) || Math.round(Number(e.hours) * Number(e.cost_rate) * 100) / 100).toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className={styles.totalsRow}>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>{t('time:crewMember.thisMonth')}</div>
            <div className={styles.totalValue}>{t('time:units.hrs', { value: monthHours.toFixed(1) })}</div>
            <div className={styles.totalSub}>{t('time:crewMember.ledgerHours')}</div>
          </div>
          <div className={styles.totalCard}>
            <div className={styles.totalLabel}>{t('time:crewMember.lifetime')}</div>
            <div className={styles.totalValue}>{t('time:units.hrs', { value: lifetimeHours.toFixed(1) })}</div>
            <div className={styles.totalSub}>{t('time:crewMember.ledgerHours')}</div>
          </div>
        </div>

        {/* Clock log */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('time:crewMember.pendingPunches')}</h2>
          {punches.filter(p => p.status === 'open' || p.status === 'submitted').length === 0 ? (
            <p className={styles.muted}>{t('time:crewMember.noPending')}</p>
          ) : (
            <div className={styles.tableWrap}><ScrollbarInside />
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
                  {punches.filter(p => p.status === 'open' || p.status === 'submitted').map(p => (
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
