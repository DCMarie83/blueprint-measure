import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Download, Send, CheckCircle, XCircle, Edit, Trash2, RotateCcw, Pencil } from 'lucide-react'
import BackLink from '../components/BackLink'
import DocumentsSection from '../components/documents/DocumentsSection'
import { useLinkedDocuments } from '../hooks/useLinkedDocuments'
import { useInvoice, useInvoiceMutations, isOverdue } from '../hooks/useInvoices'
import { generateInvoicePDF } from '../lib/generateInvoicePDF'
import { generateReceiptPDF } from '../lib/generateReceiptPDF'
import { loadLogo } from '../lib/logoImage'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { mergeInstructionDefaults } from '../hooks/usePaymentInstructions'
import { useSignedQrUrls } from '../hooks/useSignedQrUrls'
import PaymentInstructionsBlock from '../components/invoices/PaymentInstructionsBlock'
import ChangeClientDialog from '../components/clients/ChangeClientDialog'
import { fetchQrDataUrls } from '../lib/qrData'
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
  if (overdue && (status === 'sent' || status === 'viewed' || status === 'partial')) {
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
  const { company, userProfile, isSuperAdmin } = useAuth()
  const { company: effectiveCompany, companyId: effectiveCompanyId } = useEffectiveCompany()
  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'
  const { invoice, lineItems, payments, loading, error, refetch } = useInvoice(id)
  // Lane V: current job context + dialog state for "Change client".
  const [reassignProject, setReassignProject] = useState(null)
  const [showChangeClient, setShowChangeClient] = useState(false)
  // On-screen payment options: the same block the client sees.
  const paymentInstructions = mergeInstructionDefaults(effectiveCompany?.payment_instructions)
  const qrUrls = useSignedQrUrls(paymentInstructions)
  const { documents, refetch: refetchDocuments } = useLinkedDocuments('invoice', id)
  const { markSent, markPaidInFull, markVoid, reopenInvoice, recordPayment, updatePayment, deletePayment, transferPayment, deleteInvoice, updateInvoiceNumber } = useInvoiceMutations()

  // apply_invoice_payment error codes → plain messages; anything unmapped
  // falls back to the raw message (the lifecycle trigger speaks plain English).
  function paymentErrorMessage(err) {
    const known = ['draft_invoice', 'void_invoice', 'bad_amount', 'payment_not_found', 'not_found', 'forbidden', 'bad_target', 'target_status', 'different_client', 'bad_action']
    if (err?.code && known.includes(err.code)) return t(`invoices:rpcErrors.${err.code}`)
    return err?.message || String(err)
  }

  // G77: inline payment edit state
  const [editingPaymentId, setEditingPaymentId] = useState(null)
  const [editPay, setEditPay] = useState({ amount: '', method: 'check', date: '', ref: '', notes: '' })

  // G60: number edit state
  const [editingNumber, setEditingNumber] = useState(false)
  const [numberValue, setNumberValue] = useState('')
  const [numberError, setNumberError] = useState(null)
  const [numberSaving, setNumberSaving] = useState(false)

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

  // Lane F: reminders and receipts
  const [reminderModal, setReminderModal] = useState(null) // 'reminder' | 'receipt' | null
  const [reminderRecipients, setReminderRecipients] = useState(null) // null = loading
  const [attachPdf, setAttachPdf] = useState(true)
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderNotice, setReminderNotice] = useState(null)
  const [reminderHistory, setReminderHistory] = useState([])
  const [verifySaving, setVerifySaving] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    supabase.from('invoice_reminders')
      .select('id, kind, step, status, created_at, sent_at')
      .eq('invoice_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setReminderHistory(data ?? []) })
    return () => { cancelled = true }
  }, [id, reminderNotice])

  async function openReminderModal(kind) {
    setReminderModal(kind)
    setAttachPdf(true)
    setReminderRecipients(null)
    setReminderNotice(null)
    let clientId = invoice.client_id ?? null
    if (!clientId && invoice.project_id) {
      const { data: proj } = await supabase.from('projects').select('client_id').eq('id', invoice.project_id).maybeSingle()
      clientId = proj?.client_id ?? null
    }
    if (!clientId) { setReminderRecipients([]); return }
    const { data: cli } = await supabase.from('clients')
      .select('primary_email, client_contacts(email, is_portal_recipient)')
      .eq('id', clientId).maybeSingle()
    const flagged = (cli?.client_contacts ?? []).filter(c => c.is_portal_recipient && c.email).map(c => c.email)
    setReminderRecipients(Array.from(new Set([...flagged, ...(cli?.primary_email ? [cli.primary_email] : [])])))
  }

  async function handleSendReminderOrReceipt() {
    if (!reminderModal) return
    setReminderSending(true)
    setActionError(null)
    try {
      let pdfBase64 = null
      if (attachPdf) {
        const data = await fetchPdfData()
        if (reminderModal === 'receipt') {
          pdfBase64 = generateReceiptPDF({ invoice, payments, project: data?.project, client: data?.client, company: data?.company, returnAs: 'base64' })
        } else {
          pdfBase64 = generateInvoicePDF({ invoice, lineItems, payments, project: data?.project, client: data?.client, company: data?.company, qrImages: data?.qrImages, returnAs: 'base64' })
        }
      }
      const { data: result, error: fnErr } = await supabase.functions.invoke('send-invoice-reminder', {
        body: { invoice_id: id, kind: reminderModal, pdf_base64: pdfBase64 },
      })
      if (fnErr) {
        let msg = fnErr.message
        try { const b = await fnErr.context?.json(); if (b?.error) msg = b.error } catch { /* generic */ }
        throw new Error(msg)
      }
      if (result?.error) throw new Error(result.error)
      setReminderModal(null)
      setReminderNotice(reminderModal === 'receipt' ? t('invoices:reminders.receiptSent') : t('invoices:reminders.reminderSent'))
      await refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setReminderSending(false)
    }
  }

  async function handleReceiptDownload() {
    setPdfLoading(true)
    try {
      const data = await fetchPdfData()
      const pdf = generateReceiptPDF({ invoice, payments, project: data?.project, client: data?.client, company: data?.company, returnAs: 'blob' })
      const url = URL.createObjectURL(pdf)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt-${invoice.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally { setPdfLoading(false) }
  }

  async function handleMarkVerified() {
    setVerifySaving(true)
    try {
      const { error: err } = await supabase.from('invoices')
        .update({ reminders_verified_at: new Date().toISOString() }).eq('id', id)
      if (err) throw new Error(err.message)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setVerifySaving(false) }
  }

  // I5: mark-sent modal (manual delivery; email goes through the send button)
  const [showMarkSent, setShowMarkSent] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState('handed_over')

  // I6: transfer a payment to another invoice of the same client
  const [transferringPaymentId, setTransferringPaymentId] = useState(null)
  const [transferTargets, setTransferTargets] = useState(null) // null = loading
  const [transferTargetId, setTransferTargetId] = useState('')

  // For PDF: fetch project + client + company data
  const [pdfLoading, setPdfLoading] = useState(false)

  // Bank-details reveals for this invoice (client_activity, matched on the
  // invoice number the RPC stamps as metadata.ref).
  const [bankViews, setBankViews] = useState(0)
  useEffect(() => {
    if (!invoice?.invoice_number) { setBankViews(0); return }
    let cancelled = false
    supabase.from('client_activity')
      .select('id', { count: 'exact', head: true })
      .eq('activity_type', 'bank_details_viewed')
      .eq('metadata->>ref', invoice.invoice_number)
      .then(({ count }) => { if (!cancelled) setBankViews(count ?? 0) })
    return () => { cancelled = true }
  }, [invoice?.invoice_number])

  // Completion notice pending on the job: the notice sends with this invoice.
  const [noticePending, setNoticePending] = useState(false)
  useEffect(() => {
    if (!invoice?.project_id) { setNoticePending(false); return }
    let cancelled = false
    supabase.from('projects').select('completion_notice_pending').eq('id', invoice.project_id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setNoticePending(!!data?.completion_notice_pending) })
    return () => { cancelled = true }
  }, [invoice?.project_id])

  useEffect(() => {
    if (!invoice?.project_id) { setReassignProject(null); return }
    let cancelled = false
    supabase.from('projects').select('id, name, address, client_id').eq('id', invoice.project_id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setReassignProject(data ?? null) })
    return () => { cancelled = true }
  }, [invoice?.project_id, invoice?.client_id])

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
    companyData.logo = await loadLogo(company?.logo_url)
    const qrImages = await fetchQrDataUrls(companyData.payment_instructions)
    return { project: proj, client: cli, company: companyData, qrImages }
  }

  async function handleDownloadPDF() {
    setPdfLoading(true)
    try {
      const data = await fetchPdfData()
      if (!data) return
      const pdf = generateInvoicePDF({ invoice, lineItems, payments, project: data.project, client: data.client, company: data.company, qrImages: data.qrImages, returnAs: 'blob' })
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
      const pdfBase64 = generateInvoicePDF({ invoice, lineItems, payments, project: pdfData.project, client: pdfData.client, company: pdfData.company, qrImages: pdfData.qrImages, returnAs: 'base64' })
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
    } catch (err) { setActionError(paymentErrorMessage(err)) }
    finally { setActionSaving(false) }
  }

  async function handleMarkPaidInFull() {
    setActionSaving(true); setActionError(null)
    try { await markPaidInFull(id); await refetch() }
    catch (err) { setActionError(paymentErrorMessage(err)) }
    finally { setActionSaving(false) }
  }

  function startEditPayment(pmt) {
    setActionError(null)
    setEditingPaymentId(pmt.id)
    setEditPay({
      amount: String(pmt.amount ?? ''),
      method: pmt.payment_method || 'check',
      date: pmt.payment_date || new Date().toISOString().slice(0, 10),
      ref: pmt.reference_number || '',
      notes: pmt.notes || '',
    })
  }

  // G77: validation mirrors recordPayment exactly (amount greater than zero;
  // recordPayment has no remaining-balance cap, so neither does the edit).
  async function handleSavePaymentEdit() {
    const amt = Number(editPay.amount)
    if (!amt || amt <= 0) { setActionError(t('invoices:detail.errorNoAmount')); return }
    setActionSaving(true); setActionError(null)
    try {
      await updatePayment(editingPaymentId, id, {
        amount: amt,
        payment_method: editPay.method,
        payment_date: editPay.date,
        reference_number: editPay.ref,
        notes: editPay.notes,
      })
      setEditingPaymentId(null)
      await refetch()
    } catch (err) { setActionError(paymentErrorMessage(err)) }
    finally { setActionSaving(false) }
  }

  function editPayKeys(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleSavePaymentEdit() }
    if (e.key === 'Escape') setEditingPaymentId(null)
  }

  async function handleDeletePayment(paymentId) {
    if (!window.confirm(t('invoices:detail.confirmRemovePayment'))) return
    setActionSaving(true); setActionError(null)
    try { await deletePayment(paymentId, id); await refetch() }
    catch (err) { setActionError(paymentErrorMessage(err)) }
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
    setActionError(null)
    // The lifecycle guard blocks deleting a non-draft; its message shows inline.
    try { await deleteInvoice(id); navigate('/invoices') }
    catch (err) { setActionError(err.message) }
  }

  // I5: manual mark-sent with a delivery method. Email is the send button.
  async function handleMarkSent() {
    setActionSaving(true); setActionError(null)
    try {
      await markSent(id, deliveryMethod)
      setShowMarkSent(false)
      await refetch()
    } catch (err) { setActionError(err.message) }
    finally { setActionSaving(false) }
  }

  // I6: transfer a payment to another invoice of the same client.
  async function openTransfer(paymentId) {
    setActionError(null)
    setTransferringPaymentId(paymentId)
    setTransferTargetId('')
    setTransferTargets(null)
    let myClient = invoice.client_id ?? null
    if (!myClient && invoice.project_id) {
      const { data: proj } = await supabase.from('projects').select('client_id').eq('id', invoice.project_id).single()
      myClient = proj?.client_id ?? null
    }
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, status, client_id, projects(client_id)')
      .eq('company_id', invoice.company_id)
      .not('status', 'in', '(draft,void)')
      .neq('id', id)
      .order('created_at', { ascending: false })
    const targets = (data ?? []).filter(inv => {
      const invClient = inv.client_id ?? inv.projects?.client_id ?? null
      return invClient != null && invClient === myClient
    })
    setTransferTargets(targets)
  }

  async function handleTransfer() {
    if (!transferTargetId) return
    setActionSaving(true); setActionError(null)
    try {
      await transferPayment(transferringPaymentId, id, transferTargetId)
      setTransferringPaymentId(null)
      await refetch()
    } catch (err) { setActionError(paymentErrorMessage(err)) }
    finally { setActionSaving(false) }
  }

  // G60: save the edited number; a 23505 collision surfaces inline.
  async function handleSaveNumber() {
    const trimmed = numberValue.trim()
    if (!trimmed) { setNumberError(t('invoices:detail.errorNumberEmpty')); return }
    if (trimmed === invoice.invoice_number) { setEditingNumber(false); setNumberError(null); return }
    setNumberSaving(true); setNumberError(null)
    try {
      await updateInvoiceNumber(id, trimmed)
      setEditingNumber(false)
      await refetch()
    } catch (err) {
      if (err.code === '23505') setNumberError(t('invoices:detail.numberConflict', { number: trimmed }))
      else setNumberError(err.message)
    } finally {
      setNumberSaving(false)
    }
  }

  if (loading) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('common:misc.loading')}</p></main></div>
  if (error || !invoice) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('invoices:detail.notFound')}</p></main></div>

  const status = invoice.status
  const overdue = isOverdue(invoice)
  const total = Number(invoice.total) || 0
  const paidAmount = Number(invoice.paid_amount) || 0
  const balanceDue = Math.max(0, total - paidAmount)
  const overpaidBy = Math.round((paidAmount - total) * 100) / 100
  const isVoid = status === 'void'
  const canRecordPayment = !isVoid && balanceDue > 0
  const canEdit = status === 'draft' || status === 'sent' || status === 'viewed' || status === 'partial'
  // I2: delete exists only for drafts with an empty ledger.
  const canDelete = status === 'draft' && payments.length === 0
  // The category column shows only when at least one line has a named section.
  const hasLineSections = lineItems.some(li => (li.category_name || '').trim() !== '')

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <BackLink to="/invoices" label={t('invoices:nav.invoices')} />

        <div className={styles.topRow}>
          <div>
            <div className={styles.numberRow}>
              {editingNumber ? (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={numberValue}
                    onChange={e => setNumberValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveNumber()
                      if (e.key === 'Escape') { setEditingNumber(false); setNumberError(null) }
                    }}
                    style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', padding: '4px 10px', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', minWidth: 160 }}
                  />
                  <button onClick={handleSaveNumber} disabled={numberSaving} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                    {numberSaving ? '…' : t('common:action.save')}
                  </button>
                  <button onClick={() => { setEditingNumber(false); setNumberError(null) }} style={{ fontSize: 12, padding: '6px 10px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                    {t('common:action.cancel')}
                  </button>
                </span>
              ) : (
                <>
                  <h1 className={styles.number}>{invoice.invoice_number}</h1>
                  <button
                    onClick={() => { setNumberValue(invoice.invoice_number); setNumberError(null); setEditingNumber(true) }}
                    title={t('invoices:detail.editNumber')}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2, opacity: 0.7 }}
                  >
                    <Pencil size={15} />
                  </button>
                </>
              )}
              {(() => {
                const p = statusPillProps(status, overdue)
                return (
                  <span style={{ padding: '4px 12px', borderRadius: 9999, background: p.bg, color: p.color, fontWeight: 700, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', textDecoration: p.strike ? 'line-through' : undefined }}>{t(p.label)}</span>
                )
              })()}
              {invoice.estimate_id && invoice.estimates?.estimate_number && (
                <Link
                  to={`/estimates/${invoice.estimates.id}`}
                  style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}
                >
                  {t('invoices:detail.fromQuote', { number: invoice.estimates.estimate_number })}
                </Link>
              )}
              {bankViews > 0 && (
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {t('invoices:detail.bankDetailsViewed', { count: bankViews })}
                </span>
              )}
              {overpaidBy > 0 && (
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-warning, #d97706)', whiteSpace: 'nowrap' }}>
                  {t('invoices:detail.overpaidBy', { amount: fmtMoney(overpaidBy) })}
                </span>
              )}
            </div>
            {numberError && (
              <div style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', margin: '4px 0' }}>{numberError}</div>
            )}
            {invoice.title && <div className={styles.invTitle}>{invoice.title}</div>}
            {status === 'draft' && noticePending && (
              <div style={{ fontSize: 13, color: 'var(--color-warning, #d97706)', fontWeight: 600, margin: '4px 0' }}>{t('invoices:detail.completionNoticePending')}</div>
            )}
            <div className={styles.dates}>
              <span>{t('invoices:detail.issued', { date: fmtDate(invoice.created_at) })}</span>
              {invoice.due_date && <span> &middot; {t('invoices:detail.due', { date: fmtDate(invoice.due_date) })}</span>}
            </div>
          </div>
          <div className={styles.actions}>
            {isAdmin && reassignProject && (
              <button className={styles.toolBtn} onClick={() => setShowChangeClient(true)}>
                {t('clients:reassign.action')}
              </button>
            )}
            <button className={styles.toolBtn} onClick={handleDownloadPDF} disabled={pdfLoading}>
              <Download size={15} /> {pdfLoading ? '…' : t('invoices:detail.pdf')}
            </button>
            {sendSuccess && <span style={{ color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>{t('invoices:detail.sentConfirm')}</span>}
            {canEdit && (
              <button className={styles.toolBtn} onClick={() => navigate(`/invoices/new?edit=${id}`)}>
                <Edit size={15} /> {t('common:action.edit')}
              </button>
            )}
            {status === 'draft' && (
              <>
                <button className={styles.toolBtn} onClick={() => { setDeliveryMethod('handed_over'); setShowMarkSent(true) }} disabled={actionSaving}>
                  <CheckCircle size={15} /> {t('invoices:detail.markSent')}
                </button>
                <button className={styles.actionBtn} onClick={handleSendInvoice} disabled={actionSaving}>
                  <Send size={15} /> {actionSaving ? t('invoices:detail.sending') : t('invoices:detail.sendInvoice')}
                </button>
                {canDelete && (
                  <button className={styles.dangerBtn} onClick={handleDelete}><Trash2 size={15} /> {t('common:action.delete')}</button>
                )}
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
                <button className={styles.toolBtn} onClick={() => openReminderModal('reminder')} disabled={reminderSending}>
                  {t('invoices:reminders.sendReminder')}
                </button>
                <button className={styles.dangerBtn} onClick={() => setShowVoidForm(true)}>
                  <XCircle size={15} /> {t('invoices:detail.void')}
                </button>
              </>
            )}
            {status === 'paid' && (
              <>
                <button className={styles.toolBtn} onClick={() => openReminderModal('receipt')} disabled={reminderSending}>
                  {t('invoices:reminders.sendReceipt')}
                </button>
                <button className={styles.toolBtn} onClick={handleReceiptDownload} disabled={pdfLoading}>
                  <Download size={15} /> {t('invoices:reminders.receiptPdf')}
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

        {invoice.import_source && !invoice.reminders_verified_at && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            <span>{t('invoices:reminders.needsVerification')}</span>
            <button onClick={handleMarkVerified} disabled={verifySaving}
              style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}>
              {verifySaving ? '…' : t('invoices:reminders.markVerified')}
            </button>
          </div>
        )}
        {reminderNotice && (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)', margin: '6px 0' }}>{reminderNotice}</div>
        )}
        {reminderHistory.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
            {reminderHistory.map(r => (
              <span key={r.id} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-pill, 9999px)', border: '1px solid var(--color-border)', color: r.status === 'sent' ? 'var(--color-success)' : r.status === 'failed' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                {t(`invoices:reminders.kind.${r.kind}`)} · {t(`invoices:reminders.step.${r.step}`, { defaultValue: r.step })} · {new Date(r.sent_at || r.created_at).toLocaleDateString()} · {t(`invoices:reminders.status.${r.status}`, { defaultValue: r.status })}
              </span>
            ))}
          </div>
        )}
        {actionError && <div className={styles.errorBanner}>{actionError}</div>}

        {/* Line items */}
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>{t('invoices:lineItems.sectionLabel')}</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('invoices:lineItems.description')}</th>
                {hasLineSections && <th className={styles.th}>{t('invoices:lineItems.category')}</th>}
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
                  {hasLineSections && <td className={styles.td}>{li.category_name || '—'}</td>}
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
                editingPaymentId === pmt.id ? (
                  // G77: inline edit, same fields as the record form. Enter
                  // saves, Escape cancels. Pure data: no send-* call.
                  <div key={pmt.id} style={{ padding: '10px 12px', background: 'var(--color-surface)', borderLeft: '3px solid var(--color-primary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <label className={styles.formField} style={{ width: 110 }}>
                        <span>{t('invoices:detail.amountLabel')}</span>
                        <input type="number" step="0.01" min="0.01" className={styles.formInput} value={editPay.amount} onChange={e => setEditPay(p => ({ ...p, amount: e.target.value }))} onKeyDown={editPayKeys} autoFocus />
                      </label>
                      <label className={styles.formField} style={{ width: 120 }}>
                        <span>{t('invoices:detail.methodLabel')}</span>
                        <select className={styles.formSelect} value={editPay.method} onChange={e => setEditPay(p => ({ ...p, method: e.target.value }))} onKeyDown={editPayKeys}>
                          {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
                        </select>
                      </label>
                      <label className={styles.formField} style={{ width: 150 }}>
                        <span>{t('invoices:detail.dateLabel')}</span>
                        <input type="date" className={styles.formInput} value={editPay.date} onChange={e => setEditPay(p => ({ ...p, date: e.target.value }))} onKeyDown={editPayKeys} />
                      </label>
                      <label className={styles.formField} style={{ width: 130 }}>
                        <span>{t('invoices:detail.referenceOptional')}</span>
                        <input type="text" className={styles.formInput} value={editPay.ref} onChange={e => setEditPay(p => ({ ...p, ref: e.target.value }))} onKeyDown={editPayKeys} />
                      </label>
                      <label className={styles.formField} style={{ flex: 1, minWidth: 140 }}>
                        <span>{t('invoices:detail.notesOptional')}</span>
                        <input type="text" className={styles.formInput} value={editPay.notes} onChange={e => setEditPay(p => ({ ...p, notes: e.target.value }))} onKeyDown={editPayKeys} />
                      </label>
                      <span style={{ display: 'inline-flex', gap: 8, paddingBottom: 2 }}>
                        <button className={styles.cancelBtn} onClick={() => setEditingPaymentId(null)}>{t('common:action.cancel')}</button>
                        <button className={styles.confirmBtn} onClick={handleSavePaymentEdit} disabled={actionSaving}>{actionSaving ? t('invoices:detail.saving') : t('common:action.save')}</button>
                      </span>
                    </div>
                  </div>
                ) : (
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <button
                        onClick={() => startEditPayment(pmt)}
                        disabled={actionSaving}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px 6px', opacity: 0.7 }}
                        title={t('invoices:detail.editPayment')}
                      ><Pencil size={13} /></button>
                      <button
                        onClick={() => openTransfer(pmt.id)}
                        disabled={actionSaving}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '4px 6px', opacity: 0.7 }}
                        title={t('invoices:detail.transferPayment')}
                      >{t('invoices:detail.transfer')}</button>
                      <button
                        onClick={() => handleDeletePayment(pmt.id)}
                        disabled={actionSaving}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16, padding: '4px 8px', opacity: 0.6, transition: 'opacity 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
                        title={t('invoices:detail.removePayment')}
                      >×</button>
                    </span>
                  )}
                </div>
                )
              ))}
              {/* I6: transfer picker — the same client's non-draft, non-void invoices */}
              {transferringPaymentId && (
                <div style={{ padding: '10px 12px', background: 'var(--color-surface)', borderLeft: '3px solid var(--color-primary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('invoices:detail.transferTitle')}</div>
                  {transferTargets === null ? (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{t('common:misc.loading')}</p>
                  ) : transferTargets.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{t('invoices:detail.transferNoTargets')}</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select className={styles.formSelect} value={transferTargetId} onChange={e => setTransferTargetId(e.target.value)} style={{ minWidth: 240 }}>
                        <option value="">{t('invoices:detail.transferSelect')}</option>
                        {transferTargets.map(tg => (
                          <option key={tg.id} value={tg.id}>{tg.invoice_number} · {fmtMoney(tg.total)} ({t(`common:invoiceStatus.${tg.status}`, { defaultValue: tg.status })})</option>
                        ))}
                      </select>
                      <button className={styles.confirmBtn} onClick={handleTransfer} disabled={actionSaving || !transferTargetId}>
                        {actionSaving ? t('invoices:detail.saving') : t('invoices:detail.transferConfirm')}
                      </button>
                    </div>
                  )}
                  <button className={styles.cancelBtn} style={{ marginTop: 8 }} onClick={() => setTransferringPaymentId(null)}>{t('common:action.cancel')}</button>
                </div>
              )}
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

        {/* Payment options: matches what the client gets on the portal and email */}
        <div className={styles.section}>
          <PaymentInstructionsBlock paymentInstructions={paymentInstructions} variant="portal" surface="app" qrUrlFor={(k) => qrUrls[k] || null} />
        </div>

        {/* Documents: source files from Document Import + direct attach (G54) */}
        <DocumentsSection documents={documents} uploadTarget={{ type: 'invoice', id }} onUploaded={refetchDocuments} />

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

        {/* Lane F: reminder / receipt preview */}
        {reminderModal && (
          <div className={styles.inlineForm}>
            <h3 className={styles.formTitle}>{reminderModal === 'receipt' ? t('invoices:reminders.sendReceipt') : t('invoices:reminders.sendReminder')}</h3>
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <div>{t('invoices:reminders.previewTo')}: <strong>{reminderRecipients === null ? t('common:misc.loading') : reminderRecipients.length > 0 ? reminderRecipients.join(', ') : t('invoices:reminders.noRecipients')}</strong></div>
              <div>{t('invoices:reminders.previewSubject')}: <strong>{reminderModal === 'receipt'
                ? t('invoices:reminders.subjectReceipt', { number: invoice.invoice_number })
                : t('invoices:reminders.subjectReminder', { amount: fmtMoney(balanceDue), number: invoice.invoice_number })}</strong></div>
              {reminderModal === 'reminder' && invoice.due_date && (() => {
                const days = Math.floor((Date.now() - new Date(invoice.due_date + 'T00:00:00').getTime()) / 86400000)
                return days > 0 ? <div>{t('invoices:reminders.previewPastDue', { count: days })}</div> : null
              })()}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={attachPdf} onChange={e => setAttachPdf(e.target.checked)} />
              {t('invoices:reminders.attachPdf')}
            </label>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setReminderModal(null)}>{t('common:action.cancel')}</button>
              <button className={styles.confirmBtn} onClick={handleSendReminderOrReceipt} disabled={reminderSending || reminderRecipients === null || reminderRecipients.length === 0}>
                {reminderSending ? t('invoices:detail.sending') : t('common:action.send')}
              </button>
            </div>
          </div>
        )}

        {/* I5: Mark sent inline form (manual delivery; email is the send button) */}
        {showMarkSent && (
          <div className={styles.inlineForm}>
            <h3 className={styles.formTitle}>{t('invoices:detail.markSentTitle')}</h3>
            <label className={styles.formField}>
              <span>{t('invoices:detail.deliveryMethodLabel')}</span>
              <select className={styles.formSelect} value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)}>
                <option value="handed_over">{t('invoices:detail.delivery.handed_over')}</option>
                <option value="mailed">{t('invoices:detail.delivery.mailed')}</option>
                <option value="text">{t('invoices:detail.delivery.text')}</option>
                <option value="other">{t('invoices:detail.delivery.other')}</option>
              </select>
            </label>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowMarkSent(false)}>{t('common:action.cancel')}</button>
              <button className={styles.confirmBtn} onClick={handleMarkSent} disabled={actionSaving}>{actionSaving ? t('invoices:detail.saving') : t('invoices:detail.markSentConfirm')}</button>
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
        {showChangeClient && reassignProject && (
          <ChangeClientDialog
            kind="invoice"
            record={{ id: invoice.id, number: invoice.invoice_number }}
            project={reassignProject}
            onClose={() => setShowChangeClient(false)}
            onMoved={refetch}
          />
        )}
      </main>
    </div>
  )
}
