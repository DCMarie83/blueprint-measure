import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Download, Send, CheckCircle, XCircle, Edit, Trash2, RotateCcw } from 'lucide-react'
import BackLink from '../components/BackLink'
import { useInvoice, useInvoiceMutations, isOverdue } from '../hooks/useInvoices'
import { generateInvoicePDF } from '../lib/generateInvoicePDF'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './InvoiceDetailPage.module.css'

const UNIT_LABELS = { sf: 'common:units.sf', lf: 'common:units.lf', each: 'common:units.each', hour: 'common:units.hour', lump_sum: 'common:units.lumpSum' }
const PAYMENT_METHODS = [
  { value: 'cash', label: 'invoices:detail.method.cash' },
  { value: 'check', label: 'invoices:detail.method.check' },
  { value: 'ach', label: 'invoices:detail.method.ach' },
  { value: 'card', label: 'invoices:detail.method.card' },
  { value: 'venmo', label: 'invoices:detail.method.venmo' },
  { value: 'other', label: 'invoices:detail.method.other' },
]

// Local status pill for the detail-page header. Mirrors the shared
// InvoiceStatusBadge status-color semantics (STATUS_MAP + its module.css) so the
// shared component — still used by the portal and Lite — stays untouched.
const STATUS_PILL = {
  draft:   { label: 'common:invoiceStatus.draft',   bg: 'var(--color-neutral-bg)',   color: 'var(--color-neutral)' },
  sent:    { label: 'common:invoiceStatus.sent',    bg: 'var(--color-warning-bg)',   color: 'var(--color-warning)' },
  viewed:  { label: 'common:invoiceStatus.viewed',  bg: 'var(--color-info-bg)',      color: 'var(--color-info)' },
  partial: { label: 'common:invoiceStatus.partial', bg: 'rgba(245, 158, 11, 0.12)',  color: '#d97706' },
  paid:    { label: 'common:invoiceStatus.paid',    bg: 'rgba(74,222,128,0.14)',     color: 'var(--color-success)' },
  void:    { label: 'common:invoiceStatus.void',    bg: 'var(--color-danger-bg)',    color: 'var(--color-danger)', strike: true },
}

