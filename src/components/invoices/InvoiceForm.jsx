import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import AppHeader from '../AppHeader'
import BackLink from '../BackLink'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useInvoiceMutations } from '../../hooks/useInvoices'
import { supabase } from '../../lib/supabase'
import styles from './InvoiceForm.module.css'

const ITEM_TYPES = [
  { value: '', label: '—' },
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'supply', label: 'Supply' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'other', label: 'Other' },
]

const UNIT_OPTIONS = [
  { value: 'each', label: 'Each' },
  { value: 'sf', label: 'SF' },
  { value: 'lf', label: 'LF' },
  { value: 'hour', label: 'Hour' },
  { value: 'lump_sum', label: 'Lump Sum' },
]

function emptyLine() {
  return { id: crypto.randomUUID(), description: '', category_name: '', item_type: '', unit: 'each', quantity: 1, rate: 0 }
}

function fmtMoney(val) {
  return `$${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function InvoiceForm({ existingInvoice, existingLineItems }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromEstimateId = searchParams.get('from_estimate')
  const { companyId } = useEffectiveCompany()
  const { createInvoice, updateInvoice, saving, error: mutError } = useInvoiceMutations()
  const isEdit = !!existingInvoice

  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(existingInvoice?.project_id || '')
  const [estimateId, setEstimateId] = useState(existingInvoice?.estimate_id || fromEstimateId || '')
  const [estimateBanner, setEstimateBanner] = useState(null)
  const [title, setTitle] = useState(existingInvoice?.title || '')
  const [dueDate, setDueDate] = useState(existingInvoice?.due_date?.slice(0, 10) || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
  const [notes, setNotes] = useState(existingInvoice?.notes || '')
  const [terms, setTerms] = useState(existingInvoice?.terms || '')
  const [adjustmentLabel, setAdjustmentLabel] = useState(existingInvoice?.adjustment_label || '')
  const [adjustmentAmount, setAdjustmentAmount] = useState(existingInvoice?.adjustment_amount ?? '')
  const [lineItems, setLineItems] = useState(
    existingLineItems?.length > 0
      ? existingLineItems.map(li => ({ ...li, id: li.id || crypto.randomUUID(), rate: li.unit_rate ?? li.rate ?? 0 }))
      : [emptyLine()]
  )
  const [formError, setFormError] = useState(null)

  // Load projects for dropdown
  useEffect(() => {
    if (!companyId) return
    supabase.from('projects').select('id, name, client_id').eq('company_id', companyId).is('deleted_at', null).order('name')
      .then(({ data }) => setProjects(data ?? []))
  }, [companyId])

  // Pre-populate from estimate
  useEffect(() => {
    if (!fromEstimateId || isEdit) return
    ;(async () => {
      const { data: est } = await supabase
        .from('estimates')
        .select('*, estimate_line_items(*), projects(id, name, client_id)')
        .eq('id', fromEstimateId)
        .single()
      if (!est) return
      setProjectId(est.project_id)
      setEstimateId(est.id)
      setEstimateBanner(`Creating invoice from estimate ${est.estimate_number}`)
      setTitle(est.title || '')
      // Convert estimate line items → invoice line items using the selected variant or 'better' fallback
      const variant = est.accepted_variant || est.selected_variant || 'better'
      const rateField = `rate_${variant}`
      const totalField = `total_${variant}`
      const items = (est.estimate_line_items ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(li => ({
          id: crypto.randomUUID(),
          description: li.description || '',
          category_name: li.category_name || '',
          item_type: '',
          unit: li.unit || 'each',
          quantity: Number(li.quantity) || 0,
          rate: Number(li[rateField]) || 0,
          source_estimate_line_item_id: li.id,
        }))
      if (items.length > 0) setLineItems(items)
    })()
  }, [fromEstimateId, isEdit])

  function updateLine(id, field, value) {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li))
  }

  function removeLine(id) {
    setLineItems(prev => prev.length > 1 ? prev.filter(li => li.id !== id) : prev)
  }

  const subtotal = lineItems.reduce((s, li) => s + (Number(li.quantity || 0) * Number(li.rate || 0)), 0)
  const total = subtotal + (Number(adjustmentAmount) || 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)
    if (!projectId) { setFormError('Please select a project.'); return }
    const validLines = lineItems.filter(li => li.description.trim() && Number(li.rate) > 0)
    if (validLines.length === 0) { setFormError('Add at least one line item with a description and rate.'); return }

    try {
      if (isEdit) {
        await updateInvoice(existingInvoice.id, { title, due_date: dueDate || null, notes, terms, adjustment_amount: adjustmentAmount, adjustment_label: adjustmentLabel, lineItems: validLines })
        navigate(`/invoices/${existingInvoice.id}`)
      } else {
        const inv = await createInvoice({ project_id: projectId, estimate_id: estimateId || null, title, due_date: dueDate || null, notes, terms, adjustment_amount: adjustmentAmount, adjustment_label: adjustmentLabel, lineItems: validLines })
        navigate(`/invoices/${inv.id}`)
      }
    } catch (err) {
      setFormError(err.message)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <BackLink to="/invoices" label="Invoices" />
        <h1 className={styles.title}>{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>

        {estimateBanner && <div className={styles.banner}>{estimateBanner}</div>}
        {(formError || mutError) && <div className={styles.error}>{formError || mutError}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Project</span>
              <select className={styles.select} value={projectId} onChange={e => setProjectId(e.target.value)} disabled={isEdit || !!fromEstimateId} required>
                <option value="">Select a project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Title (optional)</span>
              <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Interior Repaint — Final Invoice" />
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Due Date</span>
            <input type="date" className={styles.input} value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ maxWidth: 200 }} />
          </label>

          {/* Line items */}
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>Line Items</h3>
            <div className={styles.lineItemsTable}>
              <div className={styles.lineHeader}>
                <span className={styles.lineColDesc}>Description</span>
                <span className={styles.lineColSm}>Type</span>
                <span className={styles.lineColSm}>Unit</span>
                <span className={styles.lineColNum}>Qty</span>
                <span className={styles.lineColNum}>Rate</span>
                <span className={styles.lineColNum}>Total</span>
                <span className={styles.lineColDel}></span>
              </div>
              {lineItems.map(li => (
                <div key={li.id} className={styles.lineRow}>
                  <input className={styles.lineInput} value={li.description} onChange={e => updateLine(li.id, 'description', e.target.value)} placeholder="Description" />
                  <select className={styles.lineSelect} value={li.item_type} onChange={e => updateLine(li.id, 'item_type', e.target.value)}>
                    {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select className={styles.lineSelect} value={li.unit} onChange={e => updateLine(li.id, 'unit', e.target.value)}>
                    {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                  <input type="number" className={styles.lineNum} value={li.quantity} onChange={e => updateLine(li.id, 'quantity', e.target.value)} min="0" step="any" />
                  <input type="number" className={styles.lineNum} value={li.rate} onChange={e => updateLine(li.id, 'rate', e.target.value)} min="0" step="0.01" />
                  <span className={styles.lineTotal}>{fmtMoney(Number(li.quantity || 0) * Number(li.rate || 0))}</span>
                  <button type="button" className={styles.lineDelBtn} onClick={() => removeLine(li.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button type="button" className={styles.addLineBtn} onClick={() => setLineItems(prev => [...prev, emptyLine()])}>
              <Plus size={14} /> Add Line Item
            </button>
          </div>

          {/* Adjustment */}
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Adjustment Label</span>
              <input className={styles.input} value={adjustmentLabel} onChange={e => setAdjustmentLabel(e.target.value)} placeholder="e.g. Discount, Credit, Fee" />
            </label>
            <label className={styles.field} style={{ maxWidth: 160 }}>
              <span className={styles.label}>Amount (+/-)</span>
              <input type="number" className={styles.input} value={adjustmentAmount} onChange={e => setAdjustmentAmount(e.target.value)} step="0.01" placeholder="0.00" />
            </label>
          </div>

          {/* Totals */}
          <div className={styles.totals}>
            <div className={styles.totalRow}><span>Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
            {Number(adjustmentAmount) !== 0 && <div className={styles.totalRow}><span>{adjustmentLabel || 'Adjustment'}</span><span>{fmtMoney(adjustmentAmount)}</span></div>}
            <div className={styles.totalRowGrand}><span>Total</span><span>{fmtMoney(total)}</span></div>
          </div>

          {/* Notes + Terms */}
          <label className={styles.field}>
            <span className={styles.label}>Notes (optional)</span>
            <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Internal or client-visible notes" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Terms (optional)</span>
            <textarea className={styles.textarea} value={terms} onChange={e => setTerms(e.target.value)} rows={3} placeholder="Payment terms, late fees, etc." />
          </label>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => navigate('/invoices')}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Invoice' : 'Create Invoice'}</button>
          </div>
        </form>
      </main>
    </div>
  )
}
