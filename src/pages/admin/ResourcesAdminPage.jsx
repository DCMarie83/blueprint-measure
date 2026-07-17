import { useState, useEffect } from 'react'
import {
  getAllCategories, getAllResources,
  createCategory, updateCategory, deleteCategory,
  createResource, updateResource, deleteResource,
} from '../../data/resources'
import { US_STATES } from '../../data/usStates'
import { AudienceCheckboxes, AudienceBadges } from '../../components/admin/AudienceControls'
import { visibilitySummary } from '../../lib/academyVisibility'
import styles from './sections.module.css'

// Reachability indicator via the shared rule (same one the tenant pages use).
function VisibleTo({ row }) {
  const s = visibilitySummary(row)
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: s.reason ? 'var(--color-danger, #dc2626)' : 'var(--color-text)' }}>
      {s.reason ? `Nobody (${s.reason})` : s.text}
    </span>
  )
}

const EMPTY_CAT = { key: '', label: '', sort_order: 0, is_active: true }
const EMPTY_RES = {
  category_id: '', name: '', slug: '', description: '', website_url: '', phone: '', email: '',
  service_area_text: '', is_featured: false, is_active: true, sort_order: 0, states: [], audiences: ['fieldos'],
}

export default function ResourcesAdminPage() {
  const [categories, setCategories] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)

  const [catModal, setCatModal] = useState(null)
  const [catSaving, setCatSaving] = useState(false)
  const [resModal, setResModal] = useState(null)
  const [resSaving, setResSaving] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [cats, ress] = await Promise.all([getAllCategories(), getAllResources()])
      setCategories(cats); setResources(ress)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  // ── Category CRUD ──────────────────────────────────────────────────────
  async function handleCatSave(e) {
    e.preventDefault(); setCatSaving(true)
    try {
      const payload = { key: catModal.key, label: catModal.label, sort_order: parseInt(catModal.sort_order) || 0, is_active: catModal.is_active }
      if (catModal.id) await updateCategory(catModal.id, payload)
      else await createCategory(payload)
      setCatModal(null); await loadAll()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setCatSaving(false) }
  }

  async function handleCatDelete(id) {
    if (!window.confirm('Delete this category?')) return
    try { await deleteCategory(id); await loadAll() }
    catch (err) { alert(err.message) }
  }

  // ── Resource CRUD ──────────────────────────────────────────────────────
  async function handleResSave(e) {
    e.preventDefault()
    if (!(resModal.audiences?.length)) { alert('Pick at least one audience.'); return }
    setResSaving(true)
    try {
      const payload = {
        category_id: resModal.category_id || null, name: resModal.name,
        slug: resModal.slug || resModal.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/,''),
        description: resModal.description || null, website_url: resModal.website_url || null,
        phone: resModal.phone || null, email: resModal.email || null,
        service_area_text: resModal.service_area_text || null,
        is_featured: resModal.is_featured, is_active: resModal.is_active,
        sort_order: parseInt(resModal.sort_order) || 0,
        states: resModal.states || [],
        audiences: resModal.audiences,
      }
      if (resModal.id) await updateResource(resModal.id, payload)
      else await createResource(payload)
      setResModal(null); await loadAll()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setResSaving(false) }
  }

  async function handleResDelete(id) {
    if (!window.confirm('Delete this resource?')) return
    try { await deleteResource(id); await loadAll() }
    catch (err) { alert(err.message) }
  }

  function toggleState(code) {
    setResModal(prev => {
      const s = prev.states || []
      return { ...prev, states: s.includes(code) ? s.filter(c => c !== code) : [...s, code] }
    })
  }

  if (loading) return <div className={styles.empty}>Loading…</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>Resources</h1>

      {/* ── Categories ──────────────────────────────────────────── */}
      <div className={styles.sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>Categories</h2>
          <button className={styles.addBtn} onClick={() => setCatModal({ ...EMPTY_CAT })}>+ Add Category</button>
        </div>
        {categories.length === 0 ? <div className={styles.empty}>No categories.</div> : (
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr>
              <th className={styles.th}>Order</th><th className={styles.th}>Key</th><th className={styles.th}>Label</th>
              <th className={styles.th}>Status</th><th className={styles.th}>Resources</th><th className={styles.th}></th>
            </tr></thead>
            <tbody>{categories.map(c => (
              <tr key={c.id} className={styles.tr}>
                <td className={styles.td}>{c.sort_order}</td>
                <td className={styles.td} style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.key}</td>
                <td className={styles.td} style={{ fontWeight: 600 }}>{c.label}</td>
                <td className={styles.td}><span className={`${styles.badge} ${c.is_active ? styles.badgeActive : styles.badgeInactive}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                <td className={styles.td}>{resources.filter(r => r.category_id === c.id).length}</td>
                <td className={styles.td}>
                  <button className={styles.iconBtn} onClick={() => setCatModal({ ...c })}>Edit</button>
                  <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleCatDelete(c.id)}>Delete</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {/* ── Resources ───────────────────────────────────────────── */}
      <div className={styles.sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 className={styles.sectionCardTitle} style={{ margin: 0 }}>Resources</h2>
          <button className={styles.addBtn} onClick={() => setResModal({ ...EMPTY_RES })}>+ Add Resource</button>
        </div>
        {resources.length === 0 ? <div className={styles.empty}>No resources.</div> : (
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr>
              <th className={styles.th}>Name</th><th className={styles.th}>Category</th><th className={styles.th}>Audience</th><th className={styles.th}>Visible to</th><th className={styles.th}>States</th>
              <th className={styles.th}>Featured</th><th className={styles.th}>Status</th><th className={styles.th}></th>
            </tr></thead>
            <tbody>{resources.map(r => {
              const cat = categories.find(c => c.id === r.category_id)
              return (
                <tr key={r.id} className={styles.tr}>
                  <td className={styles.td} style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className={styles.td}>{cat?.label || '—'}</td>
                  <td className={styles.td}><AudienceBadges value={r.audiences} /></td>
                  <td className={styles.td}><VisibleTo row={r} /></td>
                  <td className={styles.td} style={{ fontSize: 12 }}>{r.states?.length ? r.states.join(', ') : 'National'}</td>
                  <td className={styles.td}>{r.is_featured ? '★' : ''}</td>
                  <td className={styles.td}><span className={`${styles.badge} ${r.is_active ? styles.badgeActive : styles.badgeInactive}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className={styles.td}>
                    <button className={styles.iconBtn} onClick={() => setResModal({ ...r, states: r.states || [], audiences: r.audiences || [] })}>Edit</button>
                    <button className={styles.deleteBtn} style={{ marginLeft: 6 }} onClick={() => handleResDelete(r.id)}>Delete</button>
                  </td>
                </tr>
              )
            })}</tbody>
          </table></div>
        )}
      </div>

      {/* ── Category modal ──────────────────────────────────────── */}
      {catModal && (
        <ModalBackdrop onClose={() => setCatModal(null)}>
          <h3 style={{ margin: '0 0 16px' }}>{catModal.id ? 'Edit Category' : 'New Category'}</h3>
          <form onSubmit={handleCatSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>Label</label><input className={styles.formInput} required value={catModal.label} onChange={e => setCatModal(c => ({ ...c, label: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>Key (slug)</label><input className={styles.formInput} required value={catModal.key} onChange={e => setCatModal(c => ({ ...c, key: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>Sort Order</label><input className={styles.formInput} type="number" value={catModal.sort_order} onChange={e => setCatModal(c => ({ ...c, sort_order: e.target.value }))} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '12px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={catModal.is_active} onChange={e => setCatModal(c => ({ ...c, is_active: e.target.checked }))} /> Active
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={catSaving}>{catSaving ? 'Saving…' : 'Save'}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setCatModal(null)}>Cancel</button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      {/* ── Resource modal ──────────────────────────────────────── */}
      {resModal && (
        <ModalBackdrop onClose={() => setResModal(null)}>
          <h3 style={{ margin: '0 0 16px' }}>{resModal.id ? 'Edit Resource' : 'New Resource'}</h3>
          <form onSubmit={handleResSave}>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>Name</label><input className={styles.formInput} required value={resModal.name} onChange={e => setResModal(r => ({ ...r, name: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>Category</label>
                <select className={styles.formSelect} value={resModal.category_id} onChange={e => setResModal(r => ({ ...r, category_id: e.target.value }))}>
                  <option value="">—</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>Slug</label><input className={styles.formInput} value={resModal.slug} onChange={e => setResModal(r => ({ ...r, slug: e.target.value }))} placeholder="auto-generated" /></div>
              <div className={styles.formField}><label className={styles.formLabel}>Sort Order</label><input className={styles.formInput} type="number" value={resModal.sort_order} onChange={e => setResModal(r => ({ ...r, sort_order: e.target.value }))} /></div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>Description</label>
              <textarea className={styles.formInput} style={{ minHeight: 60, resize: 'vertical' }} value={resModal.description ?? ''} onChange={e => setResModal(r => ({ ...r, description: e.target.value }))} />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}><label className={styles.formLabel}>Website URL</label><input className={styles.formInput} value={resModal.website_url ?? ''} onChange={e => setResModal(r => ({ ...r, website_url: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>Phone</label><input className={styles.formInput} value={resModal.phone ?? ''} onChange={e => setResModal(r => ({ ...r, phone: e.target.value }))} /></div>
              <div className={styles.formField}><label className={styles.formLabel}>Email</label><input className={styles.formInput} value={resModal.email ?? ''} onChange={e => setResModal(r => ({ ...r, email: e.target.value }))} /></div>
            </div>
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>Service Area (display text)</label>
              <input className={styles.formInput} value={resModal.service_area_text ?? ''} onChange={e => setResModal(r => ({ ...r, service_area_text: e.target.value }))} placeholder="e.g. Columbus metro" />
            </div>

            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>Audience</label>
              <AudienceCheckboxes value={resModal.audiences} onChange={next => setResModal(r => ({ ...r, audiences: next }))} />
            </div>

            {/* Geo: states */}
            <div className={styles.formField} style={{ marginBottom: 12 }}>
              <label className={styles.formLabel}>Available States</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, margin: '6px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={(resModal.states || []).length === 0} onChange={e => { if (e.target.checked) setResModal(r => ({ ...r, states: [] })) }} /> Available nationally
              </label>
              {(resModal.states || []).length > 0 || !(resModal.states || []).length === 0 ? null : null}
              {(resModal.states?.length > 0 || !(resModal.states?.length === 0 && true)) ? null : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 160, overflowY: 'auto', padding: 4, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginTop: 4 }}>
                {US_STATES.map(s => (
                  <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer', minWidth: 80 }}>
                    <input type="checkbox" checked={(resModal.states || []).includes(s.code)} onChange={() => toggleState(s.code)} disabled={(resModal.states || []).length === 0} />
                    {s.code}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {(resModal.states || []).length === 0 ? 'Shows for all states.' : `Shows in: ${resModal.states.join(', ')}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={resModal.is_featured} onChange={e => setResModal(r => ({ ...r, is_featured: e.target.checked }))} /> Featured
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={resModal.is_active} onChange={e => setResModal(r => ({ ...r, is_active: e.target.checked }))} /> Active
              </label>
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={styles.submitBtn} disabled={resSaving}>{resSaving ? 'Saving…' : 'Save'}</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setResModal(null)}>Cancel</button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </div>
  )
}

function ModalBackdrop({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
