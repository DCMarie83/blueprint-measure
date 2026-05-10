import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import { invalidatePlansCache, FEATURE_KEYS } from '../../lib/plans'
import styles from './sections.module.css'

export default function PlansSection() {
  const { companies } = useAdminData()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState(null)
  const [editState, setEditState] = useState({})
  const [saving, setSaving] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('plans').select('*').order('sort_order', { ascending: true })
      if (!error) setPlans(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  function companiesOnPlan(planKey) {
    return companies.filter(c => c.plan === planKey).length
  }

  function startEdit(plan) {
    setExpandedKey(plan.key)
    setEditState({
      display_name: plan.display_name ?? '',
      monthly_price_dollars: ((plan.monthly_price_cents ?? 0) / 100).toFixed(2),
      is_active: plan.is_active ?? true,
      sort_order: plan.sort_order ?? 0,
      storage_limit_mb: plan.storage_limit_mb ?? '',
      seat_limit: plan.seat_limit ?? '',
      blueprint_limit: plan.blueprint_limit ?? '',
      features: plan.features ?? {},
    })
  }

  function updateField(field, value) {
    setEditState(prev => ({ ...prev, [field]: value }))
  }

  function toggleFeature(key) {
    setEditState(prev => ({
      ...prev,
      features: { ...prev.features, [key]: !prev.features[key] },
    }))
  }

  async function handleSave(planKey) {
    setSaving(planKey)
    try {
      const update = {
        display_name: editState.display_name,
        monthly_price_cents: Math.round(parseFloat(editState.monthly_price_dollars) * 100) || 0,
        is_active: editState.is_active,
        sort_order: parseInt(editState.sort_order) || 0,
        storage_limit_mb: editState.storage_limit_mb === '' ? null : parseInt(editState.storage_limit_mb),
        seat_limit: editState.seat_limit === '' ? null : parseInt(editState.seat_limit),
        blueprint_limit: editState.blueprint_limit === '' ? null : parseInt(editState.blueprint_limit),
        features: editState.features,
      }
      const { error } = await supabase.from('plans').update(update).eq('key', planKey)
      if (error) throw new Error(error.message)
      setPlans(prev => prev.map(p => p.key === planKey ? { ...p, ...update } : p))
      invalidatePlansCache()
      setExpandedKey(null)
    } catch (err) {
      alert('Failed to save plan: ' + err.message)
    } finally { setSaving(null) }
  }

  async function handleDelete(planKey) {
    const count = companiesOnPlan(planKey)
    if (count > 0) { alert(`Cannot delete — ${count} companies are on this plan.`); return }
    if (!window.confirm(`Delete plan "${planKey}"? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('plans').delete().eq('key', planKey)
      if (error) throw new Error(error.message)
      setPlans(prev => prev.filter(p => p.key !== planKey))
      invalidatePlansCache()
    } catch (err) { alert('Failed: ' + err.message) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newKey.trim() || !newName.trim()) return
    setCreating(true)
    try {
      const { data, error } = await supabase.from('plans').insert({
        key: newKey.trim().toLowerCase().replace(/\s+/g, '_'),
        display_name: newName.trim(),
        monthly_price_cents: 0,
        is_active: true,
        sort_order: plans.length + 1,
        features: {},
      }).select().single()
      if (error) throw new Error(error.message)
      setPlans(prev => [...prev, data])
      invalidatePlansCache()
      setNewKey(''); setNewName(''); setShowCreate(false)
    } catch (err) { alert('Failed: ' + err.message) } finally { setCreating(false) }
  }

  if (loading) return <div className={styles.empty}>Loading plans…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className={styles.pageTitle} style={{ margin: 0 }}>Plans</h1>
        <button className={styles.addBtn} onClick={() => setShowCreate(v => !v)}>
          {showCreate ? 'Cancel' : '+ New Plan'}
        </button>
      </div>

      {showCreate && (
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Plan Key (immutable)</label>
              <input className={styles.formInput} value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="e.g. enterprise" required />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Display Name</label>
              <input className={styles.formInput} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Enterprise" required />
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.submitBtn} disabled={creating}>{creating ? 'Creating…' : 'Create Plan'}</button>
          </div>
        </form>
      )}

      {plans.map(plan => {
        const isExp = expandedKey === plan.key
        const count = companiesOnPlan(plan.key)
        return (
          <div key={plan.key} className={styles.planCard}>
            <div className={styles.planHeader} onClick={() => isExp ? setExpandedKey(null) : startEdit(plan)}>
              <div className={styles.planHeaderLeft}>
                <span className={styles.planName}>{plan.display_name ?? plan.key}</span>
                <span className={styles.planPrice}>${((plan.monthly_price_cents ?? 0) / 100).toFixed(2)}/mo</span>
                <span className={`${styles.badge} ${plan.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                  {plan.is_active ? 'Active' : 'Inactive'}
                </span>
                {count > 0 && <span className={styles.pill}>{count} companies</span>}
              </div>
              <span style={{ color: 'var(--color-text-muted)' }}>{isExp ? '▾' : '▸'}</span>
            </div>

            {isExp && (
              <div className={styles.planBody}>
                <div className={styles.planFieldRow}>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Display Name</span>
                    <input className={styles.planFieldInput} value={editState.display_name} onChange={e => updateField('display_name', e.target.value)} />
                  </div>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Plan Key</span>
                    <input className={styles.planFieldInput} value={plan.key} disabled />
                  </div>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Monthly Price ($)</span>
                    <input className={styles.planFieldInput} type="number" step="0.01" min="0" value={editState.monthly_price_dollars} onChange={e => updateField('monthly_price_dollars', e.target.value)} />
                    {(parseFloat(editState.monthly_price_dollars) < 0 || isNaN(parseFloat(editState.monthly_price_dollars))) && editState.monthly_price_dollars !== '' && (
                      <span className={styles.fieldError}>Price must be a positive number</span>
                    )}
                  </div>
                </div>

                <div className={styles.planFieldRow}>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Storage Limit (MB)</span>
                    <input className={styles.planFieldInput} type="number" value={editState.storage_limit_mb} onChange={e => updateField('storage_limit_mb', e.target.value)} placeholder="Empty = unlimited" />
                  </div>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Seat Limit</span>
                    <input className={styles.planFieldInput} type="number" value={editState.seat_limit} onChange={e => updateField('seat_limit', e.target.value)} placeholder="Empty = unlimited" />
                  </div>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Blueprint Limit</span>
                    <input className={styles.planFieldInput} type="number" value={editState.blueprint_limit} onChange={e => updateField('blueprint_limit', e.target.value)} placeholder="Empty = unlimited" />
                  </div>
                </div>

                <div className={styles.planFieldRow}>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Sort Order</span>
                    <input className={styles.planFieldInput} type="number" value={editState.sort_order} onChange={e => updateField('sort_order', e.target.value)} />
                  </div>
                  <div className={styles.planField}>
                    <label className={styles.planToggleRow}>
                      <input type="checkbox" checked={editState.is_active} onChange={e => updateField('is_active', e.target.checked)} />
                      <span>Active</span>
                    </label>
                  </div>
                </div>

                <div>
                  <span className={styles.planFieldLabel}>Feature Flags</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                    {FEATURE_KEYS.map(({ key, label }) => (
                      <label key={key} className={styles.planToggleRow}>
                        <input type="checkbox" checked={!!editState.features[key]} onChange={() => toggleFeature(key)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.planActions}>
                  <button className={styles.submitBtn} onClick={() => handleSave(plan.key)} disabled={saving === plan.key || parseFloat(editState.monthly_price_dollars) < 0 || (editState.monthly_price_dollars !== '' && isNaN(parseFloat(editState.monthly_price_dollars)))}>
                    {saving === plan.key ? 'Saving…' : 'Save Plan'}
                  </button>
                  <button className={styles.dangerBtn} onClick={() => handleDelete(plan.key)} disabled={count > 0} title={count > 0 ? `${count} companies on this plan` : 'Delete plan'}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
