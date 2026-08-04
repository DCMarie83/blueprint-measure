import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Trash2, Check, X, Pencil } from 'lucide-react'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useWorkEntries } from '../../hooks/useWorkEntries'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useSheetSignal } from '../../hooks/useSheetSignal'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { GC_CLIENT_TYPE, unitLabel, fmtMoney, invoiceDueDate, isOpenPunch, punchBacked } from '../../lib/lite'
import { getEffectiveTimeZone, formatTimeOnly } from '../../lib/effectiveTime'
import styles from './lite.module.css'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Single-job rollup + entry ledger for Lite. The four stat cards summarise the
// whole job (ignoring the date filter); the table below is date-filterable and
// each row can be edited or deleted inline. "Create invoice" is intentionally
// disabled — invoicing is wired in a later stage.
export default function LiteJobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const { user, userProfile } = useAuth()
  const tz = getEffectiveTimeZone(userProfile)
  const { projects, loading: projectsLoading } = useProjects()
  const { clients } = useClients()
  const { entries, loading: entriesLoading, refetch: refetchEntries, updateEntry, deleteEntry } = useWorkEntries(id)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editId, setEditId] = useState(null)
  const [editCount, setEditCount] = useState('') // quantity for piece, hours for hourly
  const [editRate, setEditRate] = useState('')

  // Invoice range sheet
  const [showInvoiceSheet, setShowInvoiceSheet] = useState(false)
  const [invFrom, setInvFrom] = useState('')
  const [invTo, setInvTo] = useState('')
  const [creating, setCreating] = useState(false)
  const [invError, setInvError] = useState(null)

  // Hide the floating feedback FAB while the invoice-range sheet is open.
  useSheetSignal(showInvoiceSheet)

  const job = projects.find(p => p.id === id) || null
  const gc = clients.find(c => c.id === job?.client_id && c.client_type === GC_CLIENT_TYPE) || null
  const gcName = gc ? (gc.business_name || gc.display_name) : t('lite:jobDetail.noGc')

  // Open (running) punches are not billable work yet — exclude them from every
  // money view on this page (rollup, ledger, invoice range). The timer bar (on
  // /log and /home) is where a live punch lives until it closes.
  const closedEntries = useMemo(() => entries.filter(e => !isOpenPunch(e)), [entries])

  // Unbilled = never rolled into an invoice. Invoiced entries can never be
  // re-invoiced, so they never appear in the range preview.
  const unbilled = useMemo(() => closedEntries.filter(e => !e.invoice_id), [closedEntries])

  const invPreview = useMemo(() => {
    const rows = unbilled.filter(e => {
      if (invFrom && e.work_date < invFrom) return false
      if (invTo && e.work_date > invTo) return false
      return true
    })
    const total = rows.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    return { rows, total }
  }, [unbilled, invFrom, invTo])

  function openInvoiceSheet() {
    // Default range: earliest unbilled entry → today.
    const dates = unbilled.map(e => e.work_date).filter(Boolean).sort()
    setInvFrom(dates[0] || todayStr())
    setInvTo(todayStr())
    setInvError(null)
    setShowInvoiceSheet(true)
  }

  async function createInvoice() {
    if (!companyId || !user?.id || !gc) return
    const rows = invPreview.rows
    if (rows.length === 0) { setInvError(t('lite:jobDetail.noUnbilledRange')); return }
    setCreating(true); setInvError(null)
    try {
      // Deterministic order: work_date then created_at — drives line-item sort_order.
      const ordered = [...rows].sort((a, b) =>
        a.work_date === b.work_date
          ? String(a.created_at).localeCompare(String(b.created_at))
          : a.work_date.localeCompare(b.work_date))

      const subtotal = ordered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

      const { data: invNum, error: rpcErr } = await supabase.rpc('generate_invoice_number', { p_company_id: companyId })
      if (rpcErr) throw new Error(rpcErr.message)

      const { data: invoice, error: insErr } = await supabase
        .from('invoices')
        .insert({
          project_id: id,
          company_id: companyId,
          client_id: gc.id,
          estimate_id: null,
          invoice_number: invNum,
          title: null,
          status: 'draft',
          subtotal,
          adjustment_amount: 0,
          adjustment_label: null,
          total: subtotal,
          due_date: invoiceDueDate(gc.billing_terms, todayStr()),
          notes: null,
          terms: null,
          created_by: user.id,
        })
        .select()
        .single()
      if (insErr) throw new Error(insErr.message)

      // One line item per work_entry — no aggregation. Punch-backed hourly rows
      // carry their clock in/out times in the description (in the sub's zone);
      // manual entries keep the plain "<label> - <date>" shape.
      const lineRows = ordered.map((e, i) => {
        const label = e.description || e.work_items?.name || (e.entry_type === 'hourly' ? 'Hourly' : 'Piece work')
        const qty = e.entry_type === 'hourly' ? e.hours : e.quantity
        const description = punchBacked(e)
          ? `${label} - ${e.work_date} (${formatTimeOnly(tz, e.clock_in_at)} to ${formatTimeOnly(tz, e.clock_out_at)})`
          : `${label} - ${e.work_date}`
        return {
          invoice_id: invoice.id,
          description,
          category_name: null,
          item_type: 'labor',
          unit: e.unit ?? 'each',
          quantity: Number(qty) || 0,
          unit_rate: Number(e.rate_snapshot) || 0,
          total: Number(e.amount) || 0,
          sort_order: i,
        }
      })
      const { error: liErr } = await supabase.from('invoice_line_items').insert(lineRows)
      if (liErr) throw new Error(liErr.message)

      // Stamp invoice_id on every rolled entry. If this fails the invoice exists
      // but entries are unstamped — surface it by number rather than silently pass.
      const { error: stampErr } = await supabase
        .from('work_entries')
        .update({ invoice_id: invoice.id })
        .in('id', ordered.map(e => e.id))
      if (stampErr) {
        throw new Error(t('lite:jobDetail.stampFailed', { number: invNum, message: stampErr.message }))
      }

      setShowInvoiceSheet(false)
      await refetchEntries()
      navigate(`/invoices/${invoice.id}`)
    } catch (err) {
      setInvError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const rollup = useMemo(() => {
    let total = 0, unbilled = 0, invoiced = 0
    for (const e of closedEntries) {
      const amt = Number(e.amount) || 0
      total += amt
      if (e.invoice_id) invoiced += amt
      else unbilled += amt
    }
    return { total, unbilled, invoiced }
  }, [closedEntries])

  const visible = useMemo(() => {
    return closedEntries.filter(e => {
      if (dateFrom && e.work_date < dateFrom) return false
      if (dateTo && e.work_date > dateTo) return false
      return true
    })
  }, [closedEntries, dateFrom, dateTo])

  function startEdit(e) {
    setEditId(e.id)
    setEditCount(String((e.entry_type === 'hourly' ? e.hours : e.quantity) ?? ''))
    setEditRate(String(e.rate_snapshot ?? ''))
  }
  function cancelEdit() { setEditId(null); setEditCount(''); setEditRate('') }

  async function saveEdit(e) {
    const count = Number(editCount) || 0
    const rate = Number(editRate) || 0
    const fields = e.entry_type === 'hourly'
      ? { hours: count, quantity: null, rate_snapshot: rate, amount: count * rate }
      : { quantity: count, hours: null, rate_snapshot: rate, amount: count * rate }
    try {
      await updateEntry(e.id, fields)
      cancelEdit()
    } catch (err) {
      alert(t('lite:jobDetail.saveEntryFailed', { message: err.message }))
    }
  }

  const loading = projectsLoading || entriesLoading

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => navigate('/jobs')}><ChevronLeft size={15} /> {t('lite:jobDetail.jobs')}</button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{job?.name || t('lite:jobDetail.job')}</h1>
            <p className={styles.subtitle}>{gcName}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className={styles.primaryBtn} onClick={() => navigate(`/log?job=${id}`)}>{t('lite:jobDetail.logWork')}</button>
            <span className={styles.tooltipWrap} title={!gc ? t('lite:jobDetail.assignGcFirst') : unbilled.length === 0 ? t('lite:jobDetail.noUnbilledYet') : ''}>
              <button className={styles.secondaryBtn} disabled={!gc || unbilled.length === 0} onClick={openInvoiceSheet}>{t('lite:jobDetail.createInvoice')}</button>
            </span>
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('lite:jobDetail.totalLogged')}</div>
            <div className={styles.statValue}>{fmtMoney(rollup.total)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('lite:jobDetail.anticipatedPay')}</div>
            <div className={styles.statValue}>{fmtMoney(rollup.total)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('lite:jobDetail.unbilled')}</div>
            <div className={`${styles.statValue} ${styles.moneyDue}`}>{fmtMoney(rollup.unbilled)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t('lite:jobDetail.invoiced')}</div>
            <div className={styles.statValue}>{fmtMoney(rollup.invoiced)}</div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.fieldRow} style={{ marginBottom: 4 }}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('lite:jobDetail.from')}</span>
              <input className={styles.input} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('lite:jobDetail.to')}</span>
              <input className={styles.input} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button className={styles.linkBtn} onClick={() => { setDateFrom(''); setDateTo('') }}>{t('lite:jobDetail.clearDates')}</button>
          )}
        </div>

        <div className={styles.card}>
          {loading ? (
            <div className={styles.muted} style={{ padding: '12px 0' }}>{t('lite:jobDetail.loadingEntries')}</div>
          ) : visible.length === 0 ? (
            <div className={styles.muted} style={{ padding: '12px 0' }}>{t('lite:jobDetail.noEntriesRange')}</div>
          ) : (
            visible.map(e => (
              <div key={e.id} className={styles.entryRow}>
                <div className={styles.entryMain}>
                  <div className={styles.entryName}>{e.description || e.work_items?.name || (e.entry_type === 'hourly' ? t('lite:jobDetail.hourly') : t('lite:jobDetail.pieceWork'))}</div>
                  {editId === e.id ? (
                    <div className={styles.fieldRow} style={{ marginTop: 6, marginBottom: 0 }}>
                      <input className={styles.input} style={{ width: 90 }} type="number" step="0.01" min="0" value={editCount} onChange={ev => setEditCount(ev.target.value)} aria-label={e.entry_type === 'hourly' ? t('lite:jobDetail.hours') : t('lite:jobDetail.quantity')} />
                      <input className={styles.input} style={{ width: 90 }} type="number" step="0.01" min="0" value={editRate} onChange={ev => setEditRate(ev.target.value)} aria-label={t('lite:jobDetail.rate')} />
                    </div>
                  ) : (
                    <div className={styles.entryMeta}>
                      {new Date(e.work_date + 'T00:00:00').toLocaleDateString()} · {e.entry_type === 'hourly'
                        ? t('lite:jobDetail.hourlyMeta', { hours: e.hours, rate: fmtMoney(e.rate_snapshot) })
                        : t('lite:jobDetail.pieceMeta', { qty: e.quantity, unit: unitLabel(e.unit), rate: fmtMoney(e.rate_snapshot) })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {editId === e.id ? (
                    <>
                      <span className={styles.entryAmount}>{fmtMoney((Number(editCount) || 0) * (Number(editRate) || 0))}</span>
                      <button className={styles.iconBtn} aria-label={t('common:action.save')} onClick={() => saveEdit(e)}><Check size={16} /></button>
                      <button className={styles.iconBtn} aria-label={t('common:action.cancel')} onClick={cancelEdit}><X size={16} /></button>
                    </>
                  ) : (
                    <>
                      <span className={styles.entryAmount}>{fmtMoney(e.amount)}</span>
                      <button className={styles.iconBtn} aria-label={t('lite:jobDetail.editEntry')} onClick={() => startEdit(e)}><Pencil size={16} /></button>
                      <button className={styles.iconBtn} aria-label={t('lite:jobDetail.deleteEntry')} onClick={() => { if (window.confirm(t('lite:jobDetail.deleteEntryConfirm'))) deleteEntry(e.id) }}><Trash2 size={16} /></button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {showInvoiceSheet && (
        <>
          <div className={styles.sheetBackdrop} onClick={() => !creating && setShowInvoiceSheet(false)} />
          <div className={styles.sheet} role="dialog" aria-label={t('lite:jobDetail.createInvoice')}>
            <h2 className={styles.sheetTitle}>{t('lite:jobDetail.createInvoice')}</h2>
            <p className={styles.subtitle} style={{ marginBottom: 12 }}>{t('lite:jobDetail.billsRange', { gcName })}</p>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('lite:jobDetail.from')}</span>
                <input className={styles.input} type="date" value={invFrom} onChange={e => setInvFrom(e.target.value)} />
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('lite:jobDetail.to')}</span>
                <input className={styles.input} type="date" value={invTo} onChange={e => setInvTo(e.target.value)} />
              </div>
            </div>

            <div className={styles.rowBetween} style={{ padding: '8px 0' }}>
              <span className={styles.entryMeta}>{t('lite:jobDetail.unbilledEntries', { count: invPreview.rows.length })}</span>
              <span className={`${styles.entryAmount} ${styles.moneyDue}`}>{fmtMoney(invPreview.total)}</span>
            </div>

            {invError && <div className={styles.error}>{invError}</div>}

            <div className={styles.sheetActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowInvoiceSheet(false)} disabled={creating}>{t('common:action.cancel')}</button>
              <button className={styles.primaryBtn} onClick={createInvoice} disabled={creating || invPreview.rows.length === 0}>
                {creating ? t('lite:jobDetail.creating') : t('lite:jobDetail.createInvoice')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
