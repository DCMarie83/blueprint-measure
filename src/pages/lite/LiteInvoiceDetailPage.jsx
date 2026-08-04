import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Download, Send, CheckCircle, FileSpreadsheet, BellRing } from 'lucide-react'
import InvoiceStatusBadge from '../../components/invoices/InvoiceStatusBadge'
import { useInvoice, useInvoiceMutations, isOverdue } from '../../hooks/useInvoices'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useSheetSignal } from '../../hooks/useSheetSignal'
import { useAuth } from '../../context/AuthContext'
import { generateInvoicePDF } from '../../lib/generateInvoicePDF'
import { generateLiteInvoiceXLSX } from '../../lib/generateLiteInvoiceXLSX'
import { supabase } from '../../lib/supabase'
import { unitLabel, fmtMoney } from '../../lib/lite'
import { getEffectiveTimeZone } from '../../lib/effectiveTime'
import styles from './lite.module.css'

// Lite payment methods map onto the invoices.payment_method CHECK
// (cash/check/card/bank_transfer/other) — a deliberately shorter list than the
// contractor surface.
const PAY_METHODS = [
  { value: 'cash', label: 'lite:invoiceDetail.methodCash' },
  { value: 'check', label: 'lite:invoiceDetail.methodCheck' },
  { value: 'card', label: 'lite:invoiceDetail.methodCard' },
  { value: 'bank_transfer', label: 'lite:invoiceDetail.methodBankTransfer' },
  { value: 'other', label: 'lite:invoiceDetail.methodOther' },
]

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// A reminder can go out at most once every 72 hours. Same window governs the
// button's disabled state here and the home card's "Remind" affordance.
const REMIND_THROTTLE_MS = 72 * 60 * 60 * 1000
const REMINDABLE_STATUSES = ['sent', 'viewed', 'partial']

function remindedLabel(ts, t) {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days <= 0) return t('lite:invoiceDetail.remindedToday')
  return t('lite:invoiceDetail.remindedDaysAgo', { count: days })
}

