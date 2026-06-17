import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './RivetPayLinkPage.module.css'

function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve({ lat: null, lng: null }); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  })
}

function isInAppBrowser() {
  const ua = navigator.userAgent || ''
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|Twitter|; wv\)/i.test(ua)
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function RivetPayLinkPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Terms
  const [acceptingTerms, setAcceptingTerms] = useState(false)

  // Clock state
  const [selectedJob, setSelectedJob] = useState('')
  const [description, setDescription] = useState('')
  const [clockingIn, setClockingIn] = useState(false)
  const [clockingOut, setClockingOut] = useState(false)
  const [clockError, setClockError] = useState('')
  const [clockedOutMsg, setClockedOutMsg] = useState('')

  // Manual
  const [showManual, setShowManual] = useState(false)
  const [manualJob, setManualJob] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10))
  const [manualHours, setManualHours] = useState('')
  const [manualDesc, setManualDesc] = useState('')
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [manualMsg, setManualMsg] = useState('')

  const loadLink = useCallback(async () => {
    if (!token) { setError(true); setLoading(false); return }
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('rivetpay_get_link', { p_token: token })
      if (rpcErr) throw rpcErr
      if (!result || !result.valid) { setError(true) } else { setData(result) }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadLink() }, [loadLink])

  // ── Terms ──────────────────────────────────────────────────────────────
  async function handleAcceptTerms() {
    setAcceptingTerms(true)
    try {
      await supabase.rpc('rivetpay_accept_terms', { p_token: token })
      setData(prev => ({ ...prev, terms_accepted: true }))
    } catch { /* ignore */ }
    finally { setAcceptingTerms(false) }
  }

  // ── Clock In ───────────────────────────────────────────────────────────
  async function handleClockIn() {
    if (!selectedJob) return
    setClockingIn(true)
    setClockError('')
    try {
      const { lat, lng } = await getLocation()
      const { data: result, error: rpcErr } = await supabase.rpc('rivetpay_clock_in', {
        p_token: token,
        p_project_id: selectedJob,
        p_lat: lat,
        p_lng: lng,
        p_description: description || null,
      })
      if (rpcErr) throw rpcErr
      if (result?.error === 'already_open') { await loadLink(); return }
      if (result?.error === 'bad_job') { setClockError('That job is no longer available.'); return }
      if (result?.error) { setClockError(result.error); return }
      setClockedOutMsg('')
      setDescription('')
      setSelectedJob('')
      await loadLink()
    } catch (err) {
      setClockError(err.message || 'Clock in failed')
    } finally {
      setClockingIn(false)
    }
  }

  // ── Clock Out ──────────────────────────────────────────────────────────
  async function handleClockOut() {
    setClockingOut(true)
    setClockError('')
    try {
      const { lat, lng } = await getLocation()
      const { data: result, error: rpcErr } = await supabase.rpc('rivetpay_clock_out', {
        p_token: token,
        p_lat: lat,
        p_lng: lng,
      })
      if (rpcErr) throw rpcErr
      if (result?.error) { setClockError(result.error); return }
      const hrs = result?.hours ? Number(result.hours).toFixed(2) : '?'
      setClockedOutMsg(`Submitted for approval — ${hrs} hrs.`)
      setData(prev => ({ ...prev, open_punch: null }))
    } catch (err) {
      setClockError(err.message || 'Clock out failed')
    } finally {
      setClockingOut(false)
    }
  }

  // ── Manual ─────────────────────────────────────────────────────────────
  async function handleManual(e) {
    e.preventDefault()
    if (!manualJob || !manualHours) return
    setManualSubmitting(true)
    setManualMsg('')
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('rivetpay_submit_manual', {
        p_token: token,
        p_project_id: manualJob,
        p_work_date: manualDate,
        p_hours: parseFloat(manualHours),
        p_description: manualDesc || null,
      })
      if (rpcErr) throw rpcErr
      if (result?.error) { setManualMsg('Error: ' + result.error); return }
      setManualMsg('Submitted for approval.')
      setManualJob('')
      setManualHours('')
      setManualDesc('')
    } catch (err) {
      setManualMsg('Error: ' + (err.message || 'Failed'))
    } finally {
      setManualSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.loading}>Loading…</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.errorTitle}>This link isn't active</h1>
          <p className={styles.errorText}>Ask your employer for an updated link.</p>
          <p className={styles.footer}>Powered by RivetDog</p>
        </div>
      </div>
    )
  }

  const jobs = data.jobs || []

  // Terms gate
  if (!data.terms_accepted) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h2 className={styles.companyName}>{data.company_name}</h2>
          <p className={styles.workerGreeting}>Hi, {data.worker_name}</p>
          <div className={styles.termsBox}>
            <p className={styles.termsText}>
              By clocking in, you agree that your location is recorded at clock-in and clock-out for timekeeping.
            </p>
            <button className={styles.primaryBtn} onClick={handleAcceptTerms} disabled={acceptingTerms}>
              {acceptingTerms ? 'Please wait…' : 'I understand, continue'}
            </button>
          </div>
          <p className={styles.footer}>Powered by RivetDog</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.companyName}>{data.company_name}</h2>
        <p className={styles.workerGreeting}>Hi, {data.worker_name}</p>

        {isInAppBrowser() && (
          <div className={styles.inAppBanner}>
            This works best in your phone's browser. Tap the ••• or Share menu and choose <strong>Open in Safari</strong> or <strong>Open in Chrome</strong>.
          </div>
        )}

        {clockedOutMsg && (
          <div className={styles.successBox}>
            {clockedOutMsg}
            <button className={styles.linkBtn} onClick={() => { setClockedOutMsg(''); loadLink() }}>Clock in again</button>
          </div>
        )}

        {!clockedOutMsg && (
          <>
            {/* Clocked in */}
            {data.open_punch ? (
              <div className={styles.clockedInBox}>
                <div className={styles.statusLabel}>CLOCKED IN</div>
                <div className={styles.jobLabel}>{data.open_punch.project_name}</div>
                <div className={styles.sinceLabel}>since {fmtTime(data.open_punch.clock_in_at)}</div>
                {clockError && <p className={styles.inlineError}>{clockError}</p>}
                <button className={styles.clockOutBtn} onClick={handleClockOut} disabled={clockingOut}>
                  {clockingOut ? 'Clocking out…' : 'Clock Out'}
                </button>
              </div>
            ) : (
              /* Clocked out — clock in form */
              <div className={styles.clockInBox}>
                <select className={styles.jobSelect} value={selectedJob} onChange={e => setSelectedJob(e.target.value)}>
                  <option value="">Select job…</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <input
                  type="text"
                  className={styles.descInput}
                  placeholder="Description (optional)"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                {clockError && <p className={styles.inlineError}>{clockError}</p>}
                <button className={styles.clockInBtn} onClick={handleClockIn} disabled={!selectedJob || clockingIn}>
                  {clockingIn ? 'Clocking in…' : 'Clock In'}
                </button>
              </div>
            )}

            {/* Manual fallback */}
            <div className={styles.manualSection}>
              <button className={styles.manualToggle} onClick={() => setShowManual(v => !v)}>
                {showManual ? 'Hide manual entry' : 'Log time manually'}
              </button>
              {showManual && (
                <form className={styles.manualForm} onSubmit={handleManual}>
                  <select className={styles.jobSelect} value={manualJob} onChange={e => setManualJob(e.target.value)} required>
                    <option value="">Select job…</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                  <input type="date" className={styles.formInput} value={manualDate} onChange={e => setManualDate(e.target.value)} required />
                  <input type="number" className={styles.formInput} placeholder="Hours" step="0.25" min="0.25" max="24" value={manualHours} onChange={e => setManualHours(e.target.value)} required />
                  <input type="text" className={styles.descInput} placeholder="Description (optional)" value={manualDesc} onChange={e => setManualDesc(e.target.value)} />
                  <button type="submit" className={styles.primaryBtn} disabled={manualSubmitting}>
                    {manualSubmitting ? 'Submitting…' : 'Submit'}
                  </button>
                  {manualMsg && <p className={manualMsg.startsWith('Error') ? styles.inlineError : styles.successMsg}>{manualMsg}</p>}
                </form>
              )}
            </div>
          </>
        )}

        <p className={styles.footer}>Powered by RivetDog</p>
      </div>
    </div>
  )
}
