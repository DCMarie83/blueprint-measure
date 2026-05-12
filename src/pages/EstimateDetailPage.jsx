import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, Trash2, Plus, Package } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import ZoneAggregationPanel from '../components/estimates/ZoneAggregationPanel'
import PricingItemPicker from '../components/estimates/PricingItemPicker'
import LineItemsTable from '../components/estimates/LineItemsTable'
import { useEstimateBuilder } from '../hooks/useEstimateBuilder'
import { usePricingCategories } from '../hooks/usePricingCategories'
import { usePricingItems } from '../hooks/usePricingItems'
import { useAuth } from '../context/AuthContext'
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

  if (builder.loading) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}><div className={styles.empty}>Loading...</div></main>
      </div>
    )
  }

  if (builder.error || !builder.estimate) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}>
          <div className={styles.empty}>{builder.error || 'Estimate not found'}</div>
        </main>
      </div>
    )
  }

  const { estimate, lineItems, zones, totals, saving } = builder
  const notes = notesValue ?? estimate.notes ?? ''

  async function handleSave() {
    try {
      await builder.saveAll()
      if (notesValue !== null) {
        await builder.updateEstimate({ notes: notesValue })
      }
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (err) {
      alert('Save failed: ' + err.message)
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      await builder.updateEstimate({ status: newStatus })
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

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <BackLink to={`/project/${estimate.project_id}`} label="Back to project" />

        <div className={styles.headerRow}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>{estimate.estimate_number || 'Estimate'}</h1>
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
          </div>
          {isAdmin && (
            <div className={styles.headerActions}>
              {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
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
              <div className={styles.totalRow}>
                <span>Good Total</span>
                <span className={styles.totalValue}>{fmtMoney(totals.good)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Better Total</span>
                <span className={styles.totalValue}>{fmtMoney(totals.better)}</span>
              </div>
              <div className={`${styles.totalRow} ${styles.totalRowBest}`}>
                <span>Best Total</span>
                <span className={styles.totalValue}>{fmtMoney(totals.best)}</span>
              </div>
            </div>

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
    </div>
  )
}
