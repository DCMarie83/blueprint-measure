import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import BackLink from '../BackLink'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useInvoiceMutations } from '../../hooks/useInvoices'
import { getNumberingInfo, previewNextNumber, invoiceNumberTaken } from '../../data/numbering'
import { supabase } from '../../lib/supabase'
import styles from './InvoiceForm.module.css'

const ITEM_TYPES = [
  { value: '', label: 'common:itemType.blank' },
  { value: 'labor', label: 'common:itemType.labor' },
  { value: 'material', label: 'common:itemType.material' },
  { value: 'supply', label: 'common:itemType.supply' },
  { value: 'equipment', label: 'common:itemType.equipment' },
  { value: 'subcontractor', label: 'common:itemType.subcontractor' },
  { value: 'other', label: 'common:itemType.other' },
]

const UNIT_OPTIONS = [
  { value: 'each', label: 'common:units.each' },
  { value: 'sf', label: 'common:units.sf' },
  { value: 'lf', label: 'common:units.lf' },
  { value: 'hour', label: 'common:units.hour' },
  { value: 'lump_sum', label: 'common:units.lumpSum' },
]

function emptyLine() {
  return { id: crypto.randomUUID(), description: '', category_name: '', item_type: '', unit: 'each', quantity: 1, rate: 0 }
}

