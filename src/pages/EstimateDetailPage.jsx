import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, Trash2, Plus, Package, Download, Send } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import ZoneAggregationPanel from '../components/estimates/ZoneAggregationPanel'
import PricingItemPicker from '../components/estimates/PricingItemPicker'
import LineItemsTable from '../components/estimates/LineItemsTable'
import SendEstimateModal from '../components/estimates/SendEstimateModal'
import { useEstimateBuilder } from '../hooks/useEstimateBuilder'
import { usePricingCategories } from '../hooks/usePricingCategories'
import { usePricingItems } from '../hooks/usePricingItems'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { generateEstimatePDF } from '../lib/generateEstimatePDF'
import styles from './EstimateDetailPage.module.css'

const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'declined', 'expired']

const STATUS_CLASS = {
  draft: styles.statusDraft,
  sent: styles.statusSent,
  accepted: styles.statusAccepted,
  declined: styles.statusDeclined,
  expired: styles.statusExpired,
}

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EstimateDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'contractor_admin' || user?.email === 'main@ngautomationhub.com'

  const builder = useEstimateBuilder(id)

  const { categories } = usePricingCategories()
  const { items: pricingItems } = usePricingItems()

  const [showPicker, setShowPicker] = useState(false)
  const [pickerZone, setPickerZone] = useState(null)
  const [notesValue, setNotesValue] = useState(null)
  const [saveMsg, setSaveMsg] = useState(null)
  const [titleValue, setTitleValue] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)
  const pdfMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target)) {
        setPdfMenuOpen(false)
      }
    }
    if (pdfMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [pdfMenuOpen])

  // Fetch project + client + company for PDF/Send
  const [projectData, setProjectData] = useState(null)
  const [clientData, setClientData] = useState(null)
  const [companyData, setCompanyData] = useState(null)

  const estimate = builder.estimate

  async function fetchProjectClientCompany() {
    if (!estimate?.project_id) return
    const { data: proj } = await supabase
      .from('projects')
      .select('id, name, address, client_id, company_id, portal_token')
      .eq('id', estimate.project_id)
      .single()
    if (!proj) return
    setProjectData(proj)

    if (proj.client_id) {
      const { data: cli } = await supabase
        .from('clients')
        .select('id, display_name, business_name, primary_email, property_address, client_contacts(email, is_portal_recipient)')
        .eq('id', proj.client_id)
        .single()
      setClientData(cli || null)
    } else {
      setClientData(null)
    }

    if (proj.company_id) {
      const { data: co } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', proj.company_id)
        .single()
      if (co) setCompanyData(co)
    }
  }

  useEffect(() => {
    fetchProjectClientCompany()
  }, [estimate?.project_id])

  if (builder.loading) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}><div className={styles.empty}>Loading...</div></main>
      </div>
    )
  }

  if (builder.error || !estimate) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}>
          <div className={styles.empty}>{builder.error || 'Estimate not found'}</div>
        </main>
      </div>
    )
  }

  const { lineItems, zones, totals, saving } = builder
  const notes = notesValue ?? estimate.notes ?? ''
  const title = titleValue ?? estimate.title ?? ''

  async function handleSave() {
    try {
      await builder.saveAll()
      const patch = {}
      if (notesValue !== null) patch.notes = notesValue
      if (titleValue !== null) patch.title = titleValue
      if (Object.keys(patch).length > 0) {
        await builder.updateEstimate(patch)
      }
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (err) {
      alert('Save failed: ' + err.message)
    }
  }

  async function handleTitleBlur() {
    if (titleValue !== null && titleValue !== (estimate.title ?? '')) {
      try {
        await builder.updateEstimate({ title: titleValue || null })
      } catch (err) {
        console.error('Title save failed:', err)
      }
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const patch = { status: newStatus }
      if (newStatus === 'sent' && !estimate.sent_at) patch.sent_at = new Date().toISOString()
      if (newStatus === 'accepted') patch.accepted_at = new Date().toISOString()
      if (newStatus === 'declined') patch.declined_at = new Date().toISOString()
      await builder.updateEstimate(patch)
    } catch (err) {
      alert('Failed to update status: ' + err.message)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this estimate? This cannot be undone.')) return
    try {
      await builder.deleteEstimate()
      navigate(`/project/${estimate.project_id}`)
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  function handleDownloadPDF(variant = null) {
    setPdfMenuOpen(false)
    const pdf = generateEstimatePDF({
      estimate: { ...estimate, title: title || null, notes },
      lineItems,
      project: projectData,
      client: clientData,
      company: companyData,
      variant,
      returnAs: 'blob',
    })
    const url = URL.createObjectURL(pdf)
    const a = document.createElement('a')
    a.href = url
    const variantSuffix = variant ? `_${variant}` : '_internal'
    a.download = `estimate_${estimate.estimate_number || estimate.id}${variantSuffix}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleAddZone(zone) {
    setPickerZone(zone)
    setShowPicker(true)
  }

  function handlePickPricingItem(pricingItem) {
    builder.addLineItem({
      description: pricingItem.name,
      category_name: pricingItem.pricing_categories?.name || '',
      pricing_item_id: pricingItem.id,
      unit: pricingItem.unit,
      quantity: pickerZone ? pickerZone.total_result : 0,
      rate_good: pricingItem.default_rate ?? 0,
      rate_better: pricingItem.default_rate_better ?? 0,
      rate_best: pricingItem.default_rate_best ?? 0,
      source_zone_name: pickerZone ? pickerZone.display_name : null,
      source_measurement_type: pickerZone ? pickerZone.measurement_type : null,
    })
    setShowPicker(false)
    setPickerZone(null)
  }

  const canSend = isAdmin && (estimate.status === 'draft' || estimate.status === 'sent')
  const sendLabel = estimate.status === 'sent' ? 'Resend to Client' : 'Send to Client'

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <BackLink to={`/project/${estimate.project_id}`} label="Back to project" />

        {/* Header: editable title + estimate number + status */}
        <div className={styles.headerRow}>
          <div className={styles.titleWrap}>
            {isAdmin ? (
              <input
                className={styles.titleInput}
                value={title}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                placeholder="Untitled Estimate"
              />
            ) : (
              <h1 className={styles.title}>{title || 'Untitled Estimate'}</h1>
            )}
            <div className={styles.subline}>
              <span className={styles.estNumber}>{estimate.estimate_number}</span>
              {isAdmin ? (
                <select
                  className={`${styles.statusSelect} ${STATUS_CLASS[estimate.status] || styles.statusDraft}`}
                  value={estimate.status}
                  onChange={e => handleStatusChange(e.target.value)}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              ) : (
                <span className={`${styles.statusBadge} ${STATUS_CLASS[estimate.status] || styles.statusDraft}`}>
                  {estimate.status}
                </span>
              )}
              {estimate.sent_at && (
                <span className={styles.sentIndicator}>Sent {timeAgo(estimate.sent_at)}</span>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className={styles.headerActions}>
              {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
              <div className={styles.pdfDropdown} ref={pdfMenuRef}>
                <button className={styles.toolBtn} onClick={() => setPdfMenuOpen(v => !v)} title="Download PDF">
                  <Download size={15} /> PDF <span className={styles.pdfCaret}>▾</span>
                </button>
                {pdfMenuOpen && (
                  <div className={styles.pdfMenu}>
                    <button onClick={() => handleDownloadPDF(null)} className={styles.pdfMenuItem}>
                      <span className={styles.pdfMenuLabel}>All Tiers</span>
                      <span className={styles.pdfMenuHint}>Internal reference — Good / Better / Best</span>
                    </button>
                    <div className={styles.pdfMenuDivider} />
                    <button onClick={() => handleDownloadPDF('good')} className={styles.pdfMenuItem}>
                      <span className={styles.pdfMenuLabel}>Good — Client Version</span>
                    </button>
                    <button onClick={() => handleDownloadPDF('better')} className={styles.pdfMenuItem}>
                      <span className={styles.pdfMenuLabel}>Better — Client Version</span>
                    </button>
                    <button onClick={() => handleDownloadPDF('best')} className={styles.pdfMenuItem}>
                      <span className={styles.pdfMenuLabel}>Best — Client Version</span>
                    </button>
                  </div>
                )}
              </div>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                <Save size={15} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className={styles.builderLayout}>
          <aside className={styles.sidePanel}>
            <ZoneAggregationPanel
              zones={zones}
              onAddZone={handleAddZone}
              onRefresh={builder.refreshZones}
              readOnly={!isAdmin}
            />
          </aside>

          <div className={styles.mainPanel}>
            {isAdmin && (
              <div className={styles.toolbar}>
                <button className={styles.toolBtn} onClick={() => setShowPicker(true)}>
                  <Package size={14} /> Add from Pricing Library
                </button>
                <button className={styles.toolBtn} onClick={() => builder.addLineItem({
                  description: '',
                  category_name: '',
                  unit: 'sf',
                  quantity: 0,
                  rate_good: 0,
                  rate_better: 0,
                  rate_best: 0,
                })}>
                  <Plus size={14} /> Add Blank Line
                </button>
              </div>
            )}

            <LineItemsTable
              lineItems={lineItems}
              onUpdate={builder.updateLineItem}
              onRemove={builder.removeLineItem}
              readOnly={!isAdmin}
            />

            <div className={styles.totalsCard}>
              <div className={`${styles.totalRow} ${estimate.selected_variant === 'good' ? styles.totalRowSent : estimate.selected_variant ? styles.totalRowMuted : ''}`}>
                <span>Good Total</span>
                <span className={styles.totalValue}>
                  {fmtMoney(totals.good)}
                  {estimate.selected_variant === 'good' && <span className={styles.sentBadge}>SENT</span>}
                </span>
              </div>
              <div className={`${styles.totalRow} ${estimate.selected_variant === 'better' ? styles.totalRowSent : estimate.selected_variant ? styles.totalRowMuted : ''}`}>
                <span>Better Total</span>
                <span className={styles.totalValue}>
                  {fmtMoney(totals.better)}
                  {estimate.selected_variant === 'better' && <span className={styles.sentBadge}>SENT</span>}
                </span>
              </div>
              <div className={`${styles.totalRow} ${styles.totalRowBest} ${estimate.selected_variant === 'best' ? styles.totalRowSent : estimate.selected_variant ? styles.totalRowMuted : ''}`}>
                <span>Best Total</span>
                <span className={styles.totalValue}>
                  {fmtMoney(totals.best)}
                  {estimate.selected_variant === 'best' && <span className={styles.sentBadge}>SENT</span>}
                </span>
              </div>
            </div>

            {/* Send to Client CTA */}
            {canSend && (
              <button className={styles.sendBtn} onClick={async () => { await fetchProjectClientCompany(); setShowSendModal(true) }}>
                <Send size={16} /> {sendLabel}
              </button>
            )}

            <div className={styles.notesSection}>
              <h3 className={styles.sectionTitle}>Notes</h3>
              <textarea
                className={styles.notesArea}
                value={notes}
                onChange={e => setNotesValue(e.target.value)}
                placeholder="Add notes..."
                readOnly={!isAdmin}
              />
            </div>

            {isAdmin && (
              <button className={styles.deleteBtn} onClick={handleDelete}>
                <Trash2 size={15} /> Delete Estimate
              </button>
            )}
          </div>
        </div>
      </main>

      {showPicker && (
        <PricingItemPicker
          zone={pickerZone}
          categories={categories}
          items={pricingItems}
          onPick={handlePickPricingItem}
          onClose={() => { setShowPicker(false); setPickerZone(null) }}
        />
      )}

      {showSendModal && (
        <SendEstimateModal
          estimate={{ ...estimate, title: title || null, notes }}
          lineItems={lineItems}
          project={projectData}
          client={clientData}
          company={companyData}
          onClose={() => setShowSendModal(false)}
          onSent={() => {
            setShowSendModal(false)
            builder.refetch()
          }}
        />
      )}
    </div>
  )
}