function statusPillProps(status, overdue) {
  if (overdue && (status === 'sent' || status === 'partial')) {
    return { label: 'common:invoiceStatus.overdue', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  }
  return STATUS_PILL[status] ?? STATUS_PILL.draft
}

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtDateShort(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function InvoiceDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { company } = useAuth()
  const { invoice, lineItems, payments, loading, error, refetch } = useInvoice(id)
  const { markSent, markPaidInFull, markVoid, reopenInvoice, recordPayment, deletePayment, deleteInvoice } = useInvoiceMutations()

  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('check')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [showVoidForm, setShowVoidForm] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [actionError, setActionError] = useState(null)

  // For PDF: fetch project + client + company data
  const [pdfLoading, setPdfLoading] = useState(false)

  async function fetchPdfData() {
    if (!invoice) return null
    const [{ data: proj }, { data: cli }] = await Promise.all([
      supabase.from('projects').select('id, name, address, client_id').eq('id', invoice.project_id).single(),
      invoice.project_id ? supabase.from('projects').select('client_id').eq('id', invoice.project_id).single().then(async ({ data: p }) => {
        if (!p?.client_id) return { data: null }
        return supabase.from('clients').select('display_name, business_name').eq('id', p.client_id).single()
      }) : Promise.resolve({ data: null }),
    ])

    let companyData = { name: company?.name, primary_color: company?.primary_color, payment_instructions: company?.payment_instructions }
    if (company?.logo_url) {
      try {
        const res = await fetch(company.logo_url)
        if (res.ok) {
          const blob = await res.blob()
          const reader = new FileReader()
          const logoData = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob) })
          companyData.logo_data = logoData
        }
      } catch { /* skip logo */ }
    }
    return { project: proj, client: cli, company: companyData }
  }

  async function handleDownloadPDF() {
    setPdfLoading(true)
    try {
      const data = await fetchPdfData()
      if (!data) return
      const pdf = generateInvoicePDF({ invoice, lineItems, project: data.project, client: data.client, company: data.company, returnAs: 'blob' })
      const url = URL.createObjectURL(pdf)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoice.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  const [sendSuccess, setSendSuccess] = useState(false)

  async function handleSendInvoice() {
    setActionSaving(true); setActionError(null); setSendSuccess(false)
    try {
      const pdfData = await fetchPdfData()
      if (!pdfData) throw new Error(t('invoices:detail.errorPdfData'))
      const pdfBase64 = generateInvoicePDF({ invoice, lineItems, project: pdfData.project, client: pdfData.client, company: pdfData.company, returnAs: 'base64' })
      const { error: fnErr } = await supabase.functions.invoke('send-invoice-email', {
        body: { invoice_id: id, pdf_base64: pdfBase64 },
      })
      if (fnErr) throw new Error(fnErr.message || t('common:action.sendFailed'))
      setSendSuccess(true)
      setTimeout(() => setSendSuccess(false), 3000)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleRecordPayment() {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) { setActionError(t('invoices:detail.errorNoAmount')); return }
    setActionSaving(true); setActionError(null)
    try {
      await recordPayment(id, { amount: amt, payment_method: payMethod, payment_date: payDate, reference_number: payRef, notes: payNotes })
      setShowPayForm(false)
      setPayAmount(''); setPayMethod('check'); setPayDate(new Date().toISOString().slice(0, 10)); setPayRef(''); setPayNotes('')
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleMarkPaidInFull() {
    setActionSaving(true); setActionError(null)
    try { await markPaidInFull(id); await refetch() }
    catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleDeletePayment(paymentId) {
    if (!window.confirm(t('invoices:detail.confirmRemovePayment'))) return
    setActionSaving(true); setActionError(null)
    try { await deletePayment(paymentId, id); await refetch() }
    catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleMarkVoid() {
    if (!voidReason.trim()) { setActionError(t('invoices:detail.errorNoVoidReason')); return }
    setActionSaving(true); setActionError(null)
    try { await markVoid(id, voidReason); setShowVoidForm(false); await refetch() }
    catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleReopen() {
    setActionSaving(true); setActionError(null)
    try { await reopenInvoice(id); await refetch() }
    catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleDelete() {
    if (!window.confirm(t('invoices:detail.confirmDelete'))) return
    try { await deleteInvoice(id); navigate('/invoices') }
    catch (err) { alert(t('invoices:detail.deleteFailed', { message: err.message })) }
  }

  if (loading) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('common:misc.loading')}</p></main></div>
  if (error || !invoice) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('invoices:detail.notFound')}</p></main></div>

  const status = invoice.status
  const overdue = isOverdue(invoice)
  const total = Number(invoice.total) || 0
  const paidAmount = Number(invoice.paid_amount) || 0
  const balanceDue = Math.max(0, total - paidAmount)
  const isVoid = status === 'void'
  const canRecordPayment = !isVoid && balanceDue > 0

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <BackLink to="/invoices" label={t('invoices:nav.invoices')} />

        <div className={styles.topRow}>
          <div>
            <div className={styles.numberRow}>
              <h1 className={styles.number}>{invoice.invoice_number}</h1>
              {(() => {
                const p = statusPillProps(status, overdue)
                return (
                  <span style={{ padding: '4px 12px', borderRadius: 9999, background: p.bg, color: p.color, fontWeight: 700, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', textDecoration: p.strike ? 'line-through' : undefined }}>{t(p.label)}</span>
                )
              })()}
            </div>
            {invoice.title && <div className={styles.invTitle}>{invoice.title}</div>}
            <div className={styles.dates}>
              <span>{t('invoices:detail.issued', { date: fmtDate(invoice.created_at) })}</span>
              {invoice.due_date && <span> &middot; {t('invoices:detail.due', { date: fmtDate(invoice.due_date) })}</span>}
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.toolBtn} onClick={handleDownloadPDF} disabled={pdfLoading}>
              <Download size={15} /> {pdfLoading ? '…' : t('invoices:detail.pdf')}
            </button>
            {sendSuccess && <span style={{ color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>{t('invoices:detail.sentConfirm')}</span>}
            {status === 'draft' && (
              <>
                <button className={styles.toolBtn} onClick={() => navigate(`/invoices/new?edit=${id}`)}>
                  <Edit size={15} /> {t('common:action.edit')}
                </button>
                <button className={styles.actionBtn} onClick={handleSendInvoice} disabled={actionSaving}>
                  <Send size={15} /> {actionSaving ? t('invoices:detail.sending') : t('invoices:detail.sendInvoice')}
                </button>
                <button className={styles.dangerBtn} onClick={handleDelete}><Trash2 size={15} /> {t('common:action.delete')}</button>
              </>
            )}
            {(status === 'sent' || status === 'viewed' || status === 'partial') && (
              <>
                <button className={styles.toolBtn} onClick={handleSendInvoice} disabled={actionSaving}>
                  <Send size={15} /> {actionSaving ? t('invoices:detail.sending') : t('invoices:detail.resend')}
                </button>
                {canRecordPayment && (
                  <button className={styles.actionBtn} onClick={handleMarkPaidInFull} disabled={actionSaving}>
                    <CheckCircle size={15} /> {t('invoices:detail.markPaidInFull')}
                  </button>
                )}
                <button className={styles.dangerBtn} onClick={() => setShowVoidForm(true)}>
                  <XCircle size={15} /> {t('invoices:detail.void')}
                </button>
              </>
            )}
            {isVoid && (
              <button className={styles.toolBtn} onClick={handleReopen} disabled={actionSaving}>
                <RotateCcw size={15} /> {t('invoices:detail.reopen')}
              </button>
            )}
          </div>
        </div>

        {actionError && <div className={styles.errorBanner}>{actionError}</div>}

        {/* Line items */}
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>{t('invoices:lineItems.sectionLabel')}</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('invoices:lineItems.description')}</th>
                <th className={styles.th}>{t('invoices:lineItems.category')}</th>
                <th className={styles.thR}>{t('invoices:lineItems.qty')}</th>
                <th className={styles.thC}>{t('invoices:lineItems.unit')}</th>
                <th className={styles.thR}>{t('invoices:lineItems.rate')}</th>
                <th className={styles.thR}>{t('invoices:lineItems.total')}</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(li => (
                <tr key={li.id}>
                  <td className={styles.td}>{li.description}</td>
                  <td className={styles.td}>{li.category_name || '—'}</td>
                  <td className={styles.tdR}>{Number(li.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td className={styles.tdC}>{UNIT_LABELS[li.unit] ? t(UNIT_LABELS[li.unit]) : li.unit}</td>
                  <td className={styles.tdR}>{fmtMoney(li.unit_rate)}</td>
                  <td className={styles.tdR}>{fmtMoney(li.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals + Balance */}
        <div className={styles.totals}>
          <div className={styles.totalRow}><span>{t('invoices:totals.subtotal')}</span><span>{fmtMoney(invoice.subtotal)}</span></div>
          {Number(invoice.adjustment_amount) !== 0 && (
            <div className={styles.totalRow}><span>{invoice.adjustment_label || t('invoices:totals.adjustment')}</span><span>{fmtMoney(invoice.adjustment_amount)}</span></div>
          )}
          <div className={styles.totalRowGrand}><span>{t('invoices:totals.total')}</span><span>{fmtMoney(total)}</span></div>
          {paidAmount > 0 && (
            <div className={styles.totalRow}><span>{t('invoices:totals.paymentsReceived')}</span><span style={{ color: 'var(--color-success)' }}>−{fmtMoney(paidAmount)}</span></div>
          )}
          {balanceDue > 0 ? (
            <div className={styles.totalRowPaidState}><span>{t('invoices:totals.balanceDue')}</span><span style={{ color: 'var(--color-danger)' }}>{fmtMoney(balanceDue)}</span></div>
          ) : total > 0 && status !== 'draft' ? (
            <div className={styles.totalRowPaidState}><span style={{ color: 'var(--color-success)' }}>{t('common:invoiceStatus.paid')}</span><span style={{ color: 'var(--color-success)' }}>{fmtMoney(0)}</span></div>
          ) : null}
        </div>

        {/* Notes + Terms */}
        {invoice.notes && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('invoices:detail.notesLabel')}</h3>
            <p className={styles.bodyText}>{invoice.notes}</p>
          </div>
        )}
        {invoice.terms && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('invoices:detail.termsLabel')}</h3>
            <p className={styles.bodyText}>{invoice.terms}</p>
          </div>
        )}

        {/* Payments section */}
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>{t('invoices:detail.payments')}</h3>
          {payments.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>{t('invoices:detail.noPayments')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payments.map(pmt => (
                <div key={pmt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--color-surface)', borderLeft: '3px solid var(--color-success)', borderRadius: 'var(--radius-md)', fontSize: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtMoney(pmt.amount)}</span>
                      {pmt.payment_method && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{pmt.payment_method}</span>}
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmtDateShort(pmt.payment_date)}</span>
                    </div>
                    {(pmt.reference_number || pmt.notes) && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        {pmt.reference_number && <span>{t('invoices:detail.ref', { ref: pmt.reference_number })}</span>}
                        {pmt.reference_number && pmt.notes && <span> · </span>}
                        {pmt.notes && <span>{pmt.notes}</span>}
                      </div>
                    )}
                  </div>
                  {!isVoid && (
                    <button
                      onClick={() => handleDeletePayment(pmt.id)}
                      disabled={actionSaving}
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, padding: '4px 8px', opacity: 0.6, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                      title={t('invoices:detail.removePayment')}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Record a payment button */}
          {canRecordPayment && !showPayForm && (
            <button
              className={styles.toolBtn}
              style={{ marginTop: 12 }}
              onClick={() => { setPayAmount(String(balanceDue.toFixed(2))); setShowPayForm(true) }}
            >
              {t('invoices:detail.recordPayment')}
            </button>
          )}
          {isVoid && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: '12px 0 0' }}>{t('invoices:detail.reopenToRecord')}</p>
          )}
        </div>

        {/* Void reason */}
        {invoice.void_reason && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('invoices:detail.voidReasonLabel')}</h3>
            <p className={styles.bodyText}>{invoice.void_reason}</p>
          </div>
        )}

        {/* Record Payment inline form */}
        {showPayForm && (
          <div className={styles.inlineForm}>
            <h3 className={styles.formTitle}>{t('invoices:detail.recordPayment')}</h3>
            <div className={styles.formRow}>
              <label className={styles.formField}>
                <span>{t('invoices:detail.amountLabel')}</span>
                <input type="number" className={styles.formInput} value={payAmount} onChange={e => setPayAmount(e.target.value)} step="0.01" min="0.01" />
              </label>
              <label className={styles.formField}>
                <span>{t('invoices:detail.methodLabel')}</span>
                <select className={styles.formSelect} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
                </select>
              </label>
              <label className={styles.formField}>
                <span>{t('invoices:detail.dateLabel')}</span>
                <input type="date" className={styles.formInput} value={payDate} onChange={e => setPayDate(e.target.value)} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formField}>
                <span>{t('invoices:detail.referenceOptional')}</span>
                <input type="text" className={styles.formInput} value={payRef} onChange={e => setPayRef(e.target.value)} placeholder={t('invoices:detail.referencePlaceholder')} />
              </label>
              <label className={styles.formField}>
                <span>{t('invoices:detail.notesOptional')}</span>
                <input type="text" className={styles.formInput} value={payNotes} onChange={e => setPayNotes(e.target.value)} />
              </label>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowPayForm(false)}>{t('common:action.cancel')}</button>
              <button className={styles.confirmBtn} onClick={handleRecordPayment} disabled={actionSaving}>{actionSaving ? t('invoices:detail.saving') : t('invoices:detail.savePayment')}</button>
            </div>
          </div>
        )}

        {/* Void inline form */}
        {showVoidForm && (
          <div className={styles.inlineForm}>
            <h3 className={styles.formTitle}>{t('invoices:detail.voidInvoice')}</h3>
            <label className={styles.formField}>
              <span>{t('invoices:detail.reasonRequired')}</span>
              <textarea className={styles.formTextarea} value={voidReason} onChange={e => setVoidReason(e.target.value)} rows={2} placeholder={t('invoices:detail.voidReasonPlaceholder')} />
            </label>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowVoidForm(false)}>{t('common:action.cancel')}</button>
              <button className={styles.dangerConfirmBtn} onClick={handleMarkVoid} disabled={actionSaving}>{actionSaving ? t('invoices:detail.saving') : t('invoices:detail.confirmVoid')}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