export default function LiteInvoiceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const location = useLocation()
  // When arrived from Reports, location.state.backTo holds the exact /reports URL
  // (preset + custom range) so the back action returns with the range intact.
  const backTo = location.state?.backTo
  const [searchParams, setSearchParams] = useSearchParams()
  const { company } = useEffectiveCompany()
  const { userProfile } = useAuth()
  const tz = getEffectiveTimeZone(userProfile)
  const { invoice, lineItems, payments, loading, error, refetch } = useInvoice(id)
  const { recordPayment } = useInvoiceMutations()

  const [gc, setGc] = useState(null)
  const [project, setProject] = useState(null)
  // Closed clock punches backing this invoice (for the PDF Time-detail section).
  const [timeDetail, setTimeDetail] = useState([])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [sendOk, setSendOk] = useState(false)
  const [remindOk, setRemindOk] = useState(false)
  const remindAutoFired = useRef(false)

  // Mark paid sheet
  const [showPaySheet, setShowPaySheet] = useState(false)
  const [payMode, setPayMode] = useState('full') // 'full' | 'partial'
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('check')

  // Hide the floating feedback FAB while the mark-paid sheet is open.
  useSheetSignal(showPaySheet)

  // Resolve the GC + project once the invoice loads (for branding + recipient).
  useEffect(() => {
    if (!invoice) return
    let cancelled = false
    ;(async () => {
      const [{ data: cli }, { data: proj }] = await Promise.all([
        invoice.client_id
          ? supabase.from('clients').select('id, display_name, business_name, primary_email').eq('id', invoice.client_id).single()
          : Promise.resolve({ data: null }),
        invoice.project_id
          ? supabase.from('projects').select('id, name, address').eq('id', invoice.project_id).single()
          : Promise.resolve({ data: null }),
      ])
      if (!cancelled) { setGc(cli || null); setProject(proj || null) }
    })()
    return () => { cancelled = true }
  }, [invoice])

  // Load the closed punches rolled into this invoice — drives the PDF Time detail
  // and the email's clocked-hours line. Only punch-backed rows (both clock stamps).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('work_entries')
        .select('work_date, clock_in_at, clock_out_at, hours')
        .eq('invoice_id', id)
        .not('clock_in_at', 'is', null)
        .not('clock_out_at', 'is', null)
        .order('work_date', { ascending: true })
        .order('clock_in_at', { ascending: true })
      if (!cancelled) setTimeDetail(data ?? [])
    })()
    return () => { cancelled = true }
  }, [id])

  async function buildBranding() {
    const companyData = {
      name: company?.name,
      primary_color: company?.primary_color,
      payment_instructions: company?.payment_instructions,
    }
    if (company?.logo_url) {
      try {
        const res = await fetch(company.logo_url)
        if (res.ok) {
          const blob = await res.blob()
          const reader = new FileReader()
          companyData.logo_data = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob) })
        }
      } catch { /* skip logo */ }
    }
    return companyData
  }

  async function handleDownloadPDF() {
    setBusy(true); setActionError(null)
    try {
      const companyData = await buildBranding()
      const pdf = generateInvoicePDF({ invoice, lineItems, project, client: gc, company: companyData, timeDetail, timeZone: tz, returnAs: 'blob' })
      const url = URL.createObjectURL(pdf)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoice.invoice_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { setActionError(err.message) }
    finally { setBusy(false) }
  }

  async function handleDownloadExcel() {
    setBusy(true); setActionError(null)
    try {
      await generateLiteInvoiceXLSX({ invoice, lineItems, client: gc, company })
    } catch (err) { setActionError(err.message) }
    finally { setBusy(false) }
  }

  async function handleSend() {
    const email = gc?.primary_email
    if (!email) return
    const name = gc.business_name || gc.display_name || t('lite:invoiceDetail.thisGc')
    if (!window.confirm(t('lite:invoiceDetail.confirmSend', { name, email }))) return
    setBusy(true); setActionError(null); setSendOk(false)
    try {
      const companyData = await buildBranding()
      const pdfBase64 = generateInvoicePDF({ invoice, lineItems, project, client: gc, company: companyData, timeDetail, timeZone: tz, returnAs: 'base64' })
      const { error: fnErr } = await supabase.functions.invoke('send-lite-invoice-email', {
        body: { invoice_id: id, pdf_base64: pdfBase64 },
      })
      if (fnErr) throw new Error(fnErr.message || t('common:action.sendFailed'))
      setSendOk(true)
      setTimeout(() => setSendOk(false), 3000)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setBusy(false) }
  }

  // Remind GC — same send rail with mode 'reminder', then stamp last_reminded_at
  // so the 72h throttle engages. Regenerates the PDF exactly like a normal send.
  async function handleRemind() {
    const email = gc?.primary_email
    if (!email) return
    const name = gc.business_name || gc.display_name || t('lite:invoiceDetail.thisGc')
    if (!window.confirm(t('lite:invoiceDetail.confirmRemind', { name, email }))) return
    setBusy(true); setActionError(null); setRemindOk(false)
    try {
      const companyData = await buildBranding()
      const pdfBase64 = generateInvoicePDF({ invoice, lineItems, project, client: gc, company: companyData, timeDetail, timeZone: tz, returnAs: 'base64' })
      const { error: fnErr } = await supabase.functions.invoke('send-lite-invoice-email', {
        body: { invoice_id: id, pdf_base64: pdfBase64, mode: 'reminder' },
      })
      if (fnErr) throw new Error(fnErr.message || t('lite:invoiceDetail.reminderFailed'))
      const { error: upErr } = await supabase
        .from('invoices')
        .update({ last_reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (upErr) throw new Error(upErr.message)
      setRemindOk(true)
      setTimeout(() => setRemindOk(false), 3000)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setBusy(false) }
  }

  // Deep-link from the home oldest-unpaid card (?remind=1): open the reminder
  // confirm once the GC has resolved. Guarded so it fires a single time, and the
  // param is cleared so a refresh or back-nav doesn't re-trigger it.
  useEffect(() => {
    if (remindAutoFired.current) return
    if (searchParams.get('remind') !== '1') return
    if (!invoice || !gc) return
    remindAutoFired.current = true
    searchParams.delete('remind')
    setSearchParams(searchParams, { replace: true })
    const remindable = REMINDABLE_STATUSES.includes(invoice.status) &&
      (!invoice.last_reminded_at || Date.now() - new Date(invoice.last_reminded_at).getTime() >= REMIND_THROTTLE_MS)
    if (remindable && gc.primary_email) handleRemind()
  }, [invoice, gc, searchParams, setSearchParams])

  function openPaySheet() {
    const balance = Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.paid_amount) || 0))
    setPayMode('full')
    setPayAmount(balance.toFixed(2))
    setPayMethod('check')
    setActionError(null)
    setShowPaySheet(true)
  }

  async function handleConfirmPaid() {
    // Both paths flow through recordPayment so the chosen method is captured and
    // the invoice status is recomputed (paid when the balance is cleared, partial
    // otherwise) — the same D54 payment path the contractor surface uses.
    const amt = payMode === 'full' ? balanceDue : Number(payAmount)
    if (!amt || amt <= 0) { setActionError(t('lite:invoiceDetail.enterPayAmount')); return }
    setBusy(true); setActionError(null)
    try {
      await recordPayment(id, { amount: amt, payment_method: payMethod, payment_date: null, reference_number: null, notes: payMode === 'full' ? 'Marked paid in full' : null })
      setShowPaySheet(false)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setBusy(false) }
  }

  if (loading) return <div className={styles.page}><main className={styles.main}><div className={styles.loading}>{t('common:misc.loading')}</div></main></div>
  if (error || !invoice) return <div className={styles.page}><main className={styles.main}><div className={styles.loading}>{t('lite:invoiceDetail.notFound')}</div></main></div>

  const total = Number(invoice.total) || 0
  const paidAmount = Number(invoice.paid_amount) || 0
  const balanceDue = Math.max(0, total - paidAmount)
  const overdue = isOverdue(invoice)
  const gcName = gc ? (gc.business_name || gc.display_name) : '—'
  const canPay = invoice.status !== 'void' && balanceDue > 0
  const hasEmail = !!gc?.primary_email

  // Remind GC — button shows for sent/viewed/partial (never draft/paid/void).
  // The 72h throttle disables it, with the "Reminded …" stamp as the explanation.
  const remindEligible = REMINDABLE_STATUSES.includes(invoice.status)
  const remindedAt = invoice.last_reminded_at
  const remindThrottled = !!remindedAt && (Date.now() - new Date(remindedAt).getTime() < REMIND_THROTTLE_MS)
  const remindStamp = remindedAt ? remindedLabel(remindedAt, t) : null

  // The GC's online response, if they've reviewed the invoice. Any value
  // starting with "approv" is an approval; anything else set means they asked
  // for changes and left a note in gc_comment.
  const gcApproval = invoice.gc_approval || null
  const gcApproved = gcApproval && String(gcApproval).toLowerCase().startsWith('approv')
  const gcComment = (invoice.gc_comment || '').trim()

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => navigate(backTo || '/invoices')}><ChevronLeft size={15} /> {backTo ? t('lite:invoiceDetail.reports') : t('lite:invoiceDetail.invoices')}</button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{invoice.invoice_number}</h1>
            <p className={styles.subtitle}>{gcName} · {t('lite:invoiceDetail.issued', { date: fmtDate(invoice.created_at) })}{invoice.due_date ? ` · ${t('lite:invoiceDetail.due', { date: fmtDate(invoice.due_date) })}` : ''}</p>
          </div>
          <InvoiceStatusBadge status={invoice.status} isOverdue={overdue} />
        </div>

        {/* GC's online response, when they've reviewed the invoice. */}
        {gcApproval && (
          <div className={styles.card} style={{ borderLeft: `3px solid ${gcApproved ? 'var(--color-success)' : 'var(--color-warning, #b45309)'}` }}>
            <div className={styles.statLabel} style={{ color: gcApproved ? 'var(--color-success)' : 'var(--color-warning, #b45309)', marginBottom: 6 }}>
              {gcApproved ? t('lite:invoiceDetail.approvedByGc') : t('lite:invoiceDetail.changesRequested')}
            </div>
            <p className={styles.entryMeta} style={{ margin: 0 }}>
              {gcApproved
                ? (invoice.gc_responded_at
                    ? t('lite:invoiceDetail.approvedOnlineOn', { gcName, date: fmtDate(invoice.gc_responded_at) })
                    : t('lite:invoiceDetail.approvedOnline', { gcName }))
                : (invoice.gc_responded_at
                    ? t('lite:invoiceDetail.changesOn', { gcName, date: fmtDate(invoice.gc_responded_at) })
                    : t('lite:invoiceDetail.changes', { gcName }))}
            </p>
            {!gcApproved && gcComment && (
              <p className={styles.entryName} style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{gcComment}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className={styles.card}>
          <div className={styles.segmentChips} style={{ marginBottom: 0 }}>
            <button className={styles.secondaryBtn} onClick={handleDownloadPDF} disabled={busy}><Download size={15} /> {t('lite:invoiceDetail.pdf')}</button>
            <button className={styles.secondaryBtn} onClick={handleDownloadExcel} disabled={busy}><FileSpreadsheet size={15} /> {t('lite:invoiceDetail.excel')}</button>
            {hasEmail ? (
              <button className={styles.primaryBtn} onClick={handleSend} disabled={busy}>
                <Send size={15} /> {busy ? t('lite:invoiceDetail.working') : invoice.status === 'draft' ? t('lite:invoiceDetail.sendToGc') : t('lite:invoiceDetail.resendToGc')}
              </button>
            ) : (
              <button className={styles.primaryBtn} disabled>{t('lite:invoiceDetail.sendToGc')}</button>
            )}
            {canPay && (
              <button className={styles.secondaryBtn} onClick={openPaySheet} disabled={busy}><CheckCircle size={15} /> {t('lite:invoiceDetail.markPaid')}</button>
            )}
            {remindEligible && (
              <button className={styles.secondaryBtn} onClick={handleRemind} disabled={busy || remindThrottled || !hasEmail}>
                <BellRing size={15} /> {t('lite:invoiceDetail.remindGc')}
              </button>
            )}
          </div>
          {!hasEmail && (
            <p className={styles.helper}>{t('lite:invoiceDetail.noEmailOnFile')} <Link to="/gcs" className={styles.linkBtn}>{t('lite:invoiceDetail.addEmailLink')}</Link>{t('lite:invoiceDetail.toSend')}</p>
          )}
          {remindEligible && remindStamp && <p className={styles.helper}>{remindStamp}{remindThrottled ? t('lite:invoiceDetail.throttleSuffix') : ''}</p>}
          {sendOk && <p className={styles.helper} style={{ color: 'var(--color-success)' }}>{t('lite:invoiceDetail.sentTo', { gcName })}</p>}
          {remindOk && <p className={styles.helper} style={{ color: 'var(--color-success)' }}>{t('lite:invoiceDetail.reminderSentTo', { gcName })}</p>}
          {actionError && <div className={styles.error} style={{ marginTop: 10, marginBottom: 0 }}>{actionError}</div>}
        </div>

        {/* Line items */}
        <div className={styles.card}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('lite:invoiceDetail.colDescription')}</th>
                  <th>{t('lite:invoiceDetail.colUnit')}</th>
                  <th style={{ textAlign: 'right' }}>{t('lite:invoiceDetail.colQtyHrs')}</th>
                  <th style={{ textAlign: 'right' }}>{t('lite:invoiceDetail.colRate')}</th>
                  <th style={{ textAlign: 'right' }}>{t('lite:invoiceDetail.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map(li => (
                  <tr key={li.id}>
                    <td>{li.description}</td>
                    <td>{unitLabel(li.unit)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(li.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(li.unit_rate)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(li.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.dayTotal}><span>{t('lite:invoiceDetail.total')}</span><span>{fmtMoney(total)}</span></div>
          {paidAmount > 0 && (
            <div className={styles.rowBetween} style={{ paddingTop: 8 }}>
              <span className={styles.entryMeta}>{t('lite:invoiceDetail.paymentsReceived')}</span>
              <span className={styles.entryMeta} style={{ color: 'var(--color-success)' }}>−{fmtMoney(paidAmount)}</span>
            </div>
          )}
          {balanceDue > 0 ? (
            <div className={styles.rowBetween} style={{ paddingTop: 6 }}>
              <span className={styles.entryName}>{t('lite:invoiceDetail.balanceDue')}</span>
              <span className={styles.entryAmount} style={{ color: 'var(--color-danger)' }}>{fmtMoney(balanceDue)}</span>
            </div>
          ) : total > 0 && invoice.status !== 'draft' ? (
            <div className={styles.rowBetween} style={{ paddingTop: 6 }}>
              <span className={styles.entryName} style={{ color: 'var(--color-success)' }}>{t('common:invoiceStatus.paid')}</span>
            </div>
          ) : null}
        </div>

        {payments.length > 0 && (
          <div className={styles.card}>
            <div className={styles.statLabel} style={{ marginBottom: 8 }}>{t('lite:invoiceDetail.payments')}</div>
            {payments.map(p => (
              <div key={p.id} className={styles.entryRow}>
                <div className={styles.entryMain}>
                  <div className={styles.entryName}>{fmtMoney(p.amount)}</div>
                  <div className={styles.entryMeta}>{p.payment_method || t('lite:invoiceDetail.payment')} · {fmtDate(p.payment_date)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showPaySheet && (
        <>
          <div className={styles.sheetBackdrop} onClick={() => !busy && setShowPaySheet(false)} />
          <div className={styles.sheet} role="dialog" aria-label={t('lite:invoiceDetail.markPaid')}>
            <h2 className={styles.sheetTitle}>{t('lite:invoiceDetail.markPaid')}</h2>
            <div className={styles.modeToggle}>
              <button className={payMode === 'full' ? styles.modeBtnActive : styles.modeBtn} onClick={() => { setPayMode('full'); setPayAmount(balanceDue.toFixed(2)) }}>{t('lite:invoiceDetail.full')}</button>
              <button className={payMode === 'partial' ? styles.modeBtnActive : styles.modeBtn} onClick={() => setPayMode('partial')}>{t('lite:invoiceDetail.partial')}</button>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('lite:invoiceDetail.amount')}</span>
                <input className={styles.input} type="number" step="0.01" min="0" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)} disabled={payMode === 'full'} />
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('lite:invoiceDetail.method')}</span>
                <select className={styles.select} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
                </select>
              </div>
            </div>

            {actionError && <div className={styles.error}>{actionError}</div>}

            <div className={styles.sheetActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowPaySheet(false)} disabled={busy}>{t('common:action.cancel')}</button>
              <button className={styles.primaryBtn} onClick={handleConfirmPaid} disabled={busy}>{busy ? t('lite:invoiceDetail.saving') : t('common:action.confirm')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
