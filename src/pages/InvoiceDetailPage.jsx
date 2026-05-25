import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Download, Send, CheckCircle, XCircle, Edit, Trash2 } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import InvoiceStatusBadge from '../components/invoices/InvoiceStatusBadge'
import { useInvoice, useInvoiceMutations, isOverdue } from '../hooks/useInvoices'
import { generateInvoicePDF } from '../lib/generateInvoicePDF'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './InvoiceDetailPage.module.css'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
]

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { company } = useAuth()
  const { invoice, lineItems, loading, error, refetch } = useInvoice(id)
  const { markSent, markPaid, markVoid, deleteInvoice } = useInvoiceMutations()

  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('check')
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

    let companyData = { name: company?.name, primary_color: company?.primary_color }
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

  async function handleMarkPaid() {
    setActionSaving(true); setActionError(null)
    try {
      await markPaid(id, { paid_amount: payAmount || invoice.total, payment_method: payMethod, payment_notes: payNotes })
      setShowPayForm(false)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleMarkVoid() {
    if (!voidReason.trim()) { setActionError('Void reason is required.'); return }
    setActionSaving(true); setActionError(null)
    try { await markVoid(id, voidReason); setShowVoidForm(false); await refetch() }
    catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this draft invoice?')) return
    try { await deleteInvoice(id); navigate('/invoices') }
    catch (err) { alert('Failed: ' + err.message) }
  }

  if (loading) return <div className={styles.page}><AppHeader /><main className={styles.main}><p className={styles.loading}>Loading…</p></main></div>
  if (error || !invoice) return <div className={styles.page}><AppHeader /><main className={styles.main}><p className={styles.loading}>Invoice not found.</p></main></div>

  const status = invoice.status
  const overdue = isOverdue(invoice)

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <BackLink to="/invoices" label="Invoices" />

        <div className={styles.topRow}>
          <div>
            <div className={styles.numberRow}>
              <h1 className={styles.number}>{invoice.invoice_number}</h1>
              <InvoiceStatusBadge status={status} isOverdue={overdue} />
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
            {sendSuccess && <span style={{ color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>Sent — good boy!</span>}
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
            {(status === 'sent' || status === 'viewed') && (
              <>
                <button className={styles.toolBtn} onClick={handleSendInvoice} disabled={actionSaving}>
                  <Send size={15} /> {actionSaving ? 'Sending…' : 'Resend'}
                </button>
                <button className={styles.actionBtn} onClick={() => { setShowPayForm(true); setPayAmount(String(invoice.total)) }} disabled={actionSaving}>
                  <CheckCircle size={15} /> Mark Paid
                </button>
                <button className={styles.dangerBtn} onClick={() => setShowVoidForm(true)}>
                  <XCircle size={15} /> Void
                </button>
              </>
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

        {/* Totals */}
        <div className={styles.totals}>
          <div className={styles.totalRow}><span>Subtotal</span><span>{fmtMoney(invoice.subtotal)}</span></div>
          {Number(invoice.adjustment_amount) !== 0 && (
            <div className={styles.totalRow}><span>{invoice.adjustment_label || 'Adjustment'}</span><span>{fmtMoney(invoice.adjustment_amount)}</span></div>
          )}
          <div className={styles.totalRowGrand}><span>Total</span><span>{fmtMoney(invoice.total)}</span></div>
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

        {/* Payment details */}
        {invoice.paid_at && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>Payment Received</h3>
            <div className={styles.paymentDetails}>
              <div><strong>Date:</strong> {fmtDate(invoice.paid_at)}</div>
              <div><strong>Amount:</strong> {fmtMoney(invoice.paid_amount)}</div>
              {invoice.payment_method && <div><strong>Method:</strong> {invoice.payment_method.replace(/_/g, ' ')}</div>}
              {invoice.payment_notes && <div><strong>Notes:</strong> {invoice.payment_notes}</div>}
            </div>
          </div>
        )}

        {/* Void reason */}
        {invoice.void_reason && (
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>Void Reason</h3>
            <p className={styles.bodyText}>{invoice.void_reason}</p>
          </div>
        )}

        {/* Mark Paid inline form */}
        {showPayForm && (
          <div className={styles.inlineForm}>
            <h3 className={styles.formTitle}>Record Payment</h3>
            <div className={styles.formRow}>
              <label className={styles.formField}>
                <span>Amount</span>
                <input type="number" className={styles.formInput} value={payAmount} onChange={e => setPayAmount(e.target.value)} step="0.01" />
              </label>
              <label className={styles.formField}>
                <span>Method</span>
                <select className={styles.formSelect} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <label className={styles.formField}>
              <span>Notes (optional)</span>
              <textarea className={styles.formTextarea} value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2} />
            </label>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowPayForm(false)}>Cancel</button>
              <button className={styles.confirmBtn} onClick={handleMarkPaid} disabled={actionSaving}>{actionSaving ? 'Saving…' : 'Confirm Payment'}</button>
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
