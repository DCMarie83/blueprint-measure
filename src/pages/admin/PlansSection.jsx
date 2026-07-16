import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import { FEATURE_KEYS } from '../../lib/plans'
import { usePlans } from '../../lib/plans'
import styles from './sections.module.css'

export default function PlansSection() {
  const { companies } = useAdminData()
  const { refetch: refetchActivePlans } = usePlans()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [editState, setEditState] = useState({})
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('display_order', { ascending: true })
      if (!error) setPlans(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  function companiesOnPlan(planKey) {
    return companies.filter(c => (c.plan_key ?? c.plan) === planKey).length
  }

  function startEdit(plan) {
    setExpandedId(plan.id)
    setEditState({
      display_name: plan.display_name ?? '',
      monthly_price: plan.monthly_price ?? '',
      annual_price: plan.annual_price ?? '',
      max_seats: plan.max_seats ?? '',
      max_storage_gb: plan.max_storage_gb ?? '',
      trial_days: plan.trial_days ?? 0,
      is_active: plan.is_active ?? true,
      is_intro_tier: plan.is_intro_tier ?? false,
      price_locked: plan.price_locked ?? false,
      display_order: plan.display_order ?? 0,
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

  async function handleSave(plan) {
    setSaving(plan.id)
    try {
      const update = {
        display_name: editState.display_name,
        monthly_price: editState.monthly_price === '' ? null : parseFloat(editState.monthly_price),
        annual_price: editState.annual_price === '' ? null : parseFloat(editState.annual_price),
        max_seats: editState.max_seats === '' ? null : parseInt(editState.max_seats),
        max_storage_gb: editState.max_storage_gb === '' ? null : parseInt(editState.max_storage_gb),
        trial_days: parseInt(editState.trial_days) || 0,
        is_active: editState.is_active,
        is_intro_tier: editState.is_intro_tier,
        price_locked: editState.price_locked,
        display_order: parseInt(editState.display_order) || 0,
        features: editState.features,
      }
      const { error } = await supabase.from('plans').update(update).eq('id', plan.id)
      if (error) throw new Error(error.message)
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...update } : p))
      refetchActivePlans()
      setExpandedId(null)
    } catch (err) {
      alert('Failed to save plan: ' + err.message)
    } finally { setSaving(null) }
  }

  async function handleArchiveToggle(plan) {
    const newActive = !plan.is_active
    const update = {
      is_active: newActive,
      archived_at: newActive ? null : new Date().toISOString(),
    }
    try {
      const { error } = await supabase.from('plans').update(update).eq('id', plan.id)
      if (error) throw new Error(error.message)
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, ...update } : p))
      refetchActivePlans()
    } catch (err) {
      alert('Failed: ' + err.message)
    }
  }

  if (loading) return <div className={styles.empty}>Loading plans…</div>

  return (
    <div>
      <h1 className={styles.pageTitle} style={{ marginBottom: 20 }}>Plans</h1>

      {plans.map(plan => {
        const isExp = expandedId === plan.id
        const count = companiesOnPlan(plan.key)
        return (
          <div key={plan.id} className={styles.planCard}>
            <div className={styles.planHeader} onClick={() => isExp ? setExpandedId(null) : startEdit(plan)}>
              <div className={styles.planHeaderLeft}>
                <span className={styles.planName}>{plan.display_name ?? plan.key}</span>
                <span className={styles.planPrice}>${plan.monthly_price != null ? Number(plan.monthly_price).toFixed(2) : '—'}/mo</span>
                <span className={`${styles.badge} ${plan.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                  {plan.is_active ? 'Active' : 'Archived'}
                </span>
                {plan.is_intro_tier && <span className={styles.pill}>Intro</span>}
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
                </div>

                <div className={styles.planFieldRow}>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Monthly Price ($)</span>
                    <input className={styles.planFieldInput} type="number" step="0.01" min="0" value={editState.monthly_price} onChange={e => updateField('monthly_price', e.target.value)} />
                  </div>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Annual Price ($)</span>
                    <input className={styles.planFieldInput} type="number" step="0.01" min="0" value={editState.annual_price} onChange={e => updateField('annual_price', e.target.value)} />
                  </div>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Trial Days</span>
                    <input className={styles.planFieldInput} type="number" min="0" value={editState.trial_days} onChange={e => updateField('trial_days', e.target.value)} />
                  </div>
                </div>

                <div className={styles.planFieldRow}>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Max Seats</span>
                    <input className={styles.planFieldInput} type="number" value={editState.max_seats} onChange={e => updateField('max_seats', e.target.value)} placeholder="Empty = unlimited" />
                  </div>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Max Storage (GB)</span>
                    <input className={styles.planFieldInput} type="number" value={editState.max_storage_gb} onChange={e => updateField('max_storage_gb', e.target.value)} placeholder="Empty = unlimited" />
                  </div>
                </div>

                <div className={styles.planFieldRow}>
                  <div className={styles.planField}>
                    <span className={styles.planFieldLabel}>Display Order</span>
                    <input className={styles.planFieldInput} type="number" value={editState.display_order} onChange={e => updateField('display_order', e.target.value)} />
                  </div>
                  <div className={styles.planField}>
                    <label className={styles.planToggleRow}>
                      <input type="checkbox" checked={editState.is_active} onChange={e => updateField('is_active', e.target.checked)} />
                      <span>Active</span>
                    </label>
                  </div>
                  <div className={styles.planField}>
                    <label className={styles.planToggleRow}>
                      <input type="checkbox" checked={editState.is_intro_tier} onChange={e => updateField('is_intro_tier', e.target.checked)} />
                      <span>Intro Tier</span>
                    </label>
                  </div>
                  <div className={styles.planField}>
                    <label className={styles.planToggleRow}>
                      <input type="checkbox" checked={editState.price_locked} onChange={e => updateField('price_locked', e.target.checked)} />
                      <span>Lifetime price lock</span>
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

                {plan.archived_at && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Archived: {new Date(plan.archived_at).toLocaleDateString()}
                  </div>
                )}

                <div className={styles.planActions}>
                  <button className={styles.submitBtn} onClick={() => handleSave(plan)} disabled={saving === plan.id}>
                    {saving === plan.id ? 'Saving…' : 'Save Plan'}
                  </button>
                  <button
                    className={plan.is_active ? styles.dangerBtn : styles.submitBtn}
                    onClick={() => handleArchiveToggle(plan)}
                    style={!plan.is_active ? { background: 'var(--color-action-open)' } : undefined}
                  >
                    {plan.is_active ? 'Archive' : 'Unarchive'}
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
