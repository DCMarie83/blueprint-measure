import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Download, Send, CheckCircle, XCircle, Edit, Trash2, RotateCcw } from 'lucide-react'
import BackLink from '../components/BackLink'
import { useInvoice, useInvoiceMutations, isOverdue } from '../hooks/useInvoices'
import { generateInvoicePDF } from '../lib/generateInvoicePDF'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './InvoiceDetailPage.module.css'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH' },
  { value: 'card', label: 'Card' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'other', label: 'Other' },
]

// Local status pill for the detail-page header. Mirrors the shared
// InvoiceStatusBadge status-color semantics (STATUS_MAP + its module.css) so the
// shared component — still used by the portal and Lite — stays untouched.
const STATUS_PILL = {
  draft:   { label: 'Draft',          bg: 'var(--color-neutral-bg)',   color: 'var(--color-neutral)' },
  sent:    { label: 'Sent',           bg: 'var(--color-warning-bg)',   color: 'var(--color-warning)' },
  viewed:  { label: 'Viewed',         bg: 'var(--color-info-bg)',      color: 'var(--color-info)' },
  partial: { label: 'Partially paid', bg: 'rgba(245, 158, 11, 0.12)',  color: '#d97706' },
  paid:    { label: 'Paid in full',   bg: 'rgba(74,222,128,0.14)',     color: 'var(--color-success)' },
  void:    { label: 'Void',           bg: 'var(--color-danger-bg)',    color: 'var(--color-danger)', strike: true },
}