function fmtMoney(val) {
  return `$${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// I1: the route mounts this wrapper. With ?edit=<id> it loads the invoice and
// its line items and hydrates the form (isEdit); paid and void are locked.
// Without ?edit= it is the plain create form.
export default function InvoiceForm() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const [loaded, setLoaded] = useState(null) // { invoice, lineItems }
  const [loadState, setLoadState] = useState(editId ? 'loading' : 'none')

  useEffect(() => {
    if (!editId) { setLoadState('none'); setLoaded(null); return }
    let cancelled = false
    setLoadState('loading')
    ;(async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_line_items(*)')
        .eq('id', editId)
        .single()
      if (cancelled) return
      if (error || !data) { setLoadState('error'); return }
      setLoaded({
        invoice: data,
        lineItems: (data.invoice_line_items ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      })
      setLoadState('ready')
    })()
    return () => { cancelled = true }
  }, [editId])

  if (loadState === 'loading') {
    return <div className={styles.page}><main className={styles.main}><p>{t('common:misc.loading')}</p></main></div>
  }
  if (loadState === 'error') {
    return <div className={styles.page}><main className={styles.main}><p>{t('invoices:detail.notFound')}</p></main></div>
  }
  if (loadState === 'ready' && (loaded.invoice.status === 'paid' || loaded.invoice.status === 'void')) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <BackLink to={`/invoices/${editId}`} label={t('invoices:form.backToInvoice')} />
          <h1 className={styles.title}>{t('invoices:form.editTitle')}</h1>
          <div className={styles.error}>
            {loaded.invoice.status === 'paid' ? t('invoices:form.lockedPaid') : t('invoices:form.lockedVoid')}
          </div>
        </main>
      </div>
    )
  }
  // key remounts the form when the target changes so state hydrates cleanly.
  return <InvoiceFormInner key={editId || 'new'} existingInvoice={loaded?.invoice} existingLineItems={loaded?.lineItems} />
}

function InvoiceFormInner({ existingInvoice, existingLineItems }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromEstimateId = searchParams.get('from_estimate')
  const fromProjectId = searchParams.get('from_project')
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

  // ?from_project context: billed-to-date banner + already-invoiced warning
  const [billedInfo, setBilledInfo] = useState(null) // { total, count }
  const [estWarning, setEstWarning] = useState(null) // estimate number already on an invoice

  // G80 numbering: the field shows the number the save WILL take (a read-only
  // preview, never reserved). Untouched → drawn from the generator at save.
  // Edited, or inherited from the source quote in shared mode → used as-is,
  // with a 23505 collision surfacing the G60 error.
  const [numbering, setNumbering] = useState(null)
  const [numberValue, setNumberValue] = useState('')
  const [numberEdited, setNumberEdited] = useState(false)
  const numberEditedRef = useRef(false)
  const [numberNote, setNumberNote] = useState(null) // 'auto' | 'inherited' | 'nextTaken'
  const [sourceEstNumber, setSourceEstNumber] = useState(null)

  useEffect(() => {
    if (!companyId || isEdit) return
    let cancelled = false
    ;(async () => {
      try {
        const info = await getNumberingInfo(companyId)
        if (!cancelled) setNumbering(info)
      } catch { /* preview is best-effort; save still draws */ }
    })()
    return () => { cancelled = true }
  }, [companyId, isEdit])

  // Decide the default number once the mode and (any) source quote are known.
  // Never overwrite a number the user has typed.
  useEffect(() => {
    if (!numbering || isEdit) return
    let cancelled = false
    ;(async () => {
      try {
        if (numbering.mode === 'shared' && sourceEstNumber) {
          const taken = await invoiceNumberTaken(companyId, sourceEstNumber)
          if (cancelled) return
          if (!taken) {
            setNumberNote('inherited')
            setNumberValue(v => (numberEditedRef.current ? v : sourceEstNumber))
            return
          }
          setNumberNote('nextTaken')
        } else {
          setNumberNote('auto')
        }
        const preview = await previewNextNumber(companyId, 'invoice', numbering)
        if (cancelled) return
        setNumberValue(v => (numberEditedRef.current ? v : preview))
      } catch { /* preview is best-effort */ }
    })()
    return () => { cancelled = true }
  }, [numbering, sourceEstNumber, companyId, isEdit])

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
      setSourceEstNumber(est.estimate_number || null)
      setEstimateBanner(t('invoices:form.fromEstimateBanner', { number: est.estimate_number }))
      setTitle(est.title || '')
      // Convert estimate line items → invoice line items using the selected variant or 'better' fallback
      const variant = est.accepted_variant || est.selected_variant || 'good'
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

  // Pre-populate the FINAL invoice from the job (?from_project): the accepted
  // estimate's lines (same variant resolution as ?from_estimate, lineage
  // stamped) plus each approved change order as its own line, with a
  // billed-to-date banner from the job's non-draft, non-void invoices.
  // Nothing sends from here; the labeled Send button remains the only send.
  useEffect(() => {
    if (!fromProjectId || isEdit || fromEstimateId) return
    ;(async () => {
      const [{ data: ests }, { data: cos }, { data: invs }] = await Promise.all([
        supabase.from('estimates').select('*, estimate_line_items(*)').eq('project_id', fromProjectId).eq('status', 'accepted').order('accepted_at', { ascending: false }).limit(1),
        supabase.from('change_orders').select('id, co_number, title, amount, status').eq('project_id', fromProjectId).eq('status', 'approved').order('created_at', { ascending: true }),
        supabase.from('invoices').select('id, total, status, estimate_id').eq('project_id', fromProjectId),
      ])
      setProjectId(fromProjectId)

      const est = (ests ?? [])[0] ?? null
      const items = []
      if (est) {
        setEstimateId(est.id)
        setSourceEstNumber(est.estimate_number || null)
        setTitle(prev => prev || est.title || '')
        const variant = est.accepted_variant || est.selected_variant || 'good'
        const rateField = `rate_${variant}`
        for (const li of (est.estimate_line_items ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
          items.push({
            id: crypto.randomUUID(),
            description: li.description || '',
            category_name: li.category_name || '',
            item_type: '',
            unit: li.unit || 'each',
            quantity: Number(li.quantity) || 0,
            rate: Number(li[rateField]) || 0,
            source_estimate_line_item_id: li.id,
          })
        }
      }
      for (const co of (cos ?? [])) {
        items.push({
          id: crypto.randomUUID(),
          description: co.co_number ? `${co.co_number}: ${co.title}` : co.title,
          category_name: '',
          item_type: '',
          unit: 'lump_sum',
          quantity: 1,
          rate: Number(co.amount) || 0,
        })
      }
      if (items.length > 0) setLineItems(items)

      const counted = (invs ?? []).filter(i => i.status !== 'draft' && i.status !== 'void')
      setBilledInfo({ total: counted.reduce((s, i) => s + (Number(i.total) || 0), 0), count: counted.length })
      if (est && (invs ?? []).some(i => i.estimate_id === est.id)) setEstWarning(est.estimate_number || '')
    })()
  }, [fromProjectId, isEdit, fromEstimateId])

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
    if (!projectId) { setFormError(t('invoices:form.errorNoProject')); return }
    const validLines = lineItems.filter(li => li.description.trim() && Number(li.rate) > 0)
    if (validLines.length === 0) { setFormError(t('invoices:form.errorNoLineItems')); return }

    try {
      if (isEdit) {
        // Partial invoices re-derive their status against the new total; the
        // owner confirms that before the save runs.
        if (existingInvoice.status === 'partial' && !window.confirm(t('invoices:form.confirmPartialEdit'))) return
        await updateInvoice(existingInvoice.id, { title, due_date: dueDate || null, notes, terms, adjustment_amount: adjustmentAmount, adjustment_label: adjustmentLabel, lineItems: validLines })
        navigate(`/invoices/${existingInvoice.id}`)
      } else {
        // Explicit only when the user edited the field or the number is
        // inherited from the source quote; otherwise draw at save.
        const explicit = numberEdited || numberNote === 'inherited'
        const inv = await createInvoice({ project_id: projectId, estimate_id: estimateId || null, invoice_number: explicit ? numberValue.trim() : null, title, due_date: dueDate || null, notes, terms, adjustment_amount: adjustmentAmount, adjustment_label: adjustmentLabel, lineItems: validLines })
        navigate(`/invoices/${inv.id}`)
      }
    } catch (err) {
      if (err.code === '23505') {
        setFormError(t('invoices:detail.numberConflict', { number: numberValue.trim() }))
      } else {
        setFormError(err.message)
      }
    }
  }

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <BackLink to="/invoices" label={t('invoices:nav.invoices')} />
        <h1 className={styles.title}>{isEdit ? t('invoices:form.editTitle') : t('invoices:form.newTitle')}</h1>

        {estimateBanner && <div className={styles.banner}>{estimateBanner}</div>}
        {billedInfo && (
          <div className={styles.banner}>{t('invoices:form.billedToDate', { amount: fmtMoney(billedInfo.total), count: billedInfo.count })}</div>
        )}
        {estWarning !== null && (
          <div className={styles.error}>{t('invoices:form.estimateAlreadyInvoiced', { number: estWarning })}</div>
        )}
        {(formError || mutError) && <div className={styles.error}>{formError || mutError}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {!isEdit && (
            <label className={styles.field} style={{ maxWidth: 260 }}>
              <span className={styles.label}>{t('invoices:form.numberLabel')}</span>
              <input
                className={styles.input}
                style={{ fontFamily: 'var(--font-mono)' }}
                value={numberValue}
                onChange={e => {
                  setNumberValue(e.target.value)
                  setNumberEdited(true)
                  numberEditedRef.current = true
                }}
                placeholder={t('invoices:form.numberAutoHint')}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {numberEdited
                  ? t('invoices:form.numberEditedHint')
                  : numberNote === 'inherited'
                    ? t('invoices:form.numberInheritedHint', { number: sourceEstNumber })
                    : numberNote === 'nextTaken'
                      ? t('invoices:form.numberNextTakenHint', { number: sourceEstNumber })
                      : t('invoices:form.numberAutoHint')}
              </span>
            </label>
          )}
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>{t('invoices:form.project')}</span>
              <select className={styles.select} value={projectId} onChange={e => setProjectId(e.target.value)} disabled={isEdit || !!fromEstimateId || !!fromProjectId} required>
                <option value="">{t('invoices:form.selectProject')}</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('invoices:form.titleOptional')}</span>
              <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('invoices:form.titlePlaceholder')} />
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>{t('invoices:form.dueDate')}</span>
            <input type="date" className={styles.input} value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ maxWidth: 200 }} />
          </label>

          {/* Line items */}
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>{t('invoices:lineItems.sectionLabel')}</h3>
            <div className={styles.lineItemsTable}>
              <div className={styles.lineHeader}>
                <span className={styles.lineColDesc}>{t('invoices:lineItems.description')}</span>
                <span className={styles.lineColSm}>{t('invoices:lineItems.type')}</span>
                <span className={styles.lineColSm}>{t('invoices:lineItems.unit')}</span>
                <span className={styles.lineColNum}>{t('invoices:lineItems.qty')}</span>
                <span className={styles.lineColNum}>{t('invoices:lineItems.rate')}</span>
                <span className={styles.lineColNum}>{t('invoices:lineItems.total')}</span>
                <span className={styles.lineColDel}></span>
              </div>
              {lineItems.map(li => (
                <div key={li.id} className={styles.lineRow}>
                  <input className={styles.lineInput} value={li.description} onChange={e => updateLine(li.id, 'description', e.target.value)} placeholder={t('invoices:lineItems.descriptionPlaceholder')} />
                  <select className={styles.lineSelect} value={li.item_type} onChange={e => updateLine(li.id, 'item_type', e.target.value)}>
                    {ITEM_TYPES.map(it => <option key={it.value} value={it.value}>{t(it.label)}</option>)}
                  </select>
                  <select className={styles.lineSelect} value={li.unit} onChange={e => updateLine(li.id, 'unit', e.target.value)}>
                    {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{t(u.label)}</option>)}
                  </select>
                  <input type="number" className={styles.lineNum} value={li.quantity} onChange={e => updateLine(li.id, 'quantity', e.target.value)} min="0" step="any" />
                  <input type="number" className={styles.lineNum} value={li.rate} onChange={e => updateLine(li.id, 'rate', e.target.value)} min="0" step="0.01" />
                  <span className={styles.lineTotal}>{fmtMoney(Number(li.quantity || 0) * Number(li.rate || 0))}</span>
                  <button type="button" className={styles.lineDelBtn} onClick={() => removeLine(li.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button type="button" className={styles.addLineBtn} onClick={() => setLineItems(prev => [...prev, emptyLine()])}>
              <Plus size={14} /> {t('invoices:lineItems.add')}
            </button>
          </div>

          {/* Adjustment */}
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>{t('invoices:form.adjustmentLabel')}</span>
              <input className={styles.input} value={adjustmentLabel} onChange={e => setAdjustmentLabel(e.target.value)} placeholder={t('invoices:form.adjustmentLabelPlaceholder')} />
            </label>
            <label className={styles.field} style={{ maxWidth: 160 }}>
              <span className={styles.label}>{t('invoices:form.amount')}</span>
              <input type="number" className={styles.input} value={adjustmentAmount} onChange={e => setAdjustmentAmount(e.target.value)} step="0.01" placeholder={t('invoices:form.amountPlaceholder')} />
            </label>
          </div>

          {/* Totals */}
          <div className={styles.totals}>
            <div className={styles.totalRow}><span>{t('invoices:totals.subtotal')}</span><span>{fmtMoney(subtotal)}</span></div>
            {Number(adjustmentAmount) !== 0 && <div className={styles.totalRow}><span>{adjustmentLabel || t('invoices:totals.adjustment')}</span><span>{fmtMoney(adjustmentAmount)}</span></div>}
            <div className={styles.totalRowGrand}><span>{t('invoices:totals.total')}</span><span>{fmtMoney(total)}</span></div>
          </div>

          {/* Notes + Terms */}
          <label className={styles.field}>
            <span className={styles.label}>{t('invoices:form.notesOptional')}</span>
            <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder={t('invoices:form.notesPlaceholder')} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('invoices:form.termsOptional')}</span>
            <textarea className={styles.textarea} value={terms} onChange={e => setTerms(e.target.value)} rows={3} placeholder={t('invoices:form.termsPlaceholder')} />
          </label>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => navigate('/invoices')}>{t('common:action.cancel')}</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? t('invoices:form.saving') : isEdit ? t('invoices:form.saveInvoice') : t('invoices:form.createInvoice')}</button>
          </div>
        </form>
      </main>
    </div>
  )
}
