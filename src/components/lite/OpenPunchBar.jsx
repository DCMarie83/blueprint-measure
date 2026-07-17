import { useState, useEffect } from 'react'
import { Clock, Square } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtMoney } from '../../lib/lite'
import styles from '../../pages/lite/lite.module.css'

// Shared running-punch bar. Renders wherever an open punch exists (the LogPage
// timer and the /home compact indicator both mount it) and owns the ENTIRE
// clock-out: hours math, the >0-rate rule when no rate was prefilled, the amount,
// and a best-effort geo stamp that never blocks. State (elapsed) is derived from
// the punch's own clock_in_at, so it is honest across app closes and midnight.
function two(n) { return String(n).padStart(2, '0') }
function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

export default function OpenPunchBar({ punch, onDone, compact = false }) {
  const [now, setNow] = useState(() => Date.now())
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const jobName = punch.projects?.name || 'this job'
  const prefilledRate = Number(punch.rate_snapshot) || 0
  const needRate = !(prefilledRate > 0)
  const elapsed = formatElapsed(now - new Date(punch.clock_in_at).getTime())

  async function clockOut() {
    const effRate = needRate ? Number(rate) : prefilledRate
    if (!(effRate > 0)) { setErr('Enter a rate above $0 to clock out.'); return }
    setBusy(true); setErr(null)
    try {
      const outAt = new Date()
      // Honest math even across midnight; work_date stays the clock-IN day.
      const hours = Math.round(((outAt.getTime() - new Date(punch.clock_in_at).getTime()) / 3600000) * 100) / 100
      const amount = Math.round(hours * effRate * 100) / 100
      const { error } = await supabase
        .from('work_entries')
        .update({ clock_out_at: outAt.toISOString(), hours, rate_snapshot: effRate, amount })
        .eq('id', punch.id)
      if (error) throw new Error(error.message)

      // Best-effort geo — never blocks or fails the clock-out.
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => supabase.from('work_entries')
            .update({ clock_out_lat: pos.coords.latitude, clock_out_lng: pos.coords.longitude })
            .eq('id', punch.id),
          () => {},
          { timeout: 10000 },
        )
      }
      await onDone?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.card} style={{ borderLeft: '3px solid var(--color-action-open)' }}>
      <div className={styles.rowBetween}>
        <div className={styles.entryMain}>
          <div className={styles.entryMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} /> Clocked in{compact ? '' : ' on'}
          </div>
          <div className={styles.entryName}>{jobName}</div>
          <div className={styles.entryMeta}>
            {elapsed} elapsed{prefilledRate > 0 ? ` · ${fmtMoney(prefilledRate)}/hr` : ''}
          </div>
        </div>
        <button className={styles.primaryBtn} onClick={clockOut} disabled={busy}>
          <Square size={14} /> {busy ? 'Saving…' : 'Clock out'}
        </button>
      </div>
      {needRate && (
        <div className={styles.field} style={{ marginTop: 10 }}>
          <span className={styles.fieldLabel}>Rate for this job ($/hr) — needed to clock out</span>
          <input className={styles.input} type="number" step="0.01" min="0.01" value={rate}
            onChange={e => setRate(e.target.value)} placeholder="0.00" />
        </div>
      )}
      {err && <div className={styles.error} style={{ marginTop: 8, marginBottom: 0 }}>{err}</div>}
    </div>
  )
}