function statusPillProps(status, overdue) {
  if (overdue && (status === 'sent' || status === 'partial')) {
    return { label: 'Overdue', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
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
      if (!pdfData) throw new Error('Could not load PDF data')
      const pdfBase64 = generateInvoicePDF({ invoice, lineItems, project: pdfData.project, client: pdfData.client, company: pdfData.company, returnAs: 'base64' })
      const { error: fnErr } = await supabase.functions.invoke('send-invoice-email', {
        body: { invoice_id: id, pdf_base64: pdfBase64 },
      })
      if (fnErr) throw new Error(fnErr.message || 'Send failed')
      setSendSuccess(true)
      setTimeout(() => setSendSuccess(false), 3000)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleRecordPayment() {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) { setActionError('Enter a payment amount.'); return }
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
    if (!window.confirm('Remove this payment?')) return
    setActionSaving(true); setActionError(null)
    try { await deletePayment(paymentId, id); await refetch() }
    catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleMarkVoid() {
    if (!voidReason.trim()) { setActionError('Void reason is required.'); return }
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
    if (!window.confirm('Delete this draft invoice?')) return
    try { await deleteInvoice(id); navigate('/invoices') }
    catch (err) { alert('Failed: ' + err.message) }
  }

  if (loading) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>Loading…</p></main></div>
  if (error || !invoice) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>Invoice not found.</p></main></div>

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
        <BackLink to="/invoices" label="Invoices" />

        <div className={styles.topRow}>
          <div>
            <div className={styles.numberRow}>
              <h1 className={styles.number}>{invoice.invoice_number}</h1>
              {(() => {
                const p = statusPillProps(status, overdue)
                return (
                  <span style={{ padding: '4px 12px', borderRadius: 9999, background: p.bg, color: p.color, fontWeight: 700, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', textDecoration: p.strike ? 'line-through' : undefined }}>{p.label}</span>
                )
              })()}
            </div>
            {invoice.title && <div className={styles.invTitle}>{invoice.title}</div>}
            <div className={styles.dates}>
              <span>Issued {fmtDate(invoice.created_at)}</span>
              {invoice.due_date && <span> &middot; Due {fmtDate(invoice.due_date)}</span>}
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.toolBtn} onClick={handleDownloadPDF} disabled={pdfLoading}>
              <Download size={15} /> {pdfLoading ? '…' : 'PDF'}
            </button>
            {sendSuccess && <span style={{ color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>Sent!</span>}
            {status === 'draft' && (
              <>
                <button className={styles.toolBtn} onClick={() => navigate(`/invoices/new?edit=${id}`)}>
                  <Edit size={15} /> Edit
                </button>
                <button className={styles.actionBtn} onClick={handleSendInvoice} disabled={actionSaving}>
                  <Send size={15} /> {actionSaving ? 'Sending…' : 'Send Invoice'}
                </button>
                <button className={styles.dangerBtn} onClick={handleDelete}><Trash2 size={15} /> Delete</button>
              </>
            )}
            {(status === 'sent' || status === 'viewed' || status === 'partial') && (
              <>
                <button className={styles.toolBtn} onClick={handleSendInvoice} disabled={actionSaving}>
                  <Send size={15} /> {actionSaving ? 'Sending…' : 'Resend'}
                </button>
                {canRecordPayment && (
                  <button className={styles.actionBtn} onClick={handleMarkPaidInFull} disabled={actionSaving}>
                    <CheckCircle size={15} /> Mark paid in full
                  </button>
                )}
                <button className={styles.dangerBtn} onClick={() => setShowVoidForm(true)}>
                  <XCircle size={15} /> Void
                </button>
              </>
            )}
            {isVoid && (
              <button className={styles.toolBtn} onClick={handleReopen} disabled={actionSaving}>
                <RotateCcw size={15} /> Reopen invoice
              </button>
            )}
          </div>
        </div>

        {actionError && <div className={styles.errorBanner}>{actionError}</div>}

        {/* Line items */}
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>Line Items</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Description</th>
                <th className={styles.th}>Category</th>
                <th className={styles.thR}>Qty</th>
                <th className={styles.thC}>Unit</th>
                <th className={styles.thR}>Rate</th>
                <th className={styles.thR}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(li => (
                <tr key={li.id}>
                  <td className={styles.td}>{li.description}</td>
                  <td className={styles.td}>{li.category_name || '—'}</td>
                  <td className={styles.tdR}>{Number(li.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td className={styles.tdC}>{UNIT_LABELS[li.unit] || li.unit}</td>
                  <td className={styles.tdR}>{fmtMoney(li.unit_rate)}</td>
                  <td className={styles.tdR}>{fmtMoney(li.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals + Balance */}
        <div className={styles.totals}>
          <div className={styles.totalRow}><span>Subtotal</span><span>{fmtMoney(invoice.subtotal)}</span></div>
          {Number(invoice.adjustment_amount) !== 0 && (
            <div className={styles.totalRow}><span>{invoice.adjustment_label || 'Adjustment'}</span><span>{fmtMoney(invoice.adjustment_amount)}</span></div>
          )}
          <div className={styles.totalRowGrand}><span>Total</span><span>{fmtMoney(total)}</span></div>
          {paidAmount > 0 && (
            <div className={styles.totalRow}><span>Payments received</span><span style={{ color: 'var(--color-success)' }}>−{fmtMoney(paidAmount)}</span></div>
          )}
          {balanceDue > 0 ? (
            <div className={styles.totalRowPaidState}><span>Balance due</span><span style={{ color: 'var(--color-danger)' }}>{fmtMoney(balanceDue)}</span></div>
          ) : total > 0 && status !== 'draft' ? (
            <div className={styles.totalRowPaidState}><span style={{ color: 'var(--color-success)' }}>Paid in full</span><span style={{ color: 'var(--color-success)' }}>{fmtMoney(0)}</span></div>
          ) : null}
        </div>

        {/* Notes + Terms */}
        {invoice.notes && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>Notes</h3>
            <p className={styles.bodyText}>{invoice.notes}</p>
          </div>
        )}
        {invoice.terms && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>Terms</h3>
            <p className={styles.bodyText}>{invoice.terms}</p>
          </div>
        )}

        {/* Payments section */}
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>Payments</h3>
          {payments.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No payments recorded yet.</p>
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
                        {pmt.reference_number && <span>Ref: {pmt.reference_number}</span>}
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
                      title="Remove payment"
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
              Record a payment
            </button>
          )}
          {isVoid && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: '12px 0 0' }}>Reopen this invoice to record payments.</p>
          )}
        </div>

        {/* Void reason */}
        {invoice.void_reason && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>Void Reason</h3>
            <p className={styles.bodyText}>{invoice.void_reason}</p>
          </div>
        )}

        {/* Record Payment inline form */}
        {showPayForm && (
          <div className={styles.inlineForm}>
            <h3 className={styles.formTitle}>Record a payment</h3>
            <div className={styles.formRow}>
              <label className={styles.formField}>
                <span>Amount</span>
                <input type="number" className={styles.formInput} value={payAmount} onChange={e => setPayAmount(e.target.value)} step="0.01" min="0.01" />
              </label>
              <label className={styles.formField}>
                <span>Method</span>
                <select className={styles.formSelect} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className={styles.formField}>
                <span>Date</span>
                <input type="date" className={styles.formInput} value={payDate} onChange={e => setPayDate(e.target.value)} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formField}>
                <span>Reference (optional)</span>
                <input type="text" className={styles.formInput} value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Check #, transaction ID" />
              </label>
              <label className={styles.formField}>
                <span>Notes (optional)</span>
                <input type="text" className={styles.formInput} value={payNotes} onChange={e => setPayNotes(e.target.value)} />
              </label>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowPayForm(false)}>Cancel</button>
              <button className={styles.confirmBtn} onClick={handleRecordPayment} disabled={actionSaving}>{actionSaving ? 'Saving…' : 'Save payment'}</button>
            </div>
          </div>
        )}

        {/* Void inline form */}
        {showVoidForm && (
          <div className={styles.inlineForm}>
            <h3 className={styles.formTitle}>Void Invoice</h3>
            <label className={styles.formField}>
              <span>Reason (required)</span>
              <textarea className={styles.formTextarea} value={voidReason} onChange={e => setVoidReason(e.target.value)} rows={2} placeholder="Why is this invoice being voided?" />
            </label>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowVoidForm(false)}>Cancel</button>
              <button className={styles.dangerConfirmBtn} onClick={handleMarkVoid} disabled={actionSaving}>{actionSaving ? 'Saving…' : 'Confirm Void'}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
