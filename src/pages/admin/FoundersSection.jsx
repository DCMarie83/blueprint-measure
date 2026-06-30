import { useState, useEffect, useRef } from 'react'
import { getStateQuotas, updateStateQuotaCap } from '../../data/stateQuotas'
import styles from './sections.module.css'

export default function FoundersSection() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [onlyWithSignups, setOnlyWithSignups] = useState(false)
  const [savedId, setSavedId] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const data = await getStateQuotas()
      // Group by state: { state, founders, earlyBirds }
      const grouped = {}
      for (const row of data) {
        const key = row.plans?.key
        if (!grouped[row.state]) grouped[row.state] = { state: row.state, founders: null, earlyBirds: null }
        if (key === 'founding_500') grouped[row.state].founders = row
        else if (key === 'early_adopters') grouped[row.state].earlyBirds = row
      }
      setRows(Object.values(grouped).sort((a, b) => a.state.localeCompare(b.state)))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalFoundersClaimed = rows.reduce((s, r) => s + (r.founders?.signup_count ?? 0), 0)
  const totalFoundersRemaining = rows.reduce((s, r) => {
    if (!r.founders) return s
    return s + Math.max(0, r.founders.max_signups - r.founders.signup_count)
  }, 0)
  const statesFoundersFull = rows.filter(r => r.founders && r.founders.signup_count >= r.founders.max_signups).length

  const displayed = onlyWithSignups
    ? rows.filter(r => (r.founders?.signup_count ?? 0) > 0 || (r.earlyBirds?.signup_count ?? 0) > 0)
    : rows

  async function handleCapChange(quotaRow, newCap) {
    if (!quotaRow || newCap === quotaRow.max_signups) return
    try {
      await updateStateQuotaCap(quotaRow.id, newCap)
      setRows(prev => prev.map(r => {
        if (r.founders?.id === quotaRow.id) return { ...r, founders: { ...r.founders, max_signups: newCap } }
        if (r.earlyBirds?.id === quotaRow.id) return { ...r, earlyBirds: { ...r.earlyBirds, max_signups: newCap } }
        return r
      }))
      setSavedId(quotaRow.id)
      setTimeout(() => setSavedId(null), 1500)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    }
  }

  if (loading) return <div className={styles.empty}>Loading state quotas...</div>
  if (error) return <div className={styles.errorBox}>{error}</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>Founders</h1>

      <div className={styles.quickStats}>
        <div className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{totalFoundersClaimed}</span>
          <span className={styles.quickStatLabel}>Founders Claimed</span>
        </div>
        <div className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{totalFoundersRemaining}</span>
          <span className={styles.quickStatLabel}>Founders Remaining</span>
        </div>
        <div className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{statesFoundersFull}</span>
          <span className={styles.quickStatLabel}>States Full</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={onlyWithSignups} onChange={e => setOnlyWithSignups(e.target.checked)} />
          Only states with signups
        </label>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>State</th>
              <th className={styles.th}>Founders (used / cap)</th>
              <th className={styles.th}>Early Birds (used / cap)</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(r => (
              <tr key={r.state} className={styles.tr}>
                <td className={styles.td} style={{ fontWeight: 600 }}>
                  {r.state}
                  {r.founders && r.founders.signup_count >= r.founders.max_signups && (
                    <span className={styles.pill} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Full</span>
                  )}
                </td>
                <td className={styles.td}>
                  <QuotaCell quota={r.founders} savedId={savedId} onCapChange={handleCapChange} />
                </td>
                <td className={styles.td}>
                  <QuotaCell quota={r.earlyBirds} savedId={savedId} onCapChange={handleCapChange} />
                </td>
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr><td className={styles.td} colSpan={3} style={{ color: 'var(--color-text-muted)' }}>No states match filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QuotaCell({ quota, savedId, onCapChange }) {
  const [localCap, setLocalCap] = useState(null)
  const inputRef = useRef(null)

  if (!quota) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>

  const displayCap = localCap !== null ? localCap : quota.max_signups

  function handleBlur() {
    const parsed = parseInt(localCap, 10)
    if (!isNaN(parsed) && parsed >= 0 && parsed !== quota.max_signups) {
      onCapChange(quota, parsed)
    }
    setLocalCap(null)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{quota.signup_count} /</span>
      <input
        ref={inputRef}
        type="number"
        min="0"
        style={{ width: 56, padding: '3px 6px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
        value={displayCap}
        onChange={e => setLocalCap(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if (e.key === 'Enter') inputRef.current?.blur() }}
      />
      {savedId === quota.id && <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>Saved</span>}
    </span>
  )
}
